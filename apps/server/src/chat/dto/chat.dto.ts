/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsIn, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsIn(['1', '2'], { message: 'mode的字段应该是1或2' })
  mode?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  files?: Express.Multer.File[];
}
