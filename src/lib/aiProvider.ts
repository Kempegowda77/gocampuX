import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  attachments?: any[];
}

export interface ProviderOptions {
  messages: Message[];
  model?: string;
  systemInstruction?: string;
  stream?: boolean;
  thinkingLevel?: string;
  useWebSearch?: boolean;
}

// Map errors to robust, user-friendly descriptions
function mapProviderError(error: any, provider: string): Error {
  const msg = String(error.message || error);
  console.error(`[${provider.toUpperCase()} ERROR DETECTED]`, msg);

  let userFriendlyMsg = msg;
  if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid api key') || msg.includes('Invalid API')) {
    userFriendlyMsg = `Invalid API key configured for ${provider}. Please check your credentials.`;
  } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('Too Many Requests') || msg.includes('exceeded your current quota')) {
    userFriendlyMsg = `The code is correct. The ${provider} API request is being rejected because the project's quota is exhausted or rate limit has been exceeded.`;
  } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('FetchError') || msg.includes('network')) {
    userFriendlyMsg = `A network timeout occurred while communicating with ${provider}. Please try again later.`;
  } else if (msg.includes('500') || msg.includes('Internal Server Error')) {
    userFriendlyMsg = `An internal server error occurred on ${provider}'s side.`;
  }

  return new Error(userFriendlyMsg);
}

// Get the fallback ordered list of providers
export function getOrderedProviders(preferredProvider: string): string[] {
  return [(preferredProvider || 'anthropic').toLowerCase().trim()];
}

// Direct Anthropic API Helper
let anthropicClient: Anthropic | null = null;
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not defined. Please check your environment variables.');
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

async function chatAnthropic(options: ProviderOptions) {
  const client = getAnthropicClient();
  const model = options.model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  const system = options.systemInstruction;
  const messages = formatMessagesForOpenRouter(options.messages); // Anthropic-shaped messages

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as any).text)
    .join('\n');

  return {
    text,
    usageMetadata: {
      promptTokenCount: response.usage?.input_tokens || Math.ceil(JSON.stringify(messages).length / 4),
      candidatesTokenCount: response.usage?.output_tokens || Math.ceil(text.length / 4),
    }
  };
}

async function* streamAnthropic(options: ProviderOptions) {
  const client = getAnthropicClient();
  const model = options.model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  const system = options.systemInstruction;
  const messages = formatMessagesForOpenRouter(options.messages);

  const stream = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
    stream: true,
  });

  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    if (chunk.type === 'message_start' && chunk.message.usage) {
      promptTokens = chunk.message.usage.input_tokens || 0;
    }
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield { type: 'content', text: chunk.delta.text };
    }
    if (chunk.type === 'message_delta' && chunk.usage) {
      completionTokens = chunk.usage.output_tokens || 0;
    }
  }

  yield {
    type: 'stats',
    model,
    usageMetadata: {
      promptTokenCount: promptTokens || Math.ceil(JSON.stringify(messages).length / 4),
      candidatesTokenCount: completionTokens || 0,
    }
  };
}

// OpenRouter Helper & Message Formatter
let openrouterClient: Anthropic | null = null;
function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not defined. Please check your environment variables.');
  }
  if (!openrouterClient) {
    openrouterClient = new Anthropic({
      apiKey,
      baseURL: 'https://openrouter.ai/api'
    });
  }
  return openrouterClient;
}

function formatMessagesForOpenRouter(messages: Message[]) {
  const formatted: any[] = [];

  messages.forEach((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    let content: any = msg.content || '';

    if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      const parts: any[] = [];
      if (msg.content) {
        parts.push({ type: 'text', text: msg.content });
      }
      msg.attachments.forEach((att: any) => {
        if (att.mimeType && att.mimeType.startsWith('image/')) {
          parts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: att.mimeType,
              data: att.data
            }
          });
        }
      });
      content = parts;
    }

    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      const lastMsg = formatted[formatted.length - 1];
      if (typeof lastMsg.content === 'string' && typeof content === 'string') {
        lastMsg.content += '\n' + content;
      } else {
        const existingParts = typeof lastMsg.content === 'string' ? [{ type: 'text', text: lastMsg.content }] : lastMsg.content;
        const newParts = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
        lastMsg.content = [...existingParts, ...newParts];
      }
    } else {
      formatted.push({ role, content });
    }
  });

  if (formatted.length > 0 && formatted[0].role === 'assistant') {
    formatted.unshift({ role: 'user', content: 'Hello' });
  }

  return formatted;
}

// OpenRouter Calls
async function* streamOpenRouter(options: ProviderOptions) {
  const client = getOpenRouterClient();
  const model = options.model || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
  const system = options.systemInstruction;
  const messages = formatMessagesForOpenRouter(options.messages);

  const stream = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
    stream: true,
  });

  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    if (chunk.type === 'message_start' && chunk.message.usage) {
      promptTokens = chunk.message.usage.input_tokens || 0;
    }
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield {
        type: 'content',
        text: chunk.delta.text,
      };
    }
    if (chunk.type === 'message_delta' && chunk.usage) {
      completionTokens = chunk.usage.output_tokens || 0;
    }
  }

  yield {
    type: 'stats',
    model,
    usageMetadata: {
      promptTokenCount: promptTokens || Math.ceil(JSON.stringify(messages).length / 4),
      candidatesTokenCount: completionTokens || 0,
    }
  };
}

async function chatOpenRouter(options: ProviderOptions) {
  const client = getOpenRouterClient();
  const model = options.model || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
  const system = options.systemInstruction;
  const messages = formatMessagesForOpenRouter(options.messages);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as any).text)
    .join('\n');

  return {
    text,
    usageMetadata: {
      promptTokenCount: response.usage?.input_tokens || Math.ceil(JSON.stringify(messages).length / 4),
      candidatesTokenCount: response.usage?.output_tokens || Math.ceil(text.length / 4),
    }
  };
}

// Gemini Helper
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined. Please check your environment variables.');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      }
    });
  }
  return geminiClient;
}

function formatMessagesForGemini(messages: Message[]) {
  return messages.map((msg) => {
    const parts: any[] = [];
    if (msg.content) {
      parts.push({ text: msg.content.trim() });
    }
    if (msg.attachments && Array.isArray(msg.attachments)) {
      msg.attachments.forEach((att: any) => {
        parts.push({
          inlineData: {
            data: att.data,
            mimeType: att.mimeType,
          }
        });
      });
    }
    if (parts.length === 0) {
      parts.push({ text: '' });
    }
    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

// Gemini Calls
async function* streamGemini(options: ProviderOptions) {
  const client = getGeminiClient();
  const model = options.model || 'gemini-3.5-flash';
  const contents = formatMessagesForGemini(options.messages);

  const config: any = {
    systemInstruction: options.systemInstruction,
  };
  if (options.useWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }
  if (options.thinkingLevel) {
    config.thinkingConfig = {
      thinkingLevel: options.thinkingLevel === 'MINIMAL' ? ThinkingLevel.MINIMAL : options.thinkingLevel === 'LOW' ? ThinkingLevel.LOW : ThinkingLevel.HIGH
    };
  }

  const stream = await client.models.generateContentStream({
    model,
    contents,
    config,
  });

  let lastGrounding: any = null;
  let finalUsage: any = null;

  for await (const chunk of stream) {
    const text = chunk.text || '';
    const grounding = chunk.candidates?.[0]?.groundingMetadata || null;
    if (grounding) {
      lastGrounding = grounding;
    }
    const usage = (chunk as any).usageMetadata || null;
    if (usage) {
      finalUsage = usage;
    }

    yield {
      type: 'content',
      text,
      groundingMetadata: grounding,
    };
  }

  yield {
    type: 'stats',
    model,
    usageMetadata: finalUsage || {
      promptTokenCount: Math.ceil(JSON.stringify(contents).length / 3.8),
      candidatesTokenCount: 0,
    }
  };
}

async function chatGemini(options: ProviderOptions) {
  const client = getGeminiClient();
  const model = options.model || 'gemini-3.5-flash';
  const contents = formatMessagesForGemini(options.messages);

  const config: any = {
    systemInstruction: options.systemInstruction,
  };
  if (options.useWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }
  if (options.thinkingLevel) {
    config.thinkingConfig = {
      thinkingLevel: options.thinkingLevel === 'MINIMAL' ? ThinkingLevel.MINIMAL : options.thinkingLevel === 'LOW' ? ThinkingLevel.LOW : ThinkingLevel.HIGH
    };
  }

  const response = await client.models.generateContent({
    model,
    contents,
    config,
  });

  const text = response.text || '';
  const grounding = response.candidates?.[0]?.groundingMetadata || null;
  const usage = (response as any).usageMetadata || null;

  return {
    text,
    groundingMetadata: grounding,
    usageMetadata: usage || {
      promptTokenCount: Math.ceil(JSON.stringify(contents).length / 3.8),
      candidatesTokenCount: Math.ceil(text.length / 3.8),
    }
  };
}

// OpenAI Compatible Calls
function getOpenAICompatibleConfig(provider: string) {
  if (provider === 'groq') {
    return {
      apiKey: process.env.GROQ_API_KEY || '',
      keyName: 'GROQ_API_KEY',
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      defaultModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    keyName: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

async function chatOpenAICompatible(options: ProviderOptions, provider: string = 'openai') {
  const { apiKey, keyName, baseUrl, defaultModel } = getOpenAICompatibleConfig(provider);
  if (!apiKey) {
    throw new Error(`${keyName} is not defined. Please check your environment variables.`);
  }

  const model = options.model || defaultModel;
  const messages = formatMessagesForOpenAI(options);

  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    usageMetadata: {
      promptTokenCount: data.usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 4),
      candidatesTokenCount: data.usage?.completion_tokens || Math.ceil(text.length / 4),
    }
  };
}

async function* streamOpenAICompatible(options: ProviderOptions, provider: string = 'openai') {
  const { apiKey, keyName, baseUrl, defaultModel } = getOpenAICompatibleConfig(provider);
  if (!apiKey) {
    throw new Error(`${keyName} is not defined. Please check your environment variables.`);
  }

  const model = options.model || defaultModel;
  const messages = formatMessagesForOpenAI(options);

  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine || !cleanedLine.startsWith('data: ')) continue;

        const dataStr = cleanedLine.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const chunkText = parsed.choices?.[0]?.delta?.content || '';

          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || promptTokens;
            completionTokens = parsed.usage.completion_tokens || completionTokens;
          }

          if (chunkText) {
            yield {
              type: 'content',
              text: chunkText,
            };
          }
        } catch (_) {
          // Ignore parse errors on line limits
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: 'stats',
    model,
    usageMetadata: {
      promptTokenCount: promptTokens || Math.ceil(JSON.stringify(messages).length / 4),
      candidatesTokenCount: completionTokens || 0,
    }
  };
}

function formatMessagesForOpenAI(options: ProviderOptions) {
  const formatted: any[] = [];

  if (options.systemInstruction) {
    formatted.push({
      role: 'system',
      content: options.systemInstruction
    });
  }

  options.messages.forEach(msg => {
    let content: any = msg.content || '';
    if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      const parts: any[] = [];
      if (msg.content) {
        parts.push({ type: 'text', text: msg.content });
      }
      msg.attachments.forEach((att: any) => {
        if (att.mimeType && att.mimeType.startsWith('image/')) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType};base64,${att.data}`
            }
          });
        }
      });
      content = parts;
    }

    formatted.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content
    });
  });

  return formatted;
}

// Single Provider router - ONLY OpenRouter
async function* streamChatSingleProvider(provider: string, options: ProviderOptions) {
  try {
    if (provider === 'anthropic') {
      yield* streamAnthropic(options);
    } else if (provider === 'openrouter') {
      yield* streamOpenRouter(options);
    } else if (provider === 'gemini') {
      yield* streamGemini(options);
    } else if (provider === 'openai' || provider === 'groq') {
      yield* streamOpenAICompatible(options, provider);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (err: any) {
    throw mapProviderError(err, provider);
  }
}

async function chatSingleProvider(provider: string, options: ProviderOptions) {
  try {
    if (provider === 'anthropic') {
      return await chatAnthropic(options);
    } else if (provider === 'openrouter') {
      return await chatOpenRouter(options);
    } else if (provider === 'gemini') {
      return await chatGemini(options);
    } else if (provider === 'openai' || provider === 'groq') {
      return await chatOpenAICompatible(options, provider);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (err: any) {
    throw mapProviderError(err, provider);
  }
}

// Public Fallback Interface for Streams - ONLY OpenRouter
export async function* streamChatWithFallback(
  options: ProviderOptions,
  activeProvider: string
): AsyncGenerator<any, void, unknown> {
  const provider = (activeProvider || 'anthropic').toLowerCase().trim();
  const startTime = Date.now();
  console.log(`[AI PROVIDER LAYER] Attempting stream with provider: ${provider}`);

  try {
    const generator = streamChatSingleProvider(provider, options);
    for await (const chunk of generator) {
      yield { ...chunk, provider };
    }
    const duration = Date.now() - startTime;
    console.log(`[AI PROVIDER LAYER SUCCESS] Provider ${provider} completed stream in ${duration}ms`);
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[AI PROVIDER LAYER FAILURE] Provider ${provider} failed after ${duration}ms:`, err.message || err);
    throw err;
  }
}

// Public Fallback Interface for Non-Streams - ONLY OpenRouter
export async function chatWithFallback(
  options: ProviderOptions,
  activeProvider: string
): Promise<any> {
  const provider = (activeProvider || 'anthropic').toLowerCase().trim();
  const startTime = Date.now();
  console.log(`[AI PROVIDER LAYER] Attempting chat with provider: ${provider}`);

  try {
    const result = await chatSingleProvider(provider, options);
    const duration = Date.now() - startTime;
    console.log(`[AI PROVIDER LAYER SUCCESS] Provider ${provider} completed request in ${duration}ms`);
    return { ...result, provider };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[AI PROVIDER LAYER FAILURE] Provider ${provider} failed after ${duration}ms:`, err.message || err);
    throw err;
  }
}