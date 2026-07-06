import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    
    const logs = await prisma.warmupLog.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'asc' }, // Ordem cronológica para chat
    });
    
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
