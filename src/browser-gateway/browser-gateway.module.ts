import { Module } from '@nestjs/common';
import { BrowserGatewayService } from './browser-gateway.service';
import { BrowserGatewayController } from './browser-gateway.controller';
import { VncController } from './vnc.controller';
import { BrowserModule } from '../browser/browser.module';

@Module({
  imports: [BrowserModule],
  controllers: [BrowserGatewayController, VncController],
  providers: [BrowserGatewayService],
  exports: [BrowserGatewayService],
})
export class BrowserGatewayModule {}

