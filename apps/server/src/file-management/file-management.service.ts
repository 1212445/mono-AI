import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileManagement } from './file-management.entity';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { ConflictException, NotFoundException } from '@nestjs/common';

@Injectable()
export class FileManagementService {
  constructor(
    @InjectRepository(FileManagement)
    private readonly fileManagementRepository: Repository<FileManagement>,
  ) {}

  async uploadFile(file: Express.Multer.File) {
    const uniqueId = await this.generateUniqueId(file);
    const existing = await this.fileManagementRepository.findOne({
      where: { uniqueId },
    });
    if (existing) {
      throw new ConflictException('文件已存在');
    }
    const newFile = this.fileManagementRepository.create({
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      filePath: file.path,
      size: String(file.size),
      uniqueId,
      createdTime: new Date(),
    });
    const saved = await this.fileManagementRepository.save(newFile);
    return { message: '上传成功', data: saved };
  }

  async findAll() {
    const files = await this.fileManagementRepository.find({
      order: { createdTime: 'DESC' },
    });
    return { data: files };
  }

  async remove(id: number) {
    const file = await this.fileManagementRepository.findOne({ where: { id } });
    if (!file) {
      throw new NotFoundException('文件不存在');
    }
    await this.fileManagementRepository.delete(id);
    return { message: '删除成功' };
  }

  private async generateUniqueId(file: Express.Multer.File): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(file.path);
      stream.on('data', (data) => {
        hash.update(data);
      });
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}
