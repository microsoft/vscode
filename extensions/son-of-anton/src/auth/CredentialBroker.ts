/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';
import type { TokenRecord, ProviderStatus, ProviderConfig, SecretStore } from './types';

const STORAGE_KEY_PREFIX = 'son-of-anton.broker.token.';

/** Refresh proactively if fewer than 5 minutes remain before expiry. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type OpenExternalFn = (uri: string) => Thenable<boolean>;

export type DisconnectListener = (providerId: string) => void;

/**
 * Owns OAuth token lifecycle for all connected providers.
 *
 * Callers obtain an instance via the extension's activation and interact with
 * it through the RPC surface exposed by BrokerServer, or directly in tests.
 */
export class CredentialBroker {
	/** In-memory token cache — avoids repeated SecretStore round-trips. */
	private readonly cache = new Map<string, TokenRecord>();
	private readonly providerConfigs = new Map<string, ProviderConfig>();
	private readonly disconnectListeners: DisconnectListener[] = [];

	constructor(
		private readonly secrets: SecretStore,
		private readonly openExternal: OpenExternalFn,
	) {}

	registerProvider(config: ProviderConfig): void {
		this.providerConfigs.set(config.id, config);
	}

	onDidDisconnect(listener: DisconnectListener): void {
		this.disconnectListeners.push(listener);
	}

	/**
	 * Returns a valid token for the given provider.
	 * Loads from SecretStore on cache miss, refreshes if near expiry.
	 */
	async getToken(providerId: string): Promise<TokenRecord> {
		let record = this.cache.get(providerId);

		if (!record) {
			record = await this.loadFromStorage(providerId);
		}

		if (!record) {
			throw new Error(`No credentials stored for provider: ${providerId}`);
		}

		if (this.isNearExpiry(record)) {
			record = await this.performRefresh(providerId, record);
		}

		this.cache.set(providerId, record);
		return record;
	}

	/**
	 * Marks a provider's token as expired without removing the refresh token,
	 * so the next getToken call will trigger a refresh.
	 */
	async invalidate(providerId: string): Promise<void> {
		this.cache.delete(providerId);
		const stored = await this.loadFromStorage(providerId);
		if (stored) {
			const invalidated: TokenRecord = { ...stored, expiresAt: 0 };
			await this.saveToStorage(providerId, invalidated);
		}
	}

	/** Force an immediate token refresh. */
	async refresh(providerId: string): Promise<void> {
		const record = this.cache.get(providerId) ?? await this.loadFromStorage(providerId);
		if (!record) {
			throw new Error(`No credentials stored for provider: ${providerId}`);
		}
		const refreshed = await this.performRefresh(providerId, record);
		this.cache.set(providerId, refreshed);
	}

	/** Returns current status for all registered providers. */
	async status(): Promise<ProviderStatus[]> {
		const result: ProviderStatus[] = [];
		for (const [id, config] of this.providerConfigs) {
			const record = this.cache.get(id) ?? await this.loadFromStorage(id);
			result.push({
				id,
				displayName: config.displayName,
				connected: record !== undefined && record.expiresAt > Date.now(),
				expiresAt: record?.expiresAt,
			});
		}
		return result;
	}

	/**
	 * Initiates the PKCE OAuth flow for a provider, opens the browser, waits
	 * for the redirect callback, and persists the resulting tokens.
	 */
	async connect(providerId: string): Promise<void> {
		const config = this.providerConfigs.get(providerId);
		if (!config) {
			throw new Error(`Unknown provider: ${providerId}`);
		}

		const tokens = await this.runPkceFlow(config);
		this.cache.set(providerId, tokens);
		await this.saveToStorage(providerId, tokens);
	}

	/** Removes all stored credentials for a provider. */
	async disconnect(providerId: string): Promise<void> {
		this.cache.delete(providerId);
		await this.secrets.delete(`${STORAGE_KEY_PREFIX}${providerId}`);
	}

	// ── Private helpers ──────────────────────────────────────────────────────

	private isNearExpiry(record: TokenRecord): boolean {
		return record.expiresAt - Date.now() < REFRESH_BUFFER_MS;
	}

	private async loadFromStorage(providerId: string): Promise<TokenRecord | undefined> {
		const raw = await this.secrets.get(`${STORAGE_KEY_PREFIX}${providerId}`);
		if (!raw) {
			return undefined;
		}
		try {
			return JSON.parse(raw) as TokenRecord;
		} catch {
			return undefined;
		}
	}

	private async saveToStorage(providerId: string, record: TokenRecord): Promise<void> {
		await this.secrets.store(`${STORAGE_KEY_PREFIX}${providerId}`, JSON.stringify(record));
	}

	private async performRefresh(providerId: string, record: TokenRecord): Promise<TokenRecord> {
		if (!record.refreshToken) {
			this.cache.delete(providerId);
			this.fireDisconnect(providerId);
			throw new Error(`No refresh token for provider: ${providerId}`);
		}

		const config = this.providerConfigs.get(providerId);
		if (!config) {
			throw new Error(`Unknown provider: ${providerId}`);
		}

		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: record.refreshToken,
			client_id: config.clientId,
		});

		const response = await fetch(config.tokenEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		});

		if (!response.ok) {
			this.cache.delete(providerId);
			await this.secrets.delete(`${STORAGE_KEY_PREFIX}${providerId}`);
			this.fireDisconnect(providerId);
			throw new Error(`Token refresh failed for ${providerId}: HTTP ${response.status}`);
		}

		const data = await response.json() as {
			access_token: string;
			refresh_token?: string;
			expires_in: number;
		};

		const refreshed: TokenRecord = {
			token: data.access_token,
			refreshToken: data.refresh_token ?? record.refreshToken,
			expiresAt: Date.now() + data.expires_in * 1000,
			headers: record.headers,
		};

		await this.saveToStorage(providerId, refreshed);
		return refreshed;
	}

	private async runPkceFlow(config: ProviderConfig): Promise<TokenRecord> {
		const codeVerifier = crypto.randomBytes(32).toString('base64url');
		const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
		const state = crypto.randomBytes(16).toString('hex');

		const { port, server, codePromise } = await this.startRedirectListener(state);
		const redirectUri = `http://127.0.0.1:${port}/callback`;

		const authUrl = new URL(config.authorizationEndpoint);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('client_id', config.clientId);
		authUrl.searchParams.set('redirect_uri', redirectUri);
		authUrl.searchParams.set('scope', config.scopes.join(' '));
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('code_challenge', codeChallenge);
		authUrl.searchParams.set('code_challenge_method', 'S256');

		await this.openExternal(authUrl.toString());

		let code: string;
		try {
			code = await codePromise;
		} finally {
			server.close();
		}

		const tokenBody = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: config.clientId,
			code_verifier: codeVerifier,
		});

		const response = await fetch(config.tokenEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: tokenBody.toString(),
		});

		if (!response.ok) {
			throw new Error(`Token exchange failed: HTTP ${response.status}`);
		}

		const data = await response.json() as {
			access_token: string;
			refresh_token?: string;
			expires_in: number;
		};

		return {
			token: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000,
		};
	}

	private startRedirectListener(expectedState: string): Promise<{
		port: number;
		server: http.Server;
		codePromise: Promise<string>;
	}> {
		return new Promise((resolveSetup, rejectSetup) => {
			let resolveCode!: (code: string) => void;
			let rejectCode!: (err: Error) => void;

			const codePromise = new Promise<string>((res, rej) => {
				resolveCode = res;
				rejectCode = rej;
			});

			const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
				const parsed = url.parse(req.url ?? '', true);
				const { code, state, error } = parsed.query;

				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end('<html><body><p>Authentication complete. You may close this tab.</p></body></html>');

				if (error) {
					rejectCode(new Error(`OAuth error: ${error}`));
					return;
				}
				if (state !== expectedState) {
					rejectCode(new Error('OAuth state mismatch — possible CSRF'));
					return;
				}
				if (typeof code !== 'string' || !code) {
					rejectCode(new Error('No authorization code in callback'));
					return;
				}
				resolveCode(code);
			});

			server.on('error', rejectSetup);
			server.listen(0, '127.0.0.1', () => {
				const addr = server.address() as { port: number };
				resolveSetup({ port: addr.port, server, codePromise });
			});
		});
	}

	private fireDisconnect(providerId: string): void {
		for (const listener of this.disconnectListeners) {
			try {
				listener(providerId);
			} catch {
				// listeners must not throw
			}
		}
	}
}
