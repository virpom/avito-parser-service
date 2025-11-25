import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';

export interface CaptchaRequest {
  id: string;
  accountId: number;
  image: string; // base64
  timestamp: Date;
  resolved: boolean;
  answer?: string;
}

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private pendingCaptchas: Map<string, CaptchaRequest> = new Map();
  private resolvers: Map<string, (answer: string) => void> = new Map();

  /**
   * Запросить решение капчи у оператора
   */
  async requestCaptchaSolution(accountId: number, page: Page): Promise<string> {
    const captchaId = `captcha_${accountId}_${Date.now()}`;
    
    try {
      // Делаем скриншот капчи
      const captchaElement = await page.$('iframe[src*="recaptcha"], .captcha, [class*="captcha"]');
      let screenshot: string;
      
      if (captchaElement) {
        screenshot = await captchaElement.screenshot({ encoding: 'base64' });
      } else {
        // Если не нашли элемент, делаем скриншот всей страницы
        screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      }

      // Сохраняем запрос
      const request: CaptchaRequest = {
        id: captchaId,
        accountId,
        image: screenshot,
        timestamp: new Date(),
        resolved: false,
      };

      this.pendingCaptchas.set(captchaId, request);
      this.logger.log(`Captcha requested for account ${accountId}, ID: ${captchaId}`);

      // Ждем ответа от оператора (максимум 5 минут)
      const answer = await this.waitForAnswer(captchaId, 300000);
      
      return answer;
    } catch (error) {
      this.logger.error(`Failed to request captcha solution:`, error);
      throw error;
    }
  }

  /**
   * Ожидание ответа от оператора
   */
  private waitForAnswer(captchaId: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(captchaId);
        this.pendingCaptchas.delete(captchaId);
        reject(new Error('Captcha timeout - operator did not respond'));
      }, timeout);

      this.resolvers.set(captchaId, (answer: string) => {
        clearTimeout(timer);
        this.resolvers.delete(captchaId);
        this.pendingCaptchas.delete(captchaId);
        resolve(answer);
      });
    });
  }

  /**
   * Оператор отправил ответ на капчу
   */
  async submitCaptchaAnswer(captchaId: string, answer: string): Promise<boolean> {
    const resolver = this.resolvers.get(captchaId);
    
    if (!resolver) {
      this.logger.warn(`No resolver found for captcha ${captchaId}`);
      return false;
    }

    const request = this.pendingCaptchas.get(captchaId);
    if (request) {
      request.resolved = true;
      request.answer = answer;
    }

    resolver(answer);
    this.logger.log(`Captcha ${captchaId} resolved by operator`);
    
    return true;
  }

  /**
   * Получить все ожидающие капчи
   */
  getPendingCaptchas(): CaptchaRequest[] {
    return Array.from(this.pendingCaptchas.values()).filter(c => !c.resolved);
  }

  /**
   * Получить капчу по ID
   */
  getCaptcha(captchaId: string): CaptchaRequest | undefined {
    return this.pendingCaptchas.get(captchaId);
  }
}

