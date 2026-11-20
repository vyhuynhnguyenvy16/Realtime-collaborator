import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';

function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: corsOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
