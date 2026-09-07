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

    // Valida tipo MIME (imagens, áudio, vídeos e documentos)
    const allowedTypes = [
      'image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml',
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const hasAllowedExt = !!file.name.match(/\.(webp|jpg|jpeg|png|gif|mp3|ogg|wav|m4a|aac|mp4|mov|webm|pdf|doc|docx|txt|xls|xlsx)$/i);
    if (!allowedTypes.includes(file.type) && !hasAllowedExt) {
      return NextResponse.json(
        { message: 'Formato de arquivo não suportado.' },
        { status: 400 }
      );
    }

    // Determina a extensão do arquivo
    let extension = path.extname(file.name) || '.bin';
    if (!extension || extension === '.') {
      if (file.type.startsWith('image/')) extension = '.jpg';
      else if (file.type.startsWith('audio/')) extension = '.mp3';
      else if (file.type.startsWith('video/')) extension = '.mp4';
      else if (file.type === 'application/pdf') extension = '.pdf';
      else extension = '.bin';
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
