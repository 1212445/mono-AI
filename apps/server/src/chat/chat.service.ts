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
import { extractFileContent } from 'src/utils/file.util';
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
    if (files && files.length > 0) {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const content = await extractFileContent(file);
        fileContext += `\n--- 文件${index + 1}: ${file.originalname} ---\n${content}\n`;
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

    if (modeNumber === 2) {
      const context = await retrieveDocuments(question, 3, llm, embeddingModel);
      const answer = ragChat(
        currentSessionId,
        question,
        history,
        fileContext,
        context,
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
      const answer = chat(currentSessionId, question, history, fileContext);
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

    await this.chatHistoryService.saveChat(
      currentSessionId,
      question,
      fullAnswer,
      modeNumber,
      date,
    );

    res.write('data: [DONE]\n\n');
    res.end();
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
