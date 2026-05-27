import { Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatHistory } from './chat-history.entity';

@Injectable()
export class ChatHistoryService {
  constructor(
    @InjectRepository(ChatHistory)
    private readonly chatHistoryRepository: Repository<ChatHistory>,
  ) {}

  async saveChat(
    sessionId: string,
    question: string,
    answer: string,
    mode: number,
  ): Promise<ChatHistory> {
    const chatHistory = this.chatHistoryRepository.create({
      sessionId,
      question,
      answer,
      mode,
      createdTime: new Date(),
    });
    return this.chatHistoryRepository.save(chatHistory);
  }

  async getHistoryBySessionId(sessionId: string): Promise<ChatHistory[]> {
    return this.chatHistoryRepository.find({
      where: { sessionId },
      order: { createdTime: 'ASC' },
    });
  }

  async getAllSessionId(): Promise<string[]> {
    const result = await this.chatHistoryRepository
      .createQueryBuilder('chatHistory')
      .select('DISTINCT chatHistory.sessionId', 'sessionId')
      .orderBy('chatHistory.createdTime', 'DESC')
      .getRawMany<{ sessionId: string }>();
    return result.map((item) => item.sessionId);
  }
}
