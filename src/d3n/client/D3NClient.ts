/**
 * D3NClient - Production client for D3N inference gateway
 *
 * Handles all communication with D3N infrastructure including:
 * - Agent invocations
 * - Streaming responses
 * - Flash App execution
 * - BMU tier selection
 */

import { EventEmitter } from 'events';

export interface D3NConfig {
  endpoint: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface InvokeRequest {
  agentId: string;
  query: string;
  context?: Record<string, any>;
  tier?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface InvokeResponse {
  content: string;
  tierUsed: number;
  tokensUsed: number;
  latencyMs: number;
  codeBlocks: CodeBlock[];
  requestId: string;
  metadata: Record<string, any>;
}

export interface CodeBlock {
  language: string;
  filename?: string;
  code: string;
  startLine?: number;
  endLine?: number;
}

export interface StreamChunk {
  token: string;
  done: boolean;
  tierUsed?: number;
  tokensUsed?: number;
}

export interface FlashAppRequest {
  appId: string;
  input: Record<string, any>;
  context?: Record<string, any>;
}

export interface FlashAppResponse {
  output: any;
  confidence: number;
  latencyMs: number;
  cacheHit: boolean;
}

export class D3NClient extends EventEmitter {
  private config: D3NConfig;
  private sessionId: string;

  constructor(config: D3NConfig) {
    super();
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
    this.sessionId = this.generateSessionId();
  }

  /**
   * Invoke an agent with a query
   */
  async invoke(request: InvokeRequest): Promise<InvokeResponse> {
    const startTime = Date.now();

    const body = {
      agent_id: request.agentId,
      query: request.query,
      context: request.context || {},
      tier: request.tier,
      max_tokens: request.maxTokens || 4096,
      session_id: this.sessionId,
    };

    const response = await this.request('/v1/invoke', body);

    return {
      content: response.content,
      tierUsed: response.tier_used,
      tokensUsed: response.tokens_used,
      latencyMs: Date.now() - startTime,
      codeBlocks: this.extractCodeBlocks(response.content),
      requestId: response.request_id,
      metadata: response.metadata || {},
    };
  }

  /**
   * Stream a response from an agent
   */
  async *stream(request: InvokeRequest): AsyncGenerator<StreamChunk> {
    const body = {
      agent_id: request.agentId,
      query: request.query,
      context: request.context || {},
      tier: request.tier,
      max_tokens: request.maxTokens || 4096,
      session_id: this.sessionId,
      stream: true,
    };

    const response = await fetch(`${this.config.endpoint}/v1/invoke/stream`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new D3NError(`Stream request failed: ${response.status}`, response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new D3NError('No response body', 500);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            yield {
              token: data.token || '',
              done: data.done || false,
              tierUsed: data.tier_used,
              tokensUsed: data.tokens_used,
            };

            if (data.done) {
              return;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Execute a Flash App
   */
  async executeFlashApp(request: FlashAppRequest): Promise<FlashAppResponse> {
    const startTime = Date.now();

    const body = {
      app_id: request.appId,
      input: request.input,
      context: request.context || {},
      session_id: this.sessionId,
    };

    const response = await this.request('/v1/flash-app/execute', body);

    return {
      output: response.output,
      confidence: response.confidence,
      latencyMs: Date.now() - startTime,
      cacheHit: response.cache_hit,
    };
  }

  /**
   * Get optimal tier for a request
   */
  async getTierRecommendation(
    operation: string,
    query: string,
    context?: Record<string, any>
  ): Promise<{ tier: number; useFlashApp: boolean; flashAppId?: string }> {
    const body = {
      operation,
      query,
      context: context || {},
    };

    const response = await this.request('/v1/bmu/recommend', body);

    return {
      tier: response.tier,
      useFlashApp: response.use_flash_app,
      flashAppId: response.flash_app_id,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/health', null, 'GET');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Make HTTP request with retries
   */
  private async request(
    path: string,
    body: any,
    method: string = 'POST'
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries!; attempt++) {
      try {
        const response = await fetch(`${this.config.endpoint}${path}`, {
          method,
          headers: this.getHeaders(),
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.config.timeout!),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new D3NError(
            `Request failed: ${response.status} - ${errorBody}`,
            response.status
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof D3NError && error.status >= 400 && error.status < 500) {
          // Don't retry client errors
          throw error;
        }

        if (attempt < this.config.maxRetries! - 1) {
          await this.delay(this.config.retryDelay! * (attempt + 1));
        }
      }
    }

    throw lastError || new D3NError('Request failed after retries', 500);
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'X-Session-ID': this.sessionId,
      'X-Client-Version': '1.0.0',
    };
  }

  /**
   * Extract code blocks from response content
   */
  private extractCodeBlocks(content: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const pattern = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        filename: match[2],
        code: match[3].trim(),
      });
    }

    return blocks;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `logos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * D3N Error class
 */
export class D3NError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'D3NError';
    this.status = status;
  }
}

/**
 * Create D3N client singleton
 */
let clientInstance: D3NClient | null = null;

export function getD3NClient(): D3NClient {
  if (!clientInstance) {
    const endpoint = process.env.D3N_ENDPOINT || 'http://localhost:8080';
    const apiKey = process.env.D3N_API_KEY || '';

    clientInstance = new D3NClient({ endpoint, apiKey });
  }
  return clientInstance;
}

export function initializeD3NClient(config: D3NConfig): D3NClient {
  clientInstance = new D3NClient(config);
  return clientInstance;
}

export default D3NClient;


