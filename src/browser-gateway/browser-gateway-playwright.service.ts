import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

interface BrowserSession {
  accountId: number;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdpUrl: string;
  createdAt: Date;
}

@Injectable()
export class BrowserGatewayPlaywrightService {
  private readonly logger = new Logger(BrowserGatewayPlaywrightService.name);
  private sessions: Map<number, BrowserSession> = new Map();

  /**
   * Запустить браузер для ручной авторизации
   */
  async startBrowser(accountId: number, proxyConfig?: any): Promise<{ cdpUrl: string }> {
    try {
      // Проверяем есть ли уже сессия
      if (this.sessions.has(accountId)) {
        const session = this.sessions.get(accountId)!;
        this.logger.log(`Reusing existing browser for account ${accountId}`);
        return { cdpUrl: session.cdpUrl };
      }

      this.logger.log(`Starting Playwright browser for account ${accountId}`);

      const launchOptions: any = {
        headless: false, // Показываем браузер
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      };

      // Добавляем прокси если есть
      if (proxyConfig) {
        launchOptions.proxy = {
          server: `${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`,
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      const browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();
      
      // Открываем страницу Avito
      await page.goto('https://www.avito.ru/profile/login', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Получаем CDP URL
      const cdpUrl = browser.wsEndpoint();

      // Сохраняем сессию
      const session: BrowserSession = {
        accountId,
        browser,
        context,
        page,
        cdpUrl,
        createdAt: new Date(),
      };
      this.sessions.set(accountId, session);

      this.logger.log(`Playwright browser started for account ${accountId}: ${cdpUrl}`);

      return { cdpUrl };
    } catch (error: any) {
      this.logger.error(`Failed to start browser: ${error.message}`);
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

      const cookies = await session.context.cookies();
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

      const url = session.page.url();
      return !url.includes('/login');
    } catch (error: any) {
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
      
      this.logger.log(`Browser closed for account ${accountId}`);
    } catch (error: any) {
      this.logger.error(`Failed to close browser: ${error.message}`);
    }
  }

  /**
   * Получить информацию о сессии
   */
  getSession(accountId: number): BrowserSession | undefined {
    return this.sessions.get(accountId);
  }
}

