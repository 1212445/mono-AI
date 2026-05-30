import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileManagementService } from './file-management.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

@Controller('file-management')
export class FileManagementController {
  constructor(private readonly fileManagementService: FileManagementService) {}

  @Post('/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './src/upload',
        filename: (req, file, cb) => {
          const originalName = Buffer.from(
            file.originalname,
            'latin1',
          ).toString('utf8');
          cb(null, originalName);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.fileManagementService.uploadFile(file);
  }

  @Get()
  async findAll() {
    return this.fileManagementService.findAll();
  }

  @Delete('/:id')
  async remove(@Param('id') id: string) {
    return this.fileManagementService.remove(+id);
  }
}
