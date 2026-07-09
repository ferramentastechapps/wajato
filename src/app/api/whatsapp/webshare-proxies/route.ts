import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isWebshareConfigured, getRandomWebshareProxy, getWebshareProxies } from '@/lib/webshare';

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'status';

    if (action === 'status') {
      return NextResponse.json({
        success: true,
        configured: isWebshareConfigured(),
      });
    }

    if (action === 'random') {
      if (!isWebshareConfigured()) {
        return NextResponse.json({ error: 'Integração Webshare não configurada' }, { status: 400 });
      }

      const proxy = await getRandomWebshareProxy();
      if (!proxy) {
        return NextResponse.json({ error: 'Nenhum proxy disponível na sua conta Webshare' }, { status: 404 });
      }

      return NextResponse.json({ success: true, proxy });
    }

    if (action === 'list') {
      if (!isWebshareConfigured()) {
        return NextResponse.json({ error: 'Integração Webshare não configurada' }, { status: 400 });
      }

      const proxies = await getWebshareProxies();
      return NextResponse.json({ success: true, proxies });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('[Webshare API Route] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
