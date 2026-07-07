import { prisma } from './prisma';

export interface SegmentFilters {
  groupId?: string | null;
  tags?: string[];
  excludedTags?: string[];
  engagement?: 'ALL' | 'READ' | 'DELIVERED' | 'UNENGAGED';
}

/**
 * Resolve contatos dinamicamente com base nas regras do segmento.
 */
export async function resolveContactsForSegment(filters: SegmentFilters): Promise<any[]> {
  const { groupId, tags = [], excludedTags = [], engagement = 'ALL' } = filters;

  // 1. Monta as condições básicas do Prisma
  const whereClause: any = {};

  if (groupId) {
    whereClause.groupId = groupId;
  }

  // 2. Filtro de inclusão de tags (se informado, o contato precisa ter pelo menos uma dessas tags)
  if (tags && tags.length > 0) {
    whereClause.tags = {
      hasSome: tags,
    };
  }

  // 3. Filtro de exclusão de tags (se informado, o contato NÃO pode ter nenhuma dessas tags)
  // Exemplo clássico: blacklist, opt-out
  if (excludedTags && excludedTags.length > 0) {
    // Para não quebrar contatos sem tags, criamos uma negação lógica
    whereClause.NOT = [
      {
        tags: {
          hasSome: excludedTags,
        },
      },
    ];
  }

  // Busca inicial dos contatos aplicando filtros básicos (Grupo + Tags)
  let contacts = await prisma.contact.findMany({
    where: whereClause,
    include: {
      logs: {
        select: {
          status: true,
        },
      },
    },
  });

  // 4. Filtro de Engajamento pós-busca (processamento leve em memória)
  if (engagement && engagement !== 'ALL') {
    contacts = contacts.filter((contact) => {
      const hasLogs = contact.logs.length > 0;

      if (engagement === 'READ') {
        // Precisa ter pelo menos um log 'READ'
        return contact.logs.some((l: any) => l.status === 'READ');
      }

      if (engagement === 'DELIVERED') {
        // Precisa ter pelo menos um log 'DELIVERED' ou 'READ'
        return contact.logs.some((l: any) => l.status === 'DELIVERED' || l.status === 'READ');
      }

      if (engagement === 'UNENGAGED') {
        // Não tem logs OU nenhum log foi DELIVERED ou READ
        return !hasLogs || !contact.logs.some((l: any) => l.status === 'DELIVERED' || l.status === 'READ');
      }

      return true;
    });
  }

  return contacts;
}
