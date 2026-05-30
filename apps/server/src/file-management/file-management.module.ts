import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileManagement } from './file-management.entity';
import { FileManagementService } from './file-management.service';
import { FileManagementController } from './file-management.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FileManagement])],
  controllers: [FileManagementController],
  providers: [FileManagementService],
})
export class FileManagementModule {}
