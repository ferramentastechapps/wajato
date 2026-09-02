import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';

/**
 * POST /api/contacts/check-whatsapp
 * Body: { phone: string, instanceName: string }
 * Verifica se um número está ativo no WhatsApp via Evolution API
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { phone, instanceName } = body;

    if (!phone || !instanceName) {
      return NextResponse.json(
        { message: 'phone e instanceName são obrigatórios' },
        { status: 400 }
      );
    }

    const cleanPhone = evolutionApi.formatPhone(phone);
    if (!cleanPhone) {
      return NextResponse.json({ exists: false, message: 'Número inválido' });
    }

    // Chama Evolution API para verificar se o número existe no WhatsApp
    const result = await evolutionApi.checkWhatsAppNumber(instanceName, cleanPhone);

    return NextResponse.json({
      exists: result?.exists ?? false,
      jid: result?.jid ?? null,
      name: result?.name ?? null,
    });
  } catch (error: any) {
    console.error('Erro ao verificar WhatsApp:', error);
    // Retorna false em vez de 500 para não quebrar a UI
    return NextResponse.json({ exists: false, error: error.message });
  }
}
