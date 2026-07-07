import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';

// GET — Listagem de contatos paginada e com filtros otimizada para o banco
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';
    const groupId = searchParams.get('groupId') || '';

    // Cláusula de busca no banco
    const where: any = {};

    if (groupId) {
      where.groupId = groupId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const take = limit;

    // Busca os contatos da página atual, o total e os grupos de filtros
    const [contacts, total, groups] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.contact.count({ where }),
      prisma.contactGroup.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { contacts: true } } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      contacts,
      groups,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Erro ao listar contatos:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

import { contactSchema, contactImportSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();

    // Caso de Importação em Massa (Lote) com Grupos Dinâmicos
    if (body.contacts && Array.isArray(body.contacts)) {
      const result = contactImportSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { message: result.error.issues[0].message },
          { status: 400 }
        );
      }

      const { contacts, groupId: defaultGroupId } = result.data;
      
      // 1. Identifica nomes de grupos únicos contidos nas linhas do CSV
      const uniqueGroupNames: string[] = Array.from(
        new Set(
          contacts
            .map((c: any) => c.groupName?.trim())
            .filter((name: any): name is string => typeof name === 'string' && name !== '')
        )
      );

      // 2. Resolve ou cria os grupos e mapeia seus IDs
      const groupMap: Record<string, string> = {};
      for (const name of uniqueGroupNames) {
        let group = await prisma.contactGroup.findUnique({
          where: { name },
        });
        if (!group) {
          group = await prisma.contactGroup.create({
            data: { name, description: 'Criado automaticamente via importação CSV' },
          });
        }
        groupMap[name] = group.id;
      }

      // 3. Formata contatos mapeando o groupId
      const formattedContacts = contacts
        .filter((item: any) => item.phone)
        .map((item: any) => {
          let finalGroupId = defaultGroupId || null;
          if (item.groupName && typeof item.groupName === 'string') {
            const gName = item.groupName.trim();
            if (gName && groupMap[gName]) {
              finalGroupId = groupMap[gName];
            }
          }

          return {
            phone: evolutionApi.formatPhone(item.phone),
            name: item.name || null,
            tags: item.tags || [],
            groupId: finalGroupId,
          };
        })
        .filter((item: any) => item.phone !== '');

      // 4. Salva em lote de forma otimizada
      const bulkResult = await prisma.contact.createMany({
        data: formattedContacts,
        skipDuplicates: true,
      });

      return NextResponse.json({
        success: true,
        message: `${bulkResult.count} contatos importados com sucesso.`,
        count: bulkResult.count,
      });
    }

    // Caso de Criação Individual
    const result = contactSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, phone, tags, groupId } = result.data;

    const cleanPhone = evolutionApi.formatPhone(phone);

    const contact = await prisma.contact.upsert({
      where: { phone: cleanPhone },
      update: {
        name: name || null,
        tags: tags || [],
        groupId: groupId || null,
      },
      create: {
        name: name || null,
        phone: cleanPhone,
        tags: tags || [],
        groupId: groupId || null,
      },
    });

    return NextResponse.json({
      success: true,
      contact,
    });
  } catch (error: any) {
    console.error('Erro ao salvar contato:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // Excluir um único contato
      await prisma.contact.delete({
        where: { id },
      });
      return NextResponse.json({ success: true, message: 'Contato excluído' });
    }

    // Excluir múltiplos contatos ou ações em massa
    const body = await request.json().catch(() => ({}));
    
    // Ação: Excluir todos os contatos
    if (body.action === 'clear_all') {
      const result = await prisma.contact.deleteMany();
      return NextResponse.json({ 
        success: true, 
        message: 'Todos os contatos foram excluídos.', 
        count: result.count 
      });
    }

    // Ação: Excluir por grupo
    if (body.action === 'delete_by_group') {
      const { groupId } = body;
      if (!groupId) {
        return NextResponse.json({ message: 'Grupo não informado' }, { status: 400 });
      }
      const result = await prisma.contact.deleteMany({
        where: { groupId },
      });
      return NextResponse.json({ 
        success: true, 
        message: 'Contatos do grupo excluídos.', 
        count: result.count 
      });
    }

    // Ação: Excluir avulsos (sem grupo)
    if (body.action === 'delete_ungrouped') {
      const result = await prisma.contact.deleteMany({
        where: { groupId: null },
      });
      return NextResponse.json({ 
        success: true, 
        message: 'Contatos avulsos excluídos.', 
        count: result.count 
      });
    }

    // Excluir lote de IDs selecionados
    if (body.ids && Array.isArray(body.ids)) {
      await prisma.contact.deleteMany({
        where: {
          id: { in: body.ids },
        },
      });
      return NextResponse.json({ success: true, message: 'Contatos excluídos em lote' });
    }

    return NextResponse.json(
      { message: 'Parâmetro ID, lista de IDs ou ação em massa ausente' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Erro ao excluir contato:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
