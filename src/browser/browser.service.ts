import { Injectable, Logger } from '@nestjs/common';
import { Browser, Page } from 'puppeteer';
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Добавляем плагин для обхода детекции
puppeteerExtra.use(StealthPlugin());

interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  username?: string;
  password?: string;
}

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);
  private browsers: Map<string, Browser> = new Map();

  /**
   * Создать браузер с прокси
   */
  async createBrowser(accountId: string, proxy?: ProxyConfig): Promise<Browser> {
    try {
      // Если браузер уже существует, закрываем его
      if (this.browsers.has(accountId)) {
        await this.closeBrowser(accountId);
      }

      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ];

      // Добавляем прокси если есть
      if (proxy) {
        const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
        args.push(`--proxy-server=${proxyUrl}`);
        this.logger.log(`Creating browser with proxy: ${proxyUrl}`);
      }

      const browser = await puppeteerExtra.launch({
        headless: true,
        args,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      this.browsers.set(accountId, browser);
      this.logger.log(`Browser created for account ${accountId}`);

      return browser;
    } catch (error) {
      this.logger.error(`Failed to create browser for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Получить существующий браузер или создать новый
   */
  async getBrowser(accountId: string, proxy?: ProxyConfig): Promise<Browser> {
    if (this.browsers.has(accountId)) {
      const browser = this.browsers.get(accountId);
      if (browser && browser.isConnected()) {
        return browser;
      }
    }

    return this.createBrowser(accountId, proxy);
  }

  /**
   * Создать новую страницу с настройками
   */
  async createPage(browser: Browser, proxy?: ProxyConfig): Promise<Page> {
    const page = await browser.newPage();

    // Устанавливаем User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // Устанавливаем viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
    });

    // Если есть прокси с авторизацией
    if (proxy?.username && proxy?.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
    }

    // Эмулируем поведение человека
    await page.evaluateOnNewDocument(() => {
      // Переопределяем webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Добавляем языки
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });

      // Добавляем плагины
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    return page;
  }

  /**
   * Закрыть браузер
   */
  async closeBrowser(accountId: string): Promise<void> {
    const browser = this.browsers.get(accountId);
    if (browser) {
      try {
        await browser.close();
        this.browsers.delete(accountId);
        this.logger.log(`Browser closed for account ${accountId}`);
      } catch (error) {
        this.logger.error(`Error closing browser for account ${accountId}:`, error);
      }
    }
  }

  /**
   * Закрыть все браузеры
   */
  async closeAllBrowsers(): Promise<void> {
    for (const [accountId] of this.browsers) {
      await this.closeBrowser(accountId);
    }
  }

  /**
   * Случайная задержка для эмуляции человека
   */
  async randomDelay(min: number = 500, max: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

