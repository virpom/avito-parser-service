import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ParserModule } from './parser/parser.module';
import { BrowserModule } from './browser/browser.module';
import { CaptchaModule } from './captcha/captcha.module';
import { BrowserGatewayModule } from './browser-gateway/browser-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BrowserModule,
    CaptchaModule,
    ParserModule,
    BrowserGatewayModule,
  ],
})
export class AppModule {}

