/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isObject } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError, ICloudSandboxAuthenticationTarget, ICloudSandboxIdentityToken, ICloudSandboxPreparedAuthentication, ICloudSandboxSealedToken, ICloudSandboxSealTokenRequest } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AuthenticationSession } from '../../../../services/authentication/common/authentication.js';
import { RATE_LIMIT_MAX_RETRIES, RATE_LIMIT_WAIT_BUDGET_MS, rateLimitDelay } from './cloudSandboxRateLimit.js';

interface IIdentityTokenState extends IDisposable {
	readonly accountKey: string;
	readonly session: AuthenticationSession;
	cached?: ICloudSandboxIdentityToken;
	pending?: { readonly promise: CancelablePromise<ICloudSandboxIdentityToken>; waiters: number };
}

/** Unvalidated fields returned by the identity-token endpoint. */
export interface ICloudSandboxIdentityTokenResponse {
	readonly token?: unknown;
	readonly expires_at?: unknown;
	readonly expires_in?: unknown;
}

const IDENTITY_TOKEN_REFRESH_LEAD_MS = 30_000;

/** Owns identity credentials and pending exchanges; the API service supplies account selection and HTTP requests. */
export class CloudSandboxIdentityTokenProvider extends Disposable {
	private readonly _state = this._register(new MutableDisposable<IIdentityTokenState>());
	private _lifetime = new CancellationTokenSource();
	private readonly _rateLimits = new Map<string, { readonly retryAt: number; readonly error: CloudSandboxRequestError }>();

	constructor(
		private readonly _resolveAuthentication: () => Promise<{ readonly accountKey: string; readonly session: AuthenticationSession } | undefined>,
		private readonly _requestToken: (session: AuthenticationSession, token: CancellationToken) => Promise<ICloudSandboxIdentityTokenResponse | null | undefined>,
		private readonly _sealToken: (session: AuthenticationSession, request: ICloudSandboxSealTokenRequest, token: CancellationToken) => Promise<ICloudSandboxSealedToken>,
	) {
		super();
		this._register(toDisposable(() => {
			this._lifetime.dispose(true);
			this._rateLimits.clear();
		}));
	}

	async getIdentityToken(accountKey: string, token: CancellationToken, forceRefresh = false): Promise<ICloudSandboxIdentityToken> {
		const { identity, state } = await this._getIdentityTokenContext(accountKey, token, forceRefresh);
		if (token.isCancellationRequested || this._state.value !== state) {
			throw new CancellationError();
		}
		return identity;
	}

	async prepareSandboxAuthentication(accountKey: string, target: Promise<ICloudSandboxAuthenticationTarget>, token: CancellationToken, forceRefresh = false): Promise<ICloudSandboxPreparedAuthentication> {
		const lifetime = this._lifetime.token;
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(token));
		store.add(lifetime.onCancellationRequested(() => source.cancel()));
		if (token.isCancellationRequested || lifetime.isCancellationRequested) {
			source.cancel();
		}
		try {
			const [initial, readyTarget] = await raceCancellationError(Promise.all([
				this._getIdentityTokenContext(accountKey, source.token, forceRefresh),
				target,
			]), source.token);
			const { environmentId, resource } = readyTarget;
			let { state, identity } = initial;
			const authentication = await raceCancellationError(this._resolveAuthentication(), source.token);
			if (source.token.isCancellationRequested || this._state.value !== state
				|| authentication?.accountKey !== accountKey
				|| authentication.session.id !== state.session.id || authentication.session.accessToken !== state.session.accessToken) {
				throw new CancellationError();
			}
			if (identity.expiresAt !== undefined && identity.expiresAt <= Date.now() + IDENTITY_TOKEN_REFRESH_LEAD_MS) {
				({ state, identity } = await this._getIdentityTokenContext(accountKey, source.token, false));
			}
			if (source.token.isCancellationRequested || this._state.value !== state) {
				throw new CancellationError();
			}
			const sealed = await raceCancellationError(this._sealToken(state.session, {
				environmentId, resource, token: identity.token,
			}, source.token), source.token);
			if (source.token.isCancellationRequested || this._state.value !== state) {
				throw new CancellationError();
			}
			if (identity.expiresAt !== undefined && identity.expiresAt <= Date.now()) {
				throw new Error(localize('cloudSandbox.identityExpiredDuringSealing', "The sandbox identity token expired while preparing authentication. Try connecting again."));
			}
			return { ...sealed, environmentId, resource, expiresAt: identity.expiresAt };
		} finally {
			source.cancel();
			store.dispose();
		}
	}

	private async _getIdentityTokenContext(accountKey: string, token: CancellationToken, forceRefresh: boolean): Promise<{ readonly identity: ICloudSandboxIdentityToken; readonly state: IIdentityTokenState }> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const lifetime = this._lifetime.token;
		const authentication = await raceCancellationError(raceCancellationError(this._resolveAuthentication(), lifetime), token);
		if (lifetime.isCancellationRequested || token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!authentication?.session.accessToken) {
			this._state.clear();
			throw new CloudSandboxAuthenticationRequiredError();
		}
		const session = authentication.session;
		if (accountKey !== authentication.accountKey) {
			if (this._state.value?.accountKey === accountKey) {
				this._state.clear();
			}
			throw new CancellationError();
		}

		let state = this._state.value;
		if (!state || state.accountKey !== accountKey || state.session.id !== session.id || state.session.accessToken !== session.accessToken) {
			const current: IIdentityTokenState = {
				accountKey,
				session: { ...session },
				dispose: () => {
					current.cached = undefined;
					current.pending?.promise.cancel();
				},
			};
			this._state.value = state = current;
		}
		if (!forceRefresh && state.cached?.expiresAt !== undefined && state.cached.expiresAt > Date.now() + IDENTITY_TOKEN_REFRESH_LEAD_MS) {
			return { identity: state.cached, state };
		}
		state.cached = undefined;
		const current = state;
		current.pending ??= {
			promise: createCancelablePromise(async requestToken => {
				const identity = await this._mintIdentityToken(current, requestToken);
				if (requestToken.isCancellationRequested || this._state.value !== current) {
					throw new CancellationError();
				}
				current.cached = identity.expiresAt === undefined ? undefined : identity;
				return identity;
			}),
			waiters: 0,
		};
		const pending = current.pending;
		pending.waiters++;
		try {
			const identity = await raceCancellationError(pending.promise, token);
			if (token.isCancellationRequested || lifetime.isCancellationRequested || this._state.value !== current) {
				throw new CancellationError();
			}
			return { identity, state: current };
		} finally {
			if (--pending.waiters === 0 && current.pending === pending) {
				current.pending = undefined;
				pending.promise.cancel();
			}
		}
	}

	/** Discard credentials and cancel pending work without resetting per-account rate limits. */
	clear(): void {
		this._lifetime.dispose(true);
		this._lifetime = new CancellationTokenSource();
		this._state.clear();
	}

	private async _mintIdentityToken(state: IIdentityTokenState, token: CancellationToken): Promise<ICloudSandboxIdentityToken> {
		for (const [account, limit] of this._rateLimits) {
			if (limit.retryAt <= Date.now()) {
				this._rateLimits.delete(account);
			}
		}
		let waited = 0;
		for (let attempt = 0; ; attempt++) {
			const limit = this._rateLimits.get(state.accountKey);
			if (limit) {
				const delay = Math.max(0, limit.retryAt - Date.now());
				if (waited + delay > RATE_LIMIT_WAIT_BUDGET_MS) {
					throw new CloudSandboxRequestError(limit.error.statusCode, limit.error.message, delay / 1000);
				}
				await timeout(delay, token);
				waited += delay;
			}
			const started = Date.now();
			let response: ICloudSandboxIdentityTokenResponse | null | undefined;
			try {
				response = await this._requestToken(state.session, token);
			} catch (error) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (error instanceof CloudSandboxRequestError && (error.statusCode === 429 || (error.statusCode === 403 && error.retryAfterSeconds !== undefined))) {
					this._rateLimits.set(state.accountKey, {
						retryAt: Date.now() + rateLimitDelay(error.retryAfterSeconds, attempt),
						error,
					});
					if (attempt < RATE_LIMIT_MAX_RETRIES) {
						continue;
					}
				}
				throw error;
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._rateLimits.delete(state.accountKey);
			return parseIdentityToken(response, started);
		}
	}
}

function parseIdentityToken(response: ICloudSandboxIdentityTokenResponse | null | undefined, requestedAt: number): ICloudSandboxIdentityToken {
	if (!isObject(response) || typeof response.token !== 'string' || !response.token.trim()
		|| (response.expires_at !== undefined && typeof response.expires_at !== 'string')
		|| (response.expires_in !== undefined && (typeof response.expires_in !== 'number' || !Number.isSafeInteger(response.expires_in) || response.expires_in <= 0))) {
		throw new Error(localize('cloudSandbox.invalidIdentityToken', "The sandbox identity-token response is invalid."));
	}
	const absoluteExpiry = response.expires_at === undefined ? undefined : Date.parse(response.expires_at);
	const relativeExpiry = response.expires_in === undefined ? undefined : requestedAt + response.expires_in * 1000;
	const expiresAt = absoluteExpiry === undefined ? relativeExpiry
		: relativeExpiry === undefined ? absoluteExpiry : Math.min(absoluteExpiry, relativeExpiry);
	if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) {
		throw new Error(localize('cloudSandbox.invalidIdentityTokenExpiry', "The sandbox identity token has an invalid or expired lifetime."));
	}
	return { token: response.token, expiresAt };
}
