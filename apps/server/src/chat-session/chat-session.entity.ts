import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('chatSession', { schema: 'rag' })
export class ChatSession {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number;

  @Column('varchar', { name: 'sessionId', comment: '会话id', length: 255 })
  sessionId: string;

  @Column('varchar', { name: 'title', comment: '会话标题', length: 20 })
  title: string;

  @Column('datetime', { name: 'lastActiveTime', comment: '最后一次聊天时间' })
  lastActiveTime: Date;
}
