/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { GitHubAccountHandle } from '../../common/githubService.js';
import { IAgentHostAuthenticationService } from '../agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { GitHubRequestError, IGitHubTransport } from './githubTransport.js';

export interface GitHubCredential {
	readonly account: GitHubAccountHandle;
	readonly token: string;
	readonly generation: number;
	readonly signal: AbortSignal;
}

export interface GitHubCredentialInvalidation {
	readonly credential?: GitHubCredential;
	readonly reason: 'replacement' | 'authentication' | 'endpoint' | 'shutdown';
}

export const IGitHubCredentialService = createDecorator<IGitHubCredentialService>('gitHubCredentialService');

export interface IGitHubCredentialService {
	readonly _serviceBrand: undefined;
	readonly onDidInvalidate: Event<GitHubCredentialInvalidation>;
	getCredential(signal: AbortSignal): Promise<GitHubCredential>;
	resolveCredential(token: string, signal: AbortSignal): Promise<GitHubCredential>;
	handleRequestError(credential: GitHubCredential, error: unknown): void;
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

export class GitHubCredentialService extends Disposable implements IGitHubCredentialService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidInvalidate = this._register(new Emitter<GitHubCredentialInvalidation>());
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private _current: ICredentialGeneration | undefined;

	constructor(
		@IGitHubTransport private readonly _transport: IGitHubTransport,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _endpointService: IAgentHostGitHubEndpointService,
	) {
		super();
		this._register(this._authenticationService.onDidChangeToken(event => {
			if (event.request.resource !== this._endpointService.getRepoResource().resource) {
				return;
			}
			this._invalidateCurrent(event.kind === 'accepted' ? 'replacement' : 'authentication');
		}));
		this._register(this._endpointService.onDidChange(() => this._invalidateCurrent('endpoint')));
	}

	getCredential(signal: AbortSignal): Promise<GitHubCredential> {
		const request = this._endpointService.getRepoResource();
		const token = this._authenticationService.getAuthTokenWithGeneration({
			resource: request.resource,
			scopes: request.scopes_supported,
		});
		if (!token) {
			return Promise.reject(new GitHubRequestError('GitHub authentication is required', 'authentication'));
		}
		return this._resolve(token.token, token.generation, signal);
	}

	resolveCredential(token: string, signal: AbortSignal): Promise<GitHubCredential> {
		const resource = this._endpointService.getRepoResource();
		const current = this._authenticationService.getAuthTokenWithGeneration({
			resource: resource.resource,
			scopes: resource.scopes_supported,
		});
		if (!current || current.token !== token) {
			return Promise.reject(new GitHubRequestError('GitHub authentication is required', 'authentication'));
		}
		return this._resolve(token, current.generation, signal);
	}

	handleRequestError(credential: GitHubCredential, error: unknown): void {
		if (!(error instanceof GitHubRequestError) || error.kind !== 'authentication') {
			return;
		}
		const resource = this._endpointService.getRepoResource();
		this._authenticationService.invalidateAuthToken({
			resource: resource.resource,
			scopes: resource.scopes_supported,
		}, credential.generation);
		this._invalidateCurrent('authentication');
	}

	override dispose(): void {
		this._invalidateCurrent('shutdown');
		super.dispose();
	}

	private _resolve(token: string, generation: number, signal: AbortSignal): Promise<GitHubCredential> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		if (!this._current || this._current.generation !== generation || this._current.token !== token) {
			this._invalidateCurrent('replacement');
			const controller = new AbortController();
			const apiBaseUri = this._endpointService.getApiBaseUri();
			const host = new URL(apiBaseUri).host.toLowerCase();
			let current: ICredentialGeneration;
			const promise = this._resolveIdentity(token, generation, host, apiBaseUri, controller.signal).then(credential => {
				current.credential = credential;
				return credential;
			});
			current = {
				token,
				generation,
				host,
				controller,
				promise,
			};
			this._current = current;
		}
		return waitForCredential(this._current.promise, signal);
	}

	private async _resolveIdentity(token: string, generation: number, host: string, apiBaseUri: string, signal: AbortSignal): Promise<GitHubCredential> {
		const fingerprint = createHash('sha256').update(token).digest('hex');
		const bootstrapAccount: GitHubAccountHandle = { host, accountId: `bootstrap:${fingerprint}` };
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
				const resource = this._endpointService.getRepoResource();
				this._authenticationService.invalidateAuthToken({
					resource: resource.resource,
					scopes: resource.scopes_supported,
				}, generation);
			}
			throw error;
		}
		this._transport.invalidateAccount(bootstrapAccount);
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
		const current = this._current;
		if (!current) {
			return;
		}
		this._current = undefined;
		current.controller.abort(new GitHubRequestError('GitHub credential generation was invalidated', 'authentication'));
		if (current.credential) {
			this._transport.invalidateAccount(current.credential.account);
		}
		const fingerprint = createHash('sha256').update(current.token).digest('hex');
		this._transport.invalidateAccount({ host: current.host, accountId: `bootstrap:${fingerprint}` });
		this._onDidInvalidate.fire({ credential: current.credential, reason });
	}
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
