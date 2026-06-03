import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  process.env.MINIMAX_API_KEY = configService.get<string>('MINIMAX_API_KEY');
  process.env.MINIMAX_GROUP_ID = configService.get<string>('MINIMAX_GROUP_ID');
  process.env.milvus_url = configService.get<string>('milvus_url');
  process.env.milvus_collectionName = configService.get<string>(
    'milvus_collectionName',
  );
  process.env.tavily_api = configService.get<string>('tavily_api');
  process.env.RERANK_API_KEY = configService.get<string>('RERANK_API_KEY');
  process.env.RERANK_URL = configService.get<string>('RERANK_URL');
  process.env.RERANK_MODEL = configService.get<string>('RERANK_MODEL');
  process.env.PORT = configService.get<string>('PORT') ?? '3000';
  app.enableCors({
    origin: configService.get<string>('web_origin'),
    credentials: true,
  });

  await app.listen(process.env.PORT);

  if (module.hot) {
    module.hot.accept();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    module.hot.dispose(() => app.close());
  }
}
bootstrap();
