import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';

// Cache em memória simples: key = `${instanceName}:${phone}` -> { data, expiresAt }
const contactCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const phone = url.searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'phone é obrigatório' }, { status: 400 });
    }

    // Busca campanha para saber qual instância usar
    const campaign = await prisma.warmupCampaign.findUnique({
      where: { id },
      select: { sourceInstance: true, isGroup: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    const cacheKey = `${campaign.sourceInstance}:${phone}`;
    const cached = contactCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data);
    }

    // Busca info do contato na Evolution API
    const info = await evolutionApi.fetchContactInfo(campaign.sourceInstance, phone);

    // Armazena no cache
    contactCache.set(cacheKey, { data: info, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(info);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
