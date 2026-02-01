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

  // [SESSION PERSISTENCE] Reconnection Logic
  let geminiWs = null;
  let cachedSetupMessage = null;
  let isReconnecting = false;

  const connectToGemini = () => {
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    console.log(`🔗 [v4.3-AUTO] Подключение к Google (Reconnection: ${isReconnecting})...`);

    geminiWs = new WebSocket(geminiUrl, [], {
      agent: agent,
      handshakeTimeout: 30000,
      headers: { "User-Agent": "MPT-Connectum/3.0.0" }
    });

    geminiWs.on('open', () => {
      console.log('🤖 [v4.3] Канал восстановлен.');
      // Если это реконнект - шлем настройки заново
      if (isReconnecting && cachedSetupMessage) {
        console.log('🔄 [RESUME] Восстановление сессии (отправка конфига)...');
        geminiWs.send(cachedSetupMessage);
      }
      isReconnecting = false;
    });

    geminiWs.on('message', (data) => {
      // (Logic will be attached below via a shared handler or simply re-defined here? 
      //  Better to have handleGeminiMessage function)
      handleGeminiMessage(data);
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`🔴 Разрыв с Google (${code}). Пытаюсь переподключиться...`);
      isReconnecting = true;
      setTimeout(connectToGemini, 1000); // Auto-retry
    });

    geminiWs.on('error', (err) => {
      console.error('❌ Ошибка Google WS:', err.message);
    });
  };

  // Helper to handle messages (extracted from original code)
  const handleGeminiMessage = (data) => {
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
              if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(msg);
              }
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
        // console.log(`🎵 Получено аудио: ${inlineData.data.length} байт`);
      } else {
        // console.log('🤖 Ответ от Gemini:', JSON.stringify(resp, null, 2));
      }

      // Логируем текстовые сообщения от Джуна
      const serverContent = resp.serverContent || resp.server_content;
      const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
      const parts = modelTurn?.parts;

      let textPart = parts?.[0]?.text;
      if (!textPart) {
        // Try reading transcript from native audio model
        const transcript = serverContent?.outputTranscription?.text ||
          serverContent?.output_transcription?.text;
        if (transcript) {
          textPart = transcript;
          console.log(`🗣️ [TRANSCRIPT] Распознано из аудио: "${textPart}"`);
        }
      }

      if (textPart) {
        let text = textPart;
        text = text.replace(/\*\*.*?\*\*/g, '').replace(/\[.*?\]/g, '').trim();
        if (text && !parts[0].thought) {
          conversationLog += `\nДжун: ${text}`;
          console.log(`📝 Записано в память: "${text.substring(0, 50)}..."`);

          const tailLog = conversationLog.slice(-300);

          // 1. ИМЯ
          const nameConfirmMatch = tailLog.match(/Твое имя записано:\s*([А-Яа-яЁёA-Za-z]+)/i);
          if (nameConfirmMatch && db) {
            const detectedName = nameConfirmMatch[1];
            if (currentData.userName !== detectedName) {
              console.log(`⚡ [REAL-TIME] Мгновенная запись имени в базу: ${detectedName}`);
              currentData.userName = detectedName;
              db.collection('memories').doc('global_context').set({
                userName: detectedName,
                updatedAt: new Date().toISOString()
              }, { merge: true }).catch(err => console.error('Ошибка мгновенного сохранения:', err));
            }
          }

          // 2. ПОПРАВКИ
          const correctionMatch = tailLog.match(/Запомнил поправку:\s*(.+)/i);
          if (correctionMatch && db) {
            const newRule = correctionMatch[1].trim();
            if (!conversationLog.includes(`[SAVED_RULE: ${newRule}]`)) {
              console.log(`🎓 [TEACHER] Новое правило изучено: ${newRule}`);
              conversationLog += ` [SAVED_RULE: ${newRule}]`;

              db.collection('memories').doc('global_context').update({
                rules: admin.firestore.FieldValue.arrayUnion(newRule),
                updatedAt: new Date().toISOString()
              }).catch(err => console.error('Ошибка сохранения правила:', err));
            }
          }

          // 3. АВТОСОХРАНЕНИЕ
          const now = Date.now();
          if (now - lastSaveTime > 10000 && db) {
            lastSaveTime = now;
            console.log('💾 [AUTOSAVE] Синхронизация истории с базой...');
            db.collection('memories').doc('global_context').set({
              summary: conversationLog.slice(-2000),
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(e => console.error('Autosave error:', e));
          }

          // 4. КОМАНДА СБРОСА ПАМЯТИ
          if (text.match(/Забудь всё|Сброс памяти|Очисти память/i) && db) {
            console.log('🧹 [WIPE] Получена команда полного стирания памяти.');
            conversationLog = "";
            currentData = { facts: [], rules: [] };
            db.collection('memories').doc('global_context').set({
              summary: "", userName: null, rules: [], facts: [], updatedAt: new Date().toISOString()
            }).then(() => console.log('✨ Память полностью очищена.'));
          }
        }
      }

    } catch (e) { }

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data.toString());
    }
  };

  // Actually, simpler approach:
  // We keep `geminiWs` as a let. 
  // We attach the SAME `onMessage` handler to the new instance.

  connectToGemini();

  let setupReceived = false;
  let isFlushing = false;
  let conversationLog = ""; // Для суммаризации в конце
  let lastSaveTime = 0; // Для троттлинга автосохранения

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

          const rules = data.rules;
          if (rules && Array.isArray(rules) && rules.length > 0) {
            memoryInstruction += `\n\n[ВАЖНЫЕ ПРАВИЛА И ПОПРАВКИ ОТ НАПАРНИКА]:\n- ${rules.join('\n- ')}\nСОБЛЮДАЙ ЭТИ ПРАВИЛА ВСЕГДА.`;
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

                // [RESUMPTION] Cache the complete setup message for auto-reconnect
                const modifiedData = JSON.stringify(setupObj);
                cachedSetupMessage = modifiedData; // Save for later attempts

                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                  geminiWs.send(modifiedData);
                } else {
                  messageQueue.push(modifiedData);
                }
                return;
              }
            } catch (e) { console.error('Memory injection failed', e); }
          }
          // Если памяти нет или ошибка - шлем как есть
          if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
            cachedSetupMessage = data.toString(); // Save raw if processing failed
            geminiWs.send(data);
          } else {
            cachedSetupMessage = data.toString();
            messageQueue.push(data);
          }
        });
        return; // Выходим, так как отправим асинхронно
      }

      // Логируем текстовые сообщения для суммаризации
      try {
        const json = JSON.parse(msgStr);
        if (json.clientContent?.turns?.[0]?.parts?.[0]?.text) {
          const userText = json.clientContent.turns[0].parts[0].text;
          // [FILTER] Не логируем системные триггеры
          if (!userText.startsWith('[SYSTEM]')) {
            conversationLog += `\nНапарник: ${userText}`;
          }
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
