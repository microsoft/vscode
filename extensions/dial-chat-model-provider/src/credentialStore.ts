import * as vscode from 'vscode';
import { readDialConfig } from './config';
import { DialAuthHandler, type AuthResult } from './dialAuth';
import { dialLog } from './logger';
import { type Credential, type DialConfig, type Nullable } from './types';

/**
 * Reactive credential store.
 *
 * Holds the current {@link DialConfig} snapshot and a {@link DialAuthHandler}
 * keyed to it. Settings reloads produce a brand-new auth handler so that
 * shared config objects are never mutated mid-flight.
 *
 * Fires {@link onDidChange} whenever credentials are obtained or cleared.
 */
export class CredentialStore implements vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<Nullable<Credential>>();
	readonly onDidChange = this._onDidChange.event;

	private _current: Nullable<Credential>;
	private auth: DialAuthHandler;
	private config: DialConfig;
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext, initialConfig: DialConfig) {
		this.context = context;
		this.config = initialConfig;
		this.auth = new DialAuthHandler(context, this.config);
	}

	get current(): Nullable<Credential> {
		return this._current;
	}

	get currentConfig(): DialConfig {
		return this.config;
	}

	/** Interactive login — may show UI prompts. */
	async login(): Promise<Pick<AuthResult, 'newlyAuthenticated'>> {
		dialLog.info('CredentialStore.login started', `authMethod=${this.config.authMethod}`);
		await this.refreshConfig();
		try {
			const { token, newlyAuthenticated } = await this.auth.getAuthToken();
			this.set({ token, method: this.config.authMethod });
			dialLog.info('CredentialStore.login succeeded', `newlyAuthenticated=${newlyAuthenticated}`);
			return { newlyAuthenticated };
		} catch (error: unknown) {
			const detail = error instanceof Error ? error.message : String(error);
			dialLog.error('CredentialStore.login failed', detail);
			throw error instanceof Error ? error : new Error(detail);
		}
	}

	/** Attempt silent restore from the secrets store (no UI). */
	async trySilentRestore(): Promise<void> {
		await this.refreshConfig();
		if (!this.config.serverUrl) {
			return;
		}
		const token = await this.auth.getCachedToken();
		if (token) {
			this.set({ token, method: this.config.authMethod });
		}
	}

	/** Clear credentials and notify subscribers. */
	async logout(): Promise<void> {
		await this.auth.logout();
		this.set(undefined);
	}

	/** Remove auto-registered OIDC client from settings. */
	async clearOidcClient(): Promise<Nullable<string>> {
		await this.refreshConfig();
		const cleared = await this.auth.clearStoredOidcClient();
		await this.refreshConfig();
		return cleared;
	}

	async describeOidcClientSource(): Promise<string> {
		await this.refreshConfig();
		return this.auth.describeOidcClientSource();
	}

	/** Ensure credentials are valid (refresh OIDC token when needed). */
	async ensureValidToken(): Promise<string> {
		await this.refreshConfig();
		const token = await this.auth.getValidAccessToken();
		if (!token) {
			this.set(undefined);
			throw new Error('DIAL session expired — run "DIAL: Login" again');
		}
		if (this._current?.token !== token) {
			// Token rotated after refresh — update cache without refetching deployments.
			this._current = { token, method: this.config.authMethod };
		}
		return token;
	}

	/** Drop cached credentials when the access token is no longer valid. */
	async invalidateSession(): Promise<void> {
		await this.auth.invalidateSession();
		this.set(undefined);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	// ── Private ──────────────────────────────────────────────

	private set(cred: Nullable<Credential>): void {
		this._current = cred;
		this._onDidChange.fire(cred);
	}

	/** Re-read workspace settings; prompt for serverUrl if missing. */
	private async refreshConfig(): Promise<void> {
		let next = readDialConfig();

		if (!next.serverUrl) {
			const serverUrl = await this.promptForServerUrl();
			if (!serverUrl) {
				throw new Error('DIAL Server URL is required');
			}
			next = { ...next, serverUrl };
		}

		this.replaceConfig(next);
	}

	private replaceConfig(next: DialConfig): void {
		if (configsEqual(this.config, next)) {
			return;
		}
		this.config = next;
		this.auth = new DialAuthHandler(this.context, next);
	}

	private async promptForServerUrl(): Promise<Nullable<string>> {
		const cfg = vscode.workspace.getConfiguration('dial');
		const value = await vscode.window.showInputBox({
			prompt: 'Enter DIAL Server URL',
			placeHolder: 'https://dial.example.com',
			validateInput: (input) => {
				try {
					new URL(input);
					return null;
				} catch {
					return 'Invalid URL';
				}
			},
		});
		const trimmed = value?.trim();
		if (!trimmed) {
			return undefined;
		}
		await cfg.update('serverUrl', trimmed, vscode.ConfigurationTarget.Global);
		return trimmed;
	}
}

function configsEqual(a: DialConfig, b: DialConfig): boolean {
	return (
		a.serverUrl === b.serverUrl &&
		a.authMethod === b.authMethod &&
		a.oidcClientId === b.oidcClientId &&
		a.oidcScopes === b.oidcScopes &&
		a.oauthCallbackPort === b.oauthCallbackPort &&
		a.oauthBrowserProfile === b.oauthBrowserProfile
	);
}
