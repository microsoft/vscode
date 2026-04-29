/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WeakCachedFunction } from '../../../../../base/common/cache.js';
import { Event } from '../../../../../base/common/event.js';
import { observableSignalFromEvent, IReader, IObservable, derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISCMRepository, ISCMService } from '../../../scm/common/scm.js';

export class ScmAdapter {
	private readonly _repos = new WeakCachedFunction((repo: ISCMRepository) => new ScmRepoAdapter(repo));

	private readonly _reposChangedSignal;

	constructor(
		@ISCMService private readonly _scmService: ISCMService
	) {
		this._reposChangedSignal = observableSignalFromEvent(this, Event.any(this._scmService.onDidAddRepository, this._scmService.onDidRemoveRepository));
	}

	public getRepo(uri: URI, reader: IReader | undefined): ScmRepoAdapter | undefined {
		this._reposChangedSignal.read(reader);
		const repo = this._scmService.getRepository(uri);
		if (!repo) {
			return undefined;
		}
		return this._repos.get(repo);
	}
}

export class ScmRepoAdapter {
	public readonly headBranchNameObs: IObservable<string | undefined> = derived(reader => this._repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader)?.name);
	public readonly headCommitHashObs: IObservable<string | undefined> = derived(reader => this._repo.provider.historyProvider.read(reader)?.historyItemRef.read(reader)?.revision);

	constructor(
		private readonly _repo: ISCMRepository
	) {
	}

	async isIgnored(uri: URI): Promise<boolean> {
		return false;
	}
}
