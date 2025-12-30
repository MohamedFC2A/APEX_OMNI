/**
 * Error Handler - Detect and categorize errors
 */

export interface ErrorInfo {
  type: "api" | "state" | "memory" | "network" | "unknown";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  recoverable: boolean;
}

export class ChatError extends Error {
  constructor(
    public info: ErrorInfo,
    message?: string
  ) {
    super(message || info.message);
    this.name = "ChatError";
  }
}

/**
 * Detect API errors
 */
export function detectAPIError(error: unknown): ErrorInfo | null {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return {
        type: "network",
        severity: "high",
        message: error.message,
        timestamp: Date.now(),
        recoverable: true,
      };
    }

    // HTTP errors
    if (error.message.includes("HTTP") || error.message.includes("status")) {
      const statusMatch = error.message.match(/\d{3}/);
      const status = statusMatch ? parseInt(statusMatch[0]) : 500;
      
      return {
        type: "api",
        severity: status >= 500 ? "high" : status >= 400 ? "medium" : "low",
        message: error.message,
        timestamp: Date.now(),
        context: { status },
        recoverable: status >= 500 || status === 429, // Retry on server errors or rate limits
      };
    }

    // Timeout errors
    if (error.message.includes("timeout") || error.message.includes("abort")) {
      return {
        type: "api",
        severity: "medium",
        message: error.message,
        timestamp: Date.now(),
        recoverable: true,
      };
    }
  }

  return null;
}

/**
 * Detect state inconsistencies
 */
export function detectStateError(
  expected: unknown,
  actual: unknown,
  context?: string
): ErrorInfo | null {
  if (expected !== actual) {
    return {
      type: "state",
      severity: "medium",
      message: `State inconsistency detected${context ? ` in ${context}` : ""}`,
      timestamp: Date.now(),
      context: {
        expected: String(expected),
        actual: String(actual),
        context,
      },
      recoverable: true,
    };
  }
  return null;
}

/**
 * Detect memory corruption
 */
export function detectMemoryError(
  data: unknown,
  schema?: Record<string, unknown>
): ErrorInfo | null {
  if (!data) {
    return {
      type: "memory",
      severity: "high",
      message: "Memory data is null or undefined",
      timestamp: Date.now(),
      recoverable: false,
    };
  }

  if (typeof data !== "object") {
    return {
      type: "memory",
      severity: "medium",
      message: "Memory data is not an object",
      timestamp: Date.now(),
      recoverable: false,
    };
  }

  // Check schema if provided
  if (schema) {
    const dataObj = data as Record<string, unknown>;
    const missingKeys = Object.keys(schema).filter(
      (key) => !(key in dataObj)
    );
    
    if (missingKeys.length > 0) {
      return {
        type: "memory",
        severity: "medium",
        message: `Missing required keys: ${missingKeys.join(", ")}`,
        timestamp: Date.now(),
        context: { missingKeys },
        recoverable: true,
      };
    }
  }

  return null;
}

/**
 * Categorize error
 */
export function categorizeError(error: unknown): ErrorInfo {
  // Try API error detection
  const apiError = detectAPIError(error);
  if (apiError) return apiError;

  // Try memory error detection
  if (error instanceof Error) {
    if (error.message.includes("localStorage") || error.message.includes("storage")) {
      return {
        type: "memory",
        severity: "high",
        message: error.message,
        timestamp: Date.now(),
        recoverable: true,
      };
    }
  }

  // Default to unknown
  return {
    type: "unknown",
    severity: "medium",
    message: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
    recoverable: false,
  };
}

/**
 * Log error for monitoring
 */
export function logError(error: ErrorInfo): void {
  console.error(`[ErrorHandler] ${error.type.toUpperCase()}:`, {
    severity: error.severity,
    message: error.message,
    context: error.context,
    recoverable: error.recoverable,
    timestamp: new Date(error.timestamp).toISOString(),
  });
}

