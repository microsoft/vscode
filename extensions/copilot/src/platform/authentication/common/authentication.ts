/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { AuthenticationGetSessionOptions, AuthenticationGetSessionPresentationOptions, AuthenticationSession } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

/**
 * A stricter version of {@link AuthenticationGetSessionPresentationOptions} that requires
 * a `detail` message explaining why authentication is needed. This forces callers to provide
 * meaningful context to the user instead of passing a bare `true` or `{}`.
 */
export type StrictAuthenticationPresentationOptions = AuthenticationGetSessionPresentationOptions & { detail: string };
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { derived } from '../../../util/vs/base/common/observableInternal';
import { AuthPermissionMode, AuthProviderId, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { CopilotToken } from './copilotToken';
import { ICopilotTokenManager } from './copilotTokenManager';
import { ICopilotTokenStore } from './copilotTokenStore';

// Minimum set of scopes needed for Copilot to work
export const GITHUB_SCOPE_USER_EMAIL = ['user:email'];

// Old list of scopes still used for backwards compatibility
export const GITHUB_SCOPE_READ_USER = ['read:user'];

// The same scopes that GitHub Pull Request, GitHub Repositories, and others use
export const GITHUB_SCOPE_ALIGNED = ['read:user', 'user:email', 'repo', 'workflow'];

export class MinimalModeError extends Error {
	constructor() {
		super('The authentication service is in minimal mode.');
		this.name = 'MinimalModeError';
	}
}

export const IAuthenticationService = createServiceIdentifier<IAuthenticationService>('IAuthenticationService');
export interface IAuthenticationService {

	readonly _serviceBrand: undefined;

	/**
	 * Whether the authentication service is in minimal mode. If true, the authentication service will not attempt to
	 * fetch the permissive token. This means that:
	 * * {@link getGitHubSession} interactive flows with 'permissive' kind will always throw an error
	 * * {@link getGitHubSession} silent flows with 'permissive' kind and {@link permissiveGitHubSession} will always return undefined
	 */
	readonly isMinimalMode: boolean;

	/**
	 * Event emitter that will fire an event every time the authentication status changes. This is used for example to detect when the user
	 * logs out of GitHub or when they log in with a more permissive token.
	 *
	 * @note For best practice of handling of the user's authentication state, you should react to this event.
	 */
	readonly onDidAuthenticationChange: Event<void>;

	/**
	 * @deprecated Use {@link onDidAuthenticationChange} instead. This event fires when the access token changes and not the copilot token.
	 */
	readonly onDidAccessTokenChange: Event<void>;

	/**
	 * Checks if there is currently any session available in the cache. Does not make any network requests and does not
	 * call out to the underlying authentication provider.
	 *
	 * @note See {@link getAnyGitHubToken} for more information and for an async version by calling {@link getGitHubSession} with kind 'any' and `{ silent: true }`.
	 * @note For best practice of handling of the user's authentication state, you should react to {@link onDidAuthenticationChange}.
	 * @note This token will have at least the `user:email` scope to be able to access the minimum Copilot API.
	 */
	readonly anyGitHubSession: AuthenticationSession | undefined;

	/**
	 * Checks if there is currently a permissive session available in the cache. Does not make any network requests and does not
	 * call out to the underlying authentication provider.
	 *
	 * @note See {@link getPermissiveGitHubToken} for more information and for an async version by calling {@link getGitHubSession} with kind 'permissive' and `{ silent: true }`.
	 * @note For best practice of handling of the user's authentication state, you should react to {@link onDidAuthenticationChange}.
	 * @returns undefined if no auth session is available or Minimal Mode is enabled. Otherwise, returns an auth session with the `repo` scope.
	 */
	readonly permissiveGitHubSession: AuthenticationSession | undefined;

	/**
	 * Gets a GitHub session capable of calling GitHub APIs.
	 * @param kind - The kind of session that you need. **Your choice here should be thoughtful.**
	 * - 'permissive': You need a session that can access the user's private repositories or needs write access.
	 * - 'any': You only need a session that can access public information about the user.
	 * @param options - Options for getting the session.
	 * @returns Promise<AuthenticationSession> - The requested authentication session.
	 * @throws MinimalModeError - If kind is 'permissive' and the authentication service is in minimal mode.
	 * @throws Error - If no session is acquired (user cancels).
	 */
	getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;

	/**
	 * Gets a GitHub session capable of calling GitHub APIs.
	 * @param kind - The kind of session that you need. **Your choice here should be thoughtful.**
	 * - 'permissive': You need a session that can access the user's private repositories or needs write access.
	 * - 'any': You only need a session that can access public information about the user.
	 * @param options - Options for getting the session.
	 * @returns Promise<AuthenticationSession> - The requested authentication session.
	 * @throws MinimalModeError - If kind is 'permissive' and the authentication service is in minimal mode.
	 * @throws Error - If no session is acquired (user cancels).
	 */
	getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;

	/**
	 * Gets a GitHub session capable of calling GitHub APIs.
	 * @param kind - The kind of session that you need. **Your choice here should be thoughtful.**
	 * - 'permissive': You need a session that can access the user's private repositories or needs write access.
	 * - 'any': You only need a session that can access public information about the user.
	 * @param options - Options for getting the session.
	 * @returns Promise<AuthenticationSession> - The requested authentication session. OR
	 * @returns Promise<undefined> - If no session is available or kind is 'permissive' and the authentication service is in minimal mode.
	 * @see {@link isMinimalMode} for more information about minimal mode.
	 */
	getGitHubSession(kind: 'permissive' | 'any', options: Omit<AuthenticationGetSessionOptions, 'createIfNone' | 'forceNewSession'>): Promise<AuthenticationSession | undefined>;

	/**
	 * Checks if there is currently a Copilot token available in the cache. Does not make any network requests.
	 * See {@link getCopilotToken} for more information and for an async version.
	 *
	 * @note we omit token here because it is possibly expired. If you need it, use {@link getCopilotToken} instead as it includes a refresh mechanism.
	 * @note For best practice of handling of the user's authentication state, you should react to {@link onDidAuthenticationChange}.
	 */
	readonly copilotToken: Omit<CopilotToken, 'token'> | undefined;


	/**
	 * Return the token needed to authenticate with the speculative decoding endpoint.
	 * This token is public as it is set via a request to the ChatMLFetcher and reset either via expiration or a 403 response from the SD endpoint.
	 * @note There is no guarantee this is a valid token and it can still reject due to 403 with the SD endpoint
	 */
	speculativeDecodingEndpointToken: string | undefined;

	/**
	 * Return a currently valid Copilot token, retrieving a fresh one if
	 * necessary.
	 *
	 * @param force will force a refresh of the token, even if not expired
	 * @returns a Copilot token or throws an error if none is found.
	 * @note For best practice of handling of the user's authentication state, you should react to {@link onDidAuthenticationChange}.
	 */
	getCopilotToken(force?: boolean): Promise<CopilotToken>;

	/**
	 * Drop the current Copilot token as we received an HTTP error while trying
	 * to use it that indicates it's no longer valid.
	 */
	resetCopilotToken(httpError?: number): void;

	/**
	 * Fired when the authentication state changes for ado.
	 */
	readonly onDidAdoAuthenticationChange: Event<void>;

	/**
	 * Returns a valid Azure DevOps session for the user
	 */
	getAdoAccessTokenBase64(options?: AuthenticationGetSessionOptions): Promise<string | undefined>;
}

export abstract class BaseAuthenticationService extends Disposable implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAuthenticationChange = this._register(new Emitter<void>());
	readonly onDidAuthenticationChange: Event<void> = this._onDidAuthenticationChange.event;

	protected fireAuthenticationChange(source: string): void {
		const hasSession = !!this.copilotToken;
		this._logService.info(`AuthenticationService: firing onDidAuthenticationChange from ${source}. Has token: ${hasSession}`);
		this._onDidAuthenticationChange.fire();
	}

	protected readonly _onDidAccessTokenChange = this._register(new Emitter<void>());
	readonly onDidAccessTokenChange: Event<void> = this._onDidAccessTokenChange.event;

	protected readonly _onDidAdoAuthenticationChange = this._register(new Emitter<void>());
	readonly onDidAdoAuthenticationChange: Event<void> = this._onDidAdoAuthenticationChange.event;

	constructor(
		@ILogService protected readonly _logService: ILogService,
		@ICopilotTokenStore protected readonly _tokenStore: ICopilotTokenStore,
		@ICopilotTokenManager private readonly _tokenManager: ICopilotTokenManager,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
	) {
		super();
		this._register(_tokenManager.onDidCopilotTokenRefresh(() => {
			this._logService.debug('Handling CopilotToken refresh.');
			void this._handleAuthChangeEvent();
		}));
	}

	//#region isMinimalMode

	protected _isMinimalMode = derived(r => this._configurationService.getConfigObservable(ConfigKey.Shared.AuthPermissions).read(r) === AuthPermissionMode.Minimal);
	get isMinimalMode(): boolean {
		return this._isMinimalMode.get();
	}

	//#endregion

	//#region Any GitHub Token

	protected _anyGitHubSession: AuthenticationSession | undefined;
	get anyGitHubSession(): AuthenticationSession | undefined {
		return this._anyGitHubSession;
	}

	//#endregion

	//#region Permissive GitHub Token

	protected _permissiveGitHubSession: AuthenticationSession | undefined;
	get permissiveGitHubSession(): AuthenticationSession | undefined {
		return this._permissiveGitHubSession;
	}

	//#endregion

	//#region GitHub Session

	abstract getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	abstract getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	abstract getGitHubSession(kind: 'permissive' | 'any', options: Omit<AuthenticationGetSessionOptions, 'createIfNone' | 'forceNewSession'>): Promise<AuthenticationSession | undefined>;

	//#endregion

	//#region Ado

	protected _anyAdoSession: AuthenticationSession | undefined;
	get anyAdoSession(): AuthenticationSession | undefined {
		return this._anyAdoSession;
	}
	protected abstract getAnyAdoSession(options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined>;

	//#endregion

	//#region Copilot Token

	private _copilotTokenError: Error | undefined;
	get copilotToken(): CopilotToken | undefined {
		return this._tokenStore.copilotToken;
	}
	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
		try {
			const token = await this._tokenManager.getCopilotToken(force);
			this._tokenStore.copilotToken = token;
			this._copilotTokenError = undefined;
			return token;
		} catch (afterError) {
			this._tokenStore.copilotToken = undefined;
			const beforeError = this._copilotTokenError;
			this._copilotTokenError = afterError;
			// This handles the case where the user still can't get a Copilot Token,
			// but the error has change. I.e. They go from being not signed in (no copilot token can be minted)
			// to an account that doesn't have a valid subscription (no copilot token can be minted).
			// NOTE: if either error is undefined, this event should be fired elsewhere already.
			if (beforeError && afterError && beforeError.message !== afterError.message) {
				this.fireAuthenticationChange('getCopilotToken error change');
			}
			throw afterError;
		}
	}

	resetCopilotToken(httpError?: number): void {
		this._tokenStore.copilotToken = undefined;
		this._tokenManager.resetCopilotToken(httpError);
	}

	//#endregion

	// #region Speculative decoding endpoint token
	public speculativeDecodingEndpointToken: string | undefined;
	// #endregion

	//#region ADO Token
	abstract getAdoAccessTokenBase64(options?: AuthenticationGetSessionOptions): Promise<string | undefined>;
	//#endregion

	protected async _handleAuthChangeEvent(): Promise<void> {
		const anyGitHubSessionBefore = this._anyGitHubSession;
		const permissiveGitHubSessionBefore = this._permissiveGitHubSession;
		const anyAdoSessionBefore = this._anyAdoSession;
		const copilotTokenBefore = this._tokenStore.copilotToken;
		const copilotTokenErrorBefore = this._copilotTokenError;

		// Update caches
		const resolved = await Promise.allSettled([
			this.getGitHubSession('any', { silent: true }),
			this.getGitHubSession('permissive', { silent: true }),
			this.getAnyAdoSession({ silent: true }),
		]);
		for (const res of resolved) {
			if (res.status === 'rejected') {
				this._logService.error(`Error getting a session: ${res.reason}`);
			}
		}

		if (
			anyGitHubSessionBefore?.accessToken !== this._anyGitHubSession?.accessToken ||
			permissiveGitHubSessionBefore?.accessToken !== this._permissiveGitHubSession?.accessToken
		) {
			this._onDidAccessTokenChange.fire();
			this._logService.debug('Auth state changed, minting a new CopilotToken...');
			// The auth state has changed, so mint a new Copilot token
			try {
				await this.getCopilotToken(true);
			} catch (e) {
				// Ignore errors
			}
			this._logService.debug('Minted a new CopilotToken.');
			return;
		}

		if (anyAdoSessionBefore?.accessToken !== this._anyAdoSession?.accessToken) {
			this._logService.debug(`Ado auth state changed, firing event. Had token before: ${!!anyAdoSessionBefore?.accessToken}. Has token now: ${!!this._anyAdoSession?.accessToken}.`);
			this._onDidAdoAuthenticationChange.fire();
		}

		// Auth state hasn't changed, but the Copilot token might have
		try {
			await this.getCopilotToken();
		} catch (e) {
			// Ignore errors
		}

		if (copilotTokenBefore?.token !== this._tokenStore.copilotToken?.token ||
			// React to errors changing too (i.e. I go from zero session to a session that doesn't have Copilot access)
			copilotTokenErrorBefore?.message !== this._copilotTokenError?.message
		) {
			this._logService.debug('CopilotToken state changed, firing event.');
			this.fireAuthenticationChange('handleAuthChangeEvent');
		}
		this._logService.debug('Finished handling auth change event.');
	}
}

export function authProviderId(configurationService: IConfigurationService): AuthProviderId {
	return (
		configurationService.getConfig(ConfigKey.Shared.AuthProvider) === AuthProviderId.GitHubEnterprise
			? AuthProviderId.GitHubEnterprise
			: AuthProviderId.GitHub
	);
}
