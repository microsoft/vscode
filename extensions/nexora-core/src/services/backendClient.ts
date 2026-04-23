/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface BackendConfig {
	baseUrl: string;
	timeout: number;
}

export class BackendClient {
	private config: BackendConfig;

	constructor(config?: Partial<BackendConfig>) {
		this.config = {
			// Use 127.0.0.1 so health checks succeed on Windows when localhost resolves to IPv6 first
			baseUrl: config?.baseUrl || 'http://127.0.0.1:8000',
			timeout: config?.timeout || 30000
		};
	}

	async checkHealth(): Promise<boolean> {
		try {
			const response = await this._get('/api/health');
			return response?.status === 'ok';
		} catch {
			return false;
		}
	}

	async getPlatforms(): Promise<any[]> {
		try {
			const response = await this._get('/api/platforms');
			return response?.platforms || [];
		} catch {
			return this._getMockPlatforms();
		}
	}

	async searchPlatforms(query: string): Promise<any[]> {
		try {
			const response = await this._get(`/api/platforms/search?q=${encodeURIComponent(query)}`);
			return response?.results || [];
		} catch {
			return [];
		}
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
		try {
			const response = await this._get(
				`/api/platforms/semantic-search?q=${encodeURIComponent(query)}&limit=${limit}`
			);
			return response?.results || [];
		} catch {
			return [];
		}
	}

	/**
	 * Index a workspace into Memvid memory for context-aware processing.
	 * 
	 * @param workspacePath Absolute path to the workspace directory
	 * @returns Indexing result with workspace_id and statistics
	 */
	async indexWorkspace(workspacePath: string): Promise<any> {
		try {
			return await this._post('/api/memory/index', { workspace_path: workspacePath });
		} catch (error) {
			console.error('Failed to index workspace:', error);
			throw error;
		}
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
		try {
			const response = await this._get(
				`/api/memory/query?workspace_id=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}&limit=${limit}`
			);
			return response;
		} catch {
			return { entries: [], total: 0 };
		}
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
		try {
			const response = await this._get(
				`/api/memory/context?workspace_id=${encodeURIComponent(workspaceId)}&task=${encodeURIComponent(task)}`
			);
			return response;
		} catch {
			return { relevant_files: [], code_snippets: [], languages_involved: [], total_matches: 0 };
		}
	}

	/**
	 * List all indexed workspaces.
	 * 
	 * @returns List of indexed workspace IDs
	 */
	async listIndexedWorkspaces(): Promise<any[]> {
		try {
			const response = await this._get('/api/memory/workspaces');
			return response?.workspaces || [];
		} catch {
			return [];
		}
	}

	async sendMessage(message: string): Promise<any> {
		try {
			return await this._post('/api/cognitive/classify', { message });
		} catch (error) {
			throw error;
		}
	}

	/**
	 * Classify user intent with optional workspace context.
	 * 
	 * @param userRequest Natural language user request
	 * @param workspacePath Optional workspace path for context
	 * @returns Classification result with intent, confidence, sub-intents, etc.
	 */
	async classifyIntent(userRequest: string, workspacePath?: string): Promise<any> {
		try {
			const response = await this._post('/api/cognitive/classify', {
				user_request: userRequest,
				workspace_path: workspacePath
			});
			return response;
		} catch (error) {
			return {
				intent: 'UNKNOWN',
				confidence: 0,
				sub_intents: [],
				entities: {},
				complexity: 'MEDIUM',
				error: 'Classification failed'
			};
		}
	}

	/**
	 * Decompose a user request into executable tasks with DAG.
	 * 
	 * @param userRequest Natural language request to decompose
	 * @param workspacePath Optional workspace path for context
	 * @returns Decomposition result with tasks, DAG, parallel groups, etc.
	 */
	async decomposeRequest(userRequest: string, workspacePath?: string): Promise<any> {
		try {
			const response = await this._post('/api/cognitive/decompose', {
				user_request: userRequest,
				workspace_path: workspacePath
			});
			return response;
		} catch (error) {
			return {
				tasks: [],
				dag: {},
				parallel_groups: [],
				execution_order: [],
				error: 'Decomposition failed'
			};
		}
	}

	/**
	 * Get similar past orchestration decisions.
	 * 
	 * @param request User request to find similar decisions for
	 * @param limit Maximum number of results
	 * @returns List of similar past decisions
	 */
	async getSimilarDecisions(request: string, limit: number = 3): Promise<any[]> {
		try {
			const response = await this._get(
				`/api/cognitive/similar-decisions?request=${encodeURIComponent(request)}&limit=${limit}`
			);
			return response || [];
		} catch {
			return [];
		}
	}

	private async _get(endpoint: string): Promise<any> {
		const url = `${this.config.baseUrl}${endpoint}`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return await response.json();
		} catch {
			return this._getMockResponse(endpoint);
		}
	}

	private async _post(endpoint: string, data: any): Promise<any> {
		const url = `${this.config.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return await response.json();
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
