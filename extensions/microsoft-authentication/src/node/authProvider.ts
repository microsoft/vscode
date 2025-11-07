/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccountInfo, AuthenticationResult, ClientAuthError, ClientAuthErrorCodes, ServerError, SilentFlowRequest } from '@azure/msal-node';
import { AuthenticationChallenge, AuthenticationConstraint, AuthenticationGetSessionOptions, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationProviderSessionOptions, AuthenticationSession, AuthenticationSessionAccountInformation, CancellationError, env, EventEmitter, ExtensionContext, ExtensionKind, l10n, LogOutputChannel, Uri, window } from 'vscode';
import { Environment } from '@azure/ms-rest-azure-env';
import { CachedPublicClientApplicationManager } from './publicClientCache';
import { UriEventHandler } from '../UriEventHandler';
import { ICachedPublicClientApplication, ICachedPublicClientApplicationManager } from '../common/publicClientCache';
import { MicrosoftAccountType, MicrosoftAuthenticationTelemetryReporter } from '../common/telemetryReporter';
import { ScopeData } from '../common/scopeData';
import { EventBufferer } from '../common/event';
import { BetterTokenStorage } from '../betterSecretStorage';
import { IStoredSession } from '../AADHelper';
import { ExtensionHost, getMsalFlows } from './flows';
import { base64Decode } from './buffer';
import { Config } from '../common/config';
import { isSupportedClient } from '../common/env';

const MSA_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const MSA_PASSTHRU_TID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';

export class MsalAuthProvider implements AuthenticationProvider {

	private readonly _disposables: { dispose(): void }[];
	private readonly _eventBufferer = new EventBufferer();

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

	private constructor(
		private readonly _context: ExtensionContext,
		private readonly _telemetryReporter: MicrosoftAuthenticationTelemetryReporter,
		private readonly _logger: LogOutputChannel,
		private readonly _uriHandler: UriEventHandler,
		private readonly _publicClientManager: ICachedPublicClientApplicationManager,
		private readonly _env: Environment = Environment.AzureCloud
	) {
		this._disposables = _context.subscriptions;
		const accountChangeEvent = this._eventBufferer.wrapEvent(
			this._publicClientManager.onDidAccountsChange,
			(last, newEvent) => {
				if (!last) {
					return newEvent;
				}
				const mergedEvent = {
					added: [...(last.added ?? []), ...(newEvent.added ?? [])],
					deleted: [...(last.deleted ?? []), ...(newEvent.deleted ?? [])],
					changed: [...(last.changed ?? []), ...(newEvent.changed ?? [])]
				};

				const dedupedEvent = {
					added: Array.from(new Map(mergedEvent.added.map(item => [item.username, item])).values()),
					deleted: Array.from(new Map(mergedEvent.deleted.map(item => [item.username, item])).values()),
					changed: Array.from(new Map(mergedEvent.changed.map(item => [item.username, item])).values())
				};

				return dedupedEvent;
			},
			{ added: new Array<AccountInfo>(), deleted: new Array<AccountInfo>(), changed: new Array<AccountInfo>() }
		)(e => this._handleAccountChange(e));
		this._disposables.push(
			this._onDidChangeSessionsEmitter,
			accountChangeEvent
		);
	}

	static async create(
		context: ExtensionContext,
		telemetryReporter: MicrosoftAuthenticationTelemetryReporter,
		logger: LogOutputChannel,
		uriHandler: UriEventHandler,
		env: Environment = Environment.AzureCloud
	): Promise<MsalAuthProvider> {
		const publicClientManager = await CachedPublicClientApplicationManager.create(context.secrets, logger, telemetryReporter, env);
		context.subscriptions.push(publicClientManager);
		const authProvider = new MsalAuthProvider(context, telemetryReporter, logger, uriHandler, publicClientManager, env);
		await authProvider.initialize();
		return authProvider;
	}

	/**
	 * Migrate sessions from the old secret storage to MSAL.
	 * TODO: MSAL Migration. Remove this when we remove the old flow.
	 */
	private async _migrateSessions() {
		const betterSecretStorage = new BetterTokenStorage<IStoredSession>('microsoft.login.keylist', this._context);
		const sessions = await betterSecretStorage.getAll(item => {
			item.endpoint ||= Environment.AzureCloud.activeDirectoryEndpointUrl;
			return item.endpoint === this._env.activeDirectoryEndpointUrl;
		});
		this._context.globalState.update('msalMigration', true);

		const clientTenantMap = new Map<string, { clientId: string; tenant: string; refreshTokens: string[] }>();

		for (const session of sessions) {
			const scopeData = new ScopeData(session.scope.split(' '));
			const key = `${scopeData.clientId}:${scopeData.tenant}`;
			if (!clientTenantMap.has(key)) {
				clientTenantMap.set(key, { clientId: scopeData.clientId, tenant: scopeData.tenant, refreshTokens: [] });
			}
			clientTenantMap.get(key)!.refreshTokens.push(session.refreshToken);
		}

		for (const { clientId, tenant, refreshTokens } of clientTenantMap.values()) {
			await this._publicClientManager.getOrCreate(clientId, { refreshTokensToMigrate: refreshTokens, tenant });
		}
	}

	private async initialize(): Promise<void> {
		if (!this._context.globalState.get('msalMigration', false)) {
			await this._migrateSessions();
		}

		// Send telemetry for existing accounts
		for (const cachedPca of this._publicClientManager.getAll()) {
			for (const account of cachedPca.accounts) {
				const tid = account.tenantId;
				const type = tid === MSA_TID || tid === MSA_PASSTHRU_TID ? MicrosoftAccountType.MSA : MicrosoftAccountType.AAD;
				this._telemetryReporter.sendAccountEvent([], type);
			}
		}
	}

	/**
	 * See {@link onDidChangeSessions} for more information on how this is used.
	 * @param param0 Event that contains the added and removed accounts
	 */
	private _handleAccountChange({ added, changed, deleted }: { added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }) {
		this._logger.debug(`[_handleAccountChange] added: ${added.length}, changed: ${changed.length}, deleted: ${deleted.length}`);
		this._onDidChangeSessionsEmitter.fire({
			added: added.map(this.sessionFromAccountInfo),
			changed: changed.map(this.sessionFromAccountInfo),
			removed: deleted.map(this.sessionFromAccountInfo)
		});
	}

	//#region AuthenticationProvider methods

	async getSessions(scopes: string[] | undefined, options: AuthenticationGetSessionOptions = {}): Promise<AuthenticationSession[]> {
		const askingForAll = scopes === undefined;
		const scopeData = new ScopeData(scopes, undefined, options?.authorizationServer);
		// Do NOT use `scopes` beyond this place in the code. Use `scopeData` instead.
		this._logger.info('[getSessions]', askingForAll ? '[all]' : `[${scopeData.scopeStr}]`, 'starting');

		// This branch only gets called by Core for sign out purposes and initial population of the account menu. Since we are
		// living in a world where a "session" from Core's perspective is an account, we return 1 session per account.
		// See the large comment on `onDidChangeSessions` for more information.
		if (askingForAll) {
			const allSessionsForAccounts = new Map<string, AuthenticationSession>();
			for (const cachedPca of this._publicClientManager.getAll()) {
				for (const account of cachedPca.accounts) {
					if (allSessionsForAccounts.has(account.homeAccountId)) {
						continue;
					}
					allSessionsForAccounts.set(account.homeAccountId, this.sessionFromAccountInfo(account));
				}
			}
			const allSessions = Array.from(allSessionsForAccounts.values());
			this._logger.info('[getSessions] [all]', `returned ${allSessions.length} session(s)`);
			return allSessions;
		}

		const cachedPca = await this._publicClientManager.getOrCreate(scopeData.clientId);
		const sessions = await this.getAllSessionsForPca(cachedPca, scopeData, options?.account);
		this._logger.info(`[getSessions] [${scopeData.scopeStr}] returned ${sessions.length} session(s)`);
		return sessions;

	}

	async createSession(scopes: readonly string[], options: AuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
		const scopeData = new ScopeData(scopes, undefined, options.authorizationServer);
		// Do NOT use `scopes` beyond this place in the code. Use `scopeData` instead.

		this._logger.info('[createSession]', `[${scopeData.scopeStr}]`, 'starting');
		const cachedPca = await this._publicClientManager.getOrCreate(scopeData.clientId);

		// Used for showing a friendlier message to the user when the explicitly cancel a flow.
		let userCancelled: boolean | undefined;
		const yes = l10n.t('Yes');
		const no = l10n.t('No');
		const promptToContinue = async (mode: string) => {
			if (userCancelled === undefined) {
				// We haven't had a failure yet so wait to prompt
				return;
			}
			const message = userCancelled
				? l10n.t('Having trouble logging in? Would you like to try a different way? ({0})', mode)
				: l10n.t('You have not yet finished authorizing this extension to use your Microsoft Account. Would you like to try a different way? ({0})', mode);
			const result = await window.showWarningMessage(message, yes, no);
			if (result !== yes) {
				throw new CancellationError();
			}
		};

		const isNodeEnvironment = typeof process !== 'undefined' && typeof process?.versions?.node === 'string';
		const callbackUri = await env.asExternalUri(Uri.parse(`${env.uriScheme}://vscode.microsoft-authentication`));
		const flows = getMsalFlows({
			extensionHost: isNodeEnvironment
				? this._context.extension.extensionKind === ExtensionKind.UI ? ExtensionHost.Local : ExtensionHost.Remote
				: ExtensionHost.WebWorker,
			supportedClient: isSupportedClient(callbackUri),
			isBrokerSupported: cachedPca.isBrokerAvailable
		});

		const authority = new URL(scopeData.tenant, this._env.activeDirectoryEndpointUrl).toString();
		let lastError: Error | undefined;
		for (const flow of flows) {
			if (flow !== flows[0]) {
				try {
					await promptToContinue(flow.label);
				} finally {
					this._telemetryReporter.sendLoginFailedEvent();
				}
			}
			try {
				const result = await flow.trigger({
					cachedPca,
					authority,
					scopes: scopeData.scopesToSend,
					loginHint: options.account?.label,
					windowHandle: window.nativeHandle ? Buffer.from(window.nativeHandle) : undefined,
					logger: this._logger,
					uriHandler: this._uriHandler,
					callbackUri
				});

				const session = this.sessionFromAuthenticationResult(result, scopeData.originalScopes);
				this._telemetryReporter.sendLoginEvent(session.scopes);
				this._logger.info('[createSession]', `[${scopeData.scopeStr}]`, 'returned session');
				return session;
			} catch (e) {
				lastError = e;
				if (e instanceof ServerError || (e as ClientAuthError)?.errorCode === ClientAuthErrorCodes.userCanceled) {
					this._telemetryReporter.sendLoginFailedEvent();
					throw e;
				}
				// Continue to next flow
				if (e instanceof CancellationError) {
					userCancelled = true;
				}
			}
		}

		this._telemetryReporter.sendLoginFailedEvent();
		throw lastError ?? new Error('No auth flow succeeded');
	}

	async removeSession(sessionId: string): Promise<void> {
		this._logger.info('[removeSession]', sessionId, 'starting');
		const promises = new Array<Promise<void>>();
		for (const cachedPca of this._publicClientManager.getAll()) {
			const accounts = cachedPca.accounts;
			for (const account of accounts) {
				if (account.homeAccountId === sessionId) {
					this._telemetryReporter.sendLogoutEvent();
					promises.push(cachedPca.removeAccount(account));
					this._logger.info(`[removeSession] [${sessionId}] [${cachedPca.clientId}] removing session...`);
				}
			}
		}
		if (!promises.length) {
			this._logger.info('[removeSession]', sessionId, 'session not found');
			return;
		}
		const results = await Promise.allSettled(promises);
		for (const result of results) {
			if (result.status === 'rejected') {
				this._telemetryReporter.sendLogoutFailedEvent();
				this._logger.error('[removeSession]', sessionId, 'error removing session', result.reason);
			}
		}

		this._logger.info('[removeSession]', sessionId, `attempted to remove ${promises.length} sessions`);
	}

	async getSessionsFromChallenges(constraint: AuthenticationConstraint, options: AuthenticationProviderSessionOptions): Promise<readonly AuthenticationSession[]> {
		this._logger.info('[getSessionsFromChallenges]', 'starting with', constraint.challenges.length, 'challenges');

		// Use scopes from challenges if provided, otherwise use fallback scopes
		const scopes = this.extractScopesFromChallenges(constraint.challenges) ?? constraint.fallbackScopes;
		if (!scopes || scopes.length === 0) {
			throw new Error('No scopes found in authentication challenges or fallback scopes');
		}
		const claims = this.extractClaimsFromChallenges(constraint.challenges);
		if (!claims) {
			throw new Error('No claims found in authentication challenges');
		}
		const scopeData = new ScopeData(scopes, claims, options?.authorizationServer);
		this._logger.info('[getSessionsFromChallenges]', `[${scopeData.scopeStr}]`, 'with claims:', scopeData.claims);

		const cachedPca = await this._publicClientManager.getOrCreate(scopeData.clientId);
		const sessions = await this.getAllSessionsForPca(cachedPca, scopeData, options?.account);

		this._logger.info('[getSessionsFromChallenges]', 'returning', sessions.length, 'sessions');
		return sessions;
	}

	async createSessionFromChallenges(constraint: AuthenticationConstraint, options: AuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
		this._logger.info('[createSessionFromChallenges]', 'starting with', constraint.challenges.length, 'challenges');

		// Use scopes from challenges if provided, otherwise use fallback scopes
		const scopes = this.extractScopesFromChallenges(constraint.challenges) ?? constraint.fallbackScopes;
		if (!scopes || scopes.length === 0) {
			throw new Error('No scopes found in authentication challenges or fallback scopes');
		}
		const claims = this.extractClaimsFromChallenges(constraint.challenges);

		// Use scopes if available, otherwise fall back to default scopes
		const effectiveScopes = scopes.length > 0 ? scopes : ['https://graph.microsoft.com/User.Read'];

		const scopeData = new ScopeData(effectiveScopes, claims, options.authorizationServer);
		this._logger.info('[createSessionFromChallenges]', `[${scopeData.scopeStr}]`, 'starting with claims:', claims);

		const cachedPca = await this._publicClientManager.getOrCreate(scopeData.clientId);

		// Used for showing a friendlier message to the user when the explicitly cancel a flow.
		let userCancelled: boolean | undefined;
		const yes = l10n.t('Yes');
		const no = l10n.t('No');
		const promptToContinue = async (mode: string) => {
			if (userCancelled === undefined) {
				// We haven't had a failure yet so wait to prompt
				return;
			}
			const message = userCancelled
				? l10n.t('Having trouble logging in? Would you like to try a different way? ({0})', mode)
				: l10n.t('You have not yet finished authorizing this extension to use your Microsoft Account. Would you like to try a different way? ({0})', mode);
			const result = await window.showWarningMessage(message, yes, no);
			if (result !== yes) {
				throw new CancellationError();
			}
		};

		const isNodeEnvironment = typeof process !== 'undefined' && typeof process?.versions?.node === 'string';
		const callbackUri = await env.asExternalUri(Uri.parse(`${env.uriScheme}://vscode.microsoft-authentication`));
		const flows = getMsalFlows({
			extensionHost: isNodeEnvironment
				? this._context.extension.extensionKind === ExtensionKind.UI ? ExtensionHost.Local : ExtensionHost.Remote
				: ExtensionHost.WebWorker,
			isBrokerSupported: cachedPca.isBrokerAvailable,
			supportedClient: isSupportedClient(callbackUri)
		});

		const authority = new URL(scopeData.tenant, this._env.activeDirectoryEndpointUrl).toString();
		let lastError: Error | undefined;
		for (const flow of flows) {
			if (flow !== flows[0]) {
				try {
					await promptToContinue(flow.label);
				} finally {
					this._telemetryReporter.sendLoginFailedEvent();
				}
			}
			try {
				// Create the authentication request with claims if provided
				const authRequest = {
					cachedPca,
					authority,
					scopes: scopeData.scopesToSend,
					loginHint: options.account?.label,
					windowHandle: window.nativeHandle ? Buffer.from(window.nativeHandle) : undefined,
					logger: this._logger,
					uriHandler: this._uriHandler,
					claims: scopeData.claims,
					callbackUri
				};

				const result = await flow.trigger(authRequest);

				const session = this.sessionFromAuthenticationResult(result, scopeData.originalScopes);
				this._telemetryReporter.sendLoginEvent(session.scopes);
				this._logger.info('[createSessionFromChallenges]', `[${scopeData.scopeStr}]`, 'returned session');
				return session;
			} catch (e) {
				lastError = e as Error;
				if (e instanceof ClientAuthError && e.errorCode === ClientAuthErrorCodes.userCanceled) {
					this._logger.info('[createSessionFromChallenges]', `[${scopeData.scopeStr}]`, 'user cancelled');
					userCancelled = true;
					continue;
				}
				this._logger.error('[createSessionFromChallenges]', `[${scopeData.scopeStr}]`, 'error', e);
				throw e;
			}
		}

		this._telemetryReporter.sendLoginFailedEvent();
		throw lastError ?? new Error('No auth flow succeeded');
	}

	private extractScopesFromChallenges(challenges: readonly AuthenticationChallenge[]): string[] | undefined {
		for (const challenge of challenges) {
			if (challenge.scheme.toLowerCase() === 'bearer' && challenge.params.scope) {
				return challenge.params.scope.split(' ');
			}
		}
		return undefined;
	}

	private extractClaimsFromChallenges(challenges: readonly AuthenticationChallenge[]): string | undefined {
		for (const challenge of challenges) {
			if (challenge.scheme.toLowerCase() === 'bearer' && challenge.params.claims) {
				try {
					return base64Decode(challenge.params.claims);
				} catch (e) {
					this._logger.warn('[extractClaimsFromChallenges]', 'failed to decode claims... checking if it is already JSON', e);
					try {
						JSON.parse(challenge.params.claims);
						return challenge.params.claims;
					} catch (e) {
						this._logger.error('[extractClaimsFromChallenges]', 'failed to parse claims as JSON... returning undefined', e);
					}
				}
			}
		}
		return undefined;
	}

	//#endregion

	private async getAllSessionsForPca(
		cachedPca: ICachedPublicClientApplication,
		scopeData: ScopeData,
		accountFilter?: AuthenticationSessionAccountInformation
	): Promise<AuthenticationSession[]> {
		let filteredAccounts = accountFilter
			? cachedPca.accounts.filter(a => a.homeAccountId === accountFilter.id)
			: cachedPca.accounts;

		// Group accounts by homeAccountId
		const accountGroups = new Map<string, AccountInfo[]>();
		for (const account of filteredAccounts) {
			const existing = accountGroups.get(account.homeAccountId) || [];
			existing.push(account);
			accountGroups.set(account.homeAccountId, existing);
		}

		// Filter to one account per homeAccountId
		filteredAccounts = Array.from(accountGroups.values()).map(accounts => {
			if (accounts.length === 1) {
				return accounts[0];
			}

			// If we have a specific tenant to target, prefer that one
			if (scopeData.tenantId) {
				const matchingTenant = accounts.find(a => a.tenantId === scopeData.tenantId);
				if (matchingTenant) {
					return matchingTenant;
				}
			}

			// Otherwise prefer the home tenant
			return accounts.find(a => a.tenantId === a.idTokenClaims?.tid) || accounts[0];
		});

		const authority = new URL(scopeData.tenant, this._env.activeDirectoryEndpointUrl).toString();
		const sessions: AuthenticationSession[] = [];
		return this._eventBufferer.bufferEventsAsync(async () => {
			for (const account of filteredAccounts) {
				try {
					let forceRefresh: true | undefined;
					if (scopeData.tenantId) {
						// If the tenants do not match, then we need to skip the cache
						// to get a new token for the new tenant
						if (account.tenantId !== scopeData.tenantId) {
							forceRefresh = true;
						}
					} else {
						// If we are requesting the home tenant and we don't yet have
						// a token for the home tenant, we need to skip the cache
						// to get a new token for the home tenant
						if (account.tenantId !== account.idTokenClaims?.tid) {
							forceRefresh = true;
						}
					}
					// When claims are present, force refresh to ensure we get a token that satisfies the claims
					let claims: string | undefined;
					if (scopeData.claims) {
						forceRefresh = true;
						claims = scopeData.claims;
					}
					let redirectUri: string | undefined;
					// If we have the broker available and are on macOS, we HAVE to include the redirect URI or MSAL will throw an error.
					// HOWEVER, if we are _not_ using the broker, we MUST NOT include the redirect URI or MSAL will throw an error.
					if (cachedPca.isBrokerAvailable && process.platform === 'darwin') {
						redirectUri = Config.macOSBrokerRedirectUri;
					}
					const result = await cachedPca.acquireTokenSilent({
						account,
						authority,
						scopes: scopeData.scopesToSend,
						claims,
						redirectUri,
						forceRefresh
					});
					sessions.push(this.sessionFromAuthenticationResult(result, scopeData.originalScopes));
				} catch (e) {
					// If we can't get a token silently, the account is probably in a bad state so we should skip it
					// MSAL will log this already, so we don't need to log it again
					this._telemetryReporter.sendTelemetryErrorEvent(e);
					this._logger.info(`[getAllSessionsForPca] [${scopeData.scopeStr}] [${account.username}] failed to acquire token silently, skipping account`, JSON.stringify(e));
					continue;
				}
			}
			return sessions;
		});
	}

	private sessionFromAuthenticationResult(result: AuthenticationResult, scopes: readonly string[]): AuthenticationSession & { idToken: string } {
		return {
			accessToken: result.accessToken,
			idToken: result.idToken,
			id: result.account?.homeAccountId ?? result.uniqueId,
			account: {
				id: result.account?.homeAccountId ?? result.uniqueId,
				label: result.account?.username.toLowerCase() ?? 'Unknown',
			},
			scopes
		};
	}

	private sessionFromAccountInfo(account: AccountInfo): AuthenticationSession {
		return {
			accessToken: '1234',
			id: account.homeAccountId,
			scopes: [],
			account: {
				id: account.homeAccountId,
				label: account.username.toLowerCase(),
			},
			idToken: account.idToken,
		};
	}
}
