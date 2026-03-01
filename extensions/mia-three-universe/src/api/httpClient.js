// src/api/httpClient.js — HTTP client for mia-code-server narrative API routes
// Shared by all mia extensions via the core extension's exported API.

const vscode = require('vscode');

const API_ROUTES = {
	analyze: '/api/narrative/analyze',
	charts: '/api/stc/charts',
	beats: '/api/narrative/beats',
	chat: '/api/agent/chat',
	decompose: '/api/pde/decompose',
	sessions: '/api/sessions',
	health: '/api/health',
	auth: '/api/auth/token',
};

class MiaHttpClientImpl {
	/**
	 * @param {string} serverUrl
	 * @param {import('vscode').ExtensionContext} context
	 */
	constructor(serverUrl, context) {
		this._serverUrl = serverUrl;
		this._context = context;
		this._token = null;
	}

	setServerUrl(url) {
		this._serverUrl = url;
		this._token = null; // Reset token on URL change
	}

	// ─── Authentication ─────────────────────────────────────────

	async _getToken() {
		if (this._token) return this._token;

		// Try secret storage first
		const stored = await this._context.secrets.get('mia.serverToken');
		if (stored) {
			this._token = stored;
			return this._token;
		}

		return null;
	}

	async _storeToken(token) {
		this._token = token;
		await this._context.secrets.store('mia.serverToken', token);
	}

	// ─── Request helpers ────────────────────────────────────────

	async _request(method, route, body) {
		if (!this._serverUrl) {
			throw new Error('No server URL configured. Set mia.serverUrl in settings.');
		}

		const url = `${this._serverUrl}${route}`;
		const headers = { 'Content-Type': 'application/json' };

		const token = await this._getToken();
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		const options = { method, headers };
		if (body) {
			options.body = JSON.stringify(body);
		}

		const response = await fetch(url, options);

		// Handle 401 — try token refresh
		if (response.status === 401 && token) {
			this._token = null;
			await this._context.secrets.delete('mia.serverToken');
			// Retry once without token
			delete headers['Authorization'];
			const retry = await fetch(url, options);
			if (!retry.ok) throw new Error(`HTTP ${retry.status}: ${retry.statusText}`);
			return retry.json();
		}

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response.json();
	}

	async _get(route) {
		return this._request('GET', route);
	}

	async _post(route, body) {
		return this._request('POST', route, body);
	}

	async _put(route, body) {
		return this._request('PUT', route, body);
	}

	// ─── Narrative Intelligence ─────────────────────────────────

	async analyzeThreeUniverse(fileUri, content) {
		const depth = vscode.workspace.getConfiguration('mia').get('analysisDepth', 'standard');
		return this._post(API_ROUTES.analyze, { fileUri, content, depth });
	}

	// ─── STC Charts ─────────────────────────────────────────────

	async getCharts() {
		return this._get(API_ROUTES.charts);
	}

	async createChart(chart) {
		return this._post(API_ROUTES.charts, chart);
	}

	async updateChart(id, updates) {
		return this._put(`${API_ROUTES.charts}/${id}`, updates);
	}

	// ─── Story Beats ────────────────────────────────────────────

	async createBeat(beat) {
		return this._post(API_ROUTES.beats, beat);
	}

	async getSessionBeats(sessionId) {
		return this._get(`${API_ROUTES.beats}?session=${encodeURIComponent(sessionId)}`);
	}

	// ─── Agent Chat (SSE streaming) ─────────────────────────────

	async *sendChatMessage(message) {
		if (!this._serverUrl) {
			throw new Error('No server URL configured.');
		}

		const url = `${this._serverUrl}${API_ROUTES.chat}`;
		const headers = { 'Content-Type': 'application/json' };

		const token = await this._getToken();
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(message),
		});

		if (!response.ok) {
			throw new Error(`Chat HTTP ${response.status}: ${response.statusText}`);
		}

		// Parse SSE stream
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') {
						yield { content: '', universe: undefined, done: true };
						return;
					}
					try {
						yield JSON.parse(data);
					} catch {
						// Skip malformed data
					}
				}
			}
		}
	}

	// ─── PDE ────────────────────────────────────────────────────

	async decompose(prompt) {
		return this._post(API_ROUTES.decompose, { prompt });
	}

	// ─── Session ────────────────────────────────────────────────

	async getSession(id) {
		return this._get(`${API_ROUTES.sessions}/${id}`);
	}

	async createSession(intent) {
		return this._post(API_ROUTES.sessions, { intent });
	}

	// ─── Health ─────────────────────────────────────────────────

	async healthCheck() {
		return this._get(API_ROUTES.health);
	}
}

module.exports = { MiaHttpClientImpl, API_ROUTES };
