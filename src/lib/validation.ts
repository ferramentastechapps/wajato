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
  optOut: z.boolean().optional(),
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
  bodyVariants: z.array(z.string().trim().min(1)).default([]),  // Variações do texto principal
  imageUrl: z.string().url('URL da imagem inválida').or(z.literal('')).nullable().optional(),
  enableHook: z.boolean().default(false),
  hookMessage: z.string().trim().nullable().optional(),
  hookVariants: z.array(z.string().trim().min(1)).default([]),
  hookMode: z.enum(['ON_REPLY', 'DELAY']).default('ON_REPLY'),
  hookDelay: z.coerce.number().int().min(1).default(15),
});

// Schema para campanhas de mensagens
export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'O nome da campanha é obrigatório'),
  templateId: z.string().uuid('ID do template inválido'),
  groupId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do grupo inválido').optional().nullable()),
  segmentId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID do segmento inválido').optional().nullable()),
  companyId: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID da empresa inválido').optional().nullable()),
  delayMin: z.coerce.number().int().min(1, 'Delay mínimo deve ser pelo menos 1 segundo').default(5),
  delayMax: z.coerce.number().int().min(1, 'Delay máximo deve ser pelo menos 1 segundo').default(15),
  messageVariants: z.array(z.string().trim().min(1)).default([]), // Variantes de texto adicionais
  batchSize: z.coerce.number().int().min(0).default(0),           // 0 = desabilitado
  batchCooldown: z.coerce.number().int().min(0).default(600),     // segundos de pausa entre lotes
  startHour: z.coerce.number().int().min(0).max(23).default(8),
  endHour: z.coerce.number().int().min(0).max(23).default(20),
  allowedDays: z.array(z.coerce.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6]),
  instanceMode: z.enum(['AUTO_MATURE', 'SPECIFIC']).default('AUTO_MATURE'),
  instanceNames: z.array(z.string().trim()).default([]),
  scheduledAt: z.preprocess((val) => val === '' || val === null ? null : val, z.string().datetime().nullable().optional()),
}).refine(data => data.groupId || data.segmentId, {
  message: "Selecione um grupo de contatos ou uma segmentação para a campanha",
  path: ["groupId"]
}).refine(data => data.startHour < data.endHour || (data.startHour === 0 && data.endHour === 23), {
  message: "O horário de início deve ser anterior ao horário de término",
  path: ["startHour"]
});

// Schema para Empresas / Base de Conhecimento de IA
export const companySchema = z.object({
  id: z.preprocess((val) => val === '' ? null : val, z.string().uuid('ID da empresa inválido').optional().nullable()),
  name: z.string().trim().min(1, 'O nome da empresa é obrigatório'),
  segment: z.string().trim().nullable().optional(),
  description: z.string().trim().min(1, 'A descrição da empresa é obrigatória'),
  productsServices: z.string().trim().min(1, 'Os produtos/serviços e preços são obrigatórios'),
  faq: z.string().trim().nullable().optional(),
  policies: z.string().trim().nullable().optional(),
  contactInfo: z.string().trim().nullable().optional(),
  toneOfVoice: z.string().trim().nullable().optional(),
  aiInstructions: z.string().trim().nullable().optional(),
  isDefault: z.boolean().default(false),
});

// Schemas para Chatbot Auto-responder
export const chatbotRuleSchema = z.object({
  id: z.string().uuid('ID inválido').optional().nullable(),
  trigger: z.string().trim().min(1, 'A palavra-chave/gatilho é obrigatória'),
  matchType: z.enum(['EXACT', 'CONTAINS', 'STARTS_WITH', 'REGEX']),
  response: z.string().trim().optional().default(''),
  imageUrl: z.string().url('URL da imagem inválida').or(z.literal('')).nullable().optional(),
  isActive: z.boolean().default(true),
  priority: z.coerce.number().int().min(0).max(999).default(0),
  category: z.string().trim().nullable().optional(),
  action: z.enum(['REPLY', 'TAG_AND_REPLY', 'OPTOUT_AND_REPLY', 'TAG_ONLY']).default('REPLY'),
  autoTags: z.array(z.string().trim().min(1)).default([]),
});

export const chatbotConfigSchema = z.object({
  aiEnabled: z.boolean(),
  aiContext: z.string().trim().min(1, 'O contexto de inteligência artificial é obrigatório'),
  geminiApiKey: z.string().trim().nullable().optional(),
  businessHoursOnly: z.boolean(),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(0).max(23),
});

