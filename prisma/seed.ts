import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin_wajato_secure_password';

  console.log('Iniciando semeadura do banco de dados...');

  // Verifica se o usuário já existe
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (!existingUser) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });
    console.log(`Usuário administrador criado: ${user.username}`);
  } else {
    console.log(`Usuário administrador "${username}" já existe.`);
  }

  // Criar grupo de contatos padrão se não existir
  const defaultGroup = await prisma.contactGroup.findUnique({
    where: { name: 'Geral' },
  });

  if (!defaultGroup) {
    await prisma.contactGroup.create({
      data: {
        name: 'Geral',
        description: 'Grupo padrão de contatos importados',
      },
    });
    console.log('Grupo padrão "Geral" criado.');
  }

  console.log('Semeadura concluída!');
}

main()
  .catch((e) => {
    console.error('Erro na semeadura do banco:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
