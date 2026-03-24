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
			baseUrl: config?.baseUrl || 'http://localhost:8000',
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

	async sendMessage(message: string): Promise<any> {
		try {
			return await this._post('/api/cognitive/classify', { message });
		} catch (error) {
			throw error;
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
