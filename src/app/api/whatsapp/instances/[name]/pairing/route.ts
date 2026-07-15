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

    // 2. Garante que a instância está em estado limpo (close) para receber pairing code.
    // O pairing code SÓ é retornado pela Evolution API quando a instância está desconectada (close).
    // Se a instância está em estado 'open' (mesmo que fantasma), o logout simples pode falhar.
    // Por isso, deletamos e recriamos a instância para garantir estado limpo.
    try {
      await evolutionApi.logoutInstance(name);
    } catch {
      // Se logout falhou (ex: instância em estado inválido), força delete + recreate
      try {
        await evolutionApi.deleteInstance(name);
      } catch { /* ignora */ }

      // Recria a instância SEM QR code (modo pairing code)
      await evolutionApi.createInstance(name, false);

      // Reconfigura webhook
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      try {
        await evolutionApi.setWebhook(name, `${appUrl}/api/webhook`);
      } catch { /* não crítico */ }

      // Reconfigura proxy se havia
      if (dbInst.proxy) {
        try {
          await evolutionApi.setInstanceProxy(name, dbInst.proxy);
        } catch { /* não crítico */ }
      }
    }

    // 3. Chama o Evolution API para gerar o código de pareamento
    const pairingData = await evolutionApi.getPairingCode(name, formattedPhone);

    if (!pairingData || !pairingData.code) {
      return NextResponse.json({ error: 'O gateway Evolution não retornou um código de pareamento válido' }, { status: 500 });
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
      code: pairingData.code,
    });
  } catch (error: any) {
    console.error(`Erro ao gerar código de pareamento:`, error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
