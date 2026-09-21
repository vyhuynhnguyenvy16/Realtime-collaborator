import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { WsAdapter } from '@nestjs/platform-ws'; // Thêm dòng này

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.useWebSocketAdapter(new WsAdapter(app)); // Đăng ký WsAdapter
  
  await app.listen(3000);
}
bootstrap();