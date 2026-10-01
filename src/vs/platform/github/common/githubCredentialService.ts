/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubAccountHandle, GitHubRequestTimeoutError, IGitHubEndpointProvider, IGitHubTokenProvider } from './githubTypes.js';
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

const credentialResolutionTimeout = 5 * 60_000;

/** Bounds credential selection and resolution, including providers that do not honor cancellation. */
export async function withGitHubCredentialDeadline<T>(signal: AbortSignal, task: (signal: AbortSignal, deadline: number) => Promise<T>, scheduler: IGitHubScheduler = systemGitHubScheduler): Promise<T> {
	const controller = new AbortController();
	const combinedSignal = AbortSignal.any([signal, controller.signal]);
	const deadline = scheduler.now() + credentialResolutionTimeout;
	const checkDeadline = () => {
		combinedSignal.throwIfAborted();
		if (deadline <= scheduler.now()) {
			throw new GitHubRequestTimeoutError();
		}
	};
	checkDeadline();
	const timer = scheduler.schedule(() => controller.abort(new GitHubRequestTimeoutError()), credentialResolutionTimeout);
	try {
		const result = await waitForCredential(task(combinedSignal, deadline), combinedSignal);
		checkDeadline();
		return result;
	} catch (error) {
		checkDeadline();
		throw error;
	} finally {
		timer.dispose();
	}
}

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

	static createBackoff(scheduler: IGitHubScheduler = systemGitHubScheduler, logService?: ILogService): GitHubBackoffGate {
		return new GitHubBackoffGate('GitHub identity resolution', defaultBackoffPolicy, scheduler, logService);
	}

	private readonly _onDidInvalidate = this._register(new Emitter<GitHubCredentialInvalidation>());
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private readonly _backoff: GitHubBackoffGate;
	private _current: ICredentialGeneration | undefined;
	private _lastCredential: GitHubCredential | undefined;
	private _generation = 0;
	private readonly _lifetime = new AbortController();
	private readonly _identity = generateUuid();

	constructor(
		private readonly _scheduler: IGitHubScheduler = systemGitHubScheduler,
		policy: GitHubBackoffPolicy = defaultBackoffPolicy,
		private readonly _transport: IGitHubTransport,
		private readonly _tokenProvider: IGitHubTokenProvider,
		private readonly _endpointProvider: IGitHubEndpointProvider,
		private readonly _logService?: ILogService,
		private readonly _bootstrapQuotaAccount?: GitHubAccountHandle,
		backoff?: GitHubBackoffGate,
	) {
		super();
		this._backoff = backoff ?? this._register(new GitHubBackoffGate('GitHub identity resolution', policy, this._scheduler, _logService));
		if (this._tokenProvider.onDidChangeToken) {
			this._register(this._tokenProvider.onDidChangeToken(() => this._invalidateCurrent('replacement')));
		}
		this._register(this._endpointProvider.onDidChange(() => this._invalidateCurrent('endpoint')));
	}

	getCredential(signal: AbortSignal): Promise<GitHubCredential> {
		return this._withDeadline(signal, async (signal, deadline) => {
			const token = await this._tokenProvider.getToken(signal);
			this._throwIfExpired(signal, deadline);
			if (!token) {
				this._logService?.debug('[GitHubCredentialService] Token provider returned no credential');
				throw new GitHubRequestError('GitHub authentication is required', 'authentication');
			}
			return this._resolve(token, signal, deadline);
		});
	}

	resolveCredential(token: string, signal: AbortSignal): Promise<GitHubCredential> {
		return this._withDeadline(signal, async (signal, deadline) => {
			const current = await this._tokenProvider.getToken(signal);
			this._throwIfExpired(signal, deadline);
			if (current !== token) {
				this._logService?.debug('[GitHubCredentialService] Rejected credential resolution for a non-current token');
				throw new GitHubRequestError('GitHub authentication is required', 'authentication');
			}
			return this._resolve(token, signal, deadline);
		});
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
		this._lifetime.abort(new GitHubRequestError('GitHub credential service was disposed', 'unknown'));
		this._invalidateCurrent('shutdown');
		super.dispose();
	}

	private _withDeadline(signal: AbortSignal, task: (signal: AbortSignal, deadline: number) => Promise<GitHubCredential>): Promise<GitHubCredential> {
		return withGitHubCredentialDeadline(AbortSignal.any([signal, this._lifetime.signal]), task, this._scheduler);
	}

	private _throwIfExpired(signal: AbortSignal, deadline: number): void {
		signal.throwIfAborted();
		if (deadline <= this._scheduler.now()) {
			throw new GitHubRequestTimeoutError();
		}
	}

	private async _resolve(token: string, signal: AbortSignal, deadline: number): Promise<GitHubCredential> {
		this._throwIfExpired(signal, deadline);
		if (this._current?.token !== token) {
			this._preserveBootstrapCooldown();
		}
		let waitedForCooldown = false;
		while (this._current?.token !== token && this._bootstrapQuotaAccount && this._transport.rateLimits.getDelay(this._bootstrapQuotaAccount, 'core') > 0) {
			waitedForCooldown = true;
			await this._transport.rateLimits.wait(this._bootstrapQuotaAccount, 'core', signal);
			this._throwIfExpired(signal, deadline);
		}
		const waitedForBackoff = await this._backoff.wait(this._backoffKey(token, this._currentHost()), signal);
		if (waitedForCooldown || waitedForBackoff) {
			// The wait is long enough for the credential to have been replaced,
			// and resolving the superseded one would abort the request the
			// replacement is already making.
			const currentToken = await this._tokenProvider.getToken(signal);
			this._throwIfExpired(signal, deadline);
			if (currentToken !== token) {
				this._logService?.debug('[GitHubCredentialService] Abandoning a credential that was replaced while backing off');
				throw new GitHubRequestError('GitHub authentication is required', 'authentication');
			}
		}
		this._throwIfExpired(signal, deadline);
		if (!this._current || this._current.token !== token) {
			const previousCredential = this._lastCredential;
			this._invalidateCurrent('replacement');
			const generation = ++this._generation;
			const controller = new AbortController();
			const apiBaseUri = this._endpointProvider.getApiBaseUri();
			const host = new URL(apiBaseUri).host.toLowerCase();
			const bootstrapAccount: GitHubAccountHandle = { host, accountId: `bootstrap:${this._identity}:${generation}` };
			if (this._bootstrapQuotaAccount) {
				this._transport.rateLimits.preserveCooldown(bootstrapAccount, 'core', this._transport.rateLimits.getDelay(this._bootstrapQuotaAccount, 'core'));
			}
			this._logService?.debug(`[GitHubCredentialService] Resolving account identity for ${host} (generation ${generation})`);
			const current: ICredentialGeneration = {
				token,
				generation,
				host,
				controller,
				promise: this._resolveIdentity(token, generation, bootstrapAccount, apiBaseUri, controller.signal)
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
							const cooldown = this._transport.rateLimits.getDelay(bootstrapAccount, 'core');
							if (this._bootstrapQuotaAccount) {
								this._transport.rateLimits.preserveCooldown(this._bootstrapQuotaAccount, 'core', cooldown);
							}
							this._backoff.fail(this._backoffKey(token, host), cooldown);
						}
						this._logService?.debug(`[GitHubCredentialService] Account identity resolution failed for ${host} (generation ${generation}, ${credentialErrorKind(error)})`);
						throw error;
					})
					.finally(() => {
						// Retain server delays in the credential gate before discarding the transient bootstrap identity.
						this._transport.invalidateAccount(bootstrapAccount);
						this._transport.rateLimits.clearAccount(bootstrapAccount);
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

	private async _resolveIdentity(token: string, generation: number, bootstrapAccount: GitHubAccountHandle, apiBaseUri: string, signal: AbortSignal): Promise<GitHubCredential> {
		let response;
		try {
			response = await this._transport.rest<IGitHubUserResponse>(bootstrapAccount, token, {
				caller: 'github.credentials',
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
		}
		const id = response.data?.id;
		if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
			throw new GitHubRequestError('GitHub credential could not establish a stable account identity', 'malformedResponse');
		}

		return {
			account: { host: bootstrapAccount.host, accountId: String(id) },
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
		this._preserveBootstrapCooldown();
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
		this._transport.invalidateAccount({ host: current.host, accountId: `bootstrap:${this._identity}:${current.generation}` });
		this._onDidInvalidate.fire({ credential: current.credential, reason });
		if (reason === 'endpoint' || reason === 'shutdown') {
			this._lastCredential = undefined;
		}
	}

	private _preserveBootstrapCooldown(): void {
		const credential = this._current?.credential ?? this._lastCredential;
		if (this._bootstrapQuotaAccount && credential
			&& credential.account.host.toLowerCase() === this._bootstrapQuotaAccount.host.toLowerCase()) {
			this._transport.rateLimits.preserveCooldown(this._bootstrapQuotaAccount, 'core', this._transport.rateLimits.getDelay(credential.account, 'core'));
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

function waitForCredential<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		if (signal.aborted) {
			onAbort();
		} else {
			signal.addEventListener('abort', onAbort, { once: true });
		}
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
