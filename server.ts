import express from 'express';
import { createServer as createViteServer } from 'vite';
import { streamChatWithFallback, chatWithFallback, getOrderedProviders, Message, ProviderOptions } from './src/lib/aiProvider';
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
  app.use(express.json());
  
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
  const activeProvider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase().trim();
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  const hasGroqKey = !!process.env.GROQ_API_KEY;

  console.log('=== AI Provider Configuration ===');
  console.log(`Active Provider: ${activeProvider}`);
  console.log(`Anthropic API Key Loaded: ${hasAnthropicKey}`);
  console.log(`Gemini API Key Loaded: ${hasGeminiKey}`);
  console.log(`OpenAI API Key Loaded: ${hasOpenAIKey}`);
  console.log(`OpenRouter API Key Loaded: ${hasOpenRouterKey}`);
  console.log(`Groq API Key Loaded: ${hasGroqKey}`);
  console.log(`Project configuration: { nodeEnv: "${process.env.NODE_ENV || 'development'}", port: 3000 }`);
  console.log('================================');

  // Startup Validation based on selected AI_PROVIDER (Logged on startup, validated at request time to prevent boot crashes on deployment)
  let startupValidationError = '';
  if (activeProvider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      startupValidationError = 'Startup Validation Failed: ANTHROPIC_API_KEY environment variable is required when AI_PROVIDER is "anthropic".';
    } else if (!process.env.ANTHROPIC_MODEL) {
      startupValidationError = 'Startup Validation Failed: ANTHROPIC_MODEL environment variable is required when AI_PROVIDER is "anthropic".';
    }
  } else if (activeProvider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      startupValidationError = 'Startup Validation Failed: OPENAI_API_KEY environment variable is required when AI_PROVIDER is "openai".';
    } else if (!process.env.OPENAI_MODEL) {
      startupValidationError = 'Startup Validation Failed: OPENAI_MODEL environment variable is required when AI_PROVIDER is "openai".';
    }
  } else if (activeProvider === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) {
      startupValidationError = 'Startup Validation Failed: OPENROUTER_API_KEY environment variable is required when AI_PROVIDER is "openrouter".';
    } else if (!process.env.OPENROUTER_MODEL) {
      startupValidationError = 'Startup Validation Failed: OPENROUTER_MODEL environment variable is required when AI_PROVIDER is "openrouter".';
    }
  } else if (activeProvider === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      startupValidationError = 'Startup Validation Failed: GROQ_API_KEY environment variable is required when AI_PROVIDER is "groq".';
    } else if (!process.env.GROQ_MODEL) {
      startupValidationError = 'Startup Validation Failed: GROQ_MODEL environment variable is required when AI_PROVIDER is "groq".';
    }
  } else if (activeProvider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      startupValidationError = 'Startup Validation Failed: GEMINI_API_KEY environment variable is required when AI_PROVIDER is "gemini".';
    }
  } else {
    startupValidationError = `Startup Validation Failed: Unsupported AI_PROVIDER "${activeProvider}".`;
  }

  if (startupValidationError) {
    console.error('================================================================');
    console.error(`[STARTUP WARNING] ${startupValidationError}`);
    console.error('The application has started successfully to satisfy health checks, but chat requests will fail until these variables are configured.');
    console.error('================================================================');
  }

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

      console.log(`[SERVER OTP SECURITY LOG] Generated new OTP for ${cleanedPhone} (expires in 5m)`);

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
          console.log(`[SERVER OTP SUCCESS] Real SMS successfully sent to ${cleanedPhone}`);
        } catch (smsError: any) {
          console.error('[SERVER OTP ERROR] Twilio SMS dispatch failed:', smsError);
          return res.status(502).json({ 
            error: `SMS transmission failed: ${smsError.message || 'Unknown carrier/network error.'}` 
          });
        }
      } else {
        // Safe console-only logging mode if the user's Twilio credentials aren't configured yet
        console.warn('[SERVER OTP CONFIG WARNING] Twilio environment variables are missing! See .env.example.');
        console.log(`[SERVER SECURE TEST OTP - PRIVATE BACKEND LOG]: ${otp}`);
        
        return res.status(200).json({
          success: true,
          warning: 'Twilio secrets are not set in the environment yet. The secure OTP has been output to the private server logs for testing.',
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
      console.log(`[SERVER OTP SUCCESS] Phone ${cleanedPhone} successfully verified.`);
      
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

      // If there was a startup validation error for the selected provider, fail the request with a clear message
      if (startupValidationError) {
        return res.status(400).json({ error: startupValidationError });
      }

      // 1. Connection Optimization (HTTP keep-alive for fast persistent connection reuse)
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=60, max=1000');

      // 2. Detect Adaptive Connection State (Low Bandwidth / Slow Connections)
      const isLowBandwidth = req.headers['x-low-bandwidth'] === 'true' || req.query.lowBandwidth === 'true';

      // 3. Compact Context Truncation (Send ONLY the last 3-5 relevant messages to optimize latency)
      const historyPruneLimit = isLowBandwidth ? 3 : 5;
      const relevantMessages = messages.slice(-historyPruneLimit);

      const activeProvider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase().trim();
      let selectedModel = model || 'claude-opus-4-8';

      if (activeProvider === 'anthropic' && (!model || model.includes('gemini') || model.includes('gpt') || model.includes('llama') || model === 'claude-sonnet-4-0')) {
        selectedModel = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
      } else if (activeProvider === 'gemini' && (!model || model.includes('claude') || model.includes('gpt') || model.includes('llama'))) {
        selectedModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
      } else if (activeProvider === 'openai' && (!model || model.includes('gemini') || model.includes('claude') || model.includes('llama'))) {
        selectedModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      } else if (activeProvider === 'openrouter' && (!model || model.includes('gemini') || model.includes('claude') || model.includes('gpt'))) {
        selectedModel = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
      } else if (activeProvider === 'groq' && (!model || model.includes('gemini') || model.includes('claude') || model.includes('gpt'))) {
        selectedModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      }

      // Explicitly normalize/map 'claude-sonnet-4-0' to 'claude-opus-4-8'
      if (selectedModel === 'claude-sonnet-4-0') {
        selectedModel = 'claude-opus-4-8';
      }

      console.log('=== AI Provider Request ===');
      console.log(`Active Provider: ${activeProvider}`);
      console.log(`Model name: ${selectedModel}`);
      console.log(`Project configuration: { isLowBandwidth: ${isLowBandwidth}, historyPruneLimit: ${historyPruneLimit}, useWebSearch: ${!!useWebSearch}, thinkingLevel: "${thinkingLevel || 'none'}"}`);
      console.log('===========================');

      // 4. In-Memory Response Cache Lookup for frequent/frequent exact questions
      const userMessages = relevantMessages.filter((msg: any) => msg.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1];
      const hasAttachments = lastUserMsg?.attachments && lastUserMsg.attachments.length > 0;
      
      const cacheKey = lastUserMsg && !hasAttachments
        ? `${selectedModel}_${lastUserMsg.content.trim().toLowerCase().replace(/[^\w\s]/g, '')}`
        : null;

      if (cacheKey) {
        cleanAndCapCache();
        const cached = responseCache.get(cacheKey);
        if (cached && (Date.now() - cached.cachedAt < 30 * 60 * 1000)) { // 30-minute validity
          console.log(`[LATENCY PRO: CACHE HIT] Bypassing AI entirely for key: "${cacheKey}" - Speed: < 1ms`);
          
          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.write(`data: ${JSON.stringify({ text: cached.text, groundingMetadata: cached.groundingMetadata, cached: true })}\n\n`);
            
            res.write(`data: ${JSON.stringify({
              stats: {
                serverOverhead: Date.now() - routeStart,
                geminiTtft: 0,
                geminiGenerationTime: 0,
                serverTotalTime: Date.now() - routeStart,
                model: `${selectedModel} (Cached)`,
                usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
                cached: true
              }
            })}\n\n`);

            res.write('data: [DONE]\n\n');
            res.end();
            return;
          } else {
            return res.json({ text: cached.text, groundingMetadata: cached.groundingMetadata, cached: true });
          }
        }
      }

      // Parse messages to standard format for provider
      const formattedMessages: Message[] = relevantMessages.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content || '',
        attachments: msg.attachments || []
      }));

      let customSystemInstruction = systemInstruction || 'You are a helpful, creative, and intelligent AI assistant.';
      if (isLowBandwidth) {
        customSystemInstruction += ' WARNING: The user is on a slow or low-bandwidth connection. You MUST prioritize extreme brevity. Respond with high clarity using minimal tokens (ideally 1-2 chunks).';
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

          if (cacheKey && fullAccumulatedText) {
            responseCache.set(cacheKey, {
              text: fullAccumulatedText,
              groundingMetadata: finalGroundingMetadata,
              cachedAt: Date.now()
            });
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

        if (cacheKey && text) {
          responseCache.set(cacheKey, {
            text,
            groundingMetadata,
            cachedAt: Date.now()
          });
        }

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
    console.log(`Server running in ${isProd ? 'production' : 'development'} mode at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
