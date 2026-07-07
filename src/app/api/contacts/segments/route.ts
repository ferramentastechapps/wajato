import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const segmentSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, 'Nome do segmento é obrigatório'),
  description: z.string().trim().optional().nullable(),
  filters: z.object({
    groupId: z.string().uuid().optional().nullable(),
    tags: z.array(z.string()).default([]),
    excludedTags: z.array(z.string()).default([]),
    engagement: z.enum(['ALL', 'READ', 'DELIVERED', 'UNENGAGED']).default('ALL'),
  }),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const segments = await prisma.contactSegment.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, segments });
  } catch (error: any) {
    console.error('Erro ao listar segmentos:', error);
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
    const result = segmentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { id, name, description, filters } = result.data;

    let segment;
    if (id) {
      segment = await prisma.contactSegment.update({
        where: { id },
        data: {
          name,
          description,
          filters: filters as any,
        },
      });
    } else {
      // Evita nomes duplicados
      const existing = await prisma.contactSegment.findUnique({
        where: { name },
      });
      if (existing) {
        return NextResponse.json(
          { message: 'Já existe um segmento com esse nome' },
          { status: 400 }
        );
      }

      segment = await prisma.contactSegment.create({
        data: {
          name,
          description,
          filters: filters as any,
        },
      });
    }

    return NextResponse.json({ success: true, segment });
  } catch (error: any) {
    console.error('Erro ao salvar segmento:', error);
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
        { message: 'ID do segmento não informado' },
        { status: 400 }
      );
    }

    // Verifica se há campanhas vinculadas a esse segmento antes de excluir
    const linkedCampaigns = await prisma.campaign.count({
      where: { segmentId: id },
    });

    if (linkedCampaigns > 0) {
      return NextResponse.json(
        { message: 'Não é possível excluir um segmento vinculado a campanhas' },
        { status: 400 }
      );
    }

    await prisma.contactSegment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Segmento excluído com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir segmento:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
