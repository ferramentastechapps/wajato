import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';
import { getInstanceDailyCount, getInstanceHourlyCount } from '@/lib/warmup-rate-limiter';

// GET — Lista e sincroniza todas as instâncias do banco local com a Evolution API
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Busca instâncias no Evolution API
    const apiInstances = await evolutionApi.fetchInstances();

    // 1b. Garante que qualquer instância retornada pelo gateway Evolution API exista no banco de dados local
    if (Array.isArray(apiInstances) && apiInstances.length > 0) {
      for (const apiInst of apiInstances) {
        if (!apiInst.name) continue;
        try {
          const exists = await prisma.whatsAppInstance.findUnique({ where: { name: apiInst.name } });
          if (!exists) {
            let phone = null;
            if (apiInst.ownerJid) phone = apiInst.ownerJid.split(':')[0].split('@')[0];
            const status = apiInst.connectionStatus === 'open' ? 'CONNECTED' : 'DISCONNECTED';
            await prisma.whatsAppInstance.create({
              data: {
                name: apiInst.name,
                phone,
                status,
                profilePicUrl: apiInst.profilePicUrl || null,
                profileName: apiInst.profileName || null,
                healthScore: 100,
              },
            });
          }
        } catch (syncErr: any) {
          console.warn(`[Instances Route] Falha ao auto-cadastrar instância ${apiInst.name}:`, syncErr?.message);
        }
      }
    }

    // 2. Busca instâncias no banco de dados local
    const dbInstances = await prisma.whatsAppInstance.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    // 3. Atualiza / Sincroniza em segundo plano cada instância que está no banco local
    const enrichedInstances = await Promise.all(
      dbInstances.map(async (dbInst) => {
        // Encontra o registro correspondente vindo do gateway
        const apiInst = apiInstances.find((i: any) => i.name === dbInst.name);
        
        let status = dbInst.status;
        let phone = dbInst.phone;
        let profilePicUrl = dbInst.profilePicUrl;
        let profileName = dbInst.profileName;
        let qrCode = dbInst.qrCode;

        if (apiInst) {
          // IMPORTANTE: disconnectionReasonCode é HISTÓRICO (referente ao último logout),
          // NÃO indica o estado atual. Se o connectionStatus é 'open', a instância ESTÁ conectada
          // independente do motivo de desconexão anterior.
          if (apiInst.connectionStatus === 'open') {
            status = 'CONNECTED';
          } else {
            // Só usa o código de desconexão para classificar estados não-'open'
            status = qrCode ? 'DISCONNECTED' : 'INITIALIZING';
          }
          
          if (apiInst.ownerJid) {
            phone = apiInst.ownerJid.split(':')[0].split('@')[0];
          }
          
          profilePicUrl = apiInst.profilePicUrl || null;
          profileName = apiInst.profileName || null;
          
          // Se já está conectado, limpa o QR Code anterior
          if (status === 'CONNECTED') {
            qrCode = null;
          }

          // Salva no banco de dados se mudou algo
          if (
            dbInst.status !== status ||
            dbInst.phone !== phone ||
            dbInst.profilePicUrl !== profilePicUrl ||
            dbInst.profileName !== profileName ||
            (status === 'CONNECTED' && dbInst.qrCode !== null)
          ) {
            await prisma.whatsAppInstance.update({
              where: { id: dbInst.id },
              data: {
                status,
                phone,
                profilePicUrl,
                profileName,
                qrCode: status === 'CONNECTED' ? null : qrCode,
              },
            });
          }
        } else {
          // Se a instância não existe no Evolution API mas existe no banco, marcamos como desconectada
          if (dbInst.status !== 'DISCONNECTED') {
            status = 'DISCONNECTED';
            await prisma.whatsAppInstance.update({
              where: { id: dbInst.id },
              data: { status: 'DISCONNECTED', qrCode: null },
            });
          }
        }

        // 4. Calcular o Grau de Aquecimento (%) e saúde da instância
        let warmupProgress = 0;
        let heatScore = 0;
        let activeWarmupType: 'SINGLE' | 'POOL' | 'MATURED' | 'NONE' = 'NONE';
        let warmupCampaignId: string | null = null;
        let warmupPoolId: string | null = null;
        let isMatured = false;

        // Busca TODAS as campanhas onde a instância participa
        const [userCampaigns, userPools] = await Promise.all([
          prisma.warmupCampaign.findMany({
            where: {
              OR: [
                { sourceInstance: dbInst.name },
                { targetInstance: dbInst.name },
              ],
            },
            orderBy: { currentDay: 'desc' },
          }),
          prisma.warmupPool.findMany({
            where: {
              instanceNames: { has: dbInst.name },
            },
            orderBy: { currentDay: 'desc' },
          }),
        ]);

        if (userCampaigns.length > 0 || userPools.length > 0) {
          // Calcula o melhor progresso e score entre todas as campanhas em que o chip participa
          let bestProgress = 0;
          let bestHeat = 0;
          let hasCompletedOrContinuous = false;

          for (const c of userCampaigns) {
            const prog = Math.min(100, Math.round((Math.min(c.currentDay, c.totalDays) / c.totalDays) * 100));
            if (prog > bestProgress) bestProgress = prog;
            if (c.heatScore > bestHeat) bestHeat = c.heatScore;
            if (c.status === 'COMPLETED' || c.currentDay >= c.totalDays || (c.continuousMode && c.currentDay >= c.totalDays)) {
              hasCompletedOrContinuous = true;
            }
            if (!warmupCampaignId) warmupCampaignId = c.id;
          }

          for (const p of userPools) {
            const prog = Math.min(100, Math.round((Math.min(p.currentDay, p.totalDays) / p.totalDays) * 100));
            if (prog > bestProgress) bestProgress = prog;
            if (p.heatScore > bestHeat) bestHeat = p.heatScore;
            if (p.status === 'COMPLETED' || p.currentDay >= p.totalDays || (p.continuousMode && p.currentDay >= p.totalDays)) {
              hasCompletedOrContinuous = true;
            }
            if (!warmupPoolId) warmupPoolId = p.id;
          }

          warmupProgress = bestProgress;
          heatScore = bestHeat || (bestProgress >= 100 ? 100 : 0);

          if (hasCompletedOrContinuous || bestProgress >= 100) {
            isMatured = true;
            activeWarmupType = 'MATURED';
            warmupProgress = 100;
          } else if (userCampaigns.some(c => c.status === 'RUNNING' || c.status === 'PAUSED')) {
            activeWarmupType = 'SINGLE';
          } else if (userPools.some(p => p.status === 'RUNNING' || p.status === 'PAUSED')) {
            activeWarmupType = 'POOL';
          }
        }

        // 5. Buscar contadores em tempo real do Redis
        const [redisDailyCount, redisHourlyCount] = await Promise.all([
          getInstanceDailyCount(dbInst.name).catch(() => 0),
          getInstanceHourlyCount(dbInst.name).catch(() => 0),
        ]);

        // Usar o maior entre banco e Redis para garantir precisão
        const dailyMsgCount = Math.max(dbInst.dailyMsgCount, redisDailyCount);
        const hourlyMsgCount = redisHourlyCount;
        const healthScore = dbInst.healthScore;

        // 6. Buscar último envio (warmup log mais recente)
        const lastLog = await prisma.warmupLog.findFirst({
          where: { fromInstance: dbInst.name },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const lastMessageAt = lastLog?.createdAt || null;

        // 7. Verificar se está em cooldown (descanso ativo)
        let isInCooldown = false;
        if (campaign?.restPeriodUntil && new Date(campaign.restPeriodUntil) > new Date()) {
          isInCooldown = true;
        }

        // 8. Calcular Score de Proteção (0-100)
        const hasProxy = !!dbInst.proxy;
        const isWarmedOrWarming = activeWarmupType !== 'NONE' || heatScore >= 70;
        const isBlockedByUnreplied = dbInst.unrepliedBlockEnabled && dbInst.unrepliedMsgCount >= dbInst.maxUnrepliedLimit;

        let protectionScore = (
          (hasProxy ? 30 : 0) +
          (healthScore >= 70 ? 30 : healthScore >= 40 ? 15 : 0) +
          (isWarmedOrWarming ? 20 : 0) +
          (dailyMsgCount < 160 ? 20 : dailyMsgCount < 200 ? 10 : 0)
        );

        // Se o chip foi pausado por falta de resposta, seu score de proteção vai para 0% (Em Risco máximo)
        if (isBlockedByUnreplied) {
          protectionScore = 0;
        }

        // 9. Gerar alertas proativos
        const alerts: { message: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' }[] = [];
        if (status === 'CONNECTED') {
          if (isBlockedByUnreplied) {
            alerts.push({
              message: `Pausado por segurança: enviou ${dbInst.unrepliedMsgCount} mensagens consecutivas sem nenhuma resposta de clientes.`,
              severity: 'HIGH'
            });
          }
          if (!hasProxy) {
            alerts.push({ message: 'Sem proxy — risco de ban por IP compartilhado', severity: 'HIGH' });
          }
          if (healthScore < 40) {
            alerts.push({ message: `Saúde crítica (${healthScore}%) — pause envios por 24h`, severity: 'HIGH' });
          } else if (healthScore < 70) {
            alerts.push({ message: `Saúde degradada (${healthScore}%) — monitore de perto`, severity: 'LOW' });
          }
          if (dailyMsgCount > 160) {
            alerts.push({ message: `${dailyMsgCount}/200 msgs hoje — perto do limite diário`, severity: 'MEDIUM' });
          }
          if (hourlyMsgCount > 48) {
            alerts.push({ message: `${hourlyMsgCount}/60 msgs/h — perto do limite horário`, severity: 'MEDIUM' });
          }
          if (activeWarmupType === 'NONE' && heatScore < 50) {
            alerts.push({ message: 'Chip frio — aqueça antes de usar para campanhas', severity: 'LOW' });
          }
        }

        return {
          id: dbInst.id,
          name: dbInst.name,
          status,
          phone,
          qrCode,
          profilePicUrl,
          profileName,
          warmupProgress,
          heatScore,
          activeWarmupType,
          isMatured,
          warmupCampaignId,
          warmupPoolId,
          proxy: dbInst.proxy,
          updatedAt: dbInst.updatedAt,
          // Novos campos de proteção
          dailyMsgCount,
          hourlyMsgCount,
          healthScore,
          lastMessageAt,
          isInCooldown,
          protectionScore,
          alerts,
          // Campos de controle de mensagens sem resposta
          unrepliedMsgCount: dbInst.unrepliedMsgCount,
          maxUnrepliedLimit: dbInst.maxUnrepliedLimit,
          unrepliedBlockEnabled: dbInst.unrepliedBlockEnabled,
        };

      })
    );

    return NextResponse.json(enrichedInstances);
  } catch (error: any) {
    console.error('Erro ao listar conexões:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

// POST — Cadastra uma nova instância (cria no gateway e insere no banco local)
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { name, proxy } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'O nome da instância é obrigatório' }, { status: 400 });
    }

    // Valida o nome (apenas letras, números e traços)
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanName) {
      return NextResponse.json({ error: 'Nome de instância inválido' }, { status: 400 });
    }

    // Verifica se já existe localmente
    const existing = await prisma.whatsAppInstance.findUnique({
      where: { name: cleanName },
    });

    if (existing) {
      return NextResponse.json({ error: 'Já existe uma instância cadastrada com este nome' }, { status: 400 });
    }

    // 1. Cria a instância na Evolution API
    let createData;
    let qrCodeBase64 = null;
    let connectionState: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED' = 'DISCONNECTED';

    try {
      createData = await evolutionApi.createInstance(cleanName);
      qrCodeBase64 = createData?.qrcode?.base64 || null;
      connectionState = createData?.instance?.status === 'open' ? 'CONNECTED' : (qrCodeBase64 ? 'DISCONNECTED' : 'INITIALIZING');
    } catch (err: any) {
      // Se der erro porque a instância já existe no Evolution mas não no banco local, tentamos obter o QR Code
      try {
        const qrData = await evolutionApi.getQRCode(cleanName);
        qrCodeBase64 = qrData?.base64 || null;
        connectionState = 'DISCONNECTED';
      } catch (innerErr) {
        return NextResponse.json({ error: err.message || 'Erro ao criar instância na API Evolution' }, { status: 500 });
      }
    }

    // 2. Insere no banco local
    const dbStatus = connectionState === 'CONNECTED' ? 'CONNECTED' : (qrCodeBase64 ? 'DISCONNECTED' : 'INITIALIZING');
    const newInst = await prisma.whatsAppInstance.create({
      data: {
        name: cleanName,
        status: dbStatus,
        qrCode: qrCodeBase64,
        proxy: proxy || null,
      },
    });

    // 3. Configura Proxy se fornecida
    if (proxy) {
      try {
        await evolutionApi.setInstanceProxy(cleanName, proxy);
        console.log(`[POST Instance] Proxy configurado com sucesso para ${cleanName}`);
      } catch (proxyErr) {
        console.error(`[POST Instance] Erro ao configurar proxy para ${cleanName}:`, proxyErr);
      }
    }

    // 4. Configura Webhook
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      await evolutionApi.setWebhook(cleanName, `${appUrl}/api/webhook`);
    } catch (webhookErr) {
      console.error(`Erro ao configurar webhook para ${cleanName}:`, webhookErr);
    }

    return NextResponse.json({
      success: true,
      instance: newInst,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao cadastrar instância:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
