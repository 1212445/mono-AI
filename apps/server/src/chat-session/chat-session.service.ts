/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ChatSession } from './chat-session.entity';

const TITLE_MAX = 20;
function truncateTitle(title: string | undefined): string {
  if (!title) return '';
  // 按字符数截断（不是字节），超过 20 字符的尾部丢掉，避免 MySQL ER_DATA_TOO_LONG
  return [...title].slice(0, TITLE_MAX).join('');
}

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
    try {
      return await this.chatSessionRepository.save(
        this.chatSessionRepository.create({
          sessionId,
          title: truncateTitle(title),
          lastActiveTime: time,
        }),
      );
    } catch (err) {
      // 兜底：并发请求在 findOne 之后抢先 INSERT，触发了 sessionId 唯一约束
      if (this.isDuplicateKeyError(err)) {
        const winner = await this.chatSessionRepository.findOne({
          where: { sessionId },
        });
        if (winner) {
          winner.lastActiveTime = new Date();
          return this.chatSessionRepository.save(winner);
        }
      }
      throw err;
    }
  }

  async findAll(): Promise<ChatSession[]> {
    return this.chatSessionRepository.find({
      order: { lastActiveTime: 'DESC' },
    });
  }

  /**
   * 判断是否为 sessionId 唯一约束冲突
   * MySQL 错误码 1062 = ER_DUP_ENTRY
   */
  private isDuplicateKeyError(err: unknown): boolean {
    if (err instanceof QueryFailedError) {
      const driverError = (err as QueryFailedError & {
        driverError?: { code?: string; errno?: number };
      }).driverError;
      return (
        driverError?.code === 'ER_DUP_ENTRY' || driverError?.errno === 1062
      );
    }
    return false;
  }
}
