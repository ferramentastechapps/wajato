import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redisConnection } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const healthDetails: Record<string, any> = {};
  let isHealthy = true;

  // 1. Verificar conexão com o Banco de Dados (Postgres)
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    healthDetails.postgres = {
      status: 'UP',
      responseTimeMs: Date.now() - start,
    };
  } catch (error: any) {
    isHealthy = false;
    healthDetails.postgres = {
      status: 'DOWN',
      error: error.message || 'Falha de conexão',
    };
  }

  // 2. Verificar conexão com o Redis
  try {
    const start = Date.now();
    // Executa um comando ping básico para testar a conectividade
    const pingResult = await redisConnection.ping();
    if (pingResult === 'PONG') {
      healthDetails.redis = {
        status: 'UP',
        responseTimeMs: Date.now() - start,
      };
    } else {
      throw new Error(`Resposta de ping inesperada: ${pingResult}`);
    }
  } catch (error: any) {
    isHealthy = false;
    healthDetails.redis = {
      status: 'DOWN',
      error: error.message || 'Falha de ping',
    };
  }

  // 3. Adicionar informações do processo e uptime
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();

  const responseStatus = isHealthy ? 200 : 500;

  return NextResponse.json(
    {
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        formatted: formatUptime(uptimeSeconds),
      },
      services: healthDetails,
      system: {
        memory: {
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
      },
    },
    { status: responseStatus }
  );
}

function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}
