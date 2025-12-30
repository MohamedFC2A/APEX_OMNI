/**
 * Health Monitor - Monitor system health
 */

export interface HealthMetrics {
  apiHealth: {
    status: "healthy" | "degraded" | "unhealthy";
    responseTime: number;
    errorRate: number;
    lastCheck: number;
  };
  memoryHealth: {
    status: "healthy" | "degraded" | "unhealthy";
    usage: number; // Percentage
    sessions: number;
    messages: number;
    lastCheck: number;
  };
  performanceHealth: {
    status: "healthy" | "degraded" | "unhealthy";
    averageResponseTime: number;
    requestCount: number;
    errorCount: number;
    lastCheck: number;
  };
}

class HealthMonitor {
  private metrics: HealthMetrics = {
    apiHealth: {
      status: "healthy",
      responseTime: 0,
      errorRate: 0,
      lastCheck: Date.now(),
    },
    memoryHealth: {
      status: "healthy",
      usage: 0,
      sessions: 0,
      messages: 0,
      lastCheck: Date.now(),
    },
    performanceHealth: {
      status: "healthy",
      averageResponseTime: 0,
      requestCount: 0,
      errorCount: 0,
      lastCheck: Date.now(),
    },
  };

  private responseTimes: number[] = [];
  private errors: number[] = [];
  private readonly MAX_HISTORY = 100;

  /**
   * Record API response time
   */
  recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    if (this.responseTimes.length > this.MAX_HISTORY) {
      this.responseTimes.shift();
    }

    this.updatePerformanceHealth();
  }

  /**
   * Record API error
   */
  recordError(): void {
    this.errors.push(Date.now());
    // Keep only recent errors (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.errors = this.errors.filter((t) => t > oneHourAgo);

    this.updatePerformanceHealth();
  }

  /**
   * Check API health
   */
  async checkAPIHealth(): Promise<void> {
    const startTime = Date.now();
    try {
      const response = await fetch("/api/nexus/meta", {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);

      if (!response.ok) {
        this.recordError();
        this.metrics.apiHealth.status = "degraded";
      } else {
        this.metrics.apiHealth.status = "healthy";
      }

      this.metrics.apiHealth.responseTime = responseTime;
    } catch (error) {
      // Error caught - log for debugging if needed
      console.error("[HealthMonitor] API health check failed:", error);
      this.recordError();
      this.metrics.apiHealth.status = "unhealthy";
      this.metrics.apiHealth.responseTime = Date.now() - startTime;
    }

    // Calculate error rate
    const recentErrors = this.errors.filter(
      (t) => t > Date.now() - 60 * 1000 // Last minute
    ).length;
    this.metrics.apiHealth.errorRate = recentErrors;
    this.metrics.apiHealth.lastCheck = Date.now();
  }

  /**
   * Check memory health
   */
  checkMemoryHealth(sessions: number, messages: number): void {
    try {
      if (typeof window === "undefined") return;

      // Estimate localStorage usage
      let totalSize = 0;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) {
          const value = window.localStorage.getItem(key);
          if (value) {
            totalSize += value.length;
          }
        }
      }

      // Assume 5MB limit (conservative estimate)
      const maxSize = 5 * 1024 * 1024;
      const usage = (totalSize / maxSize) * 100;

      this.metrics.memoryHealth.usage = usage;
      this.metrics.memoryHealth.sessions = sessions;
      this.metrics.memoryHealth.messages = messages;

      // Determine status
      if (usage > 90) {
        this.metrics.memoryHealth.status = "unhealthy";
      } else if (usage > 70) {
        this.metrics.memoryHealth.status = "degraded";
      } else {
        this.metrics.memoryHealth.status = "healthy";
      }

      this.metrics.memoryHealth.lastCheck = Date.now();
    } catch (error) {
      console.error("[HealthMonitor] Failed to check memory:", error);
      this.metrics.memoryHealth.status = "unhealthy";
    }
  }

  /**
   * Update performance health
   */
  private updatePerformanceHealth(): void {
    if (this.responseTimes.length === 0) return;

    const avgResponseTime =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;

    const errorRate =
      this.errors.length > 0
        ? (this.errors.filter((t) => t > Date.now() - 60 * 1000).length /
            this.responseTimes.length) *
          100
        : 0;

    this.metrics.performanceHealth.averageResponseTime = avgResponseTime;
    this.metrics.performanceHealth.requestCount = this.responseTimes.length;
    this.metrics.performanceHealth.errorCount = this.errors.length;

    // Determine status
    if (avgResponseTime > 10000 || errorRate > 10) {
      this.metrics.performanceHealth.status = "unhealthy";
    } else if (avgResponseTime > 5000 || errorRate > 5) {
      this.metrics.performanceHealth.status = "degraded";
    } else {
      this.metrics.performanceHealth.status = "healthy";
    }

    this.metrics.performanceHealth.lastCheck = Date.now();
  }

  /**
   * Get current health metrics
   */
  getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }

  /**
   * Get overall health status
   */
  getOverallHealth(): "healthy" | "degraded" | "unhealthy" {
    const statuses = [
      this.metrics.apiHealth.status,
      this.metrics.memoryHealth.status,
      this.metrics.performanceHealth.status,
    ];

    if (statuses.includes("unhealthy")) return "unhealthy";
    if (statuses.includes("degraded")) return "degraded";
    return "healthy";
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.responseTimes = [];
    this.errors = [];
    this.metrics = {
      apiHealth: {
        status: "healthy",
        responseTime: 0,
        errorRate: 0,
        lastCheck: Date.now(),
      },
      memoryHealth: {
        status: "healthy",
        usage: 0,
        sessions: 0,
        messages: 0,
        lastCheck: Date.now(),
      },
      performanceHealth: {
        status: "healthy",
        averageResponseTime: 0,
        requestCount: 0,
        errorCount: 0,
        lastCheck: Date.now(),
      },
    };
  }
}

// Singleton instance
export const healthMonitor = new HealthMonitor();

// Auto-check API health every 30 seconds
if (typeof window !== "undefined") {
  setInterval(() => {
    healthMonitor.checkAPIHealth().catch(console.error);
  }, 30000);
}

