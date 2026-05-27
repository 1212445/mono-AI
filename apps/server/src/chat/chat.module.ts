import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatHistoryModule } from '../chat-history/chat-history.module';

@Module({
  imports: [ChatHistoryModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
