import { Injectable } from '@nestjs/common';
import {
  model,
  embedding,
  retrieveDocuments,
  ragChat,
  chat,
  dropCollection,
  type ChatHistory,
} from '@rag/ai-core';
import {
  extractFileContent,
  isImageFile,
  toImageDataUrl,
} from 'src/utils/file.util';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { ChatSessionService } from '../chat-session/chat-session.service';
import { ChatDto } from './dto/chat.dto';
import { Response } from 'express';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatHistoryService: ChatHistoryService,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  async chat(
    chatDto: ChatDto,
    res: Response,
    files?: Express.Multer.File[],
  ): Promise<void> {
    const { question, mode, sessionId } = chatDto;
    const modeNumber = mode ? Number(mode) : 1;
    const currentSessionId = sessionId || this.generateSessionId();
    const llm = model();
    const embeddingModel = embedding();
    const date = new Date();
    let fileContext = '';
    const images: string[] = [];
    if (files && files.length > 0) {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (isImageFile(file)) {
          images.push(toImageDataUrl(file));
        } else {
          const content = await extractFileContent(file);
          fileContext += `\n--- 文件${index + 1}: ${file.originalname} ---\n${content}\n`;
        }
      }
    }
    const tt = await this.findBySessionId(currentSessionId);
    if (tt.data.length > 0) {
      await this.chatSessionService.updated(currentSessionId, date);
    } else {
      await this.chatSessionService.updated(currentSessionId, date, question);
    }
    const historyRecords =
      await this.chatHistoryService.getHistoryBySessionId(currentSessionId);
    const history: ChatHistory[] = historyRecords.map((item) => ({
      question: item.question,
      answer: item.answer,
    }));

    res.write(`data: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`);
    let fullAnswer = '';
    let streamError: string | null = null;

    // 心跳：每 10s 写一行 SSE 注释，防代理/浏览器因长时间无数据掐连接
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        // 客户端已断，clearInterval 在 finally 里兜底
      }
    }, 10000);

    try {
      if (modeNumber === 2) {
        const context = await retrieveDocuments(
          question,
          3,
          llm,
          embeddingModel,
        );
        const answer = ragChat(
          currentSessionId,
          question,
          history,
          fileContext,
          context,
          images.length > 0 ? images : undefined,
        );
        for await (const ev of answer) {
          if (ev.type === 'content') {
            fullAnswer += ev.delta;
            res.write(
              `event: content\ndata: ${JSON.stringify({ content: ev.delta })}\n\n`,
            );
          } else if (ev.type === 'reasoning') {
            res.write(
              `event: reasoning\ndata: ${JSON.stringify({ delta: ev.delta })}\n\n`,
            );
          } else if (ev.type === 'tool_call') {
            res.write(
              `event: tool_call\ndata: ${JSON.stringify({ id: ev.id, name: ev.name, args: ev.args })}\n\n`,
            );
          } else if (ev.type === 'tool_result') {
            res.write(
              `event: tool_result\ndata: ${JSON.stringify({ id: ev.id, name: ev.name })}\n\n`,
            );
          }
        }
      } else {
        const answer = chat(
          currentSessionId,
          question,
          history,
          fileContext,
          images.length > 0 ? images : undefined,
        );
        for await (const ev of answer) {
          if (ev.type === 'content') {
            fullAnswer += ev.delta;
            res.write(
              `event: content\ndata: ${JSON.stringify({ content: ev.delta })}\n\n`,
            );
          } else if (ev.type === 'reasoning') {
            res.write(
              `event: reasoning\ndata: ${JSON.stringify({ delta: ev.delta })}\n\n`,
            );
          } else if (ev.type === 'tool_call') {
            res.write(
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              `event: tool_call\ndata: ${JSON.stringify({ id: ev.id, name: ev.name, args: ev.args })}\n\n`,
            );
          } else if (ev.type === 'tool_result') {
            res.write(
              `event: tool_result\ndata: ${JSON.stringify({ id: ev.id, name: ev.name })}\n\n`,
            );
          }
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err);
      console.error('[chat] stream error:', err);
      try {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: streamError })}\n\n`,
        );
      } catch {
        // 客户端也断了，不必再发
      }
    } finally {
      clearInterval(heartbeat);
      if (!streamError) {
        await this.chatHistoryService.saveChat(
          currentSessionId,
          question,
          fullAnswer,
          modeNumber,
          date,
        );
      }
      try {
        res.write('data: [DONE]\n\n');
      } catch {
        // 客户端已断，无需再发
      }
      res.end();
    }
  }

  async findBySessionId(sessionId: string) {
    const records =
      await this.chatHistoryService.getHistoryBySessionId(sessionId);
    return { data: records };
  }

  async findAllSessionId() {
    const data = await this.chatSessionService.findAll();
    return { data: data };
  }

  async remove() {
    try {
      await dropCollection();
    } catch (error) {
      console.error('删除 collection 失败:', error);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
