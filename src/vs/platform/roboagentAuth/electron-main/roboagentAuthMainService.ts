/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRoboAgentAuthMainService, IRoboAgentAuthSession } from '../common/roboagentAuthService.js';
import { IFileService } from '../../files/common/files.js';
import { IEncryptionMainService } from '../../encryption/common/encryptionService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IURLService } from '../../url/common/url.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { URI } from '../../../base/common/uri.js';
import { AuthStorageService, IStoredSessionData } from './storage.js';
import { AuthExchangeService, ITokenResponse } from './exchange.js';
import { LoopbackServer, IActiveLoopback, ILoopbackResult } from './loopback.js';
import { constantTimeEqual, generateCodeChallenge, generateCodeVerifier, generateState } from './pkce.js';
import { AUTH_TIMEOUT_MS, TOKEN_REFRESH_MARGIN_MS, WEB_BASE } from '../common/authConstants.js';

interface IActiveSignIn {
	readonly loopbackServer?: IActiveLoopback;
	readonly deepLinkRegistration?: IDisposable;
	readonly abort: () => void;
	readonly promise: Promise<ILoopbackResult>;
	resolveCallback: (res: ILoopbackResult) => void;
	rejectCallback: (err: Error) => void;
}

export class RoboAgentAuthMainService extends Disposable implements IRoboAgentAuthMainService {
	public readonly _serviceBrand: undefined;

	private readonly _onDidChangeSession = this._register(new Emitter<IRoboAgentAuthSession>());
	public readonly onDidChangeSession: Event<IRoboAgentAuthSession> = this._onDidChangeSession.event;

	private _session: IRoboAgentAuthSession = { isSignedIn: false };
	private _accessToken: string | undefined;
	private _refreshTimer: NodeJS.Timeout | undefined;
	private _activeSignIn: IActiveSignIn | undefined;
	private _refreshPromise: Promise<void> | undefined;

	private readonly storageService: AuthStorageService;
	private readonly exchangeService: AuthExchangeService;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IFileService fileService: IFileService,
		@IEncryptionMainService encryptionService: IEncryptionMainService,
		@IEnvironmentMainService environmentService: IEnvironmentMainService,
		@IURLService private readonly urlService: IURLService,
		@INativeHostMainService private readonly nativeHostService: INativeHostMainService
	) {
		super();

		// For security and architecture correctness, throw if anon key is completely missing
		const anonKey = this.productService.supabaseAnonKey;
		if (!anonKey) {
			this.logService.error('RoboAgentAuthMainService: Missing supabaseAnonKey in product.json. Auth will fail.');
		}

		this.storageService = new AuthStorageService(environmentService.userDataPath, fileService, encryptionService, logService);
		this.exchangeService = new AuthExchangeService(anonKey || '', logService);

		// Kick off restoration asynchronously
		this.tryRestoreSession();
	}

	public async getSession(): Promise<IRoboAgentAuthSession> {
		return this._session;
	}

	public async signIn(): Promise<IRoboAgentAuthSession> {
		this.logService.trace('RoboAgentAuthMainService#signIn: Starting sign-in flow');

		if (this._activeSignIn) {
			this.logService.trace('RoboAgentAuthMainService#signIn: Cancelling existing sign-in attempt');
			this._activeSignIn.abort();
			this._activeSignIn = undefined;
		}

		const isEncryptionAvailable = await this.storageService.isAvailable();
		if (!isEncryptionAvailable) {
			this.logService.warn('RoboAgentAuthMainService#signIn: Encryption is unavailable. Session will not persist across launches.');
		}

		const verifier = generateCodeVerifier();
		const challenge = generateCodeChallenge(verifier);
		const state = generateState();

		let resultResolve: (res: ILoopbackResult) => void;
		let resultReject: (err: Error) => void;
		const resultPromise = new Promise<ILoopbackResult>((res, rej) => {
			resultResolve = res;
			resultReject = rej;
		});

		let redirectUri: string;
		let loopbackServer: IActiveLoopback | undefined;
		let deepLinkRegistration: IDisposable | undefined;

		const cleanup = () => {
			if (this._activeSignIn?.loopbackServer) {
				this._activeSignIn.loopbackServer.abort();
			}
			if (this._activeSignIn?.deepLinkRegistration) {
				this._activeSignIn.deepLinkRegistration.dispose();
			}
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			this._activeSignIn = undefined;
		};

		const abort = () => {
			cleanup();
			resultReject(new Error('Sign in aborted'));
		};

		this._activeSignIn = {
			abort,
			promise: resultPromise,
			resolveCallback: resultResolve!,
			rejectCallback: resultReject!
		};

		// 1. Try loopback
		try {
			const loopback = new LoopbackServer();
			loopbackServer = await loopback.listen();
			this._activeSignIn = { ...this._activeSignIn, loopbackServer };
			redirectUri = `http://127.0.0.1:${loopbackServer.port}/callback`;
			
			// Hook up the loopback promise to our overall result promise
			loopbackServer.promise.then(
				(res) => resultResolve!(res),
				(err) => resultReject!(err)
			);
		} catch (e) {
			this.logService.warn('RoboAgentAuthMainService#signIn: Loopback failed, falling back to deep-link', e);
			
			// 2. Fallback to deep-link
			redirectUri = `${this.productService.urlProtocol}://auth/callback`;
			
			deepLinkRegistration = this.urlService.registerHandler({
				handleURL: async (uri: URI, options?: { originalUrl?: string }) => {
					if (uri.path === '/callback' && uri.authority === 'auth') {
						const queryParams = new URLSearchParams(uri.query);
						const code = queryParams.get('code') || undefined;
						const returnedState = queryParams.get('state') || undefined;
						const error = queryParams.get('error') || undefined;
						const error_description = queryParams.get('error_description') || undefined;
						
						this._activeSignIn?.resolveCallback({ code, state: returnedState, error, error_description });
						return true; // handled
					}
					return false;
				}
			});
			this._activeSignIn = { ...this._activeSignIn, deepLinkRegistration };
		}

		// 3. Open browser
		const authUrl = `${WEB_BASE}/login?code_challenge=${challenge}&code_challenge_method=S256&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
		await this.nativeHostService.openExternal(undefined, authUrl);

		// 4. Wait for callback with timeout
		const timeoutHandle = setTimeout(() => {
			this.logService.warn('RoboAgentAuthMainService#signIn: Timed out waiting for browser callback');
			abort();
		}, AUTH_TIMEOUT_MS);

		try {
			const result = await resultPromise;
			cleanup();

			if (result.error) {
				throw new Error(`Auth error: ${result.error} - ${result.error_description || ''}`);
			}

			if (!result.state || !constantTimeEqual(state, result.state)) {
				throw new Error('State mismatch. Possible CSRF attack.');
			}

			if (!result.code) {
				throw new Error('No code returned from auth provider.');
			}

			// 5. Exchange code
			const tokenResponse = await this.exchangeService.exchangeCode(result.code, verifier);
			await this.handleTokenResponse(tokenResponse);
			return this._session;
		} catch (e) {
			cleanup();
			throw e;
		}
	}

	public async signOut(): Promise<void> {
		this.logService.trace('RoboAgentAuthMainService#signOut: Signing out');

		if (this._accessToken) {
			await this.exchangeService.signOutRemote(this._accessToken);
		}

		await this.clearSession();
	}

	private async clearSession(): Promise<void> {
		this._accessToken = undefined;
		this._session = { isSignedIn: false };
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer);
			this._refreshTimer = undefined;
		}
		
		await this.storageService.clear();
		this._onDidChangeSession.fire(this._session);
	}

	private async handleTokenResponse(response: ITokenResponse): Promise<void> {
		this._accessToken = response.access_token;
		
		const displayName = response.user.user_metadata?.full_name || response.user.email;
		
		this._session = {
			isSignedIn: true,
			userId: response.user.id,
			email: response.user.email,
			displayName
		};

		const dataToStore: IStoredSessionData = {
			refreshToken: response.refresh_token,
			userId: response.user.id,
			email: response.user.email,
			displayName
		};
		await this.storageService.save(dataToStore);

		// Schedule next refresh
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer);
		}

		const expiresInMs = response.expires_in * 1000;
		const refreshInMs = Math.max(0, expiresInMs - TOKEN_REFRESH_MARGIN_MS);
		
		this._refreshTimer = setTimeout(() => {
			this.refreshAccessToken();
		}, refreshInMs) as any;

		this._onDidChangeSession.fire(this._session);
	}

	private async tryRestoreSession(): Promise<void> {
		this.logService.trace('RoboAgentAuthMainService#tryRestoreSession: Attempting to restore session');

		if (!(await this.storageService.isAvailable())) {
			this.logService.trace('RoboAgentAuthMainService#tryRestoreSession: Encryption unavailable, cannot restore');
			return;
		}

		const storedData = await this.storageService.load();
		if (!storedData || !storedData.refreshToken) {
			return;
		}

		// Optimistic signed-in state (no access token yet, but identity known)
		this._session = {
			isSignedIn: true,
			userId: storedData.userId,
			email: storedData.email,
			displayName: storedData.displayName
		};
		this._onDidChangeSession.fire(this._session);

		try {
			await this.refreshAccessToken(storedData.refreshToken);
		} catch (e: any) {
			if (e.name === 'ExchangeError' && (e.statusCode === 400 || e.statusCode === 401)) {
				this.logService.warn('RoboAgentAuthMainService#tryRestoreSession: Refresh token rejected, clearing session');
				await this.clearSession();
			} else {
				this.logService.warn('RoboAgentAuthMainService#tryRestoreSession: Network error during restore, keeping optimistic session', e);
				// We keep the optimistic session. A future API call will fail or we can implement a retry.
			}
		}
	}

	private async refreshAccessToken(forceRefreshToken?: string): Promise<void> {
		if (this._refreshPromise) {
			return this._refreshPromise;
		}

		this._refreshPromise = this.doRefreshAccessToken(forceRefreshToken).finally(() => {
			this._refreshPromise = undefined;
		});

		return this._refreshPromise;
	}

	private async doRefreshAccessToken(forceRefreshToken?: string): Promise<void> {
		let refreshTokenToUse = forceRefreshToken;

		if (!refreshTokenToUse) {
			const storedData = await this.storageService.load();
			refreshTokenToUse = storedData?.refreshToken;
		}

		if (!refreshTokenToUse) {
			throw new Error('No refresh token available');
		}

		try {
			const tokenResponse = await this.exchangeService.refreshAccessToken(refreshTokenToUse);
			await this.handleTokenResponse(tokenResponse);
		} catch (e: any) {
			if (e.name === 'ExchangeError' && (e.statusCode === 400 || e.statusCode === 401)) {
				this.logService.warn('RoboAgentAuthMainService#doRefreshAccessToken: Refresh rejected, clearing session');
				await this.clearSession();
			}
			throw e;
		}
	}
}
