import express from 'express';
import { createServer as createViteServer } from 'vite';
import { streamChatWithFallback, chatWithFallback, Message, ProviderOptions } from './src/lib/aiProvider';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import compression from 'compression';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory Secure Cache for frequent questions
interface CachedResponse {
  text: string;
  groundingMetadata?: any;
  cachedAt: number;
}

const responseCache = new Map<string, CachedResponse>();

// Manage cache size (keep max 500 entries) to prevent memory leak
function cleanAndCapCache() {
  const now = Date.now();
  // Clear expired entries (> 30 minutes)
  for (const [key, val] of responseCache.entries()) {
    if (now - val.cachedAt > 30 * 60 * 1000) {
      responseCache.delete(key);
    }
  }
  // Cap entries to 500
  if (responseCache.size > 500) {
    const keys = Array.from(responseCache.keys());
    const excess = responseCache.size - 500;
    for (let i = 0; i < excess; i++) {
      responseCache.delete(keys[i]);
    }
  }
}

// Secure Server-side OTP Record interface & in-memory cache
interface OtpRecord {
  otp: string;
  expiresAt: number;
  lastRequestedAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpRecord>();

// Periodically purge expired OTPs to manage memory footprint safely
setInterval(() => {
  const now = Date.now();
  for (const [phone, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(phone);
    }
  }
}, 60 * 1000);

// Lazy initialization of Twilio Client to ensure app starts even without configuration
let twilioClient: any = null;
function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are missing on the server.');
  }
  if (!twilioClient) {
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  
  // Enable automatic Gzip/Brotli payload compression for low bandwidth networks.
  // Bypass compression for SSE stream so chunks flow instantly without server buffering.
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['accept'] === 'text/event-stream' || res.getHeader('content-type') === 'text/event-stream') {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  // Log Active AI Provider and Loaded Keys
  const activeProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase().trim();
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  const hasGroqKey = !!process.env.GROQ_API_KEY;

  console.log('=== 🚀 GocampuX AI Server Initialization ===');
  console.log(`Active Provider: ${activeProvider.toUpperCase()}`);
  console.log(`Anthropic API Key Loaded: ${hasAnthropicKey}`);
  console.log(`Gemini API Key Loaded: ${hasGeminiKey}`);
  console.log(`OpenAI API Key Loaded: ${hasOpenAIKey}`);
  console.log(`OpenRouter API Key Loaded: ${hasOpenRouterKey}`);
  console.log(`Groq API Key Loaded: ${hasGroqKey}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('==========================================');

  // Startup Validation based on selected AI_PROVIDER
  let startupValidationError = '';
  if (activeProvider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      startupValidationError = 'ANTHROPIC_API_KEY is required when AI_PROVIDER is "anthropic"';
    } else if (!process.env.ANTHROPIC_MODEL) {
      startupValidationError = 'ANTHROPIC_MODEL is required when AI_PROVIDER is "anthropic"';
    }
  } else if (activeProvider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      startupValidationError = 'OPENAI_API_KEY is required when AI_PROVIDER is "openai"';
    } else if (!process.env.OPENAI_MODEL) {
      startupValidationError = 'OPENAI_MODEL is required when AI_PROVIDER is "openai"';
    }
  } else if (activeProvider === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) {
      startupValidationError = 'OPENROUTER_API_KEY is required when AI_PROVIDER is "openrouter"';
    } else if (!process.env.OPENROUTER_MODEL) {
      startupValidationError = 'OPENROUTER_MODEL is required when AI_PROVIDER is "openrouter"';
    }
  } else if (activeProvider === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      startupValidationError = 'GROQ_API_KEY is required when AI_PROVIDER is "groq"';
    } else if (!process.env.GROQ_MODEL) {
      startupValidationError = 'GROQ_MODEL is required when AI_PROVIDER is "groq"';
    }
  } else if (activeProvider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      startupValidationError = 'GEMINI_API_KEY is required when AI_PROVIDER is "gemini"';
    }
  } else {
    startupValidationError = `Unsupported AI_PROVIDER: ${activeProvider}`;
  }

  if (startupValidationError) {
    console.error('⚠️  STARTUP WARNING:');
    console.error(startupValidationError);
    console.error('Chat requests will fail until variables are configured.');
  } else {
    console.log('✅ All required environment variables are configured!');
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      provider: activeProvider,
      timestamp: new Date().toISOString(),
    });
  });

  // Secure SMS OTP Send Endpoint
  app.post('/api/otp/send', async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required.' });
      }

      // Normalize phone number: strip all spaces/special characters except '+' and numbers
      const cleanedPhone = phoneNumber.replace(/[^\d+]/g, '');

      // Ensure E.164 phone standard (+ followed by 10-15 digits)
      if (!cleanedPhone.match(/^\+\d{10,15}$/)) {
        return res.status(400).json({ error: 'Invalid international phone number format. Must start with "+" and include country code (e.g., +19876543210).' });
      }

      const now = Date.now();
      const existingRecord = otpStore.get(cleanedPhone);

      // 60-Second Request Rate Limiter (Cooldown)
      if (existingRecord && (now - existingRecord.lastRequestedAt < 60 * 1000)) {
        const waitTime = Math.ceil((60 * 1000 - (now - existingRecord.lastRequestedAt)) / 1000);
        return res.status(429).json({ 
          error: `Please wait ${waitTime}s before requesting a new OTP verification code.` 
        });
      }

      // Generate strong 6-digit verification code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = now + 5 * 60 * 1000; // 5 minutes expiration

      // Store securely with a clean reset state
      otpStore.set(cleanedPhone, {
        otp,
        expiresAt,
        lastRequestedAt: now,
        attempts: 0
      });

      console.log(`[OTP] Generated new OTP for ${cleanedPhone} (expires in 5m)`);

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioToken && twilioPhone) {
        try {
          const client = getTwilioClient();
          await client.messages.create({
            body: `gocompuX: Your secure verification code is ${otp}. It will expire in 5 minutes.`,
            from: twilioPhone,
            to: cleanedPhone
          });
          console.log(`[OTP] SMS sent to ${cleanedPhone}`);
        } catch (smsError: any) {
          console.error('[OTP ERROR]', smsError);
          return res.status(502).json({ 
            error: `SMS transmission failed: ${smsError.message || 'Unknown error'}` 
          });
        }
      } else {
        console.warn('[OTP] Twilio not configured - using debug mode');
        console.log(`[DEBUG OTP]: ${otp}`);
        
        return res.status(200).json({
          success: true,
          warning: 'Twilio not configured. OTP output to server logs.',
          message: 'OTP processed (debug mode).'
        });
      }

      return res.json({ success: true, message: 'Verification OTP sent successfully!' });
    } catch (error: any) {
      console.error('Error in /api/otp/send:', error);
      res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
  });

  // Secure SMS OTP Verify Endpoint
  app.post('/api/otp/verify', async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      if (!phoneNumber || !code) {
        return res.status(400).json({ error: 'Phone number and verification code are required.' });
      }

      const cleanedPhone = phoneNumber.replace(/[^\d+]/g, '');
      const record = otpStore.get(cleanedPhone);

      if (!record) {
        return res.status(400).json({ error: 'No OTP request found for this phone number. Please click "Send OTP" first.' });
      }

      // Check Expiration (5 minutes)
      if (Date.now() > record.expiresAt) {
        otpStore.delete(cleanedPhone);
        return res.status(400).json({ error: 'This verification code has expired. Please request a new OTP.' });
      }

      // Brute-force rate limits: invalidate code after 5 wrong attempts
      record.attempts += 1;
      if (record.attempts > 5) {
        otpStore.delete(cleanedPhone);
        return res.status(400).json({ error: 'Too many incorrect attempts. For security, this OTP is now invalidated. Please request a new code.' });
      }

      // Precise OTP Code matching
      if (record.otp !== code.trim()) {
        return res.status(400).json({ 
          error: `Incorrect verification code. Remaining attempts: ${5 - record.attempts}` 
        });
      }

      // Validation Complete: invalidate to prevent replay attacks
      otpStore.delete(cleanedPhone);
      console.log(`[OTP] Phone ${cleanedPhone} successfully verified.`);
      
      return res.json({ success: true, message: 'Phone number verified successfully!' });
    } catch (error: any) {
      console.error('Error in /api/otp/verify:', error);
      res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
  });

  // API endpoint for AI Chat
  app.post('/api/chat', async (req, res) => {
    const routeStart = Date.now();
    try {
      const { messages, model, systemInstruction, stream, thinkingLevel, useWebSearch } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required.' });
      }

      // If there was a startup validation error for the selected provider, fail the request
      if (startupValidationError) {
        return res.status(400).json({ error: startupValidationError });
      }

      // Connection Optimization
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=60, max=1000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Detect Low Bandwidth
      const isLowBandwidth = req.headers['x-low-bandwidth'] === 'true' || req.query.lowBandwidth === 'true';
      const historyPruneLimit = isLowBandwidth ? 3 : 5;
      const relevantMessages = messages.slice(-historyPruneLimit);

      // Model selection
      let selectedModel = model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';

      const formattedMessages: Message[] = relevantMessages.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content || '',
        attachments: msg.attachments || []
      }));

      let customSystemInstruction = systemInstruction || 'You are a helpful, creative, and intelligent AI assistant.';
      if (isLowBandwidth) {
        customSystemInstruction += ' WARNING: User is on slow connection. Keep responses brief and concise.';
      }

      const options: ProviderOptions = {
        messages: formattedMessages,
        model: selectedModel,
        systemInstruction: customSystemInstruction,
        thinkingLevel: thinkingLevel || undefined,
        useWebSearch: useWebSearch || undefined,
      };

      const aiStartTime = Date.now();

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');

        try {
          const streamResponse = streamChatWithFallback(options, activeProvider);
          let fullAccumulatedText = '';
          let finalGroundingMetadata: any = null;
          let firstChunkTime = 0;
          let finalUsageMetadata: any = null;
          let actualUsedModel = selectedModel;
          let actualUsedProvider = activeProvider;

          for await (const chunk of streamResponse) {
            if (firstChunkTime === 0) {
              firstChunkTime = Date.now();
            }
            
            if (chunk.provider) {
              actualUsedProvider = chunk.provider;
            }

            if (chunk.type === 'content') {
              const chunkText = chunk.text || '';
              fullAccumulatedText += chunkText;
              
              if (chunk.groundingMetadata) {
                finalGroundingMetadata = chunk.groundingMetadata;
              }
              
              res.write(`data: ${JSON.stringify({ text: chunkText, groundingMetadata: finalGroundingMetadata })}\n\n`);
            } else if (chunk.type === 'stats') {
              if (chunk.model) {
                actualUsedModel = chunk.model;
              }
              if (chunk.usageMetadata) {
                finalUsageMetadata = chunk.usageMetadata;
              }
            }
          }

          const routeEnd = Date.now();
          const serverOverhead = aiStartTime - routeStart;
          const geminiTtft = firstChunkTime > 0 ? firstChunkTime - aiStartTime : 0;
          const geminiGenerationTime = firstChunkTime > 0 ? routeEnd - firstChunkTime : 0;
          const serverTotalTime = routeEnd - routeStart;

          res.write(`data: ${JSON.stringify({
            stats: {
              serverOverhead,
              geminiTtft,
              geminiGenerationTime,
              serverTotalTime,
              model: `${actualUsedModel} (${actualUsedProvider})`,
              usageMetadata: finalUsageMetadata || {
                promptTokenCount: Math.ceil(JSON.stringify(formattedMessages).length / 3.8),
                candidatesTokenCount: Math.ceil(fullAccumulatedText.length / 3.8)
              }
            }
          })}\n\n`);

          res.write('data: [DONE]\n\n');
          res.end();
        } catch (streamError: any) {
          console.error('Streaming error in chat route:', streamError);
          res.write(`data: ${JSON.stringify({ error: streamError.message || String(streamError) })}\n\n`);
          res.end();
        }
      } else {
        const result = await chatWithFallback(options, activeProvider);
        const text = result.text || '';
        const groundingMetadata = result.groundingMetadata || null;
        const finalUsageMetadata = result.usageMetadata || null;
        const actualUsedProvider = result.provider || activeProvider;
        const actualUsedModel = result.model || selectedModel;

        const routeEnd = Date.now();
        res.json({
          text,
          groundingMetadata,
          stats: {
            serverOverhead: aiStartTime - routeStart,
            geminiTtft: routeEnd - aiStartTime,
            geminiGenerationTime: 0,
            serverTotalTime: routeEnd - routeStart,
            model: `${actualUsedModel} (${actualUsedProvider})`,
            usageMetadata: finalUsageMetadata || {
              promptTokenCount: Math.ceil(JSON.stringify(formattedMessages).length / 3.8),
              candidatesTokenCount: Math.ceil(text.length / 3.8)
            }
          }
        });
      }
    } catch (error: any) {
      console.error('Error in /api/chat:', error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // CORS preflight
  app.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
  });

  // Serve static assets or mount Vite dev middleware
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`\n✅ Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}\n`);
  });
}

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
