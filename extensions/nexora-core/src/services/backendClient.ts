/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface BackendConfig {
	baseUrl: string;
	timeout: number;
}

import { createTransport } from './backend/transport';
import { createPlatformsApi } from './backend/platforms';
import { createMemoryApi } from './backend/memory';
import { createCognitiveApi } from './backend/cognitive';
import { createAuthApi } from './backend/auth';
import { createOrchestrateApi } from './backend/orchestrate';

export class BackendClient {
	private config: BackendConfig;
	private transport: ReturnType<typeof createTransport>;

	constructor(config?: Partial<BackendConfig>) {
		this.config = {
			// Use 127.0.0.1 so health checks succeed on Windows when localhost resolves to IPv6 first
			baseUrl: config?.baseUrl || 'http://127.0.0.1:8000',
			timeout: config?.timeout || 30000
		};

		this.transport = createTransport(this.config, (endpoint) => this._getMockResponse(endpoint));
	}

	async checkHealth(): Promise<boolean> {
		try {
			const response = await this.transport.get('/api/health');
			return response?.status === 'ok';
		} catch {
			return false;
		}
	}

	async getPlatforms(): Promise<any[]> {
		return createPlatformsApi(this.transport, () => this._getMockPlatforms()).getPlatforms();
	}

	async searchPlatforms(query: string): Promise<any[]> {
		return createPlatformsApi(this.transport, () => this._getMockPlatforms()).searchPlatforms(query);
	}

	/**
	 * Semantic search for platforms using natural language.
	 * Uses ChromaDB vector embeddings to find platforms by meaning.
	 * 
	 * @param query Natural language query (e.g., "I need to deploy my app")
	 * @param limit Maximum number of results (default: 5)
	 * @returns Array of matching platforms with relevance scores
	 */
	async semanticSearchPlatforms(query: string, limit: number = 5): Promise<any[]> {
		return createPlatformsApi(this.transport, () => this._getMockPlatforms()).semanticSearchPlatforms(query, limit);
	}

	/**
	 * Index a workspace into Memvid memory for context-aware processing.
	 * 
	 * @param workspacePath Absolute path to the workspace directory
	 * @returns Indexing result with workspace_id and statistics
	 */
	async indexWorkspace(workspacePath: string): Promise<any> {
		return createMemoryApi(this.transport).indexWorkspace(workspacePath);
	}

	/**
	 * Query workspace memory for relevant context.
	 * 
	 * @param workspaceId Workspace identifier from indexing
	 * @param query Natural language query
	 * @param limit Maximum number of results (default: 5)
	 * @returns Memory query results with relevant entries
	 */
	async queryMemory(workspaceId: string, query: string, limit: number = 5): Promise<any> {
		return createMemoryApi(this.transport).queryMemory(workspaceId, query, limit);
	}

	/**
	 * Get relevant context for a task from workspace memory.
	 * Used before intent classification for context-aware processing.
	 * 
	 * @param workspaceId Workspace identifier
	 * @param task Task description
	 * @returns Task context with relevant files and snippets
	 */
	async getTaskContext(workspaceId: string, task: string): Promise<any> {
		return createMemoryApi(this.transport).getTaskContext(workspaceId, task);
	}

	/**
	 * List all indexed workspaces.
	 * 
	 * @returns List of indexed workspace IDs
	 */
	async listIndexedWorkspaces(): Promise<any[]> {
		return createMemoryApi(this.transport).listIndexedWorkspaces();
	}

	async sendMessage(message: string): Promise<any> {
		// preserve behavior: throws on errors (transport.post throws)
		return createCognitiveApi(this.transport).sendMessage(message);
	}

	/**
	 * Classify user intent with optional workspace context.
	 * 
	 * @param userRequest Natural language user request
	 * @param workspacePath Optional workspace path for context
	 * @returns Classification result with intent, confidence, sub-intents, etc.
	 */
	async classifyIntent(userRequest: string, workspacePath?: string): Promise<any> {
		return createCognitiveApi(this.transport).classifyIntent(userRequest, workspacePath);
	}

	/**
	 * Decompose a user request into executable tasks with DAG.
	 * 
	 * @param userRequest Natural language request to decompose
	 * @param workspacePath Optional workspace path for context
	 * @returns Decomposition result with tasks, DAG, parallel groups, etc.
	 */
	async decomposeRequest(userRequest: string, workspacePath?: string): Promise<any> {
		return createCognitiveApi(this.transport).decomposeRequest(userRequest, workspacePath);
	}

	/**
	 * Get similar past orchestration decisions.
	 * 
	 * @param request User request to find similar decisions for
	 * @param limit Maximum number of results
	 * @returns List of similar past decisions
	 */
	async getSimilarDecisions(request: string, limit: number = 3): Promise<any[]> {
		return createCognitiveApi(this.transport).getSimilarDecisions(request, limit);
	}

	/**
	 * Get available connector types.
	 * 
	 * @returns List of available connector type names (openai, anthropic, rest, mcp)
	 */
	async getConnectorTypes(): Promise<string[]> {
		try {
			const response = await this.transport.get('/api/connectors/types');
			return response?.types || [];
		} catch {
			return ['openai', 'anthropic', 'rest', 'mcp'];
		}
	}

	/**
	 * Execute an operation on a connector.
	 * 
	 * @param connectorType Type of connector (openai, anthropic, rest, mcp)
	 * @param operation Operation to execute (generate, chat, etc.)
	 * @param params Parameters for the operation
	 * @param config Optional connector configuration
	 * @returns Execution result with data, usage, and timing
	 */
	async executeConnector(
		connectorType: string,
		operation: string,
		params: Record<string, any>,
		config: Record<string, any> = {}
	): Promise<any> {
		try {
			return await this.transport.post('/api/connectors/execute', {
				connector_type: connectorType,
				config,
				operation,
				params
			});
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Connector execution failed',
				data: null,
				duration_ms: 0,
				usage: { input_tokens: 0, output_tokens: 0, api_calls: 0, estimated_cost: 0 }
			};
		}
	}

	/**
	 * Get usage metrics for all active connectors.
	 * 
	 * @returns Usage metrics per connector and total aggregated usage
	 */
	async getConnectorUsage(): Promise<any> {
		try {
			const response = await this.transport.get('/api/connectors/usage');
			return response || { connectors: {}, total: { input_tokens: 0, output_tokens: 0, api_calls: 0, estimated_cost: 0 } };
		} catch {
			return { connectors: {}, total: { input_tokens: 0, output_tokens: 0, api_calls: 0, estimated_cost: 0 } };
		}
	}

	/**
	 * Check health of a specific connector.
	 * 
	 * @param connectorType Type of connector to check
	 * @param config Configuration for the connector
	 * @returns Health status
	 */
	async checkConnectorHealth(connectorType: string, config: Record<string, any> = {}): Promise<any> {
		try {
			return await this.transport.post(`/api/connectors/health/${connectorType}`, { config });
		} catch {
			return { healthy: false, status: 'FAILED_TO_CONNECT' };
		}
	}

	/**
	 * Get list of active connectors.
	 * 
	 * @returns List of active connector instances
	 */
	async getActiveConnectors(): Promise<any[]> {
		try {
			const response = await this.transport.get('/api/connectors/active');
			return response?.connectors || [];
		} catch {
			return [];
		}
	}

	/**
	 * Get OAuth authentication status for all providers.
	 * 
	 * @param userId User identifier
	 * @returns Status of GitHub and Vercel connections
	 */
	async getAuthStatus(userId: string = 'default'): Promise<{
		github_connected: boolean;
		vercel_connected: boolean;
	}> {
		return createAuthApi(this.transport).getAuthStatus(userId);
	}

	/**
	 * Get GitHub OAuth authorization URL.
	 * 
	 * @param userId User identifier
	 * @returns Authorization URL to redirect user to
	 */
	async getGitHubAuthUrl(userId: string = 'default'): Promise<{ authorization_url: string } | null> {
		return createAuthApi(this.transport).getGitHubAuthUrl(userId);
	}

	/**
	 * Get Vercel OAuth authorization URL.
	 * 
	 * @param userId User identifier
	 * @returns Authorization URL to redirect user to
	 */
	async getVercelAuthUrl(userId: string = 'default'): Promise<{ authorization_url: string } | null> {
		return createAuthApi(this.transport).getVercelAuthUrl(userId);
	}

	/**
	 * Disconnect GitHub for a user.
	 * 
	 * @param userId User identifier
	 * @returns Disconnection status
	 */
	async disconnectGitHub(userId: string = 'default'): Promise<{ status: string }> {
		return createAuthApi(this.transport).disconnectGitHub(userId);
	}

	/**
	 * Disconnect Vercel for a user.
	 * 
	 * @param userId User identifier
	 * @returns Disconnection status
	 */
	async disconnectVercel(userId: string = 'default'): Promise<{ status: string }> {
		return createAuthApi(this.transport).disconnectVercel(userId);
	}

	/**
	 * Execute full deployment pipeline: Generate → Push → Deploy
	 * 
	 * @param prompt What to generate
	 * @param repoName GitHub repository name
	 * @param projectName Vercel project name
	 * @param userId User identifier
	 * @returns Deployment result with steps and URL
	 */
	async deployGeneratedCode(
		prompt: string,
		repoName: string,
		projectName: string,
		userId: string = 'default'
	): Promise<{
		success: boolean;
		steps: Array<{ step: string; success: boolean; error?: string; data?: any }>;
		deployment_url?: string;
	}> {
		return createOrchestrateApi(this.transport).deployGeneratedCode(prompt, repoName, projectName, userId);
	}

	private _getMockResponse(endpoint: string): any {
		if (endpoint === '/api/health') {
			return { status: 'mock', message: 'Backend not connected' };
		}
		if (endpoint === '/api/platforms') {
			return { platforms: this._getMockPlatforms() };
		}
		return {};
	}

	private _getMockPlatforms(): any[] {
		return [
			{ id: 'openai', name: 'OpenAI GPT-4', category: 'LLM', status: 'available' },
			{ id: 'claude', name: 'Anthropic Claude', category: 'LLM', status: 'available' },
			{ id: 'v0-dev', name: 'v0.dev', category: 'UI Generation', status: 'available' },
			{ id: 'github', name: 'GitHub', category: 'Version Control', status: 'connected' },
			{ id: 'vercel', name: 'Vercel', category: 'Deployment', status: 'available' }
		];
	}
}

let instance: BackendClient | null = null;

export function getBackendClient(): BackendClient {
	if (!instance) {
		instance = new BackendClient();
	}
	return instance;
}
