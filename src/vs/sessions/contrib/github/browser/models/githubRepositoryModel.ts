/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubRepository } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';
import { GitHubRepositoryFetcher } from '../fetchers/githubRepositoryFetcher.js';

const LOG_PREFIX = '[GitHubRepositoryModel]';

export class GitHubRepositoryModelReferenceCollection extends ReferenceCollection<GitHubRepositoryModel> {
	private readonly _fetcher: GitHubRepositoryFetcher;

	constructor(
		apiClient: GitHubApiClient,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._fetcher = new GitHubRepositoryFetcher(apiClient);
	}

	protected override createReferencedObject(key: string, owner: string, repo: string): GitHubRepositoryModel {
		this._logService.trace(`[GitHubRepositoryModelReferenceCollection][createReferencedObject] Creating repository model for ${key}`);
		return new GitHubRepositoryModel(owner, repo, this._fetcher, this._logService);
	}

	protected override destroyReferencedObject(key: string, object: GitHubRepositoryModel): void {
		this._logService.trace(`[GitHubRepositoryModelReferenceCollection][destroyReferencedObject] Disposing repository model for ${key}`);
		object.dispose();
	}
}

/** Repository metadata with coalesced, on-demand refresh. */
export class GitHubRepositoryModel extends Disposable {

	private readonly _token = cancelOnDispose(this._store);
	private readonly _repository = observableValue<IGitHubRepository | undefined>(this, undefined);
	readonly repository: IObservable<IGitHubRepository | undefined> = this._repository;

	private _refreshPromise: Promise<void> | undefined;

	constructor(
		readonly owner: string,
		readonly repo: string,
		private readonly _fetcher: GitHubRepositoryFetcher,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(_fetcher.client.onDidChange(() => {
			const shouldRefresh = this._refreshPromise !== undefined || this._repository.get() !== undefined;
			this._refreshPromise = undefined;
			this._repository.set(undefined, undefined);
			if (shouldRefresh) {
				void this.refresh();
			}
		}));
	}

	refresh(): Promise<void> {
		const pending = this._refreshPromise ??= this._refresh().finally(() => {
			if (this._refreshPromise === pending) {
				this._refreshPromise = undefined;
			}
		});
		return pending;
	}

	private async _refresh(): Promise<void> {
		const generation = this._fetcher.client.generation;
		try {
			const repository = await this._fetcher.getRepository(this.owner, this.repo, this._token);
			if (!this._store.isDisposed && generation === this._fetcher.client.generation && !structuralEquals(repository, this._repository.get())) {
				this._repository.set(repository, undefined);
			}
		} catch (err) {
			if (!isCancellationError(err)) {
				this._logService.error(`${LOG_PREFIX} Failed to refresh repository ${this.owner}/${this.repo}:`, err);
			}
		}
	}
}
