import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  const logger = new Logger('AvitoParserService');

  await app.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Avito Parser Service API')
    .setDescription('Avito browser automation and parsing service')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Serve noVNC static files
  app.useStaticAssets({
    root: '/opt/novnc',
    prefix: '/novnc/',
  });

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 5011;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Avito Parser Service running on http://localhost:${port}`);
  logger.log(`🖥️  noVNC available at http://localhost:6080`);
}

bootstrap();

