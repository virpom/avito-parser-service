import { Injectable, Logger } from '@nestjs/common';
import { Browser } from 'puppeteer';
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(StealthPlugin());

interface BrowserSession {
  accountId: number;
  browser: Browser;
  wsEndpoint: string;
  createdAt: Date;
}

@Injectable()
export class BrowserGatewayService {
  private readonly logger = new Logger(BrowserGatewayService.name);
  private sessions: Map<number, BrowserSession> = new Map();

  /**
   * Запустить браузер для ручной авторизации
   */
  async startBrowser(accountId: number, proxyConfig?: any): Promise<{ wsEndpoint: string }> {
    try {
      // Проверяем есть ли уже сессия
      if (this.sessions.has(accountId)) {
        const session = this.sessions.get(accountId)!;
        this.logger.log(`Reusing existing browser for account ${accountId}`);
        return { wsEndpoint: session.wsEndpoint };
      }

      this.logger.log(`Starting browser for account ${accountId}`);

      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ];

      // Добавляем прокси если есть
      if (proxyConfig) {
        const proxyUrl = `${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`;
        args.push(`--proxy-server=${proxyUrl}`);
      }

      const browser = await puppeteerExtra.launch({
        headless: true, // В Kubernetes всегда headless
        args,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const wsEndpoint = browser.wsEndpoint();
      
      // Открываем страницу Avito
      const page = await browser.newPage();
      
      // Если есть прокси с авторизацией
      if (proxyConfig?.username && proxyConfig?.password) {
        await page.authenticate({
          username: proxyConfig.username,
          password: proxyConfig.password,
        });
      }

      await page.goto('https://www.avito.ru/profile/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Сохраняем сессию
      const session: BrowserSession = {
        accountId,
        browser,
        wsEndpoint,
        createdAt: new Date(),
      };
      this.sessions.set(accountId, session);

      this.logger.log(`Browser started for account ${accountId}: ${wsEndpoint}`);

      return { wsEndpoint };
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

      const url = pages[0].url();
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

