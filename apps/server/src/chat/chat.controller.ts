import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFiles,
  Header,
  Res,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @Header('Content-Type', 'text/event-stream') // 关键：SSE 类型
  @Header('Cache-Control', 'no-cache') // 不缓存
  @Header('Connection', 'keep-alive') // 保持连接
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'files', maxCount: 5 }], {
      storage: diskStorage({
        destination: './src/upload',
        filename: (req, file, cb) => {
          const originalName = Buffer.from(
            file.originalname,
            'latin1',
          ).toString('utf8');
          cb(null, originalName);
        },
      }),
    }),
  )
  async chat(
    @Body() chatDto: ChatDto,
    @UploadedFiles() content: { files: Express.Multer.File[] },
    @Res() res: Response,
  ) {
    const { files } = content;
    return this.chatService.chat(chatDto, res, files);
  }

  @Get('/:id')
  async findBySessionId(@Param('id') sessionId: string) {
    return await this.chatService.findBySessionId(sessionId);
  }

  @Get('/r/r')
  async remove() {
    return await this.chatService.remove();
  }
}
