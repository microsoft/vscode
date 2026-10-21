/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { abortOnDispose, CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubAccountClient } from '../../../../platform/github/common/account/account.js';
import { deriveGitHubEndpoints } from '../../../../platform/github/common/githubEndpoints.js';
import { GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { IWorkbenchGitHubService } from '../../../../workbench/services/github/common/githubService.js';

/** Retains the selected account's client and notifies models when its grant changes. */
export class GitHubApiClient extends Disposable {
	private readonly _clientStore = this._register(new DisposableStore());
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private _signal = abortOnDispose(this._clientStore);
	private _client: Promise<IGitHubAccountClient> | undefined;
	private _generation = 0;

	get generation(): number {
		return this._generation;
	}

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();
		let accountKey = this.accountKey();
		this._register(_defaultAccountService.onDidChangeDefaultAccount(() => {
			const next = this.accountKey();
			if (next !== accountKey) {
				accountKey = next;
				this.reset();
			}
		}));
	}

	get enterpriseHost(): string | undefined {
		const provider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		const url = provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined;
		return provider.enterprise && url ? deriveGitHubEndpoints(url).enterpriseHost : undefined;
	}

	async authenticate(scopes: readonly string[], token: CancellationToken): Promise<void> {
		try {
			await this.withClient(async () => { }, token);
			return;
		} catch (error) {
			if (!(error instanceof GitHubRequestError) || error.kind !== 'authentication') {
				throw error;
			}
		}
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const account = await raceCancellationError(this._defaultAccountService.signIn({ additionalScopes: scopes }), token);
			if (!account) {
				throw new GitHubRequestError(localize('githubSignInRequired', "Sign in to GitHub with repository access."), 'authentication');
			}
		} catch (error) {
			if (error === 'Cancelled' || error instanceof Error && error.message === 'Cancelled') {
				throw new CancellationError();
			}
			throw error;
		}
		await this.withClient(async () => { }, token);
	}

	async withClient<T>(task: (client: IGitHubAccountClient, signal: AbortSignal) => Promise<T>, token: CancellationToken = CancellationToken.None): Promise<T> {
		const lifetime = new DisposableStore();
		const signal = AbortSignal.any([this._signal, CancellationToken.toAbortSignal(token, lifetime)]);
		try {
			signal.throwIfAborted();
			const pending = this._client ??= this.acquireClient(this._signal);
			const client = await raceCancellationError(pending, CancellationToken.fromAbortSignal(signal, lifetime));
			const result = await task(client, signal);
			signal.throwIfAborted();
			return result;
		} catch (error) {
			if (signal.aborted) {
				throw new CancellationError();
			}
			throw error;
		} finally {
			lifetime.dispose();
		}
	}

	private async acquireClient(signal: AbortSignal): Promise<IGitHubAccountClient> {
		try {
			const client = await this._gitHubService.acquireDefaultAccountApiClient(signal);
			if (signal.aborted) {
				client.dispose();
				throw new CancellationError();
			}
			this._clientStore.add(client);
			this._clientStore.add(client.onDidInvalidate(() => this.reset()));
			return client;
		} catch (error) {
			if (signal === this._signal) {
				this._client = undefined;
			}
			throw error;
		}
	}

	private reset(): void {
		this._client = undefined;
		this._generation++;
		this._clientStore.clear();
		this._signal = abortOnDispose(this._clientStore);
		this._onDidChange.fire();
	}

	private accountKey(): string {
		const account = this._defaultAccountService.currentDefaultAccount;
		const provider = account?.authenticationProvider ?? this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		return JSON.stringify([provider.id, account?.sessionId, provider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined]);
	}
}
