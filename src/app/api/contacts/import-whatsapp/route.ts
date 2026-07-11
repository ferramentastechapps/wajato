import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';

/**
 * POST /api/contacts/import-whatsapp
 *
 * Body:
 * {
 *   instanceName: string,
 *   groupJids: string[],          // JIDs dos grupos a importar ex: ["120363...@g.us"]
 *   targetGroupId?: string,       // ID de um ContactGroup existente (opcional)
 *   createGroupName?: string,     // Nome de um novo ContactGroup a criar (opcional)
 * }
 *
 * Um dos dois (targetGroupId ou createGroupName) deve ser fornecido.
 * Se ambos forem enviados, targetGroupId prevalece.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { instanceName, groupJids, targetGroupId, createGroupName } = body;

    // --- Validações básicas ---
    if (!instanceName || typeof instanceName !== 'string') {
      return NextResponse.json({ message: 'instanceName é obrigatório' }, { status: 400 });
    }

    if (!Array.isArray(groupJids) || groupJids.length === 0) {
      return NextResponse.json({ message: 'Selecione ao menos um grupo' }, { status: 400 });
    }

    if (!targetGroupId && !createGroupName) {
      return NextResponse.json(
        { message: 'Informe um grupo de contatos de destino ou um nome para criar um novo' },
        { status: 400 }
      );
    }

    // --- Resolve o ContactGroup de destino ---
    let finalGroupId: string;

    if (targetGroupId) {
      const existing = await prisma.contactGroup.findUnique({ where: { id: targetGroupId } });
      if (!existing) {
        return NextResponse.json({ message: 'Grupo de contatos não encontrado' }, { status: 404 });
      }
      finalGroupId = existing.id;
    } else {
      // Cria (ou reutiliza) o grupo com o nome fornecido
      const group = await prisma.contactGroup.upsert({
        where: { name: createGroupName },
        update: {},
        create: {
          name: createGroupName,
          description: `Importado do WhatsApp via instância "${instanceName}"`,
        },
      });
      finalGroupId = group.id;
    }

    // --- Coleta participantes de cada grupo ---
    const phoneSet = new Set<string>();

    for (const groupJid of groupJids) {
      const participants = await evolutionApi.fetchGroupParticipants(instanceName, groupJid);

      for (const p of participants) {
        // JID format: "5511999998888@s.whatsapp.net"
        // Remove o sufixo do JID e normaliza pelo formatPhone
        const rawPhone = p.id.split('@')[0];
        if (!rawPhone) continue;

        const formatted = evolutionApi.formatPhone(rawPhone);
        if (formatted) phoneSet.add(formatted);
      }
    }

    if (phoneSet.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhum participante encontrado nos grupos selecionados.',
        imported: 0,
        skipped: 0,
        total: 0,
      });
    }

    // --- Importa em lote (upsert: atualiza groupId se já existe, cria se não existe) ---
    const phonesArray = Array.from(phoneSet);

    // Identifica quais já existem no banco
    const existing = await prisma.contact.findMany({
      where: { phone: { in: phonesArray } },
      select: { phone: true },
    });
    const existingPhones = new Set(existing.map((c) => c.phone));

    const toCreate = phonesArray
      .filter((p) => !existingPhones.has(p))
      .map((phone) => ({
        phone,
        name: null as string | null,
        groupId: finalGroupId,
        tags: [] as string[],
      }));

    const toUpdate = phonesArray.filter((p) => existingPhones.has(p));

    // Cria novos contatos
    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.contact.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      created = result.count;
    }

    // Atualiza o groupId dos contatos já existentes (move para o grupo destino)
    let updated = 0;
    if (toUpdate.length > 0) {
      const result = await prisma.contact.updateMany({
        where: { phone: { in: toUpdate } },
        data: { groupId: finalGroupId },
      });
      updated = result.count;
    }

    const total = phonesArray.length;

    return NextResponse.json({
      success: true,
      message: `Importação concluída: ${created} novos contatos criados, ${updated} contatos existentes atualizados.`,
      imported: created,
      updated,
      total,
    });
  } catch (error: any) {
    console.error('Erro ao importar contatos do WhatsApp:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
