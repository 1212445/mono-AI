import { extname } from 'path';
import { OfficeParser } from 'officeparser';

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
