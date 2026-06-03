import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { ChatSessionModule } from '../chat-session/chat-session.module';

@Module({
  imports: [ChatHistoryModule, ChatSessionModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
