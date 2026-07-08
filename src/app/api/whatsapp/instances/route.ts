import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { evolutionApi } from '@/lib/evolution';
import { prisma } from '@/lib/prisma';

// GET — Lista e sincroniza todas as instâncias do banco local com a Evolution API
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // 1. Busca instâncias no Evolution API
    const apiInstances = await evolutionApi.fetchInstances();

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
          // Se encontrou no gateway, atualiza os dados
          status = apiInst.connectionStatus === 'open' ? 'CONNECTED' : (apiInst.connectionStatus === 'connecting' ? 'INITIALIZING' : 'DISCONNECTED');
          
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
        let activeWarmupType: 'SINGLE' | 'POOL' | 'NONE' = 'NONE';
        let warmupCampaignId: string | null = null;
        let warmupPoolId: string | null = null;

        // Busca se tem alguma campanha individual rodando
        const campaign = await prisma.warmupCampaign.findFirst({
          where: {
            sourceInstance: dbInst.name,
            status: { in: ['RUNNING', 'PAUSED'] },
          },
        });

        if (campaign) {
          warmupProgress = Math.min(100, Math.round((campaign.currentDay / campaign.totalDays) * 100));
          heatScore = campaign.heatScore;
          activeWarmupType = 'SINGLE';
          warmupCampaignId = campaign.id;
        } else {
          // Se não encontrou campanha individual, busca se está em algum pool
          const pool = await prisma.warmupPool.findFirst({
            where: {
              instanceNames: { has: dbInst.name },
              status: { in: ['RUNNING', 'PAUSED'] },
            },
          });

          if (pool) {
            warmupProgress = Math.min(100, Math.round((pool.currentDay / pool.totalDays) * 100));
            heatScore = pool.heatScore;
            activeWarmupType = 'POOL';
            warmupPoolId = pool.id;
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
          warmupCampaignId,
          warmupPoolId,
          proxy: dbInst.proxy,
          updatedAt: dbInst.updatedAt,
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
