import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const [contacts, groups] = await Promise.all([
      prisma.contact.findMany({
        orderBy: { name: 'asc' },
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.contactGroup.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { contacts: true } } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      contacts,
      groups,
    });
  } catch (error: any) {
    console.error('Erro ao listar contatos:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();

    // Caso de Importação em Massa (Lote)
    if (body.contacts && Array.isArray(body.contacts)) {
      const { contacts, groupId } = body;
      
      const formattedContacts = contacts
        .filter((item: any) => item.phone)
        .map((item: any) => ({
          phone: evolutionApi.formatPhone(item.phone),
          name: item.name || null,
          tags: item.tags || [],
          groupId: groupId || null,
        }))
        .filter((item: any) => item.phone !== '');

      const result = await prisma.contact.createMany({
        data: formattedContacts,
        skipDuplicates: true,
      });

      return NextResponse.json({
        success: true,
        message: `${result.count} contatos importados com sucesso.`,
        count: result.count,
      });
    }

    // Caso de Criação Individual
    const { name, phone, tags, groupId } = body;
    if (!phone) {
      return NextResponse.json(
        { message: 'Telefone é obrigatório' },
        { status: 400 }
      );
    }

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

    // Excluir múltiplos contatos (IDs enviados no body)
    const body = await request.json().catch(() => ({}));
    if (body.ids && Array.isArray(body.ids)) {
      await prisma.contact.deleteMany({
        where: {
          id: { in: body.ids },
        },
      });
      return NextResponse.json({ success: true, message: 'Contatos excluídos em lote' });
    }

    return NextResponse.json(
      { message: 'Parâmetro ID ou lista de IDs ausente' },
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
