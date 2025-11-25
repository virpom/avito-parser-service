import { Injectable, Logger } from '@nestjs/common';
import { Browser } from 'puppeteer';
import { BrowserService } from '../browser/browser.service';

interface AuthSession {
  accountId: number;
  browser: Browser;
  wsEndpoint: string;
  createdAt: Date;
}

@Injectable()
export class AuthBrowserService {
  private readonly logger = new Logger(AuthBrowserService.name);
  private sessions: Map<number, AuthSession> = new Map();

  constructor(private browserService: BrowserService) {}

  /**
   * Запустить браузер для ручной авторизации
   */
  async startAuthBrowser(accountId: number, proxyConfig?: any): Promise<{ wsEndpoint: string }> {
    try {
      // Проверяем есть ли уже сессия
      if (this.sessions.has(accountId)) {
        const session = this.sessions.get(accountId)!;
        return { wsEndpoint: session.wsEndpoint };
      }

      this.logger.log(`Starting auth browser for account ${accountId}`);

      // Запускаем браузер в НЕ headless режиме с удаленным доступом
      const browser = await this.browserService.createBrowser(
        accountId.toString(),
        proxyConfig,
      );

      const wsEndpoint = browser.wsEndpoint();

      // Открываем страницу Avito
      const page = await browser.newPage();
      await page.goto('https://www.avito.ru/profile/login', { 
        waitUntil: 'networkidle2' 
      });

      // Сохраняем сессию
      const session: AuthSession = {
        accountId,
        browser,
        wsEndpoint,
        createdAt: new Date(),
      };
      this.sessions.set(accountId, session);

      this.logger.log(`Auth browser started: ${wsEndpoint}`);

      return { wsEndpoint };
    } catch (error: any) {
      this.logger.error(`Failed to start auth browser: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получить cookies из браузера
   */
  async getCookies(accountId: number): Promise<string | null> {
    try {
      const session = this.sessions.get(accountId);
      if (!session) {
        return null;
      }

      const pages = await session.browser.pages();
      if (pages.length === 0) {
        return null;
      }

      const cookies = await pages[0].cookies();
      return JSON.stringify(cookies);
    } catch (error: any) {
      this.logger.error(`Failed to get cookies: ${error.message}`);
      return null;
    }
  }

  /**
   * Проверить авторизован ли пользователь
   */
  async checkAuth(accountId: number): Promise<boolean> {
    try {
      const session = this.sessions.get(accountId);
      if (!session) {
        return false;
      }

      const pages = await session.browser.pages();
      if (pages.length === 0) {
        return false;
      }

      const page = pages[0];
      const url = page.url();
      
      // Если не на странице логина - значит авторизован
      return !url.includes('/login');
    } catch (error: any) {
      this.logger.error(`Failed to check auth: ${error.message}`);
      return false;
    }
  }

  /**
   * Закрыть браузер
   */
  async closeBrowser(accountId: number): Promise<void> {
    try {
      const session = this.sessions.get(accountId);
      if (!session) {
        return;
      }

      await session.browser.close();
      this.sessions.delete(accountId);
      
      this.logger.log(`Auth browser closed for account ${accountId}`);
    } catch (error: any) {
      this.logger.error(`Failed to close browser: ${error.message}`);
    }
  }

  /**
   * Очистка старых сессий (старше 10 минут)
   */
  async cleanupOldSessions(): Promise<void> {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 минут

    for (const [accountId, session] of this.sessions.entries()) {
      if (now - session.createdAt.getTime() > maxAge) {
        this.logger.log(`Cleaning up old session for account ${accountId}`);
        await this.closeBrowser(accountId);
      }
    }
  }
}

