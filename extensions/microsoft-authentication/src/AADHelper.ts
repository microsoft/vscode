/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { isSupportedEnvironment } from './common/uri';
import { IntervalTimer, raceCancellationAndTimeoutError, SequencerByKey } from './common/async';
import { generateCodeChallenge, generateCodeVerifier, randomUUID } from './cryptoUtils';
import { BetterTokenStorage, IDidChangeInOtherWindowEvent } from './betterSecretStorage';
import { LoopbackAuthServer } from './node/authServer';
import { base64Decode } from './node/buffer';
import fetch from './node/fetch';
import { UriEventHandler } from './UriEventHandler';
import TelemetryReporter from '@vscode/extension-telemetry';
import { Environment } from '@azure/ms-rest-azure-env';

const redirectUrl = 'https://vscode.dev/redirect';
const defaultActiveDirectoryEndpointUrl = Environment.AzureCloud.activeDirectoryEndpointUrl;
const DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const DEFAULT_TENANT = 'organizations';
const MSA_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
const MSA_PASSTHRU_TID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';

const enum MicrosoftAccountType {
	AAD = 'aad',
	MSA = 'msa',
	Unknown = 'unknown'
}

interface IToken {
	accessToken?: string; // When unable to refresh due to network problems, the access token becomes undefined
	idToken?: string; // depending on the scopes can be either supplied or empty

	expiresIn?: number; // How long access token is valid, in seconds
	expiresAt?: number; // UNIX epoch time at which token will expire
	refreshToken: string;

	account: {
		label: string;
		id: string;
		type: MicrosoftAccountType;
	};
	scope: string;
	sessionId: string; // The account id + the scope
}

export interface IStoredSession {
	id: string;
	refreshToken: string;
	scope: string; // Scopes are alphabetized and joined with a space
	account: {
		label: string;
		id: string;
	};
	endpoint: string | undefined;
}

export interface ITokenResponse {
	access_token: string;
	expires_in: number;
	ext_expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: string;
	id_token?: string;
}

export interface IMicrosoftTokens {
	accessToken: string;
	idToken?: string;
}

interface IScopeData {
	originalScopes?: string[];
	scopes: string[];
	scopeStr: string;
	scopesToSend: string;
	clientId: string;
	tenant: string;
}

export const REFRESH_NETWORK_FAILURE = 'Network failure';

export class AzureActiveDirectoryService {
	// For details on why this is set to 2/3... see https://github.com/microsoft/vscode/issues/133201#issuecomment-966668197
	private static REFRESH_TIMEOUT_MODIFIER = 1000 * 2 / 3;
	private static POLLING_CONSTANT = 1000 * 60 * 30;

	private _tokens: IToken[] = [];
	private _refreshTimeouts: Map<string, NodeJS.Timeout> = new Map<string, NodeJS.Timeout>();
	private _sessionChangeEmitter: vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

	// Used to keep track of current requests when not using the local server approach.
	private _pendingNonces = new Map<string, string[]>();
	private _codeExchangePromises = new Map<string, Promise<vscode.AuthenticationSession>>();
	private _codeVerfifiers = new Map<string, string>();

	// Used to keep track of tokens that we need to store but can't because we aren't the focused window.
	private _pendingTokensToStore: Map<string, IToken> = new Map<string, IToken>();

	// Used to sequence requests to the same scope.
	private _sequencer = new SequencerByKey<string>();

	constructor(
		private readonly _logger: vscode.LogOutputChannel,
		_context: vscode.ExtensionContext,
		private readonly _uriHandler: UriEventHandler,
		private readonly _tokenStorage: BetterTokenStorage<IStoredSession>,
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _env: Environment
	) {
		_context.subscriptions.push(this._tokenStorage.onDidChangeInOtherWindow((e) => this.checkForUpdates(e)));
		_context.subscriptions.push(vscode.window.onDidChangeWindowState(async (e) => e.focused && await this.storePendingTokens()));

		// In the event that a window isn't focused for a long time, we should still try to store the tokens at some point.
		const timer = new IntervalTimer();
		timer.cancelAndSet(
			() => !vscode.window.state.focused && this.storePendingTokens(),
			// 5 hours + random extra 0-30 seconds so that each window doesn't try to store at the same time
			(18000000) + Math.floor(Math.random() * 30000));
		_context.subscriptions.push(timer);
	}

	public async initialize(): Promise<void> {
		this._logger.trace('Reading sessions from secret storage...');
		const sessions = await this._tokenStorage.getAll(item => this.sessionMatchesEndpoint(item));
		this._logger.trace(`Got ${sessions.length} stored sessions`);

		const refreshes = sessions.map(async session => {
			this._logger.trace(`[${session.scope}] '${session.id}' Read stored session`);
			const scopes = session.scope.split(' ');
			const scopeData: IScopeData = {
				scopes,
				scopeStr: session.scope,
				// filter our special scopes
				scopesToSend: scopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
				clientId: this.getClientId(scopes),
				tenant: this.getTenantId(scopes),
			};
			try {
				await this.refreshToken(session.refreshToken, scopeData, session.id);
			} catch (e) {
				// If we aren't connected to the internet, then wait and try to refresh again later.
				if (e.message === REFRESH_NETWORK_FAILURE) {
					this._tokens.push({
						accessToken: undefined,
						refreshToken: session.refreshToken,
						account: {
							...session.account,
							type: MicrosoftAccountType.Unknown
						},
						scope: session.scope,
						sessionId: session.id
					});
				} else {
					vscode.window.showErrorMessage(vscode.l10n.t('You have been signed out because reading stored authentication information failed.'));
					this._logger.error(e);
					await this.removeSessionByIToken({
						accessToken: undefined,
						refreshToken: session.refreshToken,
						account: {
							...session.account,
							type: MicrosoftAccountType.Unknown
						},
						scope: session.scope,
						sessionId: session.id
					});
				}
			}
		});

		const result = await Promise.allSettled(refreshes);
		for (const res of result) {
			if (res.status === 'rejected') {
				this._logger.error(`Failed to initialize stored data: ${res.reason}`);
				this.clearSessions();
				break;
			}
		}

		for (const token of this._tokens) {
			/* __GDPR__
				"login" : {
					"owner": "TylerLeonhardt",
					"comment": "Used to determine the usage of the Microsoft Auth Provider.",
					"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." },
					"accountType": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what account types are being used." }
				}
			*/
			this._telemetryReporter.sendTelemetryEvent('account', {
				// Get rid of guids from telemetry.
				scopes: JSON.stringify(token.scope.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}').split(' ')),
				accountType: token.account.type
			});
		}
	}

	//#region session operations

	public get onDidChangeSessions(): vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> {
		return this._sessionChangeEmitter.event;
	}

	public getSessions(scopes?: string[], account?: vscode.AuthenticationSessionAccountInformation): Promise<vscode.AuthenticationSession[]> {
		if (!scopes) {
			this._logger.info('Getting sessions for all scopes...');
			const sessions = this._tokens
				.filter(token => !account?.label || token.account.label === account.label)
				.map(token => this.convertToSessionSync(token));
			this._logger.info(`Got ${sessions.length} sessions for all scopes${account ? ` for account '${account.label}'` : ''}...`);
			return Promise.resolve(sessions);
		}

		let modifiedScopes = [...scopes];
		if (!modifiedScopes.includes('openid')) {
			modifiedScopes.push('openid');
		}
		if (!modifiedScopes.includes('email')) {
			modifiedScopes.push('email');
		}
		if (!modifiedScopes.includes('profile')) {
			modifiedScopes.push('profile');
		}
		if (!modifiedScopes.includes('offline_access')) {
			modifiedScopes.push('offline_access');
		}
		modifiedScopes = modifiedScopes.sort();

		const modifiedScopesStr = modifiedScopes.join(' ');
		const clientId = this.getClientId(scopes);
		const scopeData: IScopeData = {
			clientId,
			originalScopes: scopes,
			scopes: modifiedScopes,
			scopeStr: modifiedScopesStr,
			// filter our special scopes
			scopesToSend: modifiedScopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
			tenant: this.getTenantId(scopes),
		};

		this._logger.trace(`[${scopeData.scopeStr}] Queued getting sessions` + account ? ` for ${account?.label}` : '');
		return this._sequencer.queue(modifiedScopesStr, () => this.doGetSessions(scopeData, account));
	}

	private async doGetSessions(scopeData: IScopeData, account?: vscode.AuthenticationSessionAccountInformation): Promise<vscode.AuthenticationSession[]> {
		this._logger.info(`[${scopeData.scopeStr}] Getting sessions` + account ? ` for ${account?.label}` : '');

		const matchingTokens = this._tokens
			.filter(token => token.scope === scopeData.scopeStr)
			.filter(token => !account?.label || token.account.label === account.label);
		// If we still don't have a matching token try to get a new token from an existing token by using
		// the refreshToken. This is documented here:
		// https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow#refresh-the-access-token
		// "Refresh tokens are valid for all permissions that your client has already received consent for."
		if (!matchingTokens.length) {
			// Get a token with the correct client id and account.
			let token: IToken | undefined;
			for (const t of this._tokens) {
				// No refresh token, so we can't make a new token from this session
				if (!t.refreshToken) {
					continue;
				}
				// Need to make sure the account matches if we were provided one
				if (account?.label && t.account.label !== account.label) {
					continue;
				}
				// If the client id is the default client id, then check for the absence of the VSCODE_CLIENT_ID scope
				if (scopeData.clientId === DEFAULT_CLIENT_ID && !t.scope.includes('VSCODE_CLIENT_ID')) {
					token = t;
					break;
				}
				// If the client id is not the default client id, then check for the matching VSCODE_CLIENT_ID scope
				if (scopeData.clientId !== DEFAULT_CLIENT_ID && t.scope.includes(`VSCODE_CLIENT_ID:${scopeData.clientId}`)) {
					token = t;
					break;
				}
			}

			if (token) {
				this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Found a matching token with a different scopes '${token.scope}'. Attempting to get a new session using the existing session.`);
				try {
					const itoken = await this.doRefreshToken(token.refreshToken, scopeData);
					this._sessionChangeEmitter.fire({ added: [this.convertToSessionSync(itoken)], removed: [], changed: [] });
					matchingTokens.push(itoken);
				} catch (err) {
					this._logger.error(`[${scopeData.scopeStr}] Attempted to get a new session using the existing session with scopes '${token.scope}' but it failed due to: ${err.message ?? err}`);
				}
			}
		}

		this._logger.info(`[${scopeData.scopeStr}] Got ${matchingTokens.length} sessions`);
		const results = await Promise.allSettled(matchingTokens.map(token => this.convertToSession(token, scopeData)));
		return results
			.filter(result => result.status === 'fulfilled')
			.map(result => (result as PromiseFulfilledResult<vscode.AuthenticationSession>).value);
	}

	public createSession(scopes: string[], account?: vscode.AuthenticationSessionAccountInformation): Promise<vscode.AuthenticationSession> {
		let modifiedScopes = [...scopes];
		if (!modifiedScopes.includes('openid')) {
			modifiedScopes.push('openid');
		}
		if (!modifiedScopes.includes('email')) {
			modifiedScopes.push('email');
		}
		if (!modifiedScopes.includes('profile')) {
			modifiedScopes.push('profile');
		}
		if (!modifiedScopes.includes('offline_access')) {
			modifiedScopes.push('offline_access');
		}
		modifiedScopes = modifiedScopes.sort();
		const scopeData: IScopeData = {
			originalScopes: scopes,
			scopes: modifiedScopes,
			scopeStr: modifiedScopes.join(' '),
			// filter our special scopes
			scopesToSend: modifiedScopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
			clientId: this.getClientId(scopes),
			tenant: this.getTenantId(scopes),
		};

		this._logger.trace(`[${scopeData.scopeStr}] Queued creating session`);
		return this._sequencer.queue(scopeData.scopeStr, () => this.doCreateSession(scopeData, account));
	}

	private async doCreateSession(scopeData: IScopeData, account?: vscode.AuthenticationSessionAccountInformation): Promise<vscode.AuthenticationSession> {
		this._logger.info(`[${scopeData.scopeStr}] Creating session` + account ? ` for ${account?.label}` : '');

		const runsRemote = vscode.env.remoteName !== undefined;
		const runsServerless = vscode.env.remoteName === undefined && vscode.env.uiKind === vscode.UIKind.Web;

		if (runsServerless && this._env.activeDirectoryEndpointUrl !== defaultActiveDirectoryEndpointUrl) {
			throw new Error('Sign in to non-public clouds is not supported on the web.');
		}

		return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Signing in to your account...'), cancellable: true }, async (_progress, token) => {
			if (runsRemote || runsServerless) {
				return await this.createSessionWithoutLocalServer(scopeData, account?.label, token);
			}

			try {
				return await this.createSessionWithLocalServer(scopeData, account?.label, token);
			} catch (e) {
				this._logger.error(`[${scopeData.scopeStr}] Error creating session: ${e}`);

				// If the error was about starting the server, try directly hitting the login endpoint instead
				if (e.message === 'Error listening to server' || e.message === 'Closed' || e.message === 'Timeout waiting for port') {
					return this.createSessionWithoutLocalServer(scopeData, account?.label, token);
				}

				throw e;
			}
		});
	}

	private async createSessionWithLocalServer(scopeData: IScopeData, loginHint: string | undefined, token: vscode.CancellationToken): Promise<vscode.AuthenticationSession> {
		this._logger.trace(`[${scopeData.scopeStr}] Starting login flow with local server`);
		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const qs = new URLSearchParams({
			response_type: 'code',
			response_mode: 'query',
			client_id: scopeData.clientId,
			redirect_uri: redirectUrl,
			scope: scopeData.scopesToSend,
			code_challenge_method: 'S256',
			code_challenge: codeChallenge,
		});
		if (loginHint) {
			qs.set('login_hint', loginHint);
		} else {
			qs.set('prompt', 'select_account');
		}
		const loginUrl = new URL(`${scopeData.tenant}/oauth2/v2.0/authorize?${qs.toString()}`, this._env.activeDirectoryEndpointUrl).toString();
		const server = new LoopbackAuthServer(path.join(__dirname, '../media'), loginUrl);
		await server.start();

		let codeToExchange;
		try {
			vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${server.port}/signin?nonce=${encodeURIComponent(server.nonce)}`));
			const { code } = await raceCancellationAndTimeoutError(server.waitForOAuthResponse(), token, 1000 * 60 * 5); // 5 minutes
			codeToExchange = code;
		} finally {
			setTimeout(() => {
				void server.stop();
			}, 5000);
		}

		const session = await this.exchangeCodeForSession(codeToExchange, codeVerifier, scopeData);
		this._logger.trace(`[${scopeData.scopeStr}] '${session.id}' Sending change event for added session`);
		this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });
		this._logger.info(`[${scopeData.scopeStr}] '${session.id}' session successfully created!`);
		return session;
	}

	private async createSessionWithoutLocalServer(scopeData: IScopeData, loginHint: string | undefined, token: vscode.CancellationToken): Promise<vscode.AuthenticationSession> {
		this._logger.trace(`[${scopeData.scopeStr}] Starting login flow without local server`);
		let callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.microsoft-authentication`));
		const nonce = generateCodeVerifier();
		const callbackQuery = new URLSearchParams(callbackUri.query);
		callbackQuery.set('nonce', encodeURIComponent(nonce));
		callbackUri = callbackUri.with({
			query: callbackQuery.toString()
		});
		const state = encodeURIComponent(callbackUri.toString(true));
		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const signInUrl = new URL(`${scopeData.tenant}/oauth2/v2.0/authorize`, this._env.activeDirectoryEndpointUrl);
		const qs = new URLSearchParams({
			response_type: 'code',
			client_id: encodeURIComponent(scopeData.clientId),
			response_mode: 'query',
			redirect_uri: redirectUrl,
			state,
			scope: scopeData.scopesToSend,
			code_challenge_method: 'S256',
			code_challenge: codeChallenge,
		});
		if (loginHint) {
			qs.append('login_hint', loginHint);
		} else {
			qs.append('prompt', 'select_account');
		}
		signInUrl.search = qs.toString();
		const uri = vscode.Uri.parse(signInUrl.toString());
		vscode.env.openExternal(uri);


		const existingNonces = this._pendingNonces.get(scopeData.scopeStr) || [];
		this._pendingNonces.set(scopeData.scopeStr, [...existingNonces, nonce]);

		// Register a single listener for the URI callback, in case the user starts the login process multiple times
		// before completing it.
		let existingPromise = this._codeExchangePromises.get(scopeData.scopeStr);
		let inputBox: vscode.InputBox | undefined;
		if (!existingPromise) {
			if (isSupportedEnvironment(callbackUri)) {
				existingPromise = this.handleCodeResponse(scopeData);
			} else {
				inputBox = vscode.window.createInputBox();
				existingPromise = this.handleCodeInputBox(inputBox, codeVerifier, scopeData);
			}
			this._codeExchangePromises.set(scopeData.scopeStr, existingPromise);
		}

		this._codeVerfifiers.set(nonce, codeVerifier);

		return await raceCancellationAndTimeoutError(existingPromise, token, 1000 * 60 * 5) // 5 minutes
			.finally(() => {
				this._pendingNonces.delete(scopeData.scopeStr);
				this._codeExchangePromises.delete(scopeData.scopeStr);
				this._codeVerfifiers.delete(nonce);
				inputBox?.dispose();
			});
	}

	public async removeSessionById(sessionId: string, writeToDisk: boolean = true): Promise<vscode.AuthenticationSession | undefined> {
		const tokenIndex = this._tokens.findIndex(token => token.sessionId === sessionId);
		if (tokenIndex === -1) {
			this._logger.warn(`'${sessionId}' Session not found to remove`);
			return Promise.resolve(undefined);
		}

		const token = this._tokens.splice(tokenIndex, 1)[0];
		this._logger.trace(`[${token.scope}] '${sessionId}' Queued removing session`);
		return this._sequencer.queue(token.scope, () => this.removeSessionByIToken(token, writeToDisk));
	}

	public async clearSessions() {
		this._logger.trace('Logging out of all sessions');
		this._tokens = [];
		await this._tokenStorage.deleteAll(item => this.sessionMatchesEndpoint(item));

		this._refreshTimeouts.forEach(timeout => {
			clearTimeout(timeout);
		});

		this._refreshTimeouts.clear();
		this._logger.trace('All sessions logged out');
	}

	private async removeSessionByIToken(token: IToken, writeToDisk: boolean = true): Promise<vscode.AuthenticationSession | undefined> {
		this._logger.info(`[${token.scope}] '${token.sessionId}' Logging out of session`);
		this.removeSessionTimeout(token.sessionId);

		if (writeToDisk) {
			await this._tokenStorage.delete(token.sessionId);
		}

		const tokenIndex = this._tokens.findIndex(t => t.sessionId === token.sessionId);
		if (tokenIndex !== -1) {
			this._tokens.splice(tokenIndex, 1);
		}

		const session = this.convertToSessionSync(token);
		this._logger.trace(`[${token.scope}] '${token.sessionId}' Sending change event for session that was removed`);
		this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
		this._logger.info(`[${token.scope}] '${token.sessionId}' Logged out of session successfully!`);
		return session;
	}

	//#endregion

	//#region timeout

	private setSessionTimeout(sessionId: string, refreshToken: string, scopeData: IScopeData, timeout: number) {
		this._logger.trace(`[${scopeData.scopeStr}] '${sessionId}' Setting refresh timeout for ${timeout} milliseconds`);
		this.removeSessionTimeout(sessionId);
		this._refreshTimeouts.set(sessionId, setTimeout(async () => {
			try {
				const refreshedToken = await this.refreshToken(refreshToken, scopeData, sessionId);
				this._logger.trace(`[${scopeData.scopeStr}] '${sessionId}' Sending change event for session that was refreshed`);
				this._sessionChangeEmitter.fire({ added: [], removed: [], changed: [this.convertToSessionSync(refreshedToken)] });
				this._logger.trace(`[${scopeData.scopeStr}] '${sessionId}' refresh timeout complete`);
			} catch (e) {
				if (e.message !== REFRESH_NETWORK_FAILURE) {
					vscode.window.showErrorMessage(vscode.l10n.t('You have been signed out because reading stored authentication information failed.'));
					await this.removeSessionById(sessionId);
				}
			}
		}, timeout));
	}

	private removeSessionTimeout(sessionId: string): void {
		const timeout = this._refreshTimeouts.get(sessionId);
		if (timeout) {
			clearTimeout(timeout);
			this._refreshTimeouts.delete(sessionId);
		}
	}

	//#endregion

	//#region convert operations

	private convertToTokenSync(json: ITokenResponse, scopeData: IScopeData, existingId?: string): IToken {
		let claims = undefined;
		this._logger.trace(`[${scopeData.scopeStr}] '${existingId ?? 'new'}' Attempting to parse token response.`);

		try {
			if (json.id_token) {
				claims = JSON.parse(base64Decode(json.id_token.split('.')[1]));
			} else {
				this._logger.warn(`[${scopeData.scopeStr}] '${existingId ?? 'new'}' Attempting to parse access_token instead since no id_token was included in the response.`);
				claims = JSON.parse(base64Decode(json.access_token.split('.')[1]));
			}
		} catch (e) {
			throw e;
		}

		const id = `${claims.tid}/${(claims.oid ?? (claims.altsecid ?? '' + claims.ipd ?? ''))}`;
		const sessionId = existingId || `${id}/${randomUUID()}`;
		this._logger.trace(`[${scopeData.scopeStr}] '${sessionId}' Token response parsed successfully.`);
		return {
			expiresIn: json.expires_in,
			expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
			accessToken: json.access_token,
			idToken: json.id_token,
			refreshToken: json.refresh_token,
			scope: scopeData.scopeStr,
			sessionId,
			account: {
				label: claims.preferred_username ?? claims.email ?? claims.unique_name ?? 'user@example.com',
				id,
				type: claims.tid === MSA_TID || claims.tid === MSA_PASSTHRU_TID ? MicrosoftAccountType.MSA : MicrosoftAccountType.AAD
			}
		};
	}

	/**
	 * Return a session object without checking for expiry and potentially refreshing.
	 * @param token The token information.
	 */
	private convertToSessionSync(token: IToken): vscode.AuthenticationSession {
		return {
			id: token.sessionId,
			accessToken: token.accessToken!,
			idToken: token.idToken,
			account: token.account,
			scopes: token.scope.split(' ')
		};
	}

	private async convertToSession(token: IToken, scopeData: IScopeData): Promise<vscode.AuthenticationSession> {
		if (token.accessToken && (!token.expiresAt || token.expiresAt > Date.now())) {
			this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Token available from cache${token.expiresAt ? `, expires in ${token.expiresAt - Date.now()} milliseconds` : ''}.`);
			return {
				id: token.sessionId,
				accessToken: token.accessToken,
				idToken: token.idToken,
				account: token.account,
				scopes: scopeData.originalScopes ?? scopeData.scopes
			};
		}

		try {
			this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Token expired or unavailable, trying refresh`);
			const refreshedToken = await this.refreshToken(token.refreshToken, scopeData, token.sessionId);
			if (refreshedToken.accessToken) {
				return {
					id: token.sessionId,
					accessToken: refreshedToken.accessToken,
					idToken: refreshedToken.idToken,
					account: token.account,
					// We always prefer the original scopes requested since that array is used as a key in the AuthService
					scopes: scopeData.originalScopes ?? scopeData.scopes
				};
			} else {
				throw new Error();
			}
		} catch (e) {
			throw new Error('Unavailable due to network problems');
		}
	}

	//#endregion

	//#region refresh logic

	private refreshToken(refreshToken: string, scopeData: IScopeData, sessionId?: string): Promise<IToken> {
		this._logger.trace(`[${scopeData.scopeStr}] '${sessionId ?? 'new'}' Queued refreshing token`);
		return this._sequencer.queue(scopeData.scopeStr, () => this.doRefreshToken(refreshToken, scopeData, sessionId));
	}

	private async doRefreshToken(refreshToken: string, scopeData: IScopeData, sessionId?: string): Promise<IToken> {
		this._logger.trace(`[${scopeData.scopeStr}] '${sessionId ?? 'new'}' Refreshing token`);
		const postData = new URLSearchParams({
			refresh_token: refreshToken,
			client_id: scopeData.clientId,
			grant_type: 'refresh_token',
			scope: scopeData.scopesToSend
		}).toString();

		try {
			const json = await this.fetchTokenResponse(postData, scopeData);
			const token = this.convertToTokenSync(json, scopeData, sessionId);
			if (token.expiresIn) {
				this.setSessionTimeout(token.sessionId, token.refreshToken, scopeData, token.expiresIn * AzureActiveDirectoryService.REFRESH_TIMEOUT_MODIFIER);
			}
			this.setToken(token, scopeData);
			this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Token refresh success`);
			return token;
		} catch (e) {
			if (e.message === REFRESH_NETWORK_FAILURE) {
				// We were unable to refresh because of a network failure (i.e. the user lost internet access).
				// so set up a timeout to try again later. We only do this if we have a session id to reference later.
				if (sessionId) {
					this.setSessionTimeout(sessionId, refreshToken, scopeData, AzureActiveDirectoryService.POLLING_CONSTANT);
				}
				throw e;
			}
			this._logger.error(`[${scopeData.scopeStr}] '${sessionId ?? 'new'}' Refreshing token failed: ${e.message}`);
			throw e;
		}
	}

	//#endregion

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

	//#region oauth flow

	private async handleCodeResponse(scopeData: IScopeData): Promise<vscode.AuthenticationSession> {
		let uriEventListener: vscode.Disposable;
		return new Promise((resolve: (value: vscode.AuthenticationSession) => void, reject) => {
			uriEventListener = this._uriHandler.event(async (uri: vscode.Uri) => {
				try {
					const query = new URLSearchParams(uri.query);
					let code = query.get('code');
					let nonce = query.get('nonce');
					if (Array.isArray(code)) {
						code = code[0];
					}
					if (!code) {
						throw new Error('No code included in query');
					}
					if (Array.isArray(nonce)) {
						nonce = nonce[0];
					}
					if (!nonce) {
						throw new Error('No nonce included in query');
					}

					const acceptedStates = this._pendingNonces.get(scopeData.scopeStr) || [];
					// Workaround double encoding issues of state in web
					if (!acceptedStates.includes(nonce) && !acceptedStates.includes(decodeURIComponent(nonce))) {
						throw new Error('Nonce does not match.');
					}

					const verifier = this._codeVerfifiers.get(nonce) ?? this._codeVerfifiers.get(decodeURIComponent(nonce));
					if (!verifier) {
						throw new Error('No available code verifier');
					}

					const session = await this.exchangeCodeForSession(code, verifier, scopeData);
					this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });
					this._logger.info(`[${scopeData.scopeStr}] '${session.id}' session successfully created!`);
					resolve(session);
				} catch (err) {
					reject(err);
				}
			});
		}).then(result => {
			uriEventListener.dispose();
			return result;
		}).catch(err => {
			uriEventListener.dispose();
			throw err;
		});
	}

	private async handleCodeInputBox(inputBox: vscode.InputBox, verifier: string, scopeData: IScopeData): Promise<vscode.AuthenticationSession> {
		this._logger.trace(`[${scopeData.scopeStr}] Starting login flow with input box`);
		inputBox.ignoreFocusOut = true;
		inputBox.title = vscode.l10n.t('Microsoft Authentication');
		inputBox.prompt = vscode.l10n.t('Provide the authorization code to complete the sign in flow.');
		inputBox.placeholder = vscode.l10n.t('Paste authorization code here...');
		return new Promise((resolve: (value: vscode.AuthenticationSession) => void, reject) => {
			inputBox.show();
			inputBox.onDidAccept(async () => {
				const code = inputBox.value;
				if (code) {
					inputBox.dispose();
					const session = await this.exchangeCodeForSession(code, verifier, scopeData);
					this._logger.trace(`[${scopeData.scopeStr}] '${session.id}' sending session changed event because session was added.`);
					this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });
					this._logger.trace(`[${scopeData.scopeStr}] '${session.id}' session successfully created!`);
					resolve(session);
				}
			});
			inputBox.onDidHide(() => {
				if (!inputBox.value) {
					inputBox.dispose();
					reject('Cancelled');
				}
			});
		});
	}

	private async exchangeCodeForSession(code: string, codeVerifier: string, scopeData: IScopeData): Promise<vscode.AuthenticationSession> {
		this._logger.trace(`[${scopeData.scopeStr}] Exchanging login code for session`);
		let token: IToken | undefined;
		try {
			const postData = new URLSearchParams({
				grant_type: 'authorization_code',
				code: code,
				client_id: scopeData.clientId,
				scope: scopeData.scopesToSend,
				code_verifier: codeVerifier,
				redirect_uri: redirectUrl
			}).toString();

			const json = await this.fetchTokenResponse(postData, scopeData);
			this._logger.trace(`[${scopeData.scopeStr}] Exchanging code for token succeeded!`);
			token = this.convertToTokenSync(json, scopeData);
		} catch (e) {
			this._logger.error(`[${scopeData.scopeStr}] Error exchanging code for token: ${e}`);
			throw e;
		}

		if (token.expiresIn) {
			this.setSessionTimeout(token.sessionId, token.refreshToken, scopeData, token.expiresIn * AzureActiveDirectoryService.REFRESH_TIMEOUT_MODIFIER);
		}
		this.setToken(token, scopeData);
		this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Exchanging login code for session succeeded!`);
		return await this.convertToSession(token, scopeData);
	}

	private async fetchTokenResponse(postData: string, scopeData: IScopeData): Promise<ITokenResponse> {
		let endpointUrl: string;
		if (this._env.activeDirectoryEndpointUrl !== defaultActiveDirectoryEndpointUrl) {
			// If this is for sovereign clouds, don't try using the proxy endpoint, which supports only public cloud
			endpointUrl = this._env.activeDirectoryEndpointUrl;
		} else {
			const proxyEndpoints: { [providerId: string]: string } | undefined = await vscode.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
			endpointUrl = proxyEndpoints?.microsoft || this._env.activeDirectoryEndpointUrl;
		}
		const endpoint = new URL(`${scopeData.tenant}/oauth2/v2.0/token`, endpointUrl);

		let attempts = 0;
		while (attempts <= 3) {
			attempts++;
			let result;
			let errorMessage: string | undefined;
			try {
				result = await fetch(endpoint.toString(), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded'
					},
					body: postData
				});
			} catch (e) {
				errorMessage = e.message ?? e;
			}

			if (!result || result.status > 499) {
				if (attempts > 3) {
					this._logger.error(`[${scopeData.scopeStr}] Fetching token failed: ${result ? await result.text() : errorMessage}`);
					break;
				}
				// Exponential backoff
				await new Promise(resolve => setTimeout(resolve, 5 * attempts * attempts * 1000));
				continue;
			} else if (!result.ok) {
				// For 4XX errors, the user may actually have an expired token or have changed
				// their password recently which is throwing a 4XX. For this, we throw an error
				// so that the user can be prompted to sign in again.
				throw new Error(await result.text());
			}

			return await result.json() as ITokenResponse;
		}

		throw new Error(REFRESH_NETWORK_FAILURE);
	}

	//#endregion

	//#region storage operations

	private setToken(token: IToken, scopeData: IScopeData): void {
		this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Setting token`);

		const existingTokenIndex = this._tokens.findIndex(t => t.sessionId === token.sessionId);
		if (existingTokenIndex > -1) {
			this._tokens.splice(existingTokenIndex, 1, token);
		} else {
			this._tokens.push(token);
		}

		// Don't await because setting the token is only useful for any new windows that open.
		void this.storeToken(token, scopeData);
	}

	private async storeToken(token: IToken, scopeData: IScopeData): Promise<void> {
		if (!vscode.window.state.focused) {
			if (this._pendingTokensToStore.has(token.sessionId)) {
				this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Window is not focused, replacing token to be stored`);
			} else {
				this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Window is not focused, pending storage of token`);
			}
			this._pendingTokensToStore.set(token.sessionId, token);
			return;
		}

		await this._tokenStorage.store(token.sessionId, {
			id: token.sessionId,
			refreshToken: token.refreshToken,
			scope: token.scope,
			account: token.account,
			endpoint: this._env.activeDirectoryEndpointUrl,
		});
		this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Stored token`);
	}

	private async storePendingTokens(): Promise<void> {
		if (this._pendingTokensToStore.size === 0) {
			this._logger.trace('No pending tokens to store');
			return;
		}

		const tokens = [...this._pendingTokensToStore.values()];
		this._pendingTokensToStore.clear();

		this._logger.trace(`Storing ${tokens.length} pending tokens...`);
		await Promise.allSettled(tokens.map(async token => {
			this._logger.trace(`[${token.scope}] '${token.sessionId}' Storing pending token`);
			await this._tokenStorage.store(token.sessionId, {
				id: token.sessionId,
				refreshToken: token.refreshToken,
				scope: token.scope,
				account: token.account,
				endpoint: this._env.activeDirectoryEndpointUrl,
			});
			this._logger.trace(`[${token.scope}] '${token.sessionId}' Stored pending token`);
		}));
		this._logger.trace('Done storing pending tokens');
	}

	private async checkForUpdates(e: IDidChangeInOtherWindowEvent<IStoredSession>): Promise<void> {
		for (const key of e.added) {
			const session = await this._tokenStorage.get(key);
			if (!session) {
				this._logger.error('session not found that was apparently just added');
				continue;
			}

			if (!this.sessionMatchesEndpoint(session)) {
				// If the session wasn't made for this login endpoint, ignore this update
				continue;
			}

			const matchesExisting = this._tokens.some(token => token.scope === session.scope && token.sessionId === session.id);
			if (!matchesExisting && session.refreshToken) {
				try {
					const scopes = session.scope.split(' ');
					const scopeData: IScopeData = {
						scopes,
						scopeStr: session.scope,
						// filter our special scopes
						scopesToSend: scopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
						clientId: this.getClientId(scopes),
						tenant: this.getTenantId(scopes),
					};
					this._logger.trace(`[${scopeData.scopeStr}] '${session.id}' Session added in another window`);
					const token = await this.refreshToken(session.refreshToken, scopeData, session.id);
					this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Sending change event for session that was added`);
					this._sessionChangeEmitter.fire({ added: [this.convertToSessionSync(token)], removed: [], changed: [] });
					this._logger.trace(`[${scopeData.scopeStr}] '${token.sessionId}' Session added in another window added here`);
					continue;
				} catch (e) {
					// Network failures will automatically retry on next poll.
					if (e.message !== REFRESH_NETWORK_FAILURE) {
						vscode.window.showErrorMessage(vscode.l10n.t('You have been signed out because reading stored authentication information failed.'));
						await this.removeSessionById(session.id);
					}
					continue;
				}
			}
		}

		for (const { value } of e.removed) {
			this._logger.trace(`[${value.scope}] '${value.id}' Session removed in another window`);
			if (!this.sessionMatchesEndpoint(value)) {
				// If the session wasn't made for this login endpoint, ignore this update
				this._logger.trace(`[${value.scope}] '${value.id}' Session doesn't match endpoint. Skipping...`);
				continue;
			}

			await this.removeSessionById(value.id, false);
			this._logger.trace(`[${value.scope}] '${value.id}' Session removed in another window removed here`);
		}

		// NOTE: We don't need to handle changed sessions because all that really would give us is a new refresh token
		// because access tokens are not stored in Secret Storage due to their short lifespan. This new refresh token
		// is not useful in this window because we really only care about the lifetime of the _access_ token which we
		// are already managing (see usages of `setSessionTimeout`).
		// However, in order to minimize the amount of times we store tokens, if a token was stored via another window,
		// we cancel any pending token storage operations.
		for (const sessionId of e.updated) {
			if (this._pendingTokensToStore.delete(sessionId)) {
				this._logger.trace(`'${sessionId}' Cancelled pending token storage because token was updated in another window`);
			}
		}
	}

	private sessionMatchesEndpoint(session: IStoredSession): boolean {
		// For older sessions with no endpoint set, it can be assumed to be the default endpoint
		session.endpoint ||= defaultActiveDirectoryEndpointUrl;

		return session.endpoint === this._env.activeDirectoryEndpointUrl;
	}

	//#endregion
}
