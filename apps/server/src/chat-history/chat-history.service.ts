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
    createdTime: Date,
  ): Promise<ChatHistory> {
    const chatHistory = this.chatHistoryRepository.create({
      sessionId,
      question,
      answer,
      mode,
      createdTime,
    });
    return this.chatHistoryRepository.save(chatHistory);
  }

  async getHistoryBySessionId(sessionId: string): Promise<ChatHistory[]> {
    return this.chatHistoryRepository.find({
      where: { sessionId },
      order: { createdTime: 'ASC' },
    });
  }
}
