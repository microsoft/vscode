/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

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

export const IAuthenticationService = createDecorator<IAuthenticationService>('IAuthenticationService');

export interface IAuthenticationService {
	readonly _serviceBrand: undefined;

	isAuthenticationProviderRegistered(id: string): boolean;
	getProviderIds(): string[];
	registerAuthenticationProvider(id: string, provider: IAuthenticationProvider): void;
	unregisterAuthenticationProvider(id: string): void;
	isAccessAllowed(providerId: string, accountName: string, extensionId: string): boolean | undefined;
	updateAllowedExtension(providerId: string, accountName: string, extensionId: string, extensionName: string, isAllowed: boolean): void;
	updateSessionPreference(providerId: string, extensionId: string, session: AuthenticationSession): void;
	getSessionPreference(providerId: string, extensionId: string, scopes: string[]): string | undefined;
	removeSessionPreference(providerId: string, extensionId: string, scopes: string[]): void;
	showGetSessionPrompt(providerId: string, accountName: string, extensionId: string, extensionName: string): Promise<boolean>;
	selectSession(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: readonly AuthenticationSession[]): Promise<AuthenticationSession>;
	requestSessionAccess(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: readonly AuthenticationSession[]): void;
	completeSessionAccessRequest(providerId: string, extensionId: string, extensionName: string, scopes: string[]): Promise<void>;
	requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void>;

	readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation>;
	readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation>;

	readonly onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>;

	// TODO completely remove this property
	declaredProviders: AuthenticationProviderInformation[];
	readonly onDidChangeDeclaredProviders: Event<AuthenticationProviderInformation[]>;

	getSessions(id: string, scopes?: string[], activateImmediate?: boolean): Promise<ReadonlyArray<AuthenticationSession>>;
	getLabel(providerId: string): string;
	supportsMultipleAccounts(providerId: string): boolean;
	createSession(providerId: string, scopes: string[], options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession>;
	removeSession(providerId: string, sessionId: string): Promise<void>;

	manageTrustedExtensionsForAccount(providerId: string, accountName: string): Promise<void>;
	removeAccountSessions(providerId: string, accountName: string, sessions: AuthenticationSession[]): Promise<void>;
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
