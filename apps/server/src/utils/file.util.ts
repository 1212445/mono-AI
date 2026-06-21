import { extname } from 'path';
import { OfficeParser } from 'officeparser';

const IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isImageFile(file: Express.Multer.File): boolean {
  const ext = extname(file.originalname).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return true;
  return IMAGE_MIMES[file.mimetype] !== undefined;
}

export function toImageDataUrl(file: Express.Multer.File): string {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `图片 ${file.originalname} 超过 5MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(2)}MB）`,
    );
  }
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

export async function extractFileContent(
  file: Express.Multer.File,
): Promise<string> {
  const ext = extname(file.originalname).toLowerCase();

  switch (ext) {
    case '.docx':
    case '.pptx':
    case '.xlsx':
    case '.pdf': {
      const fileType = ext.slice(1) as 'docx' | 'pptx' | 'xlsx' | 'pdf';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const ast = await OfficeParser.parseOffice(file.buffer, { fileType });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const result = await ast.to('text');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return result.value as unknown as string;
    }
    case '.doc':
      throw new Error('不支持 .doc 格式，请转换为 .docx 格式后上传');
    case '.csv':
    case '.md':
    case '.txt':
      return file.buffer.toString('utf-8');
    case '.json':
      return file.buffer.toString('utf-8');
    default:
      throw new Error(`不支持的文件类型: ${ext}`);
  }
}
