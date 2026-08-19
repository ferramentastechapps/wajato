import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { companySchema } from '@/lib/validation';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    // Se nenhuma empresa existir, podemos criar uma empresa inicial padrão para conveniência
    const count = await prisma.company.count();
    if (count === 0) {
      await prisma.company.create({
        data: {
          name: 'Minha Empresa',
          segment: 'Geral',
          description: 'Empresa de atendimento e vendas.',
          productsServices: 'Produtos e serviços de alta qualidade com preços competitivos.',
          faq: 'Perguntas Frequentes:\n- Quais as formas de pagamento? Aceitamos PIX, Cartão de Crédito e Boleto.\n- Qual o prazo de entrega? De 2 a 5 dias úteis.',
          policies: 'Formas de pagamento: PIX com 5% de desconto, Cartão em até 12x.\nGarantia incondicional de 7 dias.',
          contactInfo: 'WhatsApp de Suporte Humano: mesmo canal.\nHorário de Atendimento: Segunda a Sexta das 08h às 18h.',
          toneOfVoice: 'Amigável, consultivo e prestativo',
          aiInstructions: 'Atenda o cliente sempre pelo nome se souber. Tire dúvidas com base no catálogo e FAQ. Caso o cliente queira fechar negócio, oriente os próximos passos.',
          isDefault: true,
        },
      });
    }

    const companies = await prisma.company.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
      include: {
        _count: {
          select: {
            campaigns: true,
            contacts: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, companies });
  } catch (error: any) {
    console.error('Erro ao listar empresas:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const result = companySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = result.data;

    // Se for a primeira empresa ou estiver marcada como default, lida com a flag isDefault
    const totalCompanies = await prisma.company.count();
    let shouldBeDefault = data.isDefault || totalCompanies === 0;

    if (shouldBeDefault) {
      await prisma.company.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const company = await prisma.company.create({
      data: {
        name: data.name,
        segment: data.segment || null,
        description: data.description,
        productsServices: data.productsServices,
        faq: data.faq || null,
        policies: data.policies || null,
        contactInfo: data.contactInfo || null,
        toneOfVoice: data.toneOfVoice || 'Amigável e profissional',
        aiInstructions: data.aiInstructions || null,
        isDefault: shouldBeDefault,
      },
    });

    return NextResponse.json({ success: true, company });
  } catch (error: any) {
    console.error('Erro ao criar empresa:', error);
    return NextResponse.json(
      { message: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
