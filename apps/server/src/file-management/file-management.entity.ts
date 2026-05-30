import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fileManagement', { schema: 'rag' })
export class FileManagement {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number;

  @Column('varchar', { name: 'fileName', comment: '文件名', length: 255 })
  fileName: string;

  @Column('varchar', { name: 'filePath', comment: '文件路径', length: 255 })
  filePath: string;

  @Column('datetime', { name: 'createdTime', comment: '文件上传时间' })
  createdTime: Date;

  @Column('varchar', { name: 'uniqueId', comment: '判重', length: 255 })
  uniqueId: string;

  @Column('varchar', {
    name: 'size',
    nullable: true,
    comment: '文件大小',
    length: 255,
  })
  size: string | null;
}
