// AI Provider Configuration

export const PROVIDERS = {
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
  OPENROUTER: 'openrouter',
  OPENAI: 'openai',
  GROQ: 'groq',
} as const;

export const PROVIDER_MODELS = {
  gemini: 'gemini-3.5-flash',
  anthropic: 'claude-opus-4-8',
  openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
} as const;

export const DEFAULT_PROVIDER = 'gemini';
