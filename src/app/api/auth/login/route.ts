import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, signToken, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { redisConnection } from '@/lib/redis';

// Função auxiliar para verificar o limite de requisições de login (Rate Limit)
async function checkLoginRateLimit(ip: string): Promise<boolean> {
  try {
    const key = `rate_limit:login:${ip}`;
    const limit = 5; // 5 tentativas
    const windowSeconds = 60; // por minuto

    // Timeout de 1 segundo para garantir que falha/lentidão do Redis nunca trave o login
    const redisPromise = (async () => {
      const current = await redisConnection.incr(key);
      if (current === 1) {
        await redisConnection.expire(key, windowSeconds);
      }
      return current > limit;
    })();

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 1000);
    });

    return await Promise.race([redisPromise, timeoutPromise]);
  } catch (err) {
    console.warn('[Login Rate Limit] Erro no Redis, liberando login:', err);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // 1. Obter o IP do cliente para o rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

    // 2. Verificar se o IP excedeu o limite de tentativas
    const isLimited = await checkLoginRateLimit(ip);
    if (isLimited) {
      return NextResponse.json(
        { message: 'Muitas tentativas de login. Por favor, tente novamente mais tarde.' },
        { status: 429 }
      );
    }

    // 3. Validar payload de entrada usando Zod
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { username, password } = result.data;

    // 4. Buscar usuário por username ou por email
    const identifier = username.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // 5. Verificar se o usuário tem senha (usuários Google podem não ter senha)
    if (!user.password) {
      return NextResponse.json(
        { message: 'Esta conta usa login com Google. Clique em "Continuar com Google".' },
        { status: 401 }
      );
    }

    // 6. Comparar senhas
    const passwordMatch = await comparePassword(password, user.password || '');

    if (!passwordMatch) {
      return NextResponse.json(
        { message: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // 6. Gerar token e cookie
    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      companyId: user.companyId,
    });
    await setSessionCookie(token);

    // Limpar o contador do rate limit após login de sucesso (sem travar se Redis falhar)
    redisConnection.del(`rate_limit:login:${ip}`).catch(() => {});

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
    });
  } catch (error: any) {
    console.error('Erro na API de login:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
