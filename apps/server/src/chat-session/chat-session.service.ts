import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSession } from './chat-session.entity';

@Injectable()
export class ChatSessionService {
  constructor(
    @InjectRepository(ChatSession)
    private readonly chatSessionRepository: Repository<ChatSession>,
  ) {}

  async updated(
    sessionId: string,
    time: Date,
    title?: string,
  ): Promise<ChatSession> {
    const existing = await this.chatSessionRepository.findOne({
      where: { sessionId },
    });
    if (existing) {
      existing.lastActiveTime = new Date();
      return this.chatSessionRepository.save(existing);
    }
    return this.chatSessionRepository.save(
      this.chatSessionRepository.create({
        sessionId,
        title,
        lastActiveTime: time,
      }),
    );
  }

  async findAll(): Promise<ChatSession[]> {
    return this.chatSessionRepository.find({
      order: { lastActiveTime: 'DESC' },
    });
  }
}
