import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const stageSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, 'Nome do estágio é obrigatório'),
  color: z.string().trim().default('#3b82f6'),
  order: z.coerce.number().int().default(0),
});

const moveSchema = z.object({
  contactId: z.string().uuid('ID de contato inválido'),
  stageId: z.string().uuid('ID de estágio inválido').nullable(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Busca estágios ordenados
    let stages = await prisma.crmStage.findMany({
      orderBy: { order: 'asc' },
      include: {
        contacts: {
          select: {
            id: true,
            name: true,
            phone: true,
            tags: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    // 2. Se não houver estágios, semeia os estágios padrão do funil Kanban
    if (stages.length === 0) {
      const defaultStages = [
        { name: 'Novos Leads', color: '#3b82f6', order: 0 },
        { name: 'Primeiro Contato', color: '#f59e0b', order: 1 },
        { name: 'Apresentação', color: '#a78bfa', order: 2 },
        { name: 'Negociação', color: '#6366f1', order: 3 },
        { name: 'Fechado / Ganho', color: '#10b981', order: 4 },
        { name: 'Perdido', color: '#ef4444', order: 5 },
      ];

      for (const ds of defaultStages) {
        await prisma.crmStage.create({ data: ds });
      }

      stages = await prisma.crmStage.findMany({
        orderBy: { order: 'asc' },
        include: {
          contacts: {
            select: {
              id: true,
              name: true,
              phone: true,
              tags: true,
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
      });
    }

    // 3. Busca contatos sem nenhum estágio atribuído (Novos/Sem Funil)
    const unassignedContacts = await prisma.contact.findMany({
      where: { stageId: null },
      select: {
        id: true,
        name: true,
        phone: true,
        tags: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 80, // Limite seguro para exibição
    });

    return NextResponse.json({ success: true, stages, unassignedContacts });
  } catch (error: any) {
    console.error('Erro ao listar estágios do CRM:', error);
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

    // Caso seja ação de mover contato de estágio
    if (body.action === 'MOVE') {
      const result = moveSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { message: result.error.issues[0].message },
          { status: 400 }
        );
      }

      const { contactId, stageId } = result.data;

      const contact = await prisma.contact.update({
        where: { id: contactId },
        data: { stageId },
      });

      return NextResponse.json({ success: true, contact });
    }

    // Caso seja criação/edição de estágio
    const result = stageSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { id, name, color, order } = result.data;

    let stage;
    if (id) {
      stage = await prisma.crmStage.update({
        where: { id },
        data: { name, color, order },
      });
    } else {
      stage = await prisma.crmStage.create({
        data: { name, color, order },
      });
    }

    return NextResponse.json({ success: true, stage });
  } catch (error: any) {
    console.error('Erro ao salvar estágio do CRM:', error);
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

    if (!id) {
      return NextResponse.json(
        { message: 'ID do estágio não informado' },
        { status: 400 }
      );
    }

    // Coloca todos os contatos deste estágio de volta para sem estágio
    await prisma.contact.updateMany({
      where: { stageId: id },
      data: { stageId: null },
    });

    await prisma.crmStage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Estágio excluído com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir estágio do CRM:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
