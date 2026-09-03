const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const t = await prisma.template.findUnique({
    where: { id: '640b716e-6f2e-469f-88ba-358d5abf0d8e' }
  });
  console.log('Template:', t);
  process.exit(0);
}
run();
