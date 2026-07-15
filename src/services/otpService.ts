// OTP Service - Handles SMS OTP verification
import { API_ENDPOINTS, API_CONFIG } from '../config/api';

export interface OTPResponse {
  success: boolean;
  message: string;
  warning?: string;
}

export class OTPServiceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'OTPServiceError';
  }
}

/**
 * Send OTP to phone number
 */
export async function sendOTP(phoneNumber: string): Promise<OTPResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.OTP_SEND, {
      method: 'POST',
      headers: API_CONFIG.HEADERS,
      body: JSON.stringify({ phoneNumber }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new OTPServiceError(
        `HTTP_${response.status}`,
        data.error || `Failed to send OTP: ${response.status}`
      );
    }

    return data;
  } catch (error) {
    if (error instanceof OTPServiceError) {
      throw error;
    }
    throw new OTPServiceError(
      'NETWORK_ERROR',
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Verify OTP code
 */
export async function verifyOTP(phoneNumber: string, code: string): Promise<OTPResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.OTP_VERIFY, {
      method: 'POST',
      headers: API_CONFIG.HEADERS,
      body: JSON.stringify({ phoneNumber, code }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new OTPServiceError(
        `HTTP_${response.status}`,
        data.error || `Failed to verify OTP: ${response.status}`
      );
    }

    return data;
  } catch (error) {
    if (error instanceof OTPServiceError) {
      throw error;
    }
    throw new OTPServiceError(
      'NETWORK_ERROR',
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
