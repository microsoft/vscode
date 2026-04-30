/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubRepository } from '../../common/types.js';
import { GitHubRepositoryFetcher } from '../fetchers/githubRepositoryFetcher.js';

const LOG_PREFIX = '[GitHubRepositoryModel]';

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
