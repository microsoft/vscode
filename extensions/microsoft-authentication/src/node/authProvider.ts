/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccountInfo, AuthenticationResult, ServerError } from '@azure/msal-node';
import { AuthenticationGetSessionOptions, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, AuthenticationSessionAccountInformation, CancellationError, env, EventEmitter, ExtensionContext, l10n, LogOutputChannel, Memento, SecretStorage, Uri, window } from 'vscode';
import { Environment } from '@azure/ms-rest-azure-env';
import { CachedPublicClientApplicationManager } from './publicClientCache';
import { UriHandlerLoopbackClient } from '../common/loopbackClientAndOpener';
import { UriEventHandler } from '../UriEventHandler';
import { ICachedPublicClientApplication } from '../common/publicClientCache';
import { MicrosoftAccountType, MicrosoftAuthenticationTelemetryReporter } from '../common/telemetryReporter';
import { loopbackTemplate } from './loopbackTemplate';
import { Delayer } from '../common/async';

const redirectUri = 'https://vscode.dev/redirect';
const DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const DEFAULT_TENANT = 'organizations';
const MSA_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const MSA_PASSTHRU_TID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';

export class MsalAuthProvider implements AuthenticationProvider {

	private readonly _disposables: { dispose(): void }[];
	private readonly _publicClientManager: CachedPublicClientApplicationManager;
	private readonly _refreshDelayer = new DelayerByKey<void>();

	/**
	 * Event to signal a change in authentication sessions for this provider.
	 */
	private readonly _onDidChangeSessionsEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();

	/**
	 * Event to signal a change in authentication sessions for this provider.
	 *
	 * NOTE: This event is handled differently in the Microsoft auth provider than "typical" auth providers. Normally,
	 * this event would fire when the provider's sessions change... which are tied to a specific list of scopes. However,
	 * since Microsoft identity doesn't care too much about scopes (you can mint a new token from an existing token),
	 * we just fire this event whenever the account list changes... so essentially there is one session per account.
	 *
	 * This is not quite how the API should be used... but this event really is just for signaling that the account list
	 * has changed.
	 */
	onDidChangeSessions = this._onDidChangeSessionsEmitter.event;

	constructor(
		context: ExtensionContext,
		private readonly _telemetryReporter: MicrosoftAuthenticationTelemetryReporter,
		private readonly _logger: LogOutputChannel,
		private readonly _uriHandler: UriEventHandler,
		private readonly _env: Environment = Environment.AzureCloud
	) {
		this._disposables = context.subscriptions;
		this._publicClientManager = new CachedPublicClientApplicationManager(
			context.globalState,
			context.secrets,
			this._logger,
			(e) => this._handleAccountChange(e)
		);
		this._disposables.push(this._publicClientManager);
		this._disposables.push(this._onDidChangeSessionsEmitter);

	}

	async initialize(): Promise<void> {
		await this._publicClientManager.initialize();

		// Send telemetry for existing accounts
		for (const cachedPca of this._publicClientManager.getAll()) {
			for (const account of cachedPca.accounts) {
				if (!account.idTokenClaims?.tid) {
					continue;
				}
				const tid = account.idTokenClaims.tid;
				const type = tid === MSA_TID || tid === MSA_PASSTHRU_TID ? MicrosoftAccountType.MSA : MicrosoftAccountType.AAD;
				this._telemetryReporter.sendAccountEvent([], type);
			}
		}
	}

	/**
	 * See {@link onDidChangeSessions} for more information on how this is used.
	 * @param param0 Event that contains the added and removed accounts
	 */
	private _handleAccountChange({ added, deleted }: { added: AccountInfo[]; deleted: AccountInfo[] }) {
		const process = (a: AccountInfo) => ({
			// This shouldn't be needed
			accessToken: '1234',
			id: a.homeAccountId,
			scopes: [],
			account: {
				id: a.homeAccountId,
				label: a.username
			},
			idToken: a.idToken,
		});
		this._onDidChangeSessionsEmitter.fire({ added: added.map(process), changed: [], removed: deleted.map(process) });
	}

	async getSessions(scopes: string[] | undefined, options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession[]> {
		this._logger.info('[getSessions]', scopes ?? 'all', 'starting');
		const modifiedScopes = scopes ? [...scopes] : [];
		const clientId = this.getClientId(modifiedScopes);
		const tenant = this.getTenantId(modifiedScopes);
		this._addCommonScopes(modifiedScopes);
		if (!scopes) {
			const allSessions: AuthenticationSession[] = [];
			for (const cachedPca of this._publicClientManager.getAll()) {
				const sessions = await this.getAllSessionsForPca(cachedPca, modifiedScopes, modifiedScopes, options?.account);
				allSessions.push(...sessions);
			}
			return allSessions;
		}

		const cachedPca = await this.getOrCreatePublicClientApplication(clientId, tenant);
		const sessions = await this.getAllSessionsForPca(cachedPca, scopes, modifiedScopes.filter(s => !s.startsWith('VSCODE_'), options?.account));
		this._logger.info(`[getSessions] returned ${sessions.length} sessions`);
		return sessions;

	}

	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
		this._logger.info('[createSession]', scopes, 'starting');
		const modifiedScopes = scopes ? [...scopes] : [];
		const clientId = this.getClientId(modifiedScopes);
		const tenant = this.getTenantId(modifiedScopes);
		this._addCommonScopes(modifiedScopes);

		const cachedPca = await this.getOrCreatePublicClientApplication(clientId, tenant);
		let result: AuthenticationResult;
		try {
			result = await cachedPca.acquireTokenInteractive({
				openBrowser: async (url: string) => { await env.openExternal(Uri.parse(url)); },
				scopes: modifiedScopes,
				// The logic for rendering one or the other of these templates is in the
				// template itself, so we pass the same one for both.
				successTemplate: loopbackTemplate,
				errorTemplate: loopbackTemplate
			});
			this.setupRefresh(cachedPca, result, scopes);
		} catch (e) {
			if (e instanceof CancellationError) {
				const yes = l10n.t('Yes');
				const result = await window.showErrorMessage(
					l10n.t('Having trouble logging in?'),
					{
						modal: true,
						detail: l10n.t('Would you like to try a different way to sign in to your Microsoft account? ({0})', 'protocol handler')
					},
					yes
				);
				if (!result) {
					this._telemetryReporter.sendLoginFailedEvent();
					throw e;
				}
			}
			// This error comes from the backend and is likely not due to the user's machine
			// failing to open a port or something local that would require us to try the
			// URL handler loopback client.
			if (e instanceof ServerError) {
				this._telemetryReporter.sendLoginFailedEvent();
				throw e;
			}
			const loopbackClient = new UriHandlerLoopbackClient(this._uriHandler, redirectUri);
			try {
				result = await cachedPca.acquireTokenInteractive({
					openBrowser: (url: string) => loopbackClient.openBrowser(url),
					scopes: modifiedScopes,
					loopbackClient
				});
				this.setupRefresh(cachedPca, result, scopes);
			} catch (e) {
				this._telemetryReporter.sendLoginFailedEvent();
				throw e;
			}
		}

		const session = this.toAuthenticationSession(result, scopes);
		this._telemetryReporter.sendLoginEvent(session.scopes);
		this._logger.info('[createSession]', scopes, 'returned session');
		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		this._logger.info('[removeSession]', sessionId, 'starting');
		for (const cachedPca of this._publicClientManager.getAll()) {
			const accounts = cachedPca.accounts;
			for (const account of accounts) {
				if (account.homeAccountId === sessionId) {
					this._telemetryReporter.sendLogoutEvent();
					try {
						await cachedPca.removeAccount(account);
					} catch (e) {
						this._telemetryReporter.sendLogoutFailedEvent();
						throw e;
					}
					this._logger.info('[removeSession]', sessionId, 'removed session');
					return;
				}
			}
		}
		this._logger.info('[removeSession]', sessionId, 'session not found');
	}

	private async getOrCreatePublicClientApplication(clientId: string, tenant: string): Promise<ICachedPublicClientApplication> {
		const authority = new URL(tenant, this._env.activeDirectoryEndpointUrl).toString();
		return await this._publicClientManager.getOrCreate(clientId, authority);
	}

	private _addCommonScopes(scopes: string[]) {
		if (!scopes.includes('openid')) {
			scopes.push('openid');
		}
		if (!scopes.includes('email')) {
			scopes.push('email');
		}
		if (!scopes.includes('profile')) {
			scopes.push('profile');
		}
		if (!scopes.includes('offline_access')) {
			scopes.push('offline_access');
		}
		return scopes;
	}

	private async getAllSessionsForPca(
		cachedPca: ICachedPublicClientApplication,
		originalScopes: readonly string[],
		scopesToSend: string[],
		accountFilter?: AuthenticationSessionAccountInformation
	): Promise<AuthenticationSession[]> {
		const accounts = accountFilter
			? cachedPca.accounts.filter(a => a.homeAccountId === accountFilter.id)
			: cachedPca.accounts;
		const sessions: AuthenticationSession[] = [];
		for (const account of accounts) {
			const result = await cachedPca.acquireTokenSilent({ account, scopes: scopesToSend, redirectUri });
			this.setupRefresh(cachedPca, result, originalScopes);
			sessions.push(this.toAuthenticationSession(result, originalScopes));
		}
		return sessions;
	}

	private setupRefresh(cachedPca: ICachedPublicClientApplication, result: AuthenticationResult, originalScopes: readonly string[]) {
		const on = result.refreshOn || result.expiresOn;
		if (!result.account || !on) {
			return;
		}

		const account = result.account;
		const scopes = result.scopes;
		const timeToRefresh = on.getTime() - Date.now() - 5 * 60 * 1000; // 5 minutes before expiry
		const key = JSON.stringify({ accountId: account.homeAccountId, scopes });
		this._refreshDelayer.trigger(key, async () => {
			const result = await cachedPca.acquireTokenSilent({ account, scopes, redirectUri, forceRefresh: true });
			this._onDidChangeSessionsEmitter.fire({ added: [], changed: [this.toAuthenticationSession(result, originalScopes)], removed: [] });
		}, timeToRefresh > 0 ? timeToRefresh : 0);
	}

	//#region scope parsers

	private getClientId(scopes: string[]) {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_CLIENT_ID:')) {
				return current.split('VSCODE_CLIENT_ID:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_CLIENT_ID;
	}

	private getTenantId(scopes: string[]) {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_TENANT:')) {
				return current.split('VSCODE_TENANT:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_TENANT;
	}

	//#endregion

	private toAuthenticationSession(result: AuthenticationResult, scopes: readonly string[]): AuthenticationSession & { idToken: string } {
		return {
			accessToken: result.accessToken,
			idToken: result.idToken,
			id: result.account?.homeAccountId ?? result.uniqueId,
			account: {
				id: result.account?.homeAccountId ?? result.uniqueId,
				label: result.account?.username ?? 'Unknown',
			},
			scopes
		};
	}
}

class DelayerByKey<T> {
	private _delayers = new Map<string, Delayer<T>>();

	trigger(key: string, fn: () => Promise<T>, delay: number): Promise<T> {
		let delayer = this._delayers.get(key);
		if (!delayer) {
			delayer = new Delayer<T>(delay);
			this._delayers.set(key, delayer);
		}

		return delayer.trigger(fn, delay);
	}
}
