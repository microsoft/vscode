/**
 * SecretStorage facade for all DIAL credentials.
 *
 * Everything that is a secret (API key, OIDC client secret, OIDC initial access
 * token, access/refresh tokens) lives in {@link vscode.SecretStorage}, which is
 * backed by the OS keychain (Windows Credential Manager / macOS Keychain /
 * libsecret). Public identifiers (`oidcClientId`, `serverUrl`, scopes, port,
 * profile mode) stay in workspace settings.
 *
 * Non-secret session state that we still want to persist (`tokenExpiry`) lives
 * in {@link vscode.ExtensionContext.globalState}.
 */

import type * as vscode from 'vscode';
import { type Nullable } from './types';

const KEY_API_KEY = 'dial.apiKey';
const KEY_OIDC_CLIENT_SECRET = 'dial.oidcClientSecret';
const KEY_OIDC_INITIAL_ACCESS_TOKEN = 'dial.oidcInitialAccessToken';
const KEY_ACCESS_TOKEN = 'dial.accessToken';
const KEY_REFRESH_TOKEN = 'dial.refreshToken';
const KEY_TOKEN_EXPIRY = 'dial.tokenExpiry';

/**
 * Subset of {@link vscode.ExtensionContext} we depend on — the auth flow is
 * happy with `secrets` + `globalState` only, which keeps unit tests cheap.
 */
export interface SecretsContext {
	readonly secrets: vscode.SecretStorage;
	readonly globalState: vscode.Memento;
}

export class DialSecrets {
	constructor(private readonly context: SecretsContext) {}

	// ── User-configurable secrets ─────────────────────────────────────

	async getApiKey(): Promise<Nullable<string>> {
		return this.context.secrets.get(KEY_API_KEY);
	}

	async setApiKey(value: string): Promise<void> {
		await this.context.secrets.store(KEY_API_KEY, value);
	}

	async deleteApiKey(): Promise<void> {
		await this.context.secrets.delete(KEY_API_KEY);
	}

	async getOidcClientSecret(): Promise<Nullable<string>> {
		return this.context.secrets.get(KEY_OIDC_CLIENT_SECRET);
	}

	async setOidcClientSecret(value: Nullable<string>): Promise<void> {
		if (value) {
			await this.context.secrets.store(KEY_OIDC_CLIENT_SECRET, value);
		} else {
			await this.context.secrets.delete(KEY_OIDC_CLIENT_SECRET);
		}
	}

	async getOidcInitialAccessToken(): Promise<Nullable<string>> {
		return this.context.secrets.get(KEY_OIDC_INITIAL_ACCESS_TOKEN);
	}

	async setOidcInitialAccessToken(value: Nullable<string>): Promise<void> {
		if (value) {
			await this.context.secrets.store(KEY_OIDC_INITIAL_ACCESS_TOKEN, value);
		} else {
			await this.context.secrets.delete(KEY_OIDC_INITIAL_ACCESS_TOKEN);
		}
	}

	// ── OAuth session secrets ─────────────────────────────────────────

	async getAccessToken(): Promise<Nullable<string>> {
		return this.context.secrets.get(KEY_ACCESS_TOKEN);
	}

	async getRefreshToken(): Promise<Nullable<string>> {
		return this.context.secrets.get(KEY_REFRESH_TOKEN);
	}

	async storeSession(
		accessToken: string,
		expiresInSeconds: number,
		refreshToken: Nullable<string>,
	): Promise<void> {
		await this.context.secrets.store(KEY_ACCESS_TOKEN, accessToken);
		await this.context.globalState.update(
			KEY_TOKEN_EXPIRY,
			Date.now() + expiresInSeconds * 1000,
		);
		if (refreshToken) {
			await this.context.secrets.store(KEY_REFRESH_TOKEN, refreshToken);
		}
	}

	async clearSession(): Promise<void> {
		await this.context.secrets.delete(KEY_ACCESS_TOKEN);
		await this.context.secrets.delete(KEY_REFRESH_TOKEN);
		await this.context.globalState.update(KEY_TOKEN_EXPIRY, undefined);
	}

	/** Token expiry is just a timestamp (not a secret) — kept in globalState. */
	getTokenExpiryMs(): Nullable<number> {
		const value = this.context.globalState.get<unknown>(KEY_TOKEN_EXPIRY);
		return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	}
}
