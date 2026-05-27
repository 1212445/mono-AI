import { Module } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatHistory } from './chat-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatHistory])],
  controllers: [],
  providers: [ChatHistoryService],
  exports: [ChatHistoryService],
})
export class ChatHistoryModule {}
