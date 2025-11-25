/**
 * Скрипт для получения cookies Avito
 * Запускать ЛОКАЛЬНО на своем компе!
 * 
 * Использование:
 * node scripts/get-cookies.js
 */

const puppeteer = require('puppeteer');

async function getCookies() {
  console.log('🚀 Запуск браузера...');
  
  const browser = await puppeteer.launch({
    headless: false, // Показываем браузер
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();
  
  console.log('📱 Открываем Avito...');
  await page.goto('https://www.avito.ru/profile/login');

  console.log('\n✋ ВНИМАНИЕ!');
  console.log('1. Введите логин и пароль');
  console.log('2. Введите SMS код');
  console.log('3. Дождитесь полной авторизации');
  console.log('4. Нажмите Enter в этом окне\n');

  // Ждем Enter
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  console.log('📦 Получаем cookies...');
  const cookies = await page.cookies();
  const cookiesJson = JSON.stringify(cookies);

  console.log('\n✅ Cookies получены!');
  console.log('\n📋 Скопируйте эту строку и вставьте в поле "Cookies" в админке:\n');
  console.log(cookiesJson);
  console.log('\n');

  await browser.close();
  process.exit(0);
}

getCookies().catch(error => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
});

