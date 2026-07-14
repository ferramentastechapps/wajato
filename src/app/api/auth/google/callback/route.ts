import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, setSessionCookie } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam || !code) {
      console.error('[Google OAuth] Erro retornado ou código ausente:', errorParam);
      return NextResponse.redirect(new URL('/login?error=google_failed', request.url));
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!googleClientId || !googleClientSecret) {
      console.error('[Google OAuth] Credenciais do Google não configuradas nas variáveis de ambiente.');
      return NextResponse.redirect(new URL('/login?error=google_not_configured', request.url));
    }

    // Usar APP_URL ou NEXT_PUBLIC_APP_URL se definido para evitar problemas com reverse proxy host header
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    let redirectUri = '';
    
    if (appUrl) {
      redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;
    } else {
      const host = request.headers.get('host') || '';
      const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
      redirectUri = `${protocol}://${host}/api/auth/google/callback`;
    }

    // 1. Trocar o código de autorização pelo Access Token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[Google OAuth] Erro ao trocar código pelo token:', tokenData);
      return NextResponse.redirect(new URL('/login?error=google_token_exchange_failed', request.url));
    }

    const accessToken = tokenData.access_token;

    // 2. Buscar informações do perfil do usuário do Google
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const profileData = await profileResponse.json();

    if (!profileResponse.ok) {
      console.error('[Google OAuth] Erro ao carregar perfil do Google:', profileData);
      return NextResponse.redirect(new URL('/login?error=google_profile_fetch_failed', request.url));
    }

    const { sub: googleId, email, name, picture: avatarUrl } = profileData;

    if (!email) {
      console.error('[Google OAuth] Perfil do Google sem endereço de e-mail.');
      return NextResponse.redirect(new URL('/login?error=google_email_missing', request.url));
    }

    // 3. Buscar usuário no banco de dados local
    // 3.1 Tenta encontrar pelo ID único do Google
    let user = await prisma.user.findUnique({
      where: { googleId },
    });

    // 3.2 Se não encontrar, tenta encontrar pelo e-mail
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        // Se achou pelo e-mail, vincula a conta do Google a este usuário existente
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            name: user.name || name,
            avatarUrl: user.avatarUrl || avatarUrl,
          },
        });
      }
    }

    // 4. Opção A: Restringir acesso apenas a e-mails cadastrados previamente
    if (!user) {
      console.warn(`[Google OAuth] Tentativa de login não autorizada do e-mail: ${email}`);
      const errUrl = new URL('/login', request.url);
      errUrl.searchParams.set('error', 'google_unauthorized');
      errUrl.searchParams.set('email', email);
      return NextResponse.redirect(errUrl);
    }

    // 5. Autenticar usuário - Gerar token de sessão (JWT)
    const token = signToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });

    await setSessionCookie(token);

    // 6. Redirecionar usuário logado ao painel
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('[Google OAuth] Erro geral no callback:', error);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}
