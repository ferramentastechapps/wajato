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

    // 2. Garante que a instância é desconectada antes de pedir o pairing code (evita estado 'connecting' travado)
    try {
      await evolutionApi.logoutInstance(name);
    } catch {
      // Ignora erro de logout se a instância já estiver desconectada
    }

    // 3. Chama o Evolution API para gerar o código de pareamento
    const pairingData = await evolutionApi.getPairingCode(name, formattedPhone);

    if (!pairingData || !pairingData.code) {
      return NextResponse.json({ error: 'O gateway Evolution não retornou um código de pareamento válido' }, { status: 500 });
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
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
