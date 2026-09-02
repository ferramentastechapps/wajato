import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/uploads
 * Upload de arquivos de mídia (imagens WebP/JPG/PNG) para campanhas e templates.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ message: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Valida tipo MIME (apenas imagens e mídias seguras)
    const allowedTypes = ['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(webp|jpg|jpeg|png|gif)$/i)) {
      return NextResponse.json(
        { message: 'Formato de arquivo não suportado. Envie imagens WebP, JPG ou PNG.' },
        { status: 400 }
      );
    }

    // Determina a extensão do arquivo
    let extension = '.webp';
    if (file.type === 'image/jpeg' || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')) {
      extension = '.jpg';
    } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
      extension = '.png';
    } else if (file.type === 'image/gif' || file.name.endsWith('.gif')) {
      extension = '.gif';
    } else if (file.type === 'image/webp' || file.name.endsWith('.webp')) {
      extension = '.webp';
    }

    // Gera um nome único e seguro para o arquivo
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const filename = `media_${Date.now()}_${randomSuffix}${extension}`;

    // Garante que o diretório public/uploads exista
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Grava o buffer no disco
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Determina a URL pública acessível para a Evolution API e WhatsApp
    const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'wajato.ftech-apps.com.br';
    const protoHeader = req.headers.get('x-forwarded-proto') || 'https';
    const configuredBase = process.env.NEXT_PUBLIC_APP_URL || `${protoHeader}://${hostHeader}`;
    const cleanBaseUrl = configuredBase.replace(/\/$/, '');

    const publicUrl = `${cleanBaseUrl}/api/uploads/${filename}`;
    const relativeUrl = `/api/uploads/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      relativeUrl,
      filename,
      size: buffer.length,
      type: file.type || 'image/webp',
    });
  } catch (error: any) {
    console.error('Erro no upload de mídia:', error);
    return NextResponse.json(
      { message: error.message || 'Erro ao processar o upload do arquivo' },
      { status: 500 }
    );
  }
}
