import { z } from 'zod';

// Schema para login de usuário
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'O nome de usuário é obrigatório'),
  password: z.string().min(1, 'A senha é obrigatória'),
});

// Schema para criação de contato único
export const contactSchema = z.object({
  name: z.string().trim().nullable().optional(),
  phone: z.string().trim().min(8, 'O telefone deve ter no mínimo 8 dígitos'),
  tags: z.array(z.string().trim()).default([]),
  groupId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do grupo inválido').nullable().optional()),
});

// Schema para lote de contatos (importação)
export const contactImportSchema = z.object({
  contacts: z.array(z.object({
    name: z.string().trim().nullable().optional(),
    phone: z.string().trim().min(8, 'O telefone deve ter no mínimo 8 dígitos'),
    tags: z.array(z.string().trim()).default([]),
    groupName: z.string().trim().optional(),
  })),
  groupId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do grupo inválido').nullable().optional()),
});

// Schema para templates de mensagem
export const templateSchema = z.object({
  id: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do template inválido').optional().nullable()),
  name: z.string().trim().min(1, 'O nome do template é obrigatório'),
  body: z.string().trim().min(1, 'O texto da mensagem é obrigatório'),
  imageUrl: z.string().url('URL da imagem inválida').or(z.literal('')).nullable().optional(),
});

// Schema para campanhas de mensagens
export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'O nome da campanha é obrigatório'),
  templateId: z.string().uuid('ID do template inválido'),
  groupId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do grupo inválido').optional().nullable()),
  segmentId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do segmento inválido').optional().nullable()),
  delayMin: z.coerce.number().int().min(1, 'Delay mínimo deve ser pelo menos 1 segundo').default(5),
  delayMax: z.coerce.number().int().min(1, 'Delay máximo deve ser pelo menos 1 segundo').default(15),
  scheduledAt: z.preprocess((val) => val === '' || val === null ? null : val, z.string().datetime().nullable().optional()),
}).refine(data => data.groupId || data.segmentId, {
  message: "Selecione um grupo de contatos ou uma segmentação para a campanha",
  path: ["groupId"]
});

// Schemas para Chatbot Auto-responder
export const chatbotRuleSchema = z.object({
  id: z.string().uuid('ID inválido').optional().nullable(),
  trigger: z.string().trim().min(1, 'A palavra-chave/gatilho é obrigatória'),
  matchType: z.enum(['EXACT', 'CONTAINS']),
  response: z.string().trim().min(1, 'A mensagem de resposta é obrigatória'),
  imageUrl: z.string().url('URL da imagem inválida').or(z.literal('')).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const chatbotConfigSchema = z.object({
  aiEnabled: z.boolean(),
  aiContext: z.string().trim().min(1, 'O contexto de inteligência artificial é obrigatório'),
  geminiApiKey: z.string().trim().nullable().optional(),
  businessHoursOnly: z.boolean(),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(0).max(23),
});
