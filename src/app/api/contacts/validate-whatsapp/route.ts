import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';

/**
 * POST /api/contacts/validate-whatsapp
 * Validador e Higienizador de Contatos em Lote via Evolution API.
 * 
 * Body:
 * - instanceName: string (obrigatório - instância conectada)
 * - ids?: string[] (opcional - lista de IDs de contatos)
 * - groupId?: string (opcional - ID do grupo para validar)
 * - validateAll?: boolean (opcional - validar todos os contatos ativos)
 * - actionOnInvalid?: 'tag_and_optout' | 'optout' | 'tag' | 'delete' (padrão: 'tag_and_optout')
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      instanceName,
      ids,
      groupId,
      validateAll,
      actionOnInvalid = 'tag_and_optout',
    } = body;

    if (!instanceName) {
      return NextResponse.json(
        { message: 'Nome da instância do WhatsApp é obrigatório' },
        { status: 400 }
      );
    }

    // 1. Constrói o filtro de busca de contatos
    const where: any = {};
    if (ids && Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids };
    } else if (groupId) {
      where.groupId = groupId;
    } else if (validateAll) {
      where.optOut = false; // Apenas contatos ativos
    } else {
      return NextResponse.json(
        { message: 'Selecione contatos, um grupo ou escolha validar todos.' },
        { status: 400 }
      );
    }

    // 2. Busca contatos no banco
    const contacts = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        tags: true,
        optOut: true,
      },
    });

    if (contacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhum contato encontrado para validação.',
        stats: { totalChecked: 0, validCount: 0, invalidCount: 0, updatedCount: 0, deletedCount: 0 },
      });
    }

    // 3. Processa em lotes de 50 contatos por chamada à API
    const chunkSize = 50;
    let validCount = 0;
    let invalidCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

    const invalidContactIds: string[] = [];
    const validContactIds: string[] = [];

    for (let i = 0; i < contacts.length; i += chunkSize) {
      const chunk = contacts.slice(i, i + chunkSize);
      const phones = chunk.map((c) => c.phone);

      const checkResults = await evolutionApi.checkWhatsAppNumbers(instanceName, phones);

      for (const contact of chunk) {
        const cleanPhone = contact.phone.replace(/\D/g, '');
        const res = checkResults.find((r) => {
          const rNum = r.phone.replace(/\D/g, '') || r.formattedPhone.replace(/\D/g, '');
          return rNum.includes(cleanPhone) || cleanPhone.includes(rNum);
        });

        const exists = res?.exists === true;

        if (exists) {
          validCount++;
          validContactIds.push(contact.id);
        } else {
          invalidCount++;
          invalidContactIds.push(contact.id);
        }
      }
    }

    // 4. Aplica as ações para os números inválidos (sem WhatsApp)
    if (invalidContactIds.length > 0) {
      if (actionOnInvalid === 'delete') {
        const delRes = await prisma.contact.deleteMany({
          where: { id: { in: invalidContactIds } },
        });
        deletedCount = delRes.count;
      } else {
        // Atualiza contatos individualmente ou em lote
        for (const contactId of invalidContactIds) {
          const existing = contacts.find((c) => c.id === contactId);
          const currentTags = existing?.tags || [];
          const newTags = currentTags.includes('sem-whatsapp')
            ? currentTags
            : [...currentTags, 'sem-whatsapp'];

          const shouldOptOut = actionOnInvalid === 'optout' || actionOnInvalid === 'tag_and_optout';

          await prisma.contact.update({
            where: { id: contactId },
            data: {
              tags: (actionOnInvalid === 'tag' || actionOnInvalid === 'tag_and_optout') ? newTags : currentTags,
              ...(shouldOptOut ? { optOut: true, optOutAt: new Date() } : {}),
            },
          });
          updatedCount++;
        }
      }
    }

    // 5. Para os válidos: remove tag 'sem-whatsapp' caso existisse antes
    if (validContactIds.length > 0) {
      for (const contactId of validContactIds) {
        const existing = contacts.find((c) => c.id === contactId);
        if (existing?.tags?.includes('sem-whatsapp')) {
          const cleanedTags = existing.tags.filter((t) => t !== 'sem-whatsapp');
          await prisma.contact.update({
            where: { id: contactId },
            data: { tags: cleanedTags },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Validação concluída: ${validCount} válidos e ${invalidCount} sem WhatsApp.`,
      stats: {
        totalChecked: contacts.length,
        validCount,
        invalidCount,
        updatedCount,
        deletedCount,
      },
    });
  } catch (error: any) {
    console.error('Erro na validação em lote de WhatsApp:', error);
    return NextResponse.json(
      { message: error.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
