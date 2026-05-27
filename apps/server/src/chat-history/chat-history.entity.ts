import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('chatHistory', { schema: 'rag' })
export class ChatHistory {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id', comment: '主键' })
  id: number;

  @Column('varchar', {
    name: 'sessionId',
    comment: '会话ID，关联同一会话',
    length: 255,
  })
  sessionId: string;

  @Column('text', { name: 'question', comment: '用户问题 ' })
  question: string;

  @Column('text', { name: 'answer', comment: 'AI回答' })
  answer: string;

  @Column('int', { name: 'mode', comment: '1为chat,2为rag' })
  mode: number;

  @Column('datetime', { name: 'createdTime', comment: '创建时间' })
  createdTime: Date;
}
