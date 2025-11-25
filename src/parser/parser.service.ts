import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'puppeteer';
import { BrowserService } from '../browser/browser.service';
import { CaptchaService } from '../captcha/captcha.service';

export interface AvitoAccount {
  id: number;
  login: string;
  password: string;
  cookies?: string;
  proxyHost?: string;
  proxyPort?: number;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
  proxyLogin?: string;
  proxyPassword?: string;
}

export interface AvitoChat {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  itemTitle?: string;
  itemId?: string;
}

export interface AvitoMessage {
  id: string;
  chatId: string;
  content: string;
  type: 'text' | 'image' | 'voice';
  direction: 'in' | 'out';
  created: string;
  author_id: string;
}

@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);
  private readonly AVITO_URL = 'https://www.avito.ru';
  private readonly MESSENGER_URL = 'https://www.avito.ru/profile/messenger';

  constructor(
    private readonly browserService: BrowserService,
    private readonly captchaService: CaptchaService,
  ) {}

  /**
   * Авторизация на Avito
   */
  async login(account: AvitoAccount): Promise<string> {
    const accountId = account.id.toString();
    let page: Page | null = null;

    try {
      this.logger.log(`Starting login for account ${accountId}`);

      // Создаем браузер с прокси
      const proxy = account.proxyHost
        ? {
            host: account.proxyHost,
            port: account.proxyPort!,
            protocol: account.proxyType || 'http',
            username: account.proxyLogin,
            password: account.proxyPassword,
          }
        : undefined;

      const browser = await this.browserService.getBrowser(accountId, proxy);
      page = await this.browserService.createPage(browser, proxy);

      // Если есть сохраненные cookies, используем их
      if (account.cookies) {
        try {
          const cookies = JSON.parse(account.cookies);
          await page.setCookie(...cookies);
          this.logger.log(`Loaded cookies for account ${accountId}`);

          // Проверяем что cookies еще валидны
          await page.goto(this.MESSENGER_URL, { waitUntil: 'networkidle2' });
          
          const isLoggedIn = await this.checkIfLoggedIn(page);
          if (isLoggedIn) {
            this.logger.log(`Account ${accountId} logged in using cookies`);
            await page.close();
            return 'Logged in using cookies';
          }
        } catch (error) {
          this.logger.warn(`Failed to use cookies for account ${accountId}, will login manually`);
        }
      }

      // Логин через форму
      await page.goto(`${this.AVITO_URL}/profile/login`, { waitUntil: 'networkidle2' });
      await this.browserService.randomDelay();

      // Ждем форму логина
      await page.waitForSelector('input[type="tel"], input[name="login"]', { timeout: 10000 });

      // Вводим телефон/email
      await page.type('input[type="tel"], input[name="login"]', account.login, { delay: 100 });
      await this.browserService.randomDelay(300, 600);

      // Нажимаем кнопку "Продолжить"
      await page.click('button[type="submit"]');
      await this.browserService.randomDelay(1000, 2000);

      // Ждем поле пароля
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      
      // Вводим пароль
      await page.type('input[type="password"]', account.password, { delay: 100 });
      await this.browserService.randomDelay(300, 600);

      // Нажимаем "Войти"
      await page.click('button[type="submit"]');
      
      // Ждем редиректа
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

      // Проверяем и решаем капчу через оператора
      await this.handleCaptchaIfPresent(account.id, page);

      // Проверяем успешный логин
      const isLoggedIn = await this.checkIfLoggedIn(page);
      if (!isLoggedIn) {
        throw new Error('Login failed - not logged in after form submission');
      }

      // Сохраняем cookies
      const cookies = await page.cookies();
      const cookiesJson = JSON.stringify(cookies);

      this.logger.log(`Account ${accountId} logged in successfully`);
      await page.close();

      return cookiesJson;
    } catch (error) {
      this.logger.error(`Login failed for account ${accountId}:`, error);
      if (page) await page.close();
      throw error;
    }
  }

  /**
   * Проверка что пользователь залогинен
   */
  private async checkIfLoggedIn(page: Page): Promise<boolean> {
    try {
      // Проверяем наличие элементов профиля
      const profileElement = await page.$('[data-marker="header/username"]');
      return !!profileElement;
    } catch {
      return false;
    }
  }

  /**
   * Получить список чатов
   */
  async getChats(account: AvitoAccount): Promise<AvitoChat[]> {
    const accountId = account.id.toString();
    let page: Page | null = null;

    try {
      this.logger.log(`Getting chats for account ${accountId}`);

      const proxy = account.proxyHost
        ? {
            host: account.proxyHost,
            port: account.proxyPort!,
            protocol: account.proxyType || 'http',
            username: account.proxyLogin,
            password: account.proxyPassword,
          }
        : undefined;

      const browser = await this.browserService.getBrowser(accountId, proxy);
      page = await this.browserService.createPage(browser, proxy);

      // Загружаем cookies
      if (account.cookies) {
        const cookies = JSON.parse(account.cookies);
        await page.setCookie(...cookies);
      }

      // Переходим в мессенджер
      await page.goto(this.MESSENGER_URL, { waitUntil: 'networkidle2' });
      await this.browserService.randomDelay();

      // Проверяем что залогинены
      const isLoggedIn = await this.checkIfLoggedIn(page);
      if (!isLoggedIn) {
        throw new Error('Not logged in, cookies expired');
      }

      // Ждем загрузки чатов
      await page.waitForSelector('[data-marker="messenger/chat-list"]', { timeout: 10000 });

      // Парсим чаты
      const chats = await page.evaluate(() => {
        const chatElements = document.querySelectorAll('[data-marker="messenger/chat-item"]');
        const result: any[] = [];

        chatElements.forEach((chatEl) => {
          try {
            const chatId = chatEl.getAttribute('data-chat-id') || '';
            const userName = chatEl.querySelector('[data-marker="chat/user-name"]')?.textContent?.trim() || '';
            const lastMessage = chatEl.querySelector('[data-marker="chat/last-message"]')?.textContent?.trim() || '';
            const timeEl = chatEl.querySelector('[data-marker="chat/time"]')?.textContent?.trim() || '';
            const unreadBadge = chatEl.querySelector('[data-marker="chat/unread-count"]');
            const unreadCount = unreadBadge ? parseInt(unreadBadge.textContent || '0') : 0;
            const itemTitle = chatEl.querySelector('[data-marker="chat/item-title"]')?.textContent?.trim();

            result.push({
              id: chatId,
              userId: chatId, // ID пользователя обычно в chatId
              userName,
              lastMessage,
              lastMessageTime: timeEl,
              unreadCount,
              itemTitle,
            });
          } catch (e) {
            console.error('Error parsing chat:', e);
          }
        });

        return result;
      });

      this.logger.log(`Found ${chats.length} chats for account ${accountId}`);
      await page.close();

      return chats;
    } catch (error) {
      this.logger.error(`Failed to get chats for account ${accountId}:`, error);
      if (page) await page.close();
      throw error;
    }
  }

  /**
   * Получить сообщения из чата
   */
  async getMessages(account: AvitoAccount, chatId: string): Promise<AvitoMessage[]> {
    const accountId = account.id.toString();
    let page: Page | null = null;

    try {
      this.logger.log(`Getting messages for chat ${chatId}, account ${accountId}`);

      const proxy = account.proxyHost
        ? {
            host: account.proxyHost,
            port: account.proxyPort!,
            protocol: account.proxyType || 'http',
            username: account.proxyLogin,
            password: account.proxyPassword,
          }
        : undefined;

      const browser = await this.browserService.getBrowser(accountId, proxy);
      page = await this.browserService.createPage(browser, proxy);

      // Загружаем cookies
      if (account.cookies) {
        const cookies = JSON.parse(account.cookies);
        await page.setCookie(...cookies);
      }

      // Переходим в чат
      await page.goto(`${this.MESSENGER_URL}/${chatId}`, { waitUntil: 'networkidle2' });
      await this.browserService.randomDelay();

      // Ждем загрузки сообщений
      await page.waitForSelector('[data-marker="messenger/messages"]', { timeout: 10000 });

      // Скроллим вверх чтобы загрузить историю
      await page.evaluate(() => {
        const messagesContainer = document.querySelector('[data-marker="messenger/messages"]');
        if (messagesContainer) {
          messagesContainer.scrollTop = 0;
        }
      });
      await this.browserService.randomDelay(1000, 2000);

      // Парсим сообщения
      const messages = await page.evaluate((chatId) => {
        const messageElements = document.querySelectorAll('[data-marker="messenger/message"]');
        const result: any[] = [];

        messageElements.forEach((msgEl, index) => {
          try {
            const isIncoming = msgEl.classList.contains('message-in') || msgEl.hasAttribute('data-direction-in');
            const content = msgEl.querySelector('[data-marker="message/text"]')?.textContent?.trim() || '';
            const timeEl = msgEl.querySelector('[data-marker="message/time"]')?.textContent?.trim() || '';
            const hasImage = !!msgEl.querySelector('[data-marker="message/image"]');
            const hasVoice = !!msgEl.querySelector('[data-marker="message/voice"]');

            let type = 'text';
            if (hasImage) type = 'image';
            if (hasVoice) type = 'voice';

            result.push({
              id: `msg_${index}_${Date.now()}`,
              chatId: chatId,
              content,
              type,
              direction: isIncoming ? 'in' : 'out',
              created: timeEl,
              author_id: isIncoming ? 'user' : 'me',
            });
          } catch (e) {
            console.error('Error parsing message:', e);
          }
        });

        return result;
      }, chatId);

      this.logger.log(`Found ${messages.length} messages in chat ${chatId}`);
      await page.close();

      return messages;
    } catch (error) {
      this.logger.error(`Failed to get messages for chat ${chatId}:`, error);
      if (page) await page.close();
      throw error;
    }
  }

  /**
   * Отправить сообщение
   */
  async sendMessage(account: AvitoAccount, chatId: string, message: string): Promise<boolean> {
    const accountId = account.id.toString();
    let page: Page | null = null;

    try {
      this.logger.log(`Sending message to chat ${chatId}, account ${accountId}`);

      const proxy = account.proxyHost
        ? {
            host: account.proxyHost,
            port: account.proxyPort!,
            protocol: account.proxyType || 'http',
            username: account.proxyLogin,
            password: account.proxyPassword,
          }
        : undefined;

      const browser = await this.browserService.getBrowser(accountId, proxy);
      page = await this.browserService.createPage(browser, proxy);

      // Загружаем cookies
      if (account.cookies) {
        const cookies = JSON.parse(account.cookies);
        await page.setCookie(...cookies);
      }

      // Переходим в чат
      await page.goto(`${this.MESSENGER_URL}/${chatId}`, { waitUntil: 'networkidle2' });
      await this.browserService.randomDelay();

      // Ждем поле ввода
      await page.waitForSelector('[data-marker="messenger/input"]', { timeout: 10000 });

      // Вводим сообщение
      await page.type('[data-marker="messenger/input"]', message, { delay: 50 });
      await this.browserService.randomDelay(300, 600);

      // Нажимаем отправить
      await page.click('[data-marker="messenger/send-button"]');
      await this.browserService.randomDelay(1000, 2000);

      this.logger.log(`Message sent to chat ${chatId}`);
      await page.close();

      return true;
    } catch (error) {
      this.logger.error(`Failed to send message to chat ${chatId}:`, error);
      if (page) await page.close();
      throw error;
    }
  }

  /**
   * Проверка и обработка капчи через оператора
   */
  private async handleCaptchaIfPresent(accountId: number, page: Page): Promise<void> {
    try {
      // Проверяем наличие капчи на странице
      const hasCaptcha = await page.evaluate(() => {
        const captchaSelectors = [
          'iframe[src*="recaptcha"]',
          'iframe[src*="captcha"]',
          '.captcha',
          '[class*="captcha"]',
          '[id*="captcha"]',
          'input[name="captcha"]',
        ];
        
        for (const selector of captchaSelectors) {
          if (document.querySelector(selector)) {
            return true;
          }
        }
        return false;
      });

      if (!hasCaptcha) {
        return;
      }

      this.logger.log(`Captcha detected for account ${accountId}, requesting operator help`);

      // Запрашиваем решение у оператора (ждем максимум 5 минут)
      const answer = await this.captchaService.requestCaptchaSolution(accountId, page);

      // Вводим ответ капчи
      const captchaInput = await page.$('input[name="captcha"], input[type="text"]');
      if (captchaInput) {
        await captchaInput.type(answer, { delay: 100 });
        await this.browserService.randomDelay(300, 600);
        
        // Отправляем форму
        await page.keyboard.press('Enter');
        await this.browserService.randomDelay(2000, 3000);
      }

      this.logger.log(`Captcha solved for account ${accountId}`);
    } catch (error) {
      this.logger.error(`Failed to handle captcha for account ${accountId}:`, error);
      throw error;
    }
  }
}

