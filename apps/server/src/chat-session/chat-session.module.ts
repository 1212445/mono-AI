import { Module } from '@nestjs/common';
import { ChatSessionService } from './chat-session.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from './chat-session.entity';
@Module({
  imports: [TypeOrmModule.forFeature([ChatSession])],
  controllers: [],
  providers: [ChatSessionService],
  exports: [ChatSessionService],
})
export class ChatSessionModule {}
