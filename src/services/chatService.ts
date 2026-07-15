// Chat Service - Handles all API communication
import { API_ENDPOINTS, API_CONFIG } from '../config/api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: any[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  systemInstruction?: string;
  stream?: boolean;
  useWebSearch?: boolean;
  thinkingLevel?: string;
}

export interface ChatResponse {
  text: string;
  groundingMetadata?: any;
  stats?: {
    serverOverhead: number;
    geminiTtft: number;
    geminiGenerationTime: number;
    serverTotalTime: number;
    model: string;
    usageMetadata: {
      promptTokenCount: number;
      candidatesTokenCount: number;
    };
  };
}

export class ChatServiceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

/**
 * Send a chat message and get a response
 * Supports both streaming and non-streaming modes
 */
export async function* streamChat(request: ChatRequest): AsyncGenerator<string, void, unknown> {
  try {
    const response = await fetch(API_ENDPOINTS.CHAT, {
      method: 'POST',
      headers: API_CONFIG.HEADERS,
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ChatServiceError(
        `HTTP_${response.status}`,
        error.error || `Chat API error: ${response.status}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ChatServiceError('NO_READER', 'Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') {
              return;
            }
            if (data) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  yield parsed.text;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof ChatServiceError) {
      throw error;
    }
    throw new ChatServiceError(
      'NETWORK_ERROR',
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Send a chat message and get the full response
 */
export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.CHAT, {
      method: 'POST',
      headers: API_CONFIG.HEADERS,
      body: JSON.stringify({
        ...request,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ChatServiceError(
        `HTTP_${response.status}`,
        error.error || `Chat API error: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ChatServiceError) {
      throw error;
    }
    throw new ChatServiceError(
      'NETWORK_ERROR',
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
