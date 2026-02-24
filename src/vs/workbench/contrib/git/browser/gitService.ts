/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IGitService, IGitExtensionDelegate, GitRef, GitRefQuery, IGitRepository, GitRepositoryState } from '../common/gitService.js';
import { ISettableObservable, observableValueOpts } from '../../../../base/common/observable.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { AutoOpenBarrier } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class GitService extends Disposable implements IGitService {
	declare readonly _serviceBrand: undefined;

	private _delegate: IGitExtensionDelegate | undefined;
	private _delegateBarrier = new AutoOpenBarrier(10_000);

	get repositories(): Iterable<IGitRepository> {
		return this._delegate?.repositories ?? [];
	}

	constructor(@ILogService private readonly logService: ILogService) {
		super();
	}

	setDelegate(delegate: IGitExtensionDelegate): IDisposable {
		// The delegate can only be set once, since the vscode.git
		// extension can only run in one extension host process per
		// window.
		if (this._delegate) {
			this.logService.error('[GitService][setDelegate] GitExtension delegate is already set.');
			throw new BugIndicatingError('GitExtension delegate is already set.');
		}

		this._delegate = delegate;
		this._delegateBarrier.open();

		return toDisposable(() => {
			this._delegate = undefined;
		});
	}

	async openRepository(uri: URI): Promise<IGitRepository | undefined> {
		// We need to wait for the delegate to be set before we can open a repository.
		// At the moment we are waiting for 10 seconds before we automatically open the
		// barrier.
		await this._delegateBarrier.wait();

		if (!this._delegate) {
			this.logService.warn('[GitService][openRepository] GitExtension delegate is not set after 10 seconds. Cannot open repository.');
			return undefined;
		}

		return this._delegate.openRepository(uri);
	}
}

export class GitRepository extends Disposable implements IGitRepository {
	readonly rootUri: URI;

	readonly state: ISettableObservable<GitRepositoryState>;
	updateState(state: GitRepositoryState): void {
		this.state.set(state, undefined);
	}

	constructor(
		rootUri: URI,
		initialState: GitRepositoryState,
		private readonly delegate: IGitExtensionDelegate
	) {
		super();

		this.rootUri = rootUri;
		this.state = observableValueOpts({ owner: this, equalsFn: structuralEquals }, initialState);
	}

	async getRefs(query: GitRefQuery, token?: CancellationToken): Promise<GitRef[]> {
		return this.delegate.getRefs(this.rootUri, query, token);
	}
}
