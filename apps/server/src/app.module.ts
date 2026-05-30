import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { ChatHistoryModule } from './chat-history/chat-history.module';
import { FileManagementModule } from './file-management/file-management.module';

import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatHistory } from './chat-history/chat-history.entity';
import { FileManagement } from './file-management/file-management.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('db_host'),
        port: configService.get<number>('db_port'),
        username: configService.get<string>('db_user'),
        password: configService.get<string>('db_password'),
        database: configService.get<string>('db_database'),
        entities: [ChatHistory, FileManagement],
        synchronize: true,
      }),
    }),
    ChatModule,
    ChatHistoryModule,
    FileManagementModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
