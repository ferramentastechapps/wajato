import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID não está configurado nas variáveis de ambiente do servidor.' },
      { status: 500 }
    );
  }

  // Obter o origin dinamicamente com base nas informações do host do cabeçalho da requisição
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  const scope = 'openid email profile';
  const state = 'wajato_oauth_state'; // Estado estático simples para proteção básica csrf
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
    `client_id=${googleClientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${state}` +
    `&prompt=select_account`;

  return NextResponse.redirect(googleAuthUrl);
}
