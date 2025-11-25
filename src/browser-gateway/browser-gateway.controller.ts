import { Controller, Post, Get, Delete, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BrowserGatewayService } from './browser-gateway.service';

@ApiTags('Browser Gateway')
@Controller('browser')
export class BrowserGatewayController {
  private readonly logger = new Logger(BrowserGatewayController.name);

  constructor(private readonly browserGateway: BrowserGatewayService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start browser for manual auth' })
  async startBrowser(@Body() body: { accountId: number, proxyConfig?: any }) {
    try {
      const result = await this.browserGateway.startBrowser(body.accountId, body.proxyConfig);
      
      // Возвращаем WebSocket URL для подключения
      return {
        success: true,
        data: {
          wsEndpoint: result.wsEndpoint,
          // Для фронта нужен публичный URL
          publicWsUrl: this.convertToPublicWsUrl(result.wsEndpoint),
        },
      };
    } catch (error: any) {
      this.logger.error('Start browser failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get(':accountId/cookies')
  @ApiOperation({ summary: 'Get cookies from browser' })
  async getCookies(@Param('accountId') accountId: string) {
    try {
      const cookies = await this.browserGateway.getCookies(parseInt(accountId));
      
      if (!cookies) {
        return {
          success: false,
          error: 'Browser session not found',
        };
      }

      return {
        success: true,
        data: { cookies },
      };
    } catch (error: any) {
      this.logger.error('Get cookies failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get(':accountId/status')
  @ApiOperation({ summary: 'Check auth status' })
  async checkStatus(@Param('accountId') accountId: string) {
    try {
      const isAuthorized = await this.browserGateway.checkAuth(parseInt(accountId));
      const session = this.browserGateway.getSession(parseInt(accountId));

      return {
        success: true,
        data: {
          isAuthorized,
          hasSession: !!session,
        },
      };
    } catch (error: any) {
      this.logger.error('Check status failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Delete(':accountId')
  @ApiOperation({ summary: 'Close browser' })
  async closeBrowser(@Param('accountId') accountId: string) {
    try {
      await this.browserGateway.closeBrowser(parseInt(accountId));
      
      return {
        success: true,
        message: 'Browser closed',
      };
    } catch (error: any) {
      this.logger.error('Close browser failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Конвертировать внутренний WebSocket URL в публичный
   */
  private convertToPublicWsUrl(wsEndpoint: string): string {
    // Для noVNC возвращаем URL к noVNC веб-клиенту
    const publicHost = process.env.PUBLIC_HOST || 'api.lead-schem.ru';
    const vncUrl = `https://${publicHost}/api/v1/browser/vnc`;
    
    this.logger.log(`VNC URL: ${vncUrl}`);
    
    return vncUrl;
  }
}


