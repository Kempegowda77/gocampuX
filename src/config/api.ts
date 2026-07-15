// API Configuration
// This file centralizes all API endpoint configuration

const API_BASE_URL = typeof window !== 'undefined' 
  ? window.location.origin
  : process.env.BACKEND_URL || 'http://localhost:3000';

export const API_ENDPOINTS = {
  // Chat endpoints
  CHAT: `${API_BASE_URL}/api/chat`,
  
  // OTP endpoints
  OTP_SEND: `${API_BASE_URL}/api/otp/send`,
  OTP_VERIFY: `${API_BASE_URL}/api/otp/verify`,
  
  // Health check
  HEALTH: `${API_BASE_URL}/api/health`,
} as const;

export const API_CONFIG = {
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream, application/json',
  },
} as const;

export default API_ENDPOINTS;
