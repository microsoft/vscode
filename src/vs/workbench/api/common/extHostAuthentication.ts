/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter, Event } from '../../../base/common/event.js';
import { MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
import { IExtensionDescription, ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from '../../services/authentication/common/authentication.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { URI } from '../../../base/common/uri.js';
import { IAuthorizationDynamicClientRegistrationResponse, IAuthorizationServerMetadata, IAuthorizationTokenResponse, isAuthorizationDynamicClientRegistrationResponse, isAuthorizationTokenResponse } from '../../../base/common/oauth.js';
import { IExtHostWindow } from './extHostWindow.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';

export interface IExtHostAuthentication extends ExtHostAuthentication { }
export const IExtHostAuthentication = createDecorator<IExtHostAuthentication>('IExtHostAuthentication');

interface ProviderWithMetadata {
	label: string;
	provider: vscode.AuthenticationProvider;
	options: vscode.AuthenticationProviderOptions;
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {

	declare _serviceBrand: undefined;

	protected _proxy: MainThreadAuthenticationShape;
	protected _authenticationProviders: Map<string, ProviderWithMetadata> = new Map<string, ProviderWithMetadata>();

	private _onDidChangeSessions = new Emitter<vscode.AuthenticationSessionsChangeEvent & { extensionIdFilter?: string[] }>();
	private _getSessionTaskSingler = new TaskSingler<vscode.AuthenticationSession | undefined>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService protected readonly _initData: IExtHostInitDataService,
		@IExtHostWindow protected readonly _extHostWindow: IExtHostWindow
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
		this._proxy.$registerAuthenticationProvider(id, label, options?.supportsMultipleAccounts ?? false, options?.supportedIssuers);

		return new Disposable(() => {
			listener.dispose();
			this._authenticationProviders.delete(id);
			this._proxy.$unregisterAuthenticationProvider(id);
		});
	}

	async $createSession(providerId: string, scopes: string[], options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			options.issuer = URI.revive(options.issuer);
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
			options.issuer = URI.revive(options.issuer);
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

	async $registerDynamicAuthProvider(serverMetadata: IAuthorizationServerMetadata): Promise<void> {
		const provider = await DynamicAuthProvider.create(
			this._proxy,
			serverMetadata,
			this._initData,
			this._extHostWindow
		);
		// leaked disposables
		this._authenticationProviders.set(serverMetadata.issuer, { label: serverMetadata.issuer, provider, options: { supportsMultipleAccounts: false } });
		provider.onDidChangeSessions(e => this._proxy.$sendDidChangeSessions(serverMetadata.issuer, e));
		await this._proxy.$registerAuthenticationProvider(serverMetadata.issuer, serverMetadata.issuer, false, [URI.parse(serverMetadata.issuer)]);
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
	private _onDidChangeSessions = new Emitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private _sessions: vscode.AuthenticationSession[] = [];

	constructor(
		private readonly _proxy: MainThreadAuthenticationShape,
		protected readonly _serverMetadata: IAuthorizationServerMetadata,
		protected readonly _clientId: string,
		private readonly _appUriScheme: string,
		protected readonly _extHostWindow: IExtHostWindow,
		protected readonly _createFlows: Array<(scopes: string[]) => Promise<vscode.AuthenticationSession>>
	) {
		this._createFlows.push(scopes => this._createWithUrlHandler(scopes));
	}

	static async create(
		proxy: MainThreadAuthenticationShape,
		serverMetadata: IAuthorizationServerMetadata,
		initData: IExtHostInitDataService,
		extHostWindow: IExtHostWindow,
		createFlows: Array<(scopes: string[]) => Promise<vscode.AuthenticationSession>> = []
	): Promise<DynamicAuthProvider> {
		if (!serverMetadata.registration_endpoint) {
			throw new Error('Server does not support dynamic registration');
		}
		try {
			const registration = await doDynamicRegistration(serverMetadata.registration_endpoint, initData, AUTHORIZATION_DEFAULT_PORT);

			const provider = new DynamicAuthProvider(
				proxy,
				serverMetadata,
				registration.client_id,
				initData.environment.appUriScheme,
				extHostWindow,
				createFlows
			);
			await provider.initializeSessions();
			return provider;
		} catch (err) {
			throw new Error(`Dynamic registration failed: ${err.message}`);
		}
	}

	initializeSessions(): Promise<void> {
		// TODO@TylerLeonhardt: Implement this to load existing sessions from secret storage
		return Promise.resolve();
	}

	async getSessions(scopes: readonly string[] | undefined, options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		if (!scopes) {
			return this._sessions;
		}
		const sessions = this._sessions.filter(session => session.scopes.join(' ') === scopes.join(' '));
		if (sessions.length) {
			return sessions;
		}
		return [];
	}

	async createSession(scopes: string[], _options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		let session: vscode.AuthenticationSession | undefined;
		for (const createFlow of this._createFlows) {
			try {
				session = await createFlow(scopes);
				if (session) {
					break;
				}
			} catch (err) {
				// TODO: Handle error
				console.error(`Failed to create session: ${err}`);
			}
		}
		if (!session) {
			throw new Error('Failed to create authentication session');
		}

		// TODO: handle dupes

		// Store session for later retrieval
		this._sessions.push(session);

		// Notify that sessions have changed
		this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });

		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		const sessionIndex = this._sessions.findIndex(session => session.id === sessionId);
		if (sessionIndex === -1) {
			// Log?
		}

		const [removedSession] = this._sessions.splice(sessionIndex, 1);
		this._onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
	}

	private async _createWithUrlHandler(scopes: string[]): Promise<vscode.AuthenticationSession> {
		// Generate PKCE code verifier (random string) and code challenge (SHA-256 hash of verifier)
		const codeVerifier = this.generateRandomString(64);
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);

		// Generate a random state value to prevent CSRF
		const nonce = this.generateRandomString(32);
		const issuer = URI.parse(this._serverMetadata.issuer);
		// TODO fix
		const state = URI.parse(`${this._appUriScheme}://mcp/${issuer.authority}/authorize?nonce=${nonce}`);
		// const state = await this._extHostWindow.asExternalUri(callbackUri, {});

		// Prepare the authorization request URL
		const authorizationUrl = new URL(this._serverMetadata.authorization_endpoint!);
		authorizationUrl.searchParams.append('client_id', this._clientId);
		authorizationUrl.searchParams.append('response_type', 'code');
		authorizationUrl.searchParams.append('scope', scopes.join(' '));
		authorizationUrl.searchParams.append('state', state.toString(true));
		authorizationUrl.searchParams.append('code_challenge', codeChallenge);
		authorizationUrl.searchParams.append('code_challenge_method', 'S256');

		// Use a redirect URI that matches what was registered during dynamic registration
		const redirectUri = 'https://vscode.dev/redirect';
		authorizationUrl.searchParams.append('redirect_uri', redirectUri);

		const promise = this.waitForAuthorizationCode(state);

		// Open the browser for user authorization
		await this._extHostWindow.openUri(authorizationUrl.toString(), {});

		// Wait for the authorization code via a redirect
		const { code } = await promise;

		if (!code) {
			throw new Error('Authentication failed: No authorization code received');
		}

		// Exchange the authorization code for tokens
		const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier, redirectUri);

		// Create a session from the token response
		const session: vscode.AuthenticationSession = {
			id: this.generateRandomString(32), // Generate a unique session ID
			accessToken: tokenResponse.access_token,
			account: {
				id: 'unknown',
				label: 'User Account' // Better label could be fetched from userinfo endpoint if available
			},
			scopes: scopes,
		};
		return session;
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
		return btoa(String.fromCharCode(...new Uint8Array(digest)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	private async waitForAuthorizationCode(expectedState: URI): Promise<{ code: string }> {
		const result = await this._proxy.$waitForUriHandler(expectedState);
		const params = new URLSearchParams(result.query);
		return { code: params.get('code') || '' };
	}

	protected async exchangeCodeForToken(code: string, codeVerifier: string, redirectUri: string): Promise<IAuthorizationTokenResponse> {
		if (!this._serverMetadata.token_endpoint) {
			throw new Error('Token endpoint not available in server metadata');
		}

		const tokenRequest = new URLSearchParams();
		tokenRequest.append('client_id', this._clientId);
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
			throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
		}

		const result = await response.json();
		if (isAuthorizationTokenResponse(result)) {
			return result;
		}
		throw new Error(`Invalid authorization token response: ${JSON.stringify(result)}`);
	}
}

export const AUTHORIZATION_DEFAULT_PORT = 33418;
export async function doDynamicRegistration(registrationEndpoint: string, initData: IExtHostInitDataService, port: number): Promise<IAuthorizationDynamicClientRegistrationResponse> {
	const response = await fetch(registrationEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			client_name: initData.environment.appName,
			client_uri: 'https://code.visualstudio.com',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			redirect_uris: [
				'https://insiders.vscode.dev/redirect',
				'https://vscode.dev/redirect',
				// Using a port here in the event that the authorization server does not support updating.
				`http://localhost:${port}/callback`,
				`http://127.0.0.1:${port}/callback`,
			],
			token_endpoint_auth_method: 'none'
		})
	});

	if (!response.ok) {
		throw new Error(`Registration failed: ${response.statusText}`);
	}

	const registration = await response.json();
	if (isAuthorizationDynamicClientRegistrationResponse(registration)) {
		return registration;
	}
	throw new Error(`Invalid authorization dynamic client registration response: ${JSON.stringify(registration)}`);
}
