/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubAccountHandle, IGitHubEndpointProvider, IGitHubTokenProvider } from './githubTypes.js';
import { GitHubBackoffGate, GitHubBackoffPolicy } from './githubBackoff.js';
import { IGitHubScheduler, systemGitHubScheduler } from './githubScheduler.js';
import { GitHubRequestError, IGitHubTransport } from './githubTransport.js';

export interface GitHubCredential {
	readonly account: GitHubAccountHandle;
	readonly token: string;
	readonly generation: number;
	readonly signal: AbortSignal;
}

export interface GitHubCredentialInvalidation {
	readonly credential?: GitHubCredential;
	readonly reason: 'replacement' | 'account' | 'authentication' | 'endpoint' | 'shutdown';
}

export interface IGitHubCredentials {
	readonly onDidInvalidate: Event<GitHubCredentialInvalidation>;
	getCredential(signal: AbortSignal): Promise<GitHubCredential>;
	resolveCredential(token: string, signal: AbortSignal): Promise<GitHubCredential>;
	handleRequestError(credential: GitHubCredential, error: unknown): void;
}

/**
 * How long identity resolution waits before retrying a credential GitHub has
 * already refused or failed to answer for. Without it every subscriber that
 * asks for a credential turns an authentication outage into a request storm,
 * because each refusal invalidates the generation the next request rebuilds.
 */
const defaultBackoffPolicy: GitHubBackoffPolicy = {
	immediateRetries: 1,
	base: 5_000,
	maximum: 120_000,
	decay: 300_000,
	jitter: 2_000,
};

interface ICredentialGeneration {
	readonly token: string;
	readonly generation: number;
	readonly host: string;
	readonly controller: AbortController;
	readonly promise: Promise<GitHubCredential>;
	credential?: GitHubCredential;
}

interface IGitHubUserResponse {
	readonly id?: unknown;
}

export class GitHubCredentialService extends Disposable implements IGitHubCredentials {

	private readonly _onDidInvalidate = this._register(new Emitter<GitHubCredentialInvalidation>());
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private readonly _backoff: GitHubBackoffGate;
	private _current: ICredentialGeneration | undefined;
	private _lastCredential: GitHubCredential | undefined;
	private _generation = 0;

	constructor(
		scheduler: IGitHubScheduler | undefined,
		policy: GitHubBackoffPolicy = defaultBackoffPolicy,
		private readonly _transport: IGitHubTransport,
		private readonly _tokenProvider: IGitHubTokenProvider,
		private readonly _endpointProvider: IGitHubEndpointProvider,
		private readonly _logService?: ILogService,
	) {
		super();
		this._backoff = this._register(new GitHubBackoffGate('GitHub identity resolution', policy, scheduler ?? systemGitHubScheduler, _logService));
		if (this._tokenProvider.onDidChangeToken) {
			this._register(this._tokenProvider.onDidChangeToken(() => this._invalidateCurrent('replacement')));
		}
		this._register(this._endpointProvider.onDidChange(() => this._invalidateCurrent('endpoint')));
	}

	async getCredential(signal: AbortSignal): Promise<GitHubCredential> {
		const token = await this._tokenProvider.getToken(signal);
		if (!token) {
			this._logService?.debug('[GitHubCredentialService] Token provider returned no credential');
			throw new GitHubRequestError('GitHub authentication is required', 'authentication');
		}
		return this._resolve(token, signal);
	}

	async resolveCredential(token: string, signal: AbortSignal): Promise<GitHubCredential> {
		const current = await this._tokenProvider.getToken(signal);
		if (current !== token) {
			this._logService?.debug('[GitHubCredentialService] Rejected credential resolution for a non-current token');
			throw new GitHubRequestError('GitHub authentication is required', 'authentication');
		}
		return this._resolve(token, signal);
	}

	handleRequestError(credential: GitHubCredential, error: unknown): void {
		if (!(error instanceof GitHubRequestError) || error.kind !== 'authentication') {
			return;
		}
		if (credential.signal.aborted
			|| this._current?.generation !== credential.generation
			|| this._current.token !== credential.token) {
			this._logService?.trace(`[GitHubCredentialService] Ignoring authentication error for stale generation ${credential.generation}`);
			return;
		}
		this._logService?.debug(`[GitHubCredentialService] Invalidating generation ${credential.generation} after an authentication error`);
		this._invalidateCurrent('authentication');
		this._tokenProvider.invalidateToken?.(credential.token);
	}

	override dispose(): void {
		this._invalidateCurrent('shutdown');
		super.dispose();
	}

	private async _resolve(token: string, signal: AbortSignal): Promise<GitHubCredential> {
		if (signal.aborted) {
			throw signal.reason;
		}
		if (await this._backoff.wait(this._backoffKey(token, this._currentHost()), signal)) {
			// The wait is long enough for the credential to have been replaced,
			// and resolving the superseded one would abort the request the
			// replacement is already making.
			if (await this._tokenProvider.getToken(signal) !== token) {
				this._logService?.debug('[GitHubCredentialService] Abandoning a credential that was replaced while backing off');
				throw new GitHubRequestError('GitHub authentication is required', 'authentication');
			}
		}
		if (signal.aborted) {
			throw signal.reason;
		}
		if (!this._current || this._current.token !== token) {
			const previousCredential = this._lastCredential;
			this._invalidateCurrent('replacement');
			const generation = ++this._generation;
			const controller = new AbortController();
			const apiBaseUri = this._endpointProvider.getApiBaseUri();
			const host = new URL(apiBaseUri).host.toLowerCase();
			this._logService?.debug(`[GitHubCredentialService] Resolving account identity for ${host} (generation ${generation})`);
			const current: ICredentialGeneration = {
				token,
				generation,
				host,
				controller,
				promise: this._resolveIdentity(token, generation, host, apiBaseUri, controller.signal)
					.then(credential => {
						current.credential = credential;
						// Deliberately does not clear the failure record: a working
						// `/user` only proves identity resolution recovered, and when
						// GitHub is refusing this credential for real requests every
						// round would otherwise reset the delay to zero and hammer
						// the outage. Recovery is instead signalled by a new token,
						// a new host, or the record decaying while nothing fails.
						this._logService?.debug(`[GitHubCredentialService] Resolved account identity for ${host} (generation ${generation})`);
						if (previousCredential && !sameAccount(previousCredential.account, credential.account)) {
							this._logService?.debug(`[GitHubCredentialService] Account changed on ${host} at generation ${generation}`);
							this._onDidInvalidate.fire({ credential: previousCredential, reason: 'account' });
						}
						this._lastCredential = credential;
						return credential;
					})
					.catch(error => {
						if (this._current === current) {
							this._current = undefined;
						}
						// An invalidated generation was not refused by GitHub, so
						// it must not count towards the delay the next one serves.
						if (!controller.signal.aborted) {
							this._backoff.fail(this._backoffKey(token, host));
						}
						this._logService?.debug(`[GitHubCredentialService] Account identity resolution failed for ${host} (generation ${generation}, ${credentialErrorKind(error)})`);
						throw error;
					}),
			};
			this._current = current;
		}
		return waitForCredential(this._current.promise, signal);
	}

	/**
	 * Names the credential the gate holds back. Two different tokens, or the
	 * same token against two hosts, have not each been refused.
	 */
	private _backoffKey(token: string, host: string): string {
		return `${host}\x00${token}`;
	}

	private _currentHost(): string {
		return new URL(this._endpointProvider.getApiBaseUri()).host.toLowerCase();
	}

	private async _resolveIdentity(token: string, generation: number, host: string, apiBaseUri: string, signal: AbortSignal): Promise<GitHubCredential> {
		const bootstrapAccount: GitHubAccountHandle = { host, accountId: `bootstrap:${generation}` };
		let response;
		try {
			response = await this._transport.rest<IGitHubUserResponse>(bootstrapAccount, token, {
				method: 'GET',
				url: `${apiBaseUri}/user`,
				etag: false,
				unconditional: true,
				priority: 'interactive',
			}, signal);
		} catch (error) {
			if (error instanceof GitHubRequestError && error.kind === 'authentication') {
				this._tokenProvider.invalidateToken?.(token);
			}
			throw error;
		} finally {
			this._transport.invalidateAccount(bootstrapAccount);
		}
		const id = response.data?.id;
		if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
			throw new GitHubRequestError('GitHub credential could not establish a stable account identity', 'malformedResponse');
		}

		return {
			account: { host, accountId: String(id) },
			token,
			generation,
			signal,
		};
	}

	private _invalidateCurrent(reason: GitHubCredentialInvalidation['reason']): void {
		// The gate keys its record by host, so a credential held back on the
		// previous endpoint must not keep the new one waiting.
		if (reason === 'endpoint') {
			this._backoff.reset();
		}
		const current = this._current;
		if (!current) {
			if (reason === 'replacement' && this._lastCredential) {
				this._logService?.debug(`[GitHubCredentialService] Invalidating retained credential (${reason})`);
				this._onDidInvalidate.fire({ credential: this._lastCredential, reason });
			}
			if (reason === 'endpoint' || reason === 'shutdown') {
				this._lastCredential = undefined;
			}
			return;
		}
		this._logService?.debug(`[GitHubCredentialService] Invalidating generation ${current.generation} on ${current.host} (${reason})`);
		this._current = undefined;
		// A refused credential is counted before subscribers are told, because
		// they answer the invalidation by asking for a credential again right
		// away and would otherwise reissue the request GitHub just refused.
		if (reason === 'authentication') {
			this._backoff.fail(this._backoffKey(current.token, current.host));
		}
		current.controller.abort(new GitHubRequestError('GitHub credential generation was invalidated', 'authentication'));
		if (current.credential) {
			this._transport.invalidateAccount(current.credential.account);
		}
		this._transport.invalidateAccount({ host: current.host, accountId: `bootstrap:${current.generation}` });
		this._onDidInvalidate.fire({ credential: current.credential, reason });
		if (reason === 'endpoint' || reason === 'shutdown') {
			this._lastCredential = undefined;
		}
	}
}

function credentialErrorKind(error: unknown): string {
	if (error instanceof GitHubRequestError) {
		return `${error.kind}${error.statusCode === undefined ? '' : `:${error.statusCode}`}`;
	}
	return error instanceof Error ? error.name : typeof error;
}

function sameAccount(left: GitHubAccountHandle, right: GitHubAccountHandle): boolean {
	return left.host.toLowerCase() === right.host.toLowerCase() && left.accountId === right.accountId;
}

function waitForCredential(promise: Promise<GitHubCredential>, signal: AbortSignal): Promise<GitHubCredential> {
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		void promise.then(
			credential => {
				signal.removeEventListener('abort', onAbort);
				resolve(credential);
			},
			error => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			},
		);
	});
}
