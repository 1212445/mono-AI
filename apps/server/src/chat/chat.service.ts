import { Injectable } from '@nestjs/common';
import {
  model,
  embedding,
  retrieveDocuments,
  generateAnswer,
  chat,
  loading,
  splitDocs,
  vectorStore,
  dropCollection,
} from '@rag/ai-core';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { ChatDto } from './dto/chat.dto';
import { Response } from 'express';

@Injectable()
export class ChatService {
  constructor(private readonly chatHistoryService: ChatHistoryService) {}

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

    if (files && files.length > 0) {
      for (const file of files) {
        const fileName = file.filename;
        const docs = await loading(fileName);
        const splitDocuments = await splitDocs(docs);
        await vectorStore(splitDocuments, embeddingModel);
      }
    }

    const historyRecords =
      await this.chatHistoryService.getHistoryBySessionId(currentSessionId);
    const history: Array<{ question: string; answer: string }> =
      historyRecords.map((item) => ({
        question: item.question,
        answer: item.answer,
      }));

    res.write(`data: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`);
    let fullAnswer = '';

    if (modeNumber === 2) {
      const context = await retrieveDocuments(question, 3, llm, embeddingModel);
      console.log(context);
      const answer = generateAnswer(question, context, llm, history);
      for await (const chunk of answer) {
        fullAnswer += chunk;
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
    } else {
      const answer = chat(llm, question, history);
      for await (const chunk of answer) {
        fullAnswer += chunk;
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
    }

    await this.chatHistoryService.saveChat(
      currentSessionId,
      question,
      fullAnswer,
      modeNumber,
    );

    res.write('data: [DONE]\n\n');
    res.end();
  }

  async findBySessionId(sessionId: string) {
    return await this.chatHistoryService.getHistoryBySessionId(sessionId);
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
