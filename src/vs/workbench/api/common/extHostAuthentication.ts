/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as nls from '../../../nls.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from './extHost.protocol.js';
import { Disposable, ProgressLocation } from './extHostTypes.js';
import { IExtensionDescription, ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from '../../services/authentication/common/authentication.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { fetchDynamicRegistration, getClaimsFromJWT, IAuthorizationJWTClaims, IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata, IAuthorizationTokenResponse, isAuthorizationTokenResponse } from '../../../base/common/oauth.js';
import { IExtHostWindow } from './extHostWindow.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { ILogger, ILoggerService } from '../../../platform/log/common/log.js';
import { autorun, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { stringHash } from '../../../base/common/hash.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { IExtHostUrlsService } from './extHostUrls.js';
import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { equals as arraysEqual } from '../../../base/common/arrays.js';
import { IExtHostProgress } from './extHostProgress.js';
import { IProgressStep } from '../../../platform/progress/common/progress.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { raceCancellationError } from '../../../base/common/async.js';

export interface IExtHostAuthentication extends ExtHostAuthentication { }
export const IExtHostAuthentication = createDecorator<IExtHostAuthentication>('IExtHostAuthentication');

interface ProviderWithMetadata {
	label: string;
	provider: vscode.AuthenticationProvider;
	disposable?: vscode.Disposable;
	options: vscode.AuthenticationProviderOptions;
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {

	declare _serviceBrand: undefined;

	protected readonly _dynamicAuthProviderCtor = DynamicAuthProvider;

	private _proxy: MainThreadAuthenticationShape;
	private _authenticationProviders: Map<string, ProviderWithMetadata> = new Map<string, ProviderWithMetadata>();

	private _onDidChangeSessions = new Emitter<vscode.AuthenticationSessionsChangeEvent & { extensionIdFilter?: string[] }>();
	private _getSessionTaskSingler = new TaskSingler<vscode.AuthenticationSession | undefined>();

	private _onDidDynamicAuthProviderTokensChange = new Emitter<{ authProviderId: string; clientId: string; tokens: IAuthorizationToken[] }>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService private readonly _initData: IExtHostInitDataService,
		@IExtHostWindow private readonly _extHostWindow: IExtHostWindow,
		@IExtHostUrlsService private readonly _extHostUrls: IExtHostUrlsService,
		@IExtHostProgress private readonly _extHostProgress: IExtHostProgress,
		@ILoggerService private readonly _extHostLoggerService: ILoggerService
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadAuthentication);
	}

	/**
	 * This sets up an event that will fire when the auth sessions change with a built-in filter for the extensionId
	 * if a session change only affects a specific extension.
	 * @param extensionId The extension that is interested in the event.
	 * @returns An event with a built-in filter for the extensionId
	 */
	getExtensionScopedSessionsEvent(extensionId: string): Event<vscode.AuthenticationSessionsChangeEvent> {
		const normalizedExtensionId = extensionId.toLowerCase();
		return Event.chain(this._onDidChangeSessions.event, ($) => $
			.filter(e => !e.extensionIdFilter || e.extensionIdFilter.includes(normalizedExtensionId))
			.map(e => ({ provider: e.provider }))
		);
	}

	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions & ({ createIfNone: true } | { forceNewSession: true } | { forceNewSession: vscode.AuthenticationForceNewSessionOptions })): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions & { forceNewSession: true }): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions & { forceNewSession: vscode.AuthenticationForceNewSessionOptions }): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions): Promise<vscode.AuthenticationSession | undefined>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions = {}): Promise<vscode.AuthenticationSession | undefined> {
		const extensionId = ExtensionIdentifier.toKey(requestingExtension.identifier);
		const sortedScopes = [...scopes].sort().join(' ');
		const keys: (keyof vscode.AuthenticationGetSessionOptions)[] = Object.keys(options) as (keyof vscode.AuthenticationGetSessionOptions)[];
		const optionsStr = keys.sort().map(key => `${key}:${!!options[key]}`).join(', ');
		return await this._getSessionTaskSingler.getOrCreate(`${extensionId} ${providerId} ${sortedScopes} ${optionsStr}`, async () => {
			await this._proxy.$ensureProvider(providerId);
			const extensionName = requestingExtension.displayName || requestingExtension.name;
			return this._proxy.$getSession(providerId, scopes, extensionId, extensionName, options);
		});
	}

	async getAccounts(providerId: string) {
		await this._proxy.$ensureProvider(providerId);
		return await this._proxy.$getAccounts(providerId);
	}

	async removeSession(providerId: string, sessionId: string): Promise<void> {
		const providerData = this._authenticationProviders.get(providerId);
		if (!providerData) {
			return this._proxy.$removeSession(providerId, sessionId);
		}

		return providerData.provider.removeSession(sessionId);
	}

	registerAuthenticationProvider(id: string, label: string, provider: vscode.AuthenticationProvider, options?: vscode.AuthenticationProviderOptions): vscode.Disposable {
		if (this._authenticationProviders.get(id)) {
			throw new Error(`An authentication provider with id '${id}' is already registered.`);
		}

		this._authenticationProviders.set(id, { label, provider, options: options ?? { supportsMultipleAccounts: false } });
		const listener = provider.onDidChangeSessions(e => this._proxy.$sendDidChangeSessions(id, e));
		this._proxy.$registerAuthenticationProvider(id, label, options?.supportsMultipleAccounts ?? false, options?.supportedAuthorizationServers);

		return new Disposable(() => {
			listener.dispose();
			this._authenticationProviders.delete(id);
			this._proxy.$unregisterAuthenticationProvider(id);
		});
	}

	async $createSession(providerId: string, scopes: string[], options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			options.authorizationServer = URI.revive(options.authorizationServer);
			return await providerData.provider.createSession(scopes, options);
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	async $removeSession(providerId: string, sessionId: string): Promise<void> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return await providerData.provider.removeSession(sessionId);
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	async $getSessions(providerId: string, scopes: ReadonlyArray<string> | undefined, options: vscode.AuthenticationProviderSessionOptions): Promise<ReadonlyArray<vscode.AuthenticationSession>> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			options.authorizationServer = URI.revive(options.authorizationServer);
			return await providerData.provider.getSessions(scopes, options);
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$onDidChangeAuthenticationSessions(id: string, label: string, extensionIdFilter?: string[]) {
		// Don't fire events for the internal auth providers
		if (!id.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
			this._onDidChangeSessions.fire({ provider: { id, label }, extensionIdFilter });
		}
		return Promise.resolve();
	}

	$onDidUnregisterAuthenticationProvider(id: string): Promise<void> {
		const providerData = this._authenticationProviders.get(id);
		if (providerData?.disposable) {
			providerData.disposable.dispose();
		}
		this._authenticationProviders.delete(id);
		return Promise.resolve();
	}

	async $registerDynamicAuthProvider(
		authorizationServerComponents: UriComponents,
		serverMetadata: IAuthorizationServerMetadata,
		resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined,
		clientId: string | undefined,
		initialTokens: IAuthorizationToken[] | undefined
	): Promise<string> {
		if (!clientId) {
			if (!serverMetadata.registration_endpoint) {
				throw new Error('Server does not support dynamic registration');
			}
			try {
				const registration = await fetchDynamicRegistration(serverMetadata.registration_endpoint, this._initData.environment.appName);
				clientId = registration.client_id;
			} catch (err) {
				throw new Error(`Dynamic registration failed: ${err.message}`);
			}
		}
		const provider = new this._dynamicAuthProviderCtor(
			this._extHostWindow,
			this._extHostUrls,
			this._initData,
			this._extHostProgress,
			this._extHostLoggerService,
			this._proxy,
			URI.revive(authorizationServerComponents),
			serverMetadata,
			resourceMetadata,
			clientId,
			this._onDidDynamicAuthProviderTokensChange,
			initialTokens || []
		);
		const disposable = provider.onDidChangeSessions(e => this._proxy.$sendDidChangeSessions(provider.id, e));
		this._authenticationProviders.set(
			provider.id,
			{
				label: provider.label,
				provider,
				disposable: Disposable.from(provider, disposable),
				options: { supportsMultipleAccounts: false }
			}
		);
		await this._proxy.$registerDynamicAuthenticationProvider(provider.id, provider.label, provider.authorizationServer, provider.clientId);
		return provider.id;
	}

	async $onDidChangeDynamicAuthProviderTokens(authProviderId: string, clientId: string, tokens: IAuthorizationToken[]): Promise<void> {
		this._onDidDynamicAuthProviderTokensChange.fire({ authProviderId, clientId, tokens });
	}
}

class TaskSingler<T> {
	private _inFlightPromises = new Map<string, Promise<T>>();
	getOrCreate(key: string, promiseFactory: () => Promise<T>) {
		const inFlight = this._inFlightPromises.get(key);
		if (inFlight) {
			return inFlight;
		}

		const promise = promiseFactory().finally(() => this._inFlightPromises.delete(key));
		this._inFlightPromises.set(key, promise);

		return promise;
	}
}

export class DynamicAuthProvider implements vscode.AuthenticationProvider {
	readonly id: string;
	readonly label: string;

	private _onDidChangeSessions = new Emitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _tokenStore: TokenStore;

	protected readonly _createFlows: Array<{
		label: string;
		handler: (scopes: string[], progress: vscode.Progress<{ message: string }>, token: vscode.CancellationToken) => Promise<IAuthorizationTokenResponse>;
	}>;

	protected readonly _logger: ILogger;
	private readonly _disposable: DisposableStore;

	constructor(
		@IExtHostWindow protected readonly _extHostWindow: IExtHostWindow,
		@IExtHostUrlsService private readonly _extHostUrls: IExtHostUrlsService,
		@IExtHostInitDataService private readonly _initData: IExtHostInitDataService,
		@IExtHostProgress private readonly _extHostProgress: IExtHostProgress,
		@ILoggerService loggerService: ILoggerService,
		protected readonly _proxy: MainThreadAuthenticationShape,
		readonly authorizationServer: URI,
		protected readonly _serverMetadata: IAuthorizationServerMetadata,
		protected readonly _resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined,
		readonly clientId: string,
		onDidDynamicAuthProviderTokensChange: Emitter<{ authProviderId: string; clientId: string; tokens: IAuthorizationToken[] }>,
		initialTokens: IAuthorizationToken[],
	) {
		const stringifiedServer = authorizationServer.toString(true);
		this.id = _resourceMetadata?.resource
			? stringifiedServer + ' ' + _resourceMetadata?.resource
			: stringifiedServer;
		this.label = _resourceMetadata?.resource_name ?? this.authorizationServer.authority;

		this._logger = loggerService.createLogger(stringifiedServer, { name: this.label });
		this._disposable = new DisposableStore();
		this._disposable.add(this._onDidChangeSessions);
		const scopedEvent = Event.chain(onDidDynamicAuthProviderTokensChange.event, $ => $
			.filter(e => e.authProviderId === this.id && e.clientId === clientId)
			.map(e => e.tokens)
		);
		this._tokenStore = this._disposable.add(new TokenStore(
			{
				onDidChange: scopedEvent,
				set: (tokens) => _proxy.$setSessionsForDynamicAuthProvider(stringifiedServer, this.clientId, tokens),
			},
			initialTokens,
			this._logger
		));
		this._disposable.add(this._tokenStore.onDidChangeSessions(e => this._onDidChangeSessions.fire(e)));
		// Will be extended later to support other flows
		this._createFlows = [{
			label: nls.localize('url handler', "URL Handler"),
			handler: (scopes, progress, token) => this._createWithUrlHandler(scopes, progress, token)
		}];
	}

	async getSessions(scopes: readonly string[] | undefined, _options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		this._logger.info(`Getting sessions for scopes: ${scopes?.join(' ') ?? 'all'}`);
		if (!scopes) {
			return this._tokenStore.sessions;
		}
		let sessions = this._tokenStore.sessions.filter(session => session.scopes.join(' ') === scopes.join(' '));
		this._logger.info(`Found ${sessions.length} sessions for scopes: ${scopes.join(' ')}`);
		if (sessions.length) {
			const newTokens: IAuthorizationToken[] = [];
			const removedTokens: IAuthorizationToken[] = [];
			const tokenMap = new Map<string, IAuthorizationToken>(this._tokenStore.tokens.map(token => [token.access_token, token]));
			for (const session of sessions) {
				const token = tokenMap.get(session.accessToken);
				if (token && token.expires_in) {
					const now = Date.now();
					const expiresInMS = token.expires_in * 1000;
					// Check if the token is about to expire in 5 minutes or if it is expired
					if (now > token.created_at + expiresInMS - (5 * 60 * 1000)) {
						this._logger.info(`Token for session ${session.id} is about to expire, refreshing...`);
						removedTokens.push(token);
						if (!token.refresh_token) {
							// No refresh token available, cannot refresh
							this._logger.warn(`No refresh token available for scopes ${session.scopes.join(' ')}. Throwing away token.`);
							continue;
						}
						try {
							const newToken = await this.exchangeRefreshTokenForToken(token.refresh_token);
							this._logger.info(`Successfully created a new token for scopes ${session.scopes.join(' ')}.`);
							newTokens.push(newToken);
						} catch (err) {
							this._logger.error(`Failed to refresh token: ${err}`);
						}

					}
				}
			}
			if (newTokens.length || removedTokens.length) {
				this._tokenStore.update({ added: newTokens, removed: removedTokens });
				// Since we updated the tokens, we need to re-filter the sessions
				// to get the latest state
				sessions = this._tokenStore.sessions.filter(session => session.scopes.join(' ') === scopes.join(' '));
			}
			this._logger.info(`Found ${sessions.length} sessions for scopes: ${scopes.join(' ')}`);
			return sessions;
		}
		return [];
	}

	async createSession(scopes: string[], _options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		this._logger.info(`Creating session for scopes: ${scopes.join(' ')}`);
		let token: IAuthorizationTokenResponse | undefined;
		for (let i = 0; i < this._createFlows.length; i++) {
			const { handler } = this._createFlows[i];
			try {
				token = await this._extHostProgress.withProgressFromSource(
					{ label: this.label, id: this.id },
					{
						location: ProgressLocation.Notification,
						title: nls.localize('authenticatingTo', "Authenticating to '{0}'", this.label),
						cancellable: true
					},
					(progress, token) => handler(scopes, progress, token));
				if (token) {
					break;
				}
			} catch (err) {
				const nextMode = this._createFlows[i + 1]?.label;
				if (!nextMode) {
					break; // No more flows to try
				}
				const message = isCancellationError(err)
					? nls.localize('userCanceledContinue', "Having trouble authenticating to '{0}'? Would you like to try a different way? ({1})", this.label, nextMode)
					: nls.localize('continueWith', "You have not yet finished authenticating to '{0}'. Would you like to try a different way? ({1})", this.label, nextMode);

				const result = await this._proxy.$showContinueNotification(message);
				if (!result) {
					throw new CancellationError();
				}
				this._logger.error(`Failed to create token via flow '${nextMode}': ${err}`);
			}
		}
		if (!token) {
			throw new Error('Failed to create authentication token');
		}

		// Store session for later retrieval
		this._tokenStore.update({ added: [{ ...token, created_at: Date.now() }], removed: [] });
		const session = this._tokenStore.sessions.find(t => t.accessToken === token.access_token)!;
		this._logger.info(`Created session for scopes: ${scopes.join(' ')}`);
		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		this._logger.info(`Removing session with id: ${sessionId}`);
		const session = this._tokenStore.sessions.find(session => session.id === sessionId);
		if (!session) {
			this._logger.error(`Session with id ${sessionId} not found`);
			return;
		}
		const token = this._tokenStore.tokens.find(token => token.access_token === session.accessToken);
		if (!token) {
			this._logger.error(`Failed to retrieve token for removed session: ${session.id}`);
			return;
		}
		this._tokenStore.update({ added: [], removed: [token] });
		this._logger.info(`Removed token for session: ${session.id} with scopes: ${session.scopes.join(' ')}`);
	}

	dispose(): void {
		this._disposable.dispose();
	}

	private async _createWithUrlHandler(scopes: string[], progress: vscode.Progress<IProgressStep>, token: vscode.CancellationToken): Promise<IAuthorizationTokenResponse> {
		// Generate PKCE code verifier (random string) and code challenge (SHA-256 hash of verifier)
		const codeVerifier = this.generateRandomString(64);
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);

		// Generate a random state value to prevent CSRF
		const nonce = this.generateRandomString(32);
		const callbackUri = URI.parse(`${this._initData.environment.appUriScheme}://dynamicauthprovider/${this.authorizationServer.authority}/authorize?nonce=${nonce}`);
		let state: URI;
		try {
			state = await this._extHostUrls.createAppUri(callbackUri);
		} catch (error) {
			throw new Error(`Failed to create external URI: ${error}`);
		}

		// Prepare the authorization request URL
		const authorizationUrl = new URL(this._serverMetadata.authorization_endpoint!);
		authorizationUrl.searchParams.append('client_id', this.clientId);
		authorizationUrl.searchParams.append('response_type', 'code');
		authorizationUrl.searchParams.append('state', state.toString());
		authorizationUrl.searchParams.append('code_challenge', codeChallenge);
		authorizationUrl.searchParams.append('code_challenge_method', 'S256');
		const scopeString = scopes.join(' ');
		if (scopeString) {
			// If non-empty scopes are provided, include scope parameter in the request
			authorizationUrl.searchParams.append('scope', scopeString);
		}
		if (this._resourceMetadata?.resource) {
			// If a resource is specified, include it in the request
			authorizationUrl.searchParams.append('resource', this._resourceMetadata.resource);
		}

		// Use a redirect URI that matches what was registered during dynamic registration
		const redirectUri = 'https://vscode.dev/redirect';
		authorizationUrl.searchParams.append('redirect_uri', redirectUri);

		const promise = this.waitForAuthorizationCode(callbackUri);

		// Open the browser for user authorization
		this._logger.info(`Opening authorization URL for scopes: ${scopeString}`);
		this._logger.trace(`Authorization URL: ${authorizationUrl.toString()}`);
		const opened = await this._extHostWindow.openUri(authorizationUrl.toString(), {});
		if (!opened) {
			throw new CancellationError();
		}
		progress.report({
			message: nls.localize('completeAuth', "Complete the authentication in the browser window that has opened."),
		});

		// Wait for the authorization code via a redirect
		let code: string | undefined;
		try {
			const response = await raceCancellationError(promise, token);
			code = response.code;
		} catch (err) {
			if (isCancellationError(err)) {
				this._logger.info('Authorization code request was cancelled by the user.');
				throw err;
			}
			this._logger.error(`Failed to receive authorization code: ${err}`);
			throw new Error(`Failed to receive authorization code: ${err}`);
		}
		this._logger.info(`Authorization code received for scopes: ${scopeString}`);

		// Exchange the authorization code for tokens
		const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier, redirectUri);
		return tokenResponse;
	}

	protected generateRandomString(length: number): string {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return Array.from(array)
			.map(b => b.toString(16).padStart(2, '0'))
			.join('')
			.substring(0, length);
	}

	protected async generateCodeChallenge(codeVerifier: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(codeVerifier);
		const digest = await crypto.subtle.digest('SHA-256', data);

		// Base64url encode the digest
		return encodeBase64(VSBuffer.wrap(new Uint8Array(digest)), false, false)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	private async waitForAuthorizationCode(expectedState: URI): Promise<{ code: string }> {
		const result = await this._proxy.$waitForUriHandler(expectedState);
		// Extract the code parameter directly from the query string. NOTE, URLSearchParams does not work here because
		// it will decode the query string and we need to keep it encoded.
		const codeMatch = /[?&]code=([^&]+)/.exec(result.query || '');
		if (!codeMatch || codeMatch.length < 2) {
			// No code parameter found in the query string
			throw new Error('Authentication failed: No authorization code received');
		}
		return { code: codeMatch[1] };
	}

	protected async exchangeCodeForToken(code: string, codeVerifier: string, redirectUri: string): Promise<IAuthorizationTokenResponse> {
		if (!this._serverMetadata.token_endpoint) {
			throw new Error('Token endpoint not available in server metadata');
		}

		const tokenRequest = new URLSearchParams();
		tokenRequest.append('client_id', this.clientId);
		tokenRequest.append('grant_type', 'authorization_code');
		tokenRequest.append('code', code);
		tokenRequest.append('redirect_uri', redirectUri);
		tokenRequest.append('code_verifier', codeVerifier);

		const response = await fetch(this._serverMetadata.token_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json'
			},
			body: tokenRequest.toString()
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${text}`);
		}

		const result = await response.json();
		if (isAuthorizationTokenResponse(result)) {
			return result;
		}
		throw new Error(`Invalid authorization token response: ${JSON.stringify(result)}`);
	}

	protected async exchangeRefreshTokenForToken(refreshToken: string): Promise<IAuthorizationToken> {
		if (!this._serverMetadata.token_endpoint) {
			throw new Error('Token endpoint not available in server metadata');
		}

		const tokenRequest = new URLSearchParams();
		tokenRequest.append('client_id', this.clientId);
		tokenRequest.append('grant_type', 'refresh_token');
		tokenRequest.append('refresh_token', refreshToken);

		const response = await fetch(this._serverMetadata.token_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json'
			},
			body: tokenRequest.toString()
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${text}`);
		}

		const result = await response.json();
		if (isAuthorizationTokenResponse(result)) {
			return {
				...result,
				created_at: Date.now(),
			};
		}
		throw new Error(`Invalid authorization token response: ${JSON.stringify(result)}`);
	}
}

type IAuthorizationToken = IAuthorizationTokenResponse & {
	/**
	 * The time when the token was created, in milliseconds since the epoch.
	 */
	created_at: number;
};

class TokenStore implements Disposable {
	private readonly _tokensObservable: ISettableObservable<IAuthorizationToken[]>;
	private readonly _sessionsObservable: IObservable<vscode.AuthenticationSession[]>;

	private readonly _onDidChangeSessions = new Emitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _disposable: DisposableStore;

	constructor(
		private readonly _persistence: { onDidChange: Event<IAuthorizationToken[]>; set: (tokens: IAuthorizationToken[]) => void },
		initialTokens: IAuthorizationToken[],
		private readonly _logger: ILogger
	) {
		this._disposable = new DisposableStore();
		this._tokensObservable = observableValue<IAuthorizationToken[]>('tokens', initialTokens);
		this._sessionsObservable = derivedOpts(
			{ equalsFn: (a, b) => arraysEqual(a, b, (a, b) => a.accessToken === b.accessToken) },
			(reader) => this._tokensObservable.read(reader).map(t => this._getSessionFromToken(t))
		);
		this._disposable.add(this._registerChangeEventAutorun());
		this._disposable.add(this._persistence.onDidChange((tokens) => this._tokensObservable.set(tokens, undefined)));
	}

	get tokens(): IAuthorizationToken[] {
		return this._tokensObservable.get();
	}

	get sessions(): vscode.AuthenticationSession[] {
		return this._sessionsObservable.get();
	}

	dispose() {
		this._disposable.dispose();
	}

	update({ added, removed }: { added: IAuthorizationToken[]; removed: IAuthorizationToken[] }): void {
		this._logger.trace(`Updating tokens: added ${added.length}, removed ${removed.length}`);
		const currentTokens = [...this._tokensObservable.get()];
		for (const token of removed) {
			const index = currentTokens.findIndex(t => t.access_token === token.access_token);
			if (index !== -1) {
				currentTokens.splice(index, 1);
			}
		}
		for (const token of added) {
			const index = currentTokens.findIndex(t => t.access_token === token.access_token);
			if (index === -1) {
				currentTokens.push(token);
			} else {
				currentTokens[index] = token;
			}
		}
		if (added.length || removed.length) {
			this._tokensObservable.set(currentTokens, undefined);
			void this._persistence.set(currentTokens);
		}
		this._logger.trace(`Tokens updated: ${currentTokens.length} tokens stored.`);
	}

	private _registerChangeEventAutorun(): IDisposable {
		let previousSessions: vscode.AuthenticationSession[] = [];
		return autorun((reader) => {
			this._logger.trace('Checking for session changes...');
			const currentSessions = this._sessionsObservable.read(reader);
			if (previousSessions === currentSessions) {
				this._logger.trace('No session changes detected.');
				return;
			}

			if (!currentSessions || currentSessions.length === 0) {
				// If currentSessions is undefined, all previous sessions are considered removed
				this._logger.trace('All sessions removed.');
				if (previousSessions.length > 0) {
					this._onDidChangeSessions.fire({
						added: [],
						removed: previousSessions,
						changed: []
					});
					previousSessions = [];
				}
				return;
			}

			const added: vscode.AuthenticationSession[] = [];
			const removed: vscode.AuthenticationSession[] = [];

			// Find added sessions
			for (const current of currentSessions) {
				const exists = previousSessions.some(prev => prev.accessToken === current.accessToken);
				if (!exists) {
					added.push(current);
				}
			}

			// Find removed sessions
			for (const prev of previousSessions) {
				const exists = currentSessions.some(current => current.accessToken === prev.accessToken);
				if (!exists) {
					removed.push(prev);
				}
			}

			// Fire the event if there are any changes
			if (added.length > 0 || removed.length > 0) {
				this._logger.trace(`Sessions changed: added ${added.length}, removed ${removed.length}`);
				this._onDidChangeSessions.fire({ added, removed, changed: [] });
			}

			// Update previous sessions reference
			previousSessions = currentSessions;
		});
	}

	private _getSessionFromToken(token: IAuthorizationTokenResponse): vscode.AuthenticationSession {
		let claims: IAuthorizationJWTClaims | undefined;
		if (token.id_token) {
			try {
				claims = getClaimsFromJWT(token.id_token);
			} catch (e) {
				// log
			}
		}
		if (!claims) {
			try {
				claims = getClaimsFromJWT(token.access_token);
			} catch (e) {
				// log
			}
		}
		const scopes = token.scope
			? token.scope.split(' ')
			: claims?.scope
				? claims.scope.split(' ')
				: [];
		return {
			id: stringHash(token.access_token, 0).toString(),
			accessToken: token.access_token,
			account: {
				id: claims?.sub || 'unknown',
				// TODO: Don't say MCP...
				label: claims?.preferred_username || claims?.name || claims?.email || 'MCP',
			},
			scopes: scopes,
			idToken: token.id_token
		};
	}
}
