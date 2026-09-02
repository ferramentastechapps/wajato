import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/contacts/duplicates
 * Retorna pares de contatos que possuem o mesmo nome (case-insensitive)
 * mas números de telefone diferentes (possíveis duplicatas).
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // Agrupa contatos por nome normalizado e busca grupos com mais de 1 contato
    const allContacts = await prisma.contact.findMany({
      where: {
        name: { not: null },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        tags: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        optOut: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    // Agrupa pelo nome normalizado (lowercase + trim)
    const byName: Record<string, typeof allContacts> = {};
    for (const contact of allContacts) {
      if (!contact.name) continue;
      const normalizedName = contact.name.trim().toLowerCase();
      if (!byName[normalizedName]) byName[normalizedName] = [];
      byName[normalizedName].push(contact);
    }

    // Filtra grupos com mais de um contato (duplicatas potenciais)
    const duplicateGroups = Object.entries(byName)
      .filter(([, contacts]) => contacts.length > 1)
      .map(([name, contacts]) => ({ name, contacts }));

    return NextResponse.json({
      success: true,
      total: duplicateGroups.reduce((acc, g) => acc + g.contacts.length, 0),
      groups: duplicateGroups.length,
      duplicates: duplicateGroups,
    });
  } catch (error: any) {
    console.error('Erro ao buscar duplicatas:', error);
    return NextResponse.json({ message: 'Erro interno no servidor' }, { status: 500 });
  }
}
