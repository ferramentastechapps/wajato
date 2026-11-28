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
 *
 * Regras da extração (dono, 28/11):
 * - Administradores do grupo (admin/superadmin) NÃO são extraídos.
 * - Cada contato extraído ganha uma TAG com o nome do grupo do WhatsApp
 *   de onde veio (se vier de mais de um grupo, ganha uma tag por grupo).
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

    // --- Nome de cada grupo do WhatsApp (para a tag com o nome do grupo) ---
    const groupNameByJid = new Map<string, string>();
    const allGroups = await evolutionApi.fetchGroups(instanceName);
    for (const g of allGroups) {
      if (g?.id && g?.subject) groupNameByJid.set(g.id, String(g.subject).trim());
    }

    // --- Coleta participantes de cada grupo ---
    const phoneSet = new Set<string>();
    const contactMap = new Map<string, { name: string | null; tags: string[] }>();
    let adminsSkipped = 0;

    for (const groupJid of groupJids) {
      const participants = await evolutionApi.fetchGroupParticipants(instanceName, groupJid);
      const groupTag = groupNameByJid.get(groupJid) || null;

      for (const p of participants) {
        // Administrador do grupo NÃO é extraído (regra do dono, 28/11)
        if (p.admin || (p as any).isAdmin || (p as any).isSuperAdmin) {
          adminsSkipped++;
          continue;
        }

        // JID real fica em p.phoneNumber se o JID principal p.id for uma LID (ex: community announcement)
        const finalJid = p.phoneNumber || p.id;
        if (!finalJid) continue;

        const rawPhone = finalJid.split('@')[0];
        if (!rawPhone) continue;

        const formatted = evolutionApi.formatPhone(rawPhone);
        if (!formatted) continue;

        phoneSet.add(formatted);

        const info = contactMap.get(formatted) || { name: null, tags: [] as string[] };
        if (!info.name && p.name) info.name = p.name;
        if (groupTag && !info.tags.includes(groupTag)) info.tags.push(groupTag);
        contactMap.set(formatted, info);
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

    // Identifica quais já existem no banco (com as tags atuais, p/ mesclar)
    const existing = await prisma.contact.findMany({
      where: { phone: { in: phonesArray } },
      select: { phone: true, tags: true },
    });
    const existingPhones = new Set(existing.map((c) => c.phone));

    const toCreate = phonesArray
      .filter((p) => !existingPhones.has(p))
      .map((phone) => ({
        phone,
        name: contactMap.get(phone)?.name || null,
        groupId: finalGroupId,
        tags: contactMap.get(phone)?.tags || [],
      }));

    const toUpdate = phonesArray.filter((p) => existingPhones.has(p));

    // Cria novos contatos com seus respectivos nomes
    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.contact.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      created = result.count;
    }

    // Atualiza contatos existentes
    let updated = 0;
    if (toUpdate.length > 0) {
      // 1. Atualiza o nome dos contatos que estão sem nome atualmente no banco
      const emptyNameContacts = await prisma.contact.findMany({
        where: {
          phone: { in: toUpdate },
          OR: [
            { name: null },
            { name: "" }
          ]
        },
        select: { id: true, phone: true }
      });

      const updateNamePromises = emptyNameContacts.map((c) => {
        const info = contactMap.get(c.phone);
        if (info && info.name) {
          return prisma.contact.update({
            where: { id: c.id },
            data: { name: info.name }
          });
        }
        return null;
      }).filter(Boolean);

      if (updateNamePromises.length > 0) {
        await Promise.all(updateNamePromises);
      }

      // 2. Atualiza o groupId para todos os contatos existentes de uma só vez
      const result = await prisma.contact.updateMany({
        where: { phone: { in: toUpdate } },
        data: { groupId: finalGroupId },
      });
      updated = result.count;

      // 3. Mescla a tag do nome do grupo nas tags atuais (sem remover nenhuma)
      const tagUpdatePromises = existing
        .map((c) => {
          const newTags = contactMap.get(c.phone)?.tags || [];
          if (newTags.length === 0) return null;
          const merged = Array.from(new Set([...(c.tags || []), ...newTags]));
          if (merged.length === (c.tags || []).length) return null;
          return prisma.contact.update({
            where: { phone: c.phone },
            data: { tags: merged },
          });
        })
        .filter(Boolean);

      if (tagUpdatePromises.length > 0) {
        await Promise.all(tagUpdatePromises);
      }
    }

    const total = phonesArray.length;

    return NextResponse.json({
      success: true,
      message:
        `Importação concluída: ${created} novos contatos criados, ${updated} contatos existentes atualizados.` +
        (adminsSkipped > 0 ? ` ${adminsSkipped} administradores ignorados.` : ''),
      imported: created,
      updated,
      total,
      adminsSkipped,
    });
  } catch (error: any) {
    console.error('Erro ao importar contatos do WhatsApp:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
