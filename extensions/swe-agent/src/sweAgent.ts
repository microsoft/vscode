/**
 * SWE Agent Client
 *
 * Client for communicating with Gateway-D3N and the SWE Agent backend.
 */

import axios, { AxiosInstance } from 'axios';

/**
 * Context for code operations
 */
export interface CodeContext {
    language?: string;
    filePath?: string;
    workspacePath?: string;
    selection?: string;
}

/**
 * Response from SWE Agent
 */
export interface SWEResponse {
    requestId: string;
    status: 'completed' | 'failed' | 'pending';
    result?: string;
    modelUsed?: string;
    pipelineUsed?: string[];
    exitLayer?: number;
    latencyMs: number;
    error?: string;
}

/**
 * Model information
 */
export interface ModelInfo {
    id: string;
    name: string;
    cluster: string;
    tier: number;
    status: 'online' | 'offline' | 'degraded';
    metrics?: {
        latencyP50Ms: number;
        exitRate: number;
        successRate: number;
    };
}

/**
 * Client for SWE Agent API
 */
export class SWEAgentClient {
    private client: AxiosInstance;
    private sessionId: string;

    constructor(endpoint: string) {
        this.client = axios.create({
            baseURL: endpoint,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.sessionId = this.generateSessionId();
    }

    /**
     * Generate code from prompt
     */
    async generate(prompt: string, context: CodeContext): Promise<string> {
        const response = await this.request('/swe/generate', {
            query: prompt,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Fix bugs in code
     */
    async fix(code: string, description: string, context: CodeContext): Promise<string> {
        const response = await this.request('/swe/fix', {
            query: description || 'Fix the bugs in this code',
            code,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Review code
     */
    async review(code: string, context: CodeContext): Promise<string> {
        const response = await this.request('/swe/review', {
            query: 'Review this code for issues and improvements',
            code,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Generate tests
     */
    async generateTests(code: string, context: CodeContext): Promise<string> {
        const response = await this.request('/swe/test', {
            query: 'Generate comprehensive tests for this code',
            code,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Explain code
     */
    async explain(code: string, context: CodeContext): Promise<string> {
        const response = await this.request('/swe/explain', {
            query: 'Explain what this code does',
            code,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Refactor code
     */
    async refactor(
        code: string,
        instruction: string,
        context: CodeContext
    ): Promise<string> {
        const response = await this.request('/swe/refactor', {
            query: instruction,
            code,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Generate documentation
     */
    async document(code: string, context: CodeContext): Promise<string> {
        const response = await this.request('/swe/document', {
            query: 'Generate documentation for this code',
            code,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Complete code (for inline suggestions)
     */
    async complete(prefix: string, context: CodeContext): Promise<string | null> {
        try {
            const response = await this.request('/swe/complete', {
                query: prefix,
                ...context,
            }, 5000); // Shorter timeout for inline completion

            return response.result || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Chat with SWE Agent
     */
    async chat(
        message: string,
        history: Array<{ role: string; content: string }>,
        context: CodeContext
    ): Promise<string> {
        const response = await this.request('/swe/chat', {
            query: message,
            history,
            ...context,
        });

        return response.result || '';
    }

    /**
     * Get available models
     */
    async getModels(): Promise<ModelInfo[]> {
        const response = await this.client.get('/swe/models');
        return response.data.models || [];
    }

    /**
     * Get model metrics
     */
    async getMetrics(): Promise<Record<string, any>> {
        const response = await this.client.get('/swe/metrics');
        return response.data;
    }

    /**
     * Submit feedback
     */
    async submitFeedback(
        requestId: string,
        accepted: boolean,
        feedback?: string
    ): Promise<void> {
        await this.client.post('/swe/feedback', {
            requestId,
            accepted,
            feedback,
            sessionId: this.sessionId,
        });
    }

    /**
     * Make API request
     */
    private async request(
        path: string,
        data: Record<string, any>,
        timeout?: number
    ): Promise<SWEResponse> {
        const response = await this.client.post(path, {
            ...data,
            sessionId: this.sessionId,
        }, {
            timeout: timeout || 60000,
        });

        return response.data;
    }

    /**
     * Generate session ID
     */
    private generateSessionId(): string {
        return 'swe-' + Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}



