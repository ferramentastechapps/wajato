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
    let pairingData: { code: string } | null = null;
    try {
      pairingData = await evolutionApi.getPairingCode(name, formattedPhone);
    } catch (directErr: any) {
      console.log(`[Pairing] Primeira tentativa direta falhou para '${name}': ${directErr?.message}. Tentando resetar sessão na Evolution API...`);

      // Se falhou (ex: instância em estado inválido ou não inicializada), tenta deslogar / recriar com tratamento de erro seguro
      try {
        await evolutionApi.logoutInstance(name);
      } catch { /* ignora erro de logout */ }

      try {
        await evolutionApi.deleteInstance(name);
      } catch { /* ignora erro de delete */ }

      try {
        // Tenta recriar em modo pairing code (qrcode: false)
        await evolutionApi.createInstance(name, false);
      } catch (createErr: any) {
        console.log(`[Pairing] Aviso ao criar instância '${name}':`, createErr?.message || createErr);
        // Não relança o erro se a instância já existir ou dar erro secundário
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

      // Segunda tentativa de obter o código
      pairingData = await evolutionApi.getPairingCode(name, formattedPhone);
    }

    if (!pairingData || !pairingData.code) {
      return NextResponse.json({ error: 'O gateway Evolution não retornou um código de pareamento válido.' }, { status: 500 });
    }

    // 3. Salva o telefone informado na instância e marca como INITIALIZING
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
      code: pairingData.code,
    });
  } catch (error: any) {
    console.error(`Erro ao gerar código de pareamento:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno ao obter código de pareamento' }, { status: 500 });
  }
}
