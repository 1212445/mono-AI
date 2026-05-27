import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  process.env.MINIMAX_API_KEY = configService.get<string>('MINIMAX_API_KEY');
  process.env.MINIMAX_GROUP_ID = configService.get<string>('MINIMAX_GROUP_ID');
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
