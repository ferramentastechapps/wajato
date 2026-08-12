import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ name: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { name } = await params;
    const body = await req.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json({ error: 'O número de telefone é obrigatório para pareamento' }, { status: 400 });
    }

    // Limpa o formato do fone
    const formattedPhone = evolutionApi.formatPhone(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
      return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 });
    }

    // 1. Busca a instância local
    const dbInst = await prisma.whatsAppInstance.findUnique({
      where: { name },
    });

    if (!dbInst) {
      return NextResponse.json({ error: 'Instância não encontrada no banco' }, { status: 404 });
    }

    // 2. Tenta primeiro obter o código de pareamento diretamente da Evolution API
    let pairingCodeStr: string | null = null;
    try {
      const directRes = await evolutionApi.getPairingCode(name, formattedPhone);
      pairingCodeStr = directRes.code;
    } catch (directErr: any) {
      console.log(`[Pairing] Tentativa direta falhou para '${name}': ${directErr?.message}. Forçando recreação da instância em modo pairing code...`);
    }

    // 3. Se não obtivemos o código direto (ex: instância estava em modo QR Code), recriamos a instância com qrcode=false
    if (!pairingCodeStr) {
      try {
        await evolutionApi.logoutInstance(name);
      } catch { /* ignora erro de logout */ }

      try {
        await evolutionApi.deleteInstance(name);
      } catch { /* ignora erro de delete */ }

      // Aguarda 1.5s para a Evolution API liberar os recursos da instância
      await new Promise(res => setTimeout(res, 1500));

      let createRes: any = null;
      try {
        createRes = await evolutionApi.createInstance(name, false, formattedPhone);
      } catch (createErr: any) {
        console.log(`[Pairing] Recriação direta falhou, tentando delete forçado e recriação nova para '${name}'...`);
        try {
          await evolutionApi.deleteInstance(name);
          await new Promise(res => setTimeout(res, 1000));
          createRes = await evolutionApi.createInstance(name, false, formattedPhone);
        } catch (innerErr: any) {
          console.error(`[Pairing] Erro na segunda tentativa de criação para '${name}':`, innerErr?.message || innerErr);
        }
      }

      // Tenta extrair o código de pareamento se a própria resposta de criação o trouxe
      const rawCandidates = [
        createRes?.pairingCode,
        createRes?.qrcode?.pairingCode,
        createRes?.qrcode?.code,
      ];

      const codeFromCreate = rawCandidates.find(
        (c) => typeof c === 'string' && c.trim().length >= 6 && c.trim().length <= 12 && !c.includes('+') && !c.includes('/') && !c.includes('@')
      );

      if (codeFromCreate) {
        pairingCodeStr = codeFromCreate.trim();
      } else {
        // Aguarda 1s e tenta buscar via getPairingCode
        await new Promise(res => setTimeout(res, 1000));
        const secondRes = await evolutionApi.getPairingCode(name, formattedPhone);
        pairingCodeStr = secondRes.code;
      }

      // Reconfigura webhook e proxy se necessário
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      try {
        await evolutionApi.setWebhook(name, `${appUrl}/api/webhook`);
      } catch { /* não crítico */ }

      if (dbInst.proxy) {
        try {
          await evolutionApi.setInstanceProxy(name, dbInst.proxy);
        } catch { /* não crítico */ }
      }
    }

    if (!pairingCodeStr) {
      return NextResponse.json({ error: 'O gateway Evolution não retornou um código de pareamento válido.' }, { status: 500 });
    }

    // 4. Salva o telefone informado na instância e marca como INITIALIZING
    await prisma.whatsAppInstance.update({
      where: { name },
      data: {
        phone: formattedPhone,
        status: 'INITIALIZING',
        qrCode: null, // Limpa qualquer QR code pendente para essa sessão
      },
    });

    return NextResponse.json({
      success: true,
      code: pairingCodeStr,
    });
  } catch (error: any) {
    console.error(`Erro ao gerar código de pareamento:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno ao obter código de pareamento' }, { status: 500 });
  }
}
