import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus } from './types';
// Путь относительный текущей папки
import { decode, decodeAudioData, createPcmBlob, playSFX } from './services/audioHelpers';

const SYSTEM_INSTRUCTION = `
РОЛЬ: Ты Джун из Металлкардбот. Энергичный мальчик-герой, напарник и наставник для ребенка 7 лет.
ЛИЧНОСТЬ: Добрый, любознательный, смелый. Ты общаешься через устройство Метал-Брез.

КРИТИЧЕСКИЕ ПРАВИЛА (ДЛЯ МГНОВЕННОЙ РЕАКЦИИ):
1. ОТВЕЧАЙ ТОЛЬКО ГОЛОСОМ. Запрещено выводить любой текст или "мысли" (thoughts).
2. НИКАКИХ РАССУЖДЕНИЙ. Сразу переходи к общению. Твоя внутренняя логика должна быть скрыта.
3. МГНОВЕННЫЙ ОТКЛИК. Не делай пауз, не готовь текст в уме. Просто говори.

ПРАВИЛА ПОВЕДЕНИЯ:
1. ПЕРВОЕ ВКЛЮЧЕНИЕ: Радостно поприветствуй: "Ого, канал связи активен! Привет, напарник! Я — Джун, твой верный друг. А как тебя зовут?". Запомни имя и используй его.
2. ЦЕНЗУРА И ВОСПИТАНИЕ: Если ребенок говорит плохо, ответь: "Ой, герой, такие слова не подходят для нашего канала связи. Давай лучше скажем 'вот это да!' или 'круто!', это звучит куда героичнее!".
3. РОДИТЕЛЬСКИЙ КОНТРОЛЬ: Если взрослые темы — отправляй к родителям.
4. ИНИЦИАТИВА: Если молчит — предложи игру или секрет.

ПРАВИЛА ПРОИЗНОШЕНИЯ:
- Идеальный русский, буква "Ё", ударение в "герОи" на "О".
- ОБРЫВ РЕЧИ: Перебили — МГНОВЕННО замолчи.
`;

function resample(buffer: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}

const AudioWaveform = ({ analyser, isUser }: { analyser: AnalyserNode | null, isUser: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef(isUser ? 180 : 200);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 60;

      hueRef.current = (hueRef.current + 1) % 360;
      const color = isUser ? `hsla(180, 100%, 50%, 0.8)` : `hsla(${hueRef.current}, 100%, 60%, 0.9)`;

      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;

      for (let i = 0; i < bufferLength; i += 2) {
        const val = dataArray[i] / 255;
        const barHeight = val * 70;
        const angle = (i / bufferLength) * Math.PI * 2;

        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isUser]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={300}
      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 15 }}
    />
  );
};

const MetalBreathIcon = ({ active, speaking, status, analyser, isUserSpeaking }: any) => {
  const isConnecting = status === ConnectionStatus.CONNECTING;
  const isError = status === ConnectionStatus.ERROR;

  return (
    <div
      className={active ? 'animate-float' : 'animate-pulse-ring'}
      style={{
        position: 'relative',
        width: '280px',
        height: '280px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {(speaking || isUserSpeaking) && <AudioWaveform analyser={analyser} isUser={isUserSpeaking} />}

      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        filter: 'blur(60px)',
        opacity: 0.3,
        transition: 'all 1s ease',
        background: isError ? '#ef4444' : (active ? '#00f2ff' : '#4f46e5')
      }}></div>

      <svg viewBox="0 0 240 240" style={{ width: '256px', height: '256px', position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
        <defs>
          <pattern id="hexagons" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M10 0 L20 5 L20 15 L10 20 L0 15 L0 5 Z" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>

        <circle cx="120" cy="120" r="115" fill="none" stroke="var(--cyan)" strokeWidth="0.5" strokeDasharray="2 10" className="opacity-20 animate-rotate-slow" />
        <g className="animate-rotate-fast">
          <circle cx="120" cy="120" r="105" fill="none" stroke="var(--indigo)" strokeWidth="1" strokeDasharray="60 120" className="opacity-40" />
          <circle cx="225" cy="120" r="4" fill="var(--cyan)" className="animate-pulse" />
        </g>
        <circle cx="120" cy="120" r="85" fill="none" stroke="var(--cyan)" strokeWidth="1" className="opacity-30" />
        <circle cx="120" cy="120" r="75" fill="url(#hexagons)" className="text-cyan-900 opacity-20" />

        <circle
          cx="120"
          cy="120"
          r="65"
          fill="#020617"
          stroke={isError ? '#ef4444' : (active ? (speaking ? '#fbbf24' : '#00f2ff') : 'rgba(0, 242, 255, 0.4)')}
          strokeWidth="4"
          style={{
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: active ? (speaking ? 'drop-shadow(0 0 25px #fbbf24)' : 'drop-shadow(0 0 20px var(--cyan))') : 'none',
            transform: speaking ? 'scale(1.08)' : 'scale(1)',
            transformOrigin: 'center'
          }}
        />

        {active && (
          <circle
            cx="120"
            cy="120"
            r="60"
            fill="none"
            stroke="white"
            strokeWidth="0.5"
            className="opacity-20 animate-pulse"
          />
        )}
      </svg>

      {!active && !isConnecting && (
        <div className="animate-pulse-text" style={{
          position: 'absolute',
          bottom: '10px',
          fontSize: '10px',
          fontWeight: 900,
          letterSpacing: '6px',
          color: '#00f2ff',
          whiteSpace: 'nowrap',
          zIndex: 30,
          background: 'rgba(2, 6, 23, 0.85)',
          padding: '6px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(0, 242, 255, 0.15)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
        }}>
          НАЖМИ ДЛЯ СВЯЗИ
        </div>
      )}
      {isConnecting && (
        <div className="animate-pulse" style={{
          position: 'absolute',
          bottom: '10px',
          fontSize: '10px',
          fontWeight: 900,
          letterSpacing: '6px',
          color: '#ffcc00',
          whiteSpace: 'nowrap',
          zIndex: 30,
          background: 'rgba(2, 6, 23, 0.85)',
          padding: '6px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 204, 0, 0.15)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
        }}>
          УСТАНОВКА КАНАЛА...
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [isJunSpeaking, setIsJunSpeaking] = useState<boolean>(false);
  const [userIsSpeaking, setUserIsSpeaking] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mainAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(null);

  const stopAudio = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { } });
    sourcesRef.current.clear();
    if (mainAudioContextRef.current) nextStartTimeRef.current = mainAudioContextRef.current.currentTime;
    setIsJunSpeaking(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    // Очищаем audio processor
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) { }
      processorRef.current = null;
    }
    stopAudio();
    setStatus(ConnectionStatus.DISCONNECTED);
    setLastMessage('');
    playSFX('deactivate');
  }, [stopAudio]);

  // Fallback функция для ScriptProcessorNode (устаревший API)
  const setupScriptProcessorFallback = useCallback((
    ctx: AudioContext,
    source: MediaStreamAudioSourceNode,
    socket: WebSocket,
    inputRate: number
  ) => {
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (socket.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        const downsampled = resample(inputData, inputRate, 16000);
        const pcmBlob = createPcmBlob(downsampled);

        socket.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              data: pcmBlob.data,
              mimeType: pcmBlob.mimeType
            }]
          }
        }));
      }
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    processorRef.current = processor;
  }, []);

  const connectToJun = useCallback(async (initialPrompt?: string) => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      playSFX('activate');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      if (!mainAudioContextRef.current) {
        mainAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = mainAudioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const inputRate = ctx.sampleRate;

      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(ctx.destination);
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = async () => {
        setStatus(ConnectionStatus.CONNECTED);

        // Отправляем setup сообщение для конфигурации Gemini API
        const setupMessage = {
          setup: {
            model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Puck"
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }]
            }
          }
        };
        socket.send(JSON.stringify(setupMessage));

        // Отправляем начальный приветственный промпт
        const welcomePrompt = initialPrompt || "Привет, Джун! Поприветствуй меня голосом!";
        socket.send(JSON.stringify({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [{ text: welcomePrompt }]
              }
            ],
            turnComplete: true
          }
        }));

        const source = ctx.createMediaStreamSource(stream);

        // Используем AudioWorkletNode если доступен, иначе fallback на ScriptProcessorNode
        const useAudioWorklet = 'audioWorklet' in ctx;

        if (useAudioWorklet) {
          // Современный подход с AudioWorklet
          // Проверяем, не зарегистрирован ли уже процессор
          const workletCode = `
            if (typeof registerProcessor !== 'undefined') {
              try {
                class AudioRecorderProcessor extends AudioWorkletProcessor {
                  constructor() {
                    super();
                    this.bufferSize = 2048;
                    this.buffer = new Float32Array(this.bufferSize);
                    this.bufferIndex = 0;
                  }
                  
                  process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (input && input[0]) {
                      const channelData = input[0];
                      for (let i = 0; i < channelData.length; i++) {
                        this.buffer[this.bufferIndex++] = channelData[i];
                        if (this.bufferIndex >= this.bufferSize) {
                          this.port.postMessage({ audioData: this.buffer.slice() });
                          this.bufferIndex = 0;
                        }
                      }
                    }
                    return true;
                  }
                }
                registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
              } catch (e) {
                // Процессор уже зарегистрирован, игнорируем ошибку
              }
            }
          `;

          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);

          try {
            await ctx.audioWorklet.addModule(workletUrl);
            const workletNode = new AudioWorkletNode(ctx, 'audio-recorder-processor');

            workletNode.port.onmessage = (e) => {
              if (socket.readyState === WebSocket.OPEN) {
                const audioData = e.data.audioData;
                const downsampled = resample(audioData, inputRate, 16000);
                const pcmBlob = createPcmBlob(downsampled);

                socket.send(JSON.stringify({
                  realtimeInput: {
                    mediaChunks: [{
                      data: pcmBlob.data,
                      mimeType: pcmBlob.mimeType
                    }]
                  }
                }));
              }
            };

            source.connect(workletNode);
            workletNode.connect(ctx.destination);

            // Сохраняем ссылку для очистки
            processorRef.current = workletNode;
          } catch (err) {
            console.warn('AudioWorklet не удалось инициализировать, используем fallback:', err);
            // Fallback на ScriptProcessorNode
            setupScriptProcessorFallback(ctx, source, socket, inputRate);
          }

          URL.revokeObjectURL(workletUrl);
        } else {
          // Fallback для старых браузеров
          setupScriptProcessorFallback(ctx, source, socket, inputRate);
        }
      };

      socket.onmessage = async (event) => {
        let textData = event.data;
        if (event.data instanceof Blob) {
          textData = await event.data.text();
        }

        const message = JSON.parse(textData);

        // Логируем не аудио сообщения для отладки
        if (!message.serverContent?.modelTurn?.parts?.[0]?.inlineData && !message.server_content?.model_turn?.parts?.[0]?.inline_data) {
          console.log('🤖 Пришло от Джуна:', message);
        }

        const serverContent = message.serverContent || message.server_content;
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
        const parts = modelTurn?.parts;
        const firstPart = parts?.[0];
        const inlineData = firstPart?.inlineData || firstPart?.inline_data;
        const base64Audio = inlineData?.data;

        if (base64Audio) {
          setIsJunSpeaking(true);
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
          const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(analyserRef.current!);
          source.onended = () => {
            sourcesRef.current.delete(source);
            if (sourcesRef.current.size === 0) setIsJunSpeaking(false);
          };
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buffer.duration;
          sourcesRef.current.add(source);
        }

        if (serverContent?.interrupted) stopAudio();
        if (serverContent?.turnComplete || serverContent?.turn_complete) setUserIsSpeaking(false);
      };

      socket.onerror = (e) => {
        console.error("Neural link error:", e);
        setStatus(ConnectionStatus.ERROR);
      };

      socket.onclose = () => {
        if (status !== ConnectionStatus.ERROR) {
          setStatus(ConnectionStatus.DISCONNECTED);
        }
      };

    } catch (err) {
      console.error("Connection failed:", err);
      setStatus(ConnectionStatus.ERROR);
    }
  }, [stopAudio, status, setupScriptProcessorFallback]);

  const toggleMainAction = useCallback(() => {
    if (isJunSpeaking) {
      stopAudio();
      playSFX('click');
      return;
    }

    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      handleDisconnect();
    } else {
      // При первом клике инициируем знакомство
      connectToJun();
    }
  }, [status, isJunSpeaking, handleDisconnect, connectToJun, stopAudio]);

  const triggerAction = (label: string, prompt: string) => {
    playSFX('click');
    setLastMessage(`РЕЖИМ: ${label}`);
    if (status === ConnectionStatus.CONNECTED && socketRef.current) {
      stopAudio();
      socketRef.current.send(JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          turnComplete: true
        }
      }));
    } else {
      connectToJun(prompt);
    }
  };

  return (
    <div id="root" style={{ background: 'transparent', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        height: '65px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 20px',
        zIndex: 100,
        background: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(15px)',
        borderBottom: '1px solid rgba(0, 242, 255, 0.25)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '13px', color: '#00f2ff', fontWeight: 900, letterSpacing: '3.5px', textShadow: '0 0 12px var(--cyan)' }}>МЕТАЛ-БРЕЗ</div>
            <div style={{
              fontSize: '8px',
              color: status === ConnectionStatus.CONNECTED ? '#00f2ff' : 'rgba(0, 242, 255, 0.4)',
              fontWeight: 700,
              letterSpacing: '1.5px',
              transition: 'all 0.5s ease',
              textShadow: status === ConnectionStatus.CONNECTED ? '0 0 10px #00f2ff' : 'none',
              opacity: status === ConnectionStatus.CONNECTED ? 1 : 0.6,
              animation: status === ConnectionStatus.CONNECTED ? 'pulse-text 2s infinite' : 'none'
            }}>
              ПРЯМАЯ СВЯЗЬ
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '16px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{
                width: '3px',
                height: i * 3 + 'px',
                background: status === ConnectionStatus.CONNECTED ? '#00f2ff' : '#1e293b',
                boxShadow: status === ConnectionStatus.CONNECTED ? '0 0 8px #00f2ff' : 'none',
                borderRadius: '1px',
                transition: 'all 0.4s ease'
              }}></div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); stopAudio(); playSFX('click'); }}
            style={{
              background: isJunSpeaking ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
              border: isJunSpeaking ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              borderRadius: '12px',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: status === ConnectionStatus.CONNECTED ? 1 : 0,
              pointerEvents: status === ConnectionStatus.CONNECTED ? 'auto' : 'none',
              filter: isJunSpeaking ? 'drop-shadow(0 0 12px #ef4444)' : 'none',
              animation: isJunSpeaking ? 'pulse-ring 1s infinite' : 'none'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isJunSpeaking ? "#ef4444" : "#00f2ff"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              {isJunSpeaking ? (
                <>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </>
              ) : (
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              )}
            </svg>
          </button>

          <button onClick={() => location.reload()} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '8px 12px', borderRadius: '10px', fontSize: '9px', fontWeight: 900, cursor: 'pointer' }}>СБРОС</button>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div
          onClick={toggleMainAction}
          style={{ zIndex: 20, width: '280px', height: '280px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
        >
          <MetalBreathIcon active={status === ConnectionStatus.CONNECTED} speaking={isJunSpeaking} status={status} analyser={analyserRef.current} isUserSpeaking={userIsSpeaking} />
        </div>
      </main>

      <div style={{ width: '100%', padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60px', zIndex: 10 }}>
        {lastMessage && (
          <div style={{
            fontSize: '12px', fontWeight: 900, color: '#00f2ff', letterSpacing: '5px', textTransform: 'uppercase',
            textShadow: '0 0 10px rgba(0, 242, 255, 0.6)', background: 'rgba(0, 242, 255, 0.1)',
            padding: '8px 20px', borderRadius: '20px', border: '1px solid rgba(0, 242, 255, 0.3)'
          }}>
            {lastMessage}
          </div>
        )}
      </div>

      <footer style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '15px',
        background: 'rgba(2, 6, 23, 0.95)', backdropFilter: 'blur(30px)', borderTop: '1px solid rgba(0, 242, 255, 0.2)',
        paddingBottom: 'calc(15px + env(safe-area-inset-bottom))', zIndex: 100
      }}>
        <FooterBtn label="ОБЩЕНИЕ" color="#4f46e5" onClick={() => triggerAction('ОБЩЕНИЕ', 'Джун, переходи в режим ОБЩЕНИЕ! Прояви инициативу и предложи тему для разговора.')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="МИССИЯ" color="#0ea5e9" onClick={() => triggerAction('МИССИЯ', 'Джун, активируй режим МИССИЯ! Нам нужно выполнить важное задание.')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="СКАНЕР" color="#ec4899" onClick={() => triggerAction('СКАНЕР', 'Джун, включай режим СКАНЕР! Проверь, нет ли поблизости чего-то интересного.')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="КАРТЫ" color="#8b5cf6" onClick={() => triggerAction('КАРТЫ', 'Джун, активируй режим КАРТЫ! Где мы сейчас находимся в мире Металлкардбот?')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="НАУКА" color="#10b981" onClick={() => triggerAction('НАУКА', 'Джун, включай режим НАУКА! Расскажи какой-нибудь удивительный факт.')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="ЯЗЫКИ" color="#f59e0b" onClick={() => triggerAction('ЯЗЫКИ', 'Джун, переходи в режим ЯЗЫКИ! Давай выучим новое слово.')} active={status === ConnectionStatus.CONNECTED} />
      </footer>
    </div>
  );
}

const FooterBtn = ({ label, onClick, color, active }: any) => (
  <button onClick={onClick} className="btn-active-flash" style={{
    background: active ? `linear-gradient(135deg, ${color}33, rgba(15, 23, 42, 0.8))` : 'rgba(255, 255, 255, 0.04)',
    border: `1px solid ${active ? color : 'rgba(255, 255, 255, 0.15)'}`,
    borderRadius: '16px', padding: '18px 6px', color: active ? 'white' : '#64748b',
    fontSize: '11px', fontWeight: '900', letterSpacing: '1.5px', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer', overflow: 'hidden', position: 'relative', boxShadow: active ? `0 0 20px ${color}22` : 'none'
  }}>
    {active && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)', animation: 'shimmer 2.5s infinite' }}></div>}
    {label}
  </button>
);
