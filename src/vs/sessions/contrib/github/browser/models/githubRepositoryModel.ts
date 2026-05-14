/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
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

/**
 * Reactive model for a GitHub repository. Wraps fetcher data
 * in observables and supports on-demand refresh.
 */
export class GitHubRepositoryModel extends Disposable {

	private _repositoryEtag: string | undefined = undefined;
	private readonly _repository = observableValue<IGitHubRepository | undefined>(this, undefined);
	readonly repository: IObservable<IGitHubRepository | undefined> = this._repository;

	private _refreshPromise: Promise<void> | undefined = undefined;

	constructor(
		readonly owner: string,
		readonly repo: string,
		private readonly _fetcher: GitHubRepositoryFetcher,
		private readonly _logService: ILogService,
	) {
		super();
	}

	refresh(): Promise<void> {
		if (!this._refreshPromise) {
			this._refreshPromise = this._refresh()
				.finally(() => {
					this._refreshPromise = undefined;
				});
		}

		return this._refreshPromise;
	}

	private async _refresh(): Promise<void> {
		try {
			const response = await this._fetcher.getRepository(this.owner, this.repo, this._repositoryEtag);
			if (response.statusCode === 200 && response.data) {
				this._repositoryEtag = response.etag;
				this._repository.set(response.data, undefined);
			}
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to refresh repository ${this.owner}/${this.repo}:`, err);
		}
	}
}
