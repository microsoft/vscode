/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata } from '../../../../base/common/oauth.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Use this if you don't want the onDidChangeSessions event to fire in the extension host
 */
export const INTERNAL_AUTH_PROVIDER_PREFIX = '__';

export interface AuthenticationSessionAccount {
	label: string;
	id: string;
}

export interface AuthenticationSession {
	id: string;
	accessToken: string;
	account: AuthenticationSessionAccount;
	scopes: ReadonlyArray<string>;
	idToken?: string;
}

export interface AuthenticationSessionsChangeEvent {
	added: ReadonlyArray<AuthenticationSession> | undefined;
	removed: ReadonlyArray<AuthenticationSession> | undefined;
	changed: ReadonlyArray<AuthenticationSession> | undefined;
}

export interface AuthenticationProviderInformation {
	id: string;
	label: string;
	authorizationServerGlobs?: ReadonlyArray<string>;
}

export interface IAuthenticationCreateSessionOptions {
	activateImmediate?: boolean;
	/**
	 * The account that is being asked about. If this is passed in, the provider should
	 * attempt to return the sessions that are only related to this account.
	 */
	account?: AuthenticationSessionAccount;
	/**
	 * The authorization server URI to use for this creation request. If passed in, first we validate that
	 * the provider can use this authorization server, then it is passed down to the auth provider.
	 */
	authorizationServer?: URI;
}

export interface IAuthenticationGetSessionsOptions {
	/**
	 * The account that is being asked about. If this is passed in, the provider should
	 * attempt to return the sessions that are only related to this account.
	 */
	account?: AuthenticationSessionAccount;
	/**
	 * The authorization server URI to use for this request. If passed in, first we validate that
	 * the provider can use this authorization server, then it is passed down to the auth provider.
	 */
	authorizationServer?: URI;
}

export interface AllowedExtension {
	id: string;
	name: string;
	/**
	 * If true or undefined, the extension is allowed to use the account
	 * If false, the extension is not allowed to use the account
	 * TODO: undefined shouldn't be a valid value, but it is for now
	 */
	allowed?: boolean;
	lastUsed?: number;
	// If true, this comes from the product.json
	trusted?: boolean;
}

export interface IAuthenticationProviderHostDelegate {
	/** Priority for this delegate, delegates are tested in descending priority order */
	readonly priority: number;
	create(authorizationServer: URI, serverMetadata: IAuthorizationServerMetadata, resource: IAuthorizationProtectedResourceMetadata | undefined): Promise<string>;
}

export const IAuthenticationService = createDecorator<IAuthenticationService>('IAuthenticationService');

export interface IAuthenticationService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when an authentication provider has been registered
	 */
	readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation>;
	/**
	 * Fires when an authentication provider has been unregistered
	 */
	readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation>;

	/**
	 * Fires when the list of sessions for a provider has been added, removed or changed
	 */
	readonly onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>;

	/**
	 * Fires when the list of declaredProviders has changed
	 */
	readonly onDidChangeDeclaredProviders: Event<void>;

	/**
	 * All providers that have been statically declared by extensions. These may not actually be registered or active yet.
	 */
	readonly declaredProviders: AuthenticationProviderInformation[];

	/**
	 * Registers that an extension has declared an authentication provider in their package.json
	 * @param provider The provider information to register
	 */
	registerDeclaredAuthenticationProvider(provider: AuthenticationProviderInformation): void;

	/**
	 * Unregisters a declared authentication provider
	 * @param id The id of the provider to unregister
	 */
	unregisterDeclaredAuthenticationProvider(id: string): void;

	/**
	 * Checks if an authentication provider has been registered
	 * @param id The id of the provider to check
	 */
	isAuthenticationProviderRegistered(id: string): boolean;

	/**
	 * Registers an authentication provider
	 * @param id The id of the provider
	 * @param provider The implementation of the provider
	 */
	registerAuthenticationProvider(id: string, provider: IAuthenticationProvider): void;

	/**
	 * Unregisters an authentication provider
	 * @param id The id of the provider to unregister
	 */
	unregisterAuthenticationProvider(id: string): void;

	/**
	 * Gets the provider ids of all registered authentication providers
	 */
	getProviderIds(): string[];

	/**
	 * Gets the provider with the given id.
	 * @param id The id of the provider to get
	 * @throws if the provider is not registered
	 */
	getProvider(id: string): IAuthenticationProvider;

	/**
	 * Gets all accounts that are currently logged in across all sessions
	 * @param id The id of the provider to ask for accounts
	 * @returns A promise that resolves to an array of accounts
	 */
	getAccounts(id: string): Promise<ReadonlyArray<AuthenticationSessionAccount>>;

	/**
	 * Gets all sessions that satisfy the given scopes from the provider with the given id
	 * @param id The id of the provider to ask for a session
	 * @param scopes The scopes for the session
	 * @param options Additional options for getting sessions
	 * @param activateImmediate If true, the provider should activate immediately if it is not already
	 */
	getSessions(id: string, scopes?: string[], options?: IAuthenticationGetSessionsOptions, activateImmediate?: boolean): Promise<ReadonlyArray<AuthenticationSession>>;

	/**
	 * Creates an AuthenticationSession with the given provider and scopes
	 * @param providerId The id of the provider
	 * @param scopes The scopes to request
	 * @param options Additional options for creating the session
	 */
	createSession(providerId: string, scopes: string[], options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession>;

	/**
	 * Removes the session with the given id from the provider with the given id
	 * @param providerId The id of the provider
	 * @param sessionId The id of the session to remove
	 */
	removeSession(providerId: string, sessionId: string): Promise<void>;

	/**
	 * Gets a provider id for a specified authorization server
	 * @param authorizationServer The authorization server url that this provider is responsible for
	 */
	getOrActivateProviderIdForServer(authorizationServer: URI): Promise<string | undefined>;

	/**
	 * Allows the ability register a delegate that will be used to start authentication providers
	 * @param delegate The delegate to register
	 */
	registerAuthenticationProviderHostDelegate(delegate: IAuthenticationProviderHostDelegate): IDisposable;

	/**
	 * Creates a dynamic authentication provider for the given server metadata
	 * @param serverMetadata The metadata for the server that is being authenticated against
	 */
	createDynamicAuthenticationProvider(authorizationServer: URI, serverMetadata: IAuthorizationServerMetadata, resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined): Promise<IAuthenticationProvider | undefined>;
}

export function isAuthenticationSession(thing: unknown): thing is AuthenticationSession {
	if (typeof thing !== 'object' || !thing) {
		return false;
	}
	const maybe = thing as AuthenticationSession;
	if (typeof maybe.id !== 'string') {
		return false;
	}
	if (typeof maybe.accessToken !== 'string') {
		return false;
	}
	if (typeof maybe.account !== 'object' || !maybe.account) {
		return false;
	}
	if (typeof maybe.account.label !== 'string') {
		return false;
	}
	if (typeof maybe.account.id !== 'string') {
		return false;
	}
	if (!Array.isArray(maybe.scopes)) {
		return false;
	}
	if (maybe.idToken && typeof maybe.idToken !== 'string') {
		return false;
	}
	return true;
}

// TODO: Move this into MainThreadAuthentication
export const IAuthenticationExtensionsService = createDecorator<IAuthenticationExtensionsService>('IAuthenticationExtensionsService');
export interface IAuthenticationExtensionsService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when an account preference for a specific provider has changed for the specified extensions. Does not fire when:
	 * * An account preference is removed
	 * * A session preference is changed (because it's deprecated)
	 * * A session preference is removed (because it's deprecated)
	 */
	onDidChangeAccountPreference: Event<{ extensionIds: string[]; providerId: string }>;
	/**
	 * Returns the accountName (also known as account.label) to pair with `IAuthenticationAccessService` to get the account preference
	 * @param providerId The authentication provider id
	 * @param extensionId The extension id to get the preference for
	 * @returns The accountName of the preference, or undefined if there is no preference set
	 */
	getAccountPreference(extensionId: string, providerId: string): string | undefined;
	/**
	 * Sets the account preference for the given provider and extension
	 * @param providerId The authentication provider id
	 * @param extensionId The extension id to set the preference for
	 * @param account The account to set the preference to
	 */
	updateAccountPreference(extensionId: string, providerId: string, account: AuthenticationSessionAccount): void;
	/**
	 * Removes the account preference for the given provider and extension
	 * @param providerId The authentication provider id
	 * @param extensionId The extension id to remove the preference for
	 */
	removeAccountPreference(extensionId: string, providerId: string): void;
	/**
	 * @deprecated Sets the session preference for the given provider and extension
	 * @param providerId
	 * @param extensionId
	 * @param session
	 */
	updateSessionPreference(providerId: string, extensionId: string, session: AuthenticationSession): void;
	/**
	 * @deprecated Gets the session preference for the given provider and extension
	 * @param providerId
	 * @param extensionId
	 * @param scopes
	 */
	getSessionPreference(providerId: string, extensionId: string, scopes: string[]): string | undefined;
	/**
	 * @deprecated Removes the session preference for the given provider and extension
	 * @param providerId
	 * @param extensionId
	 * @param scopes
	 */
	removeSessionPreference(providerId: string, extensionId: string, scopes: string[]): void;
	selectSession(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: readonly AuthenticationSession[]): Promise<AuthenticationSession>;
	requestSessionAccess(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: readonly AuthenticationSession[]): void;
	requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void>;
}

export interface IAuthenticationProviderSessionOptions {
	/**
	 * The account that is being asked about. If this is passed in, the provider should
	 * attempt to return the sessions that are only related to this account.
	 */
	account?: AuthenticationSessionAccount;
	/**
	 * The authorization server that is being asked about. If this is passed in, the provider should
	 * attempt to return sessions that are only related to this authorization server.
	 */
	authorizationServer?: URI;
}

/**
 * Represents an authentication provider.
 */
export interface IAuthenticationProvider {
	/**
	 * The unique identifier of the authentication provider.
	 */
	readonly id: string;

	/**
	 * The display label of the authentication provider.
	 */
	readonly label: string;

	/**
	 * The resolved authorization servers. These can still contain globs, but should be concrete URIs
	 */
	readonly authorizationServers?: ReadonlyArray<URI>;

	/**
	 * Indicates whether the authentication provider supports multiple accounts.
	 */
	readonly supportsMultipleAccounts: boolean;

	/**
	 * An {@link Event} which fires when the array of sessions has changed, or data
	 * within a session has changed.
	 */
	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;

	/**
	 * Retrieves a list of authentication sessions.
	 * @param scopes - An optional list of scopes. If provided, the sessions returned should match these permissions, otherwise all sessions should be returned.
	 * @param options - Additional options for getting sessions.
	 * @returns A promise that resolves to an array of authentication sessions.
	 */
	getSessions(scopes: string[] | undefined, options: IAuthenticationProviderSessionOptions): Promise<readonly AuthenticationSession[]>;

	/**
	 * Prompts the user to log in.
	 * If login is successful, the `onDidChangeSessions` event should be fired.
	 * If login fails, a rejected promise should be returned.
	 * If the provider does not support multiple accounts, this method should not be called if there is already an existing session matching the provided scopes.
	 * @param scopes - A list of scopes that the new session should be created with.
	 * @param options - Additional options for creating the session.
	 * @returns A promise that resolves to an authentication session.
	 */
	createSession(scopes: string[], options: IAuthenticationProviderSessionOptions): Promise<AuthenticationSession>;

	/**
	 * Removes the session corresponding to the specified session ID.
	 * If the removal is successful, the `onDidChangeSessions` event should be fired.
	 * If a session cannot be removed, the provider should reject with an error message.
	 * @param sessionId - The ID of the session to remove.
	 */
	removeSession(sessionId: string): Promise<void>;
}
