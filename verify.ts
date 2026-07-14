import { prisma } from './src/lib/prisma';
import { evolutionApi } from './src/lib/evolution';

async function main() {
  console.log("=== 🔍 1. Estado no banco ANTES da sincronização ===");
  const instBefore = await prisma.whatsAppInstance.findUnique({
    where: { name: 'marcelo' }
  });
  console.log("Nome:", instBefore?.name);
  console.log("Status:", instBefore?.status);
  console.log("HealthScore:", instBefore?.healthScore);
  console.log("unrepliedMsgCount:", instBefore?.unrepliedMsgCount);

  console.log("\n=== ⚙️ 2. Executando Sincronização ===");
  const apiInstances = await evolutionApi.fetchInstances();
  const dbInstances = await prisma.whatsAppInstance.findMany();

  for (const dbInst of dbInstances) {
    const apiInst = apiInstances.find((i: any) => i.name === dbInst.name);
    if (apiInst) {
      const isUnauthorized = apiInst.disconnectionReasonCode === 401 || 
                             (apiInst.disconnectionObject && 
                              typeof apiInst.disconnectionObject === 'string' && 
                              apiInst.disconnectionObject.includes('401'));

      const status = (apiInst.connectionStatus === 'open' && !isUnauthorized)
        ? 'CONNECTED'
        : 'DISCONNECTED';

      if (dbInst.status !== status) {
        await prisma.whatsAppInstance.update({
          where: { id: dbInst.id },
          data: { status }
        });
        console.log(`Instância ${dbInst.name} atualizada de ${dbInst.status} para ${status}`);
      } else {
        console.log(`Instância ${dbInst.name} manteve status ${dbInst.status}`);
      }
    }
  }

  console.log("\n=== 🔍 3. Estado no banco DEPOIS da sincronização ===");
  const instAfter = await prisma.whatsAppInstance.findUnique({
    where: { name: 'marcelo' }
  });
  console.log("Nome:", instAfter?.name);
  console.log("Status:", instAfter?.status);
  console.log("HealthScore:", instAfter?.healthScore);
}

main().catch(console.error).finally(() => prisma.$disconnect());
