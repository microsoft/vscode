/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

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
}

export interface IAuthenticationCreateSessionOptions {
	sessionToRecreate?: AuthenticationSession;
	activateImmediate?: boolean;
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
	 * Gets all sessions that satisfy the given scopes from the provider with the given id
	 * @param id The id of the provider to ask for a session
	 * @param scopes The scopes for the session
	 * @param activateImmediate If true, the provider should activate immediately if it is not already
	 */
	getSessions(id: string, scopes?: string[], activateImmediate?: boolean): Promise<ReadonlyArray<AuthenticationSession>>;

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
}

// TODO: Move this into MainThreadAuthentication
export const IAuthenticationExtensionsService = createDecorator<IAuthenticationExtensionsService>('IAuthenticationExtensionsService');
export interface IAuthenticationExtensionsService {
	readonly _serviceBrand: undefined;

	updateSessionPreference(providerId: string, extensionId: string, session: AuthenticationSession): void;
	getSessionPreference(providerId: string, extensionId: string, scopes: string[]): string | undefined;
	removeSessionPreference(providerId: string, extensionId: string, scopes: string[]): void;
	selectSession(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: readonly AuthenticationSession[]): Promise<AuthenticationSession>;
	requestSessionAccess(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: readonly AuthenticationSession[]): void;
	requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void>;
}

export interface IAuthenticationProviderCreateSessionOptions {
	sessionToRecreate?: AuthenticationSession;
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
	 * @returns A promise that resolves to an array of authentication sessions.
	 */
	getSessions(scopes?: string[]): Promise<readonly AuthenticationSession[]>;

	/**
	 * Prompts the user to log in.
	 * If login is successful, the `onDidChangeSessions` event should be fired.
	 * If login fails, a rejected promise should be returned.
	 * If the provider does not support multiple accounts, this method should not be called if there is already an existing session matching the provided scopes.
	 * @param scopes - A list of scopes that the new session should be created with.
	 * @param options - Additional options for creating the session.
	 * @returns A promise that resolves to an authentication session.
	 */
	createSession(scopes: string[], options: IAuthenticationProviderCreateSessionOptions): Promise<AuthenticationSession>;

	/**
	 * Removes the session corresponding to the specified session ID.
	 * If the removal is successful, the `onDidChangeSessions` event should be fired.
	 * If a session cannot be removed, the provider should reject with an error message.
	 * @param sessionId - The ID of the session to remove.
	 */
	removeSession(sessionId: string): Promise<void>;
}
