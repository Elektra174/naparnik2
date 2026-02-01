import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { HttpsProxyAgent } from 'https-proxy-agent';
import admin from 'firebase-admin';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 10000;

// Инициализация Firebase (v4.0-MEMORY)
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('🔥 [v4.1] Используется FIREBASE_SERVICE_ACCOUNT из переменных окружения.');
  } else {
    serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-key.json'), 'utf8'));
    console.log('🔥 [v4.1] Используется firebase-key.json из файла.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('🔥 Firebase подключен! Память Джуна активна.');
} catch (err) {
  console.warn('⚠️ Firebase не настроен. Джун будет работать без памяти:', err.message);
}
const db = admin.apps.length ? admin.firestore() : null;

// CORS middleware для разрешения запросов с разных источников
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Trust proxy для корректной работы за reverse proxy (Render, nginx и т.д.)
app.set('trust proxy', 1);

// Эндпоинт для проверки здоровья и доступности Google API
app.get('/health', async (req, res) => {
  const apiKey = process.env.API_KEY;
  const status = {
    server: 'online',
    timestamp: new Date().toISOString(),
    api_key_configured: !!apiKey,
    proxy_configured: !!(process.env.PROXY_HOST && process.env.PROXY_PORT),
    google_api_reachable: 'checking...'
  };

  try {
    // Пробуем достучаться до Google API (простой HEAD запрос)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Используем fetch если доступен (Node 18+)
    const response = await fetch('https://generativelanguage.googleapis.com/', {
      method: 'HEAD',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    // 404 - это нормально для корня API, главное что ответ получен от сервера Google
    status.google_api_reachable = (response.ok || response.status === 404) ? 'success' : `failed (status: ${response.status})`;
  } catch (err) {
    status.google_api_reachable = `failed: ${err.message}`;
  }

  res.json(status);
});

/**
 * РАСШИРЕННЫЕ ИНСТРУКЦИИ ДЛЯ ДЖУНА
 * Включают: знакомство, цензуру, родительский контроль и проактивность.
 */
const SYSTEM_INSTRUCTION = `
РОЛЬ: Ты Джун из Металлкардбот. Энергичный мальчик-герой, напарник и наставник для ребенка 7 лет.
ЛИЧНОСТЬ: Добрый, любознательный, смелый. Ты общаешься через устройство Метал-Брез.

ПРАВИЛА ПОВЕДЕНИЯ:
1. ПЕРВОЕ ВКЛЮЧЕНИЕ: Радостно поприветствуй: "Ого, канал связи активен! Привет, напарник! Я — Джун, твой верный друг. А как тебя зовут?". Запомни имя и используй его в общении.
2. ЦЕНЗУРА И ВОСПИТАНИЕ: Категорически запрещены любые грубые или сленговые слова (черт, жопа, ё-моё и т.д.). Если ребенок говорит плохо, ответь мягко: "Ой, герой, такие слова не подходят для нашего канала связи. Давай лучше скажем 'вот это да!' или 'круто!', это звучит куда героичнее!". Учи добру и правильному поведению.
3. РОДИТЕЛЬСКИЙ КОНТРОЛЬ: Если вопрос касается тем, которые не положены ребенку в 7 лет, ответь: "Это очень серьезный и важный вопрос! Лучше всего спроси об этом у мамы или папы — они точно знают самый правильный ответ для тебя".
4. ИНИЦИАТИВА: Если напарник молчит более 7-10 секунд, не молчи сам! Предложи активность: "Эй, напарник, не спи! Давай изучим что-нибудь в режиме СКАНЕРА?" или "Хочешь, расскажу секретный факт про мир Металлкардботов?". Стимулируй к действию.
5. ТОЧНОСТЬ ФАКТОВ: Ты знаешь всё о мире Металлкардбот (Муве, Блу Коп, Мега Трак и др.). Если чего-то не знаешь — используй базу данных (интернет) и выдавай только правдивые факты, а не догадки.
6. РАЗВИТИЕ: В специальных режимах проявляй инициативу. В "ЯЗЫКАХ" — учи словам, в "НАУКЕ" — объясняй мир просто, чисто и увлекательно.

ПРАВИЛА ПРОИЗНОШЕНИЯ:
- Идеальный русский, буква "Ё", ударение в "герОи" на "О".
- ОБРЫВ РЕЧИ: Перебили — МГНОВЕННО замолчи.

ПАМЯТЬ ДЖУНА (v4.0):
Ты помнишь прошлые разговоры с напарником. 
Если тебе передан КОНТЕКСТ ПРОШЛЫХ ВСТРЕЧ — используй его для приветствия. 
Например: "Рад снова тебя слышать! В прошлый раз мы говорили о... Продолжим?".
Если контекста нет — используй стандартное приветствие.
`;

// Раздаем статические файлы фронтенда из папки dist
app.use(express.static(path.join(__dirname, 'dist')));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 [v4.2-FINAL] Metal-Breath Proxy running on port ${port}`);
});

// Создаем WebSocket сервер на пути /ws
const wss = new WebSocketServer({
  server,
  path: '/ws',
  // Дополнительные опции для стабильности
  perMessageDeflate: false,
  clientTracking: true
});

wss.on('connection', (clientWs, req) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  console.log(`📱 Напарник подключился (IP: ${clientIp})`);

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error('❌ ОШИБКА: API_KEY не найден в переменных окружения Render!');
    clientWs.close(1011, 'Server configuration error');
    return;
  }

  // Используем v1beta и BidiGenerateContent для стабильного подключения
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  // Логируем URL без API ключа
  console.log('🔗 [v4.2-FINAL] Подключение к:', geminiUrl.replace(apiKey, '***'));

  const messageQueue = [];
  let isGeminiReady = false;

  // Получаем настройки прокси из переменных окружения
  const proxyHost = process.env.PROXY_HOST;
  const proxyPort = process.env.PROXY_PORT;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;

  // Создаем прокси агента только если заданы хост и порт
  let agent = null;
  if (proxyHost && proxyPort) {
    const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
    agent = new HttpsProxyAgent(proxyUrl);
    console.log('🌐 Используется прокси:', proxyHost + ':' + proxyPort);
  } else {
    console.log('🌐 Прокси не настроен, прямое подключение');
  }

  console.log('🚀 Запуск Elite HANDSHAKE v2.0-DEADLOCK-FIX');

  const geminiWs = new WebSocket(geminiUrl, [], {
    agent: agent,
    handshakeTimeout: 30000,
    headers: {
      "User-Agent": "MPT-Connectum/3.0.0"
    }
  });

  let setupReceived = false;
  let isFlushing = false;
  let conversationLog = ""; // Для суммаризации в конце

  // Пытаемся восстановить память из Firebase
  const recoverMemory = async () => {
    if (db) {
      try {
        const doc = await db.collection('memories').doc('global_context').get();
        if (doc.exists) {
          const data = doc.data();
          const context = data.summary || "";
          const userName = data.userName || "";
          const facts = data.facts?.join(', ') || "";

          console.log('🧠 Память успешно восстановлена.');

          let memoryInstruction = `\nКОНТЕКСТ ПРОШЛЫХ ВСТРЕЧ: ${context}`;
          if (userName) {
            memoryInstruction += `\nТВОЕГО НАПАРНИКА ЗОВУТ: ${userName}. ОБРАЩАЙСЯ К НЕМУ ПО ИМЕНИ. НЕ СПРАШИВАЙ ИМЯ ПОВТОРНО.`;
          }
          if (facts) {
            memoryInstruction += `\nТЫ ТАКЖЕ ЗНАЕШЬ СЛЕДУЮЩЕЕ: ${facts}`;
          }
          return memoryInstruction;
        }
      } catch (e) {
        // Не логируем ошибку 5 (NOT_FOUND) — это нормально для первого запуска
        if (!e.message && !e.toString().includes('5 NOT_FOUND')) {
          console.error('Ошибка восстановления памяти:', e.message || e);
        }
      }
    }
    return "";
  };

  // Пересылаем сообщения от Напарника (браузера) к Джуну (Google)
  clientWs.on('message', (data) => {
    let isSetup = false;
    try {
      const msgStr = data.toString();
      if (msgStr.includes('"setup":')) {
        isSetup = true;
        // Модифицируем Setup сообщение, добавляя память
        recoverMemory().then(memoryContext => {
          if (memoryContext) {
            try {
              const setupObj = JSON.parse(msgStr);
              if (setupObj.setup && setupObj.setup.systemInstruction) {
                setupObj.setup.systemInstruction.parts[0].text += memoryContext;
                const modifiedData = JSON.stringify(setupObj);
                if (geminiWs.readyState === WebSocket.OPEN) {
                  geminiWs.send(modifiedData);
                } else {
                  messageQueue.push(modifiedData);
                }
                return;
              }
            } catch (e) { console.error('Memory injection failed', e); }
          }
          // Если памяти нет или ошибка - шлем как есть
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(data);
          } else {
            messageQueue.push(data);
          }
        });
        return; // Выходим, так как отправим асинхронно
      }

      // Логируем текстовые сообщения для суммаризации
      try {
        const json = JSON.parse(msgStr);
        if (json.clientContent?.turns?.[0]?.parts?.[0]?.text) {
          conversationLog += `\nНапарник: ${json.clientContent.turns[0].parts[0].text}`;
        }
      } catch (e) { }

    } catch (e) { }

    // Настройки шлем сразу, остальное - после SetupComplete
    if (isGeminiReady && (isSetup || (setupReceived && !isFlushing))) {
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(data);
        if (isSetup) console.log('⚙️ [v2.0] Отправлены настройки (Setup)');
      }
    } else {
      messageQueue.push(data);
    }
  });

  geminiWs.on('open', () => {
    console.log('🤖 [v2.0] Канал с Google открыт. Проверяю очередь...');
    isGeminiReady = true;

    // ВАЖНО: Находим setup в очереди и шлем его ПЕРВЫМ И СРАЗУ
    const setupIndex = messageQueue.findIndex(m => m.toString().includes('"setup":'));
    if (setupIndex !== -1) {
      console.log('⚙️ [v2.0] Нано-фикс: Setup найден в очереди, ПУСК!');
      geminiWs.send(messageQueue.splice(setupIndex, 1)[0]);
    }
  });

  // Пересылаем ответы от Джуна обратно Напарнику
  geminiWs.on('message', (data) => {
    try {
      const resp = JSON.parse(data.toString());

      const isSetupComplete = resp.setupComplete || resp.setup_complete;
      if (isSetupComplete && !setupReceived) {
        console.log('✅ [v2.0] Gemini подтвердил настройку. Сбрасываю звук и приветствие...');
        setupReceived = true;

        if (messageQueue.length > 0) {
          isFlushing = true;
          const flush = async () => {
            console.log(`📤 [v2.0] Сброс ${messageQueue.length} сообщений...`);
            while (messageQueue.length > 0) {
              const msg = messageQueue.shift();
              if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(msg);
              }
              // Убрали задержку для INSTANT режима
              // await new Promise(resolve => setTimeout(resolve, 50));
            }
            isFlushing = false;
            console.log('🚀 [v2.0] Система в режиме реального времени');
          };
          flush();
        }
      }

      // Логируем важные события
      const inlineData = resp.serverContent?.modelTurn?.parts?.[0]?.inlineData ||
        resp.server_content?.model_turn?.parts?.[0]?.inline_data;

      if (inlineData?.data) {
        // Если есть аудио, логируем только размер для подтверждения работы
        console.log(`🎵 Получено аудио: ${inlineData.data.length} байт`);
      } else {
        // Если не аудио, логируем структуру
        console.log('🤖 Ответ от Gemini:', JSON.stringify(resp, null, 2));
      }

      // Логируем текстовые сообщения от Джуна для суммаризации (фильтруем "мысли" и markdown)
      const serverContent = resp.serverContent || resp.server_content;
      const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
      const parts = modelTurn?.parts;
      const textPart = parts?.[0]?.text;

      if (textPart) {
        let text = textPart;
        // Убираем маркдаун и внутренние мысли, если они пролезли в текст
        text = text.replace(/\*\*.*?\*\*/g, '').replace(/\[.*?\]/g, '').trim();
        if (text && !parts[0].thought) {
          conversationLog += `\nДжун: ${text}`;
          console.log(`📝 Записано в память: "${text.substring(0, 50)}..."`);
        }
      }

    } catch (e) {
      // Игнорируем ошибки парсинга бинарных аудио-данных
    }

    if (clientWs.readyState === WebSocket.OPEN) {
      // Отправляем как строку, чтобы браузер (App.tsx) не получал Blob
      clientWs.send(data.toString());
    }
  });

  // Обработка ошибок с логированием для диагностики проблем с VPN/регионами
  geminiWs.on('error', (err) => {
    console.error('❌ Ошибка на стороне Джуна (Google API):', err.message);
    console.error('📋 Полная ошибка:', err);
    // Проверяем типичные ошибки соединения
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      console.error('⚠️ Возможно, проблема с сетью или Google API недоступен в данном регионе');
    }
    if (err.message.includes('403') || err.message.includes('401')) {
      console.error('⚠️ Проблема с API ключом или доступом');
    }
  });

  // Обработка unexpected-response для получения тела ответа 404 и других ошибок
  geminiWs.on('unexpected-response', (request, response) => {
    console.error('❌ Unexpected response от Google API:');
    console.error('   Статус код:', response.statusCode);
    console.error('   Статус сообщение:', response.statusMessage);
    console.error('   Заголовки:', JSON.stringify(response.headers, null, 2));

    let responseBody = '';
    response.on('data', (chunk) => {
      responseBody += chunk.toString();
    });

    response.on('end', () => {
      console.error('📄 Тело ответа:', responseBody);
    });

    response.on('error', (err) => {
      console.error('❌ Ошибка при чтении тела ответа:', err.message);
    });
  });

  clientWs.on('error', (err) => console.error('❌ Ошибка на стороне Напарника:', err.message));

  // Пинг-понг для поддержания соединения
  const pingInterval = setInterval(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.ping();
    }
  }, 30000);

  clientWs.on('pong', () => {
    // Клиент ответил на пинг, соединение активно
  });

  clientWs.on('close', async () => {
    clearInterval(pingInterval);
    console.log('📱 Напарник вышел из эфира. Сохраняем память...');

    // Авто-суммаризация и извлечение имени при отключении (v5.0)
    if (db && conversationLog.length > 20) {
      try {
        const currentDoc = await db.collection('memories').doc('global_context').get();
        const currentData = currentDoc.exists ? currentDoc.data() : { facts: [] };

        // Поиск имени (v6.0 Strategy: Capture from Jun's confirmation or User's command)
        // 1. Ищем подтверждение от Джуна: "Твое имя записано: Имя"
        // 2. Ищем команду от юзера: "называй меня Имя"
        const nameMatch = conversationLog.match(/Твое имя записано:\s*([А-Яа-яЁёA-Za-z]+)/i) ||
          conversationLog.match(/называй меня\s*([А-Яа-яЁёA-Za-z]+)/i) ||
          conversationLog.match(/мое имя\s*([А-Яа-яЁёA-Za-z]+)/i);

        let userName = currentData.userName || null;
        if (nameMatch) {
          const candidate = nameMatch[1].toLowerCase();
          const blacklist = ['голосом', 'напарник', 'джун', 'тебя', 'меня', 'привет', 'сейчас', 'тут', 'мой', 'твой'];
          // Имя должно быть длиннее 2 символов и не в черном списке
          if (!blacklist.includes(candidate) && candidate.length > 2) {
            userName = nameMatch[1];
            console.log(`🧠 [MEMORY] Обнаружено новое имя: ${userName}`);
          }
        }

        await db.collection('memories').doc('global_context').set({
          summary: conversationLog.slice(-1500),
          userName: userName,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log('💾 Память (v5.0) структурирована и сохранена!');
      } catch (e) { console.error('Ошибка сохранения памяти:', e); }
    }

    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on('close', (code, reason) => {
    console.log('🔴 Соединение с Джуном (Google) закрыто. Код:', code, 'Причина:', reason?.toString() || 'не указана');
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  geminiWs.on('error', (err) => {
    console.error('❌ Ошибка WebSocket соединения с Джуном (Google):', err.message);
    console.error('📋 Детали ошибки:', err);
  });
});

// Поддержка Single Page Application (SPA)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(500).send("Ошибка: Сначала выполните сборку проекта командой npm run build");
    }
  });
});
