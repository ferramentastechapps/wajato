import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evolutionApi } from '@/lib/evolution';
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

const updateContactSchema = z.object({
  contactId: z.string().uuid('ID de contato inválido'),
  name: z.string().trim().nullable().optional(),
  phone: z.string().trim().optional(),
  value: z.coerce.number().min(0).optional(),
  tags: z.array(z.string().trim()).optional(),
  notes: z.string().nullable().optional(),
  stageId: z.string().uuid('ID de estágio inválido').nullable().optional(),
  groupId: z.string().uuid('ID de grupo inválido').nullable().optional(),
});

const quickAddLeadSchema = z.object({
  name: z.string().trim().nullable().optional(),
  phone: z.string().trim().min(8, 'O telefone deve ter no mínimo 8 dígitos'),
  value: z.coerce.number().min(0).default(0),
  tags: z.array(z.string().trim()).default([]),
  notes: z.string().nullable().optional(),
  stageId: z.string().uuid('ID de estágio inválido').nullable().optional(),
  groupId: z.string().uuid('ID de grupo inválido').nullable().optional(),
});

const reorderSchema = z.object({
  stages: z.array(z.object({
    id: z.string().uuid(),
    order: z.number().int(),
  })),
});

const contactSelect = {
  id: true,
  name: true,
  phone: true,
  tags: true,
  value: true,
  notes: true,
  optOut: true,
  createdAt: true,
  updatedAt: true,
  group: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
};

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Busca estágios ordenados com contatos completos
    let stages = await prisma.crmStage.findMany({
      orderBy: { order: 'asc' },
      include: {
        contacts: {
          select: contactSelect,
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
            select: contactSelect,
            orderBy: { updatedAt: 'desc' },
          },
        },
      });
    }

    // 3. Busca contatos sem nenhum estágio atribuído (Novos/Sem Funil)
    const unassignedContacts = await prisma.contact.findMany({
      where: { stageId: null },
      select: contactSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // 4. Calcula métricas do pipeline de vendas (KPIs)
    let totalLeads = 0;
    let totalPipelineValue = 0;
    let totalWonValue = 0;
    let wonCount = 0;

    for (const stage of stages) {
      totalLeads += stage.contacts.length;
      const isWon = stage.name.toLowerCase().includes('ganho') || stage.name.toLowerCase().includes('fechado');
      for (const c of stage.contacts) {
        const v = Number(c.value) || 0;
        totalPipelineValue += v;
        if (isWon) {
          totalWonValue += v;
          wonCount++;
        }
      }
    }

    const metrics = {
      totalLeads,
      totalPipelineValue,
      totalWonValue,
      wonCount,
      unassignedCount: unassignedContacts.length,
    };

    return NextResponse.json({
      success: true,
      stages,
      unassignedContacts,
      metrics,
    });
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

    // ── Ação: Mover contato de estágio ──
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
        select: contactSelect,
      });

      return NextResponse.json({ success: true, contact });
    }

    // ── Ação: Atualizar contato a partir do Drawer do Lead ──
    if (body.action === 'UPDATE_CONTACT') {
      const result = updateContactSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { message: result.error.issues[0].message },
          { status: 400 }
        );
      }

      const { contactId, name, phone, value, tags, notes, stageId, groupId } = result.data;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name || null;
      if (phone !== undefined) updateData.phone = evolutionApi.formatPhone(phone);
      if (value !== undefined) updateData.value = value;
      if (tags !== undefined) updateData.tags = tags;
      if (notes !== undefined) updateData.notes = notes || null;
      if (stageId !== undefined) updateData.stageId = stageId || null;
      if (groupId !== undefined) updateData.groupId = groupId || null;

      const contact = await prisma.contact.update({
        where: { id: contactId },
        data: updateData,
        select: contactSelect,
      });

      return NextResponse.json({ success: true, contact });
    }

    // ── Ação: Cadastro Rápido de Lead Direto no Estágio ──
    if (body.action === 'QUICK_ADD_LEAD') {
      const result = quickAddLeadSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { message: result.error.issues[0].message },
          { status: 400 }
        );
      }

      const { name, phone, value, tags, notes, stageId, groupId } = result.data;
      const cleanPhone = evolutionApi.formatPhone(phone);

      const contact = await prisma.contact.upsert({
        where: { phone: cleanPhone },
        update: {
          name: name || null,
          value,
          tags,
          notes: notes || null,
          stageId: stageId || null,
          groupId: groupId || null,
        },
        create: {
          phone: cleanPhone,
          name: name || null,
          value,
          tags,
          notes: notes || null,
          stageId: stageId || null,
          groupId: groupId || null,
        },
        select: contactSelect,
      });

      return NextResponse.json({ success: true, contact });
    }

    // ── Ação: Reordenar Estágios em Lote ──
    if (body.action === 'REORDER_STAGES') {
      const result = reorderSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { message: result.error.issues[0].message },
          { status: 400 }
        );
      }

      for (const item of result.data.stages) {
        await prisma.crmStage.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }

      return NextResponse.json({ success: true });
    }

    // ── Ação Padrão: Criação / Edição de Estágio ──
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
    console.error('Erro ao salvar estágio/lead do CRM:', error);
    return NextResponse.json(
      { message: error.message || 'Erro interno no servidor' },
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
