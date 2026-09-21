/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IGitService, IGitExtensionDelegate, GitRef, GitRefQuery, IGitRepository, GitRepositoryState, GitChange, GitDiffChange, IGitDiffOptions } from '../common/gitService.js';
import { ISettableObservable, observableValueOpts } from '../../../../base/common/observable.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { isEqual } from '../../../../base/common/resources.js';
import { AutoOpenBarrier } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class GitService extends Disposable implements IGitService {
	declare readonly _serviceBrand: undefined;

	private _delegate: IGitExtensionDelegate | undefined;
	private _delegateBarrier = new AutoOpenBarrier(10_000);
	private readonly _onDidOpenRepository = this._register(new Emitter<IGitRepository>());
	readonly onDidOpenRepository = this._onDidOpenRepository.event;

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

		const repository = await this._delegate.openRepository(uri);
		if (repository) {
			this._onDidOpenRepository.fire(repository);
		}
		return repository;
	}
}

/**
 * `structuralEquals` bails out on any value whose prototype is not `Object.prototype`, so a
 * state holding revived `URI` instances always compares unequal. Without this, every
 * `updateState` on a repository with any change wakes all of its observers.
 */
function gitRepositoryStateEquals(a: GitRepositoryState, b: GitRepositoryState): boolean {
	const changesEqual = (left: readonly GitChange[], right: readonly GitChange[]) =>
		left.length === right.length && left.every((change, index) =>
			isEqual(change.uri, right[index].uri)
			&& isEqual(change.originalUri, right[index].originalUri)
			&& isEqual(change.modifiedUri, right[index].modifiedUri));
	return structuralEquals(a.HEAD, b.HEAD)
		&& structuralEquals(a.remotes, b.remotes)
		&& changesEqual(a.mergeChanges, b.mergeChanges)
		&& changesEqual(a.indexChanges, b.indexChanges)
		&& changesEqual(a.workingTreeChanges, b.workingTreeChanges)
		&& changesEqual(a.untrackedChanges, b.untrackedChanges);
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
		this.state = observableValueOpts({ owner: this, equalsFn: gitRepositoryStateEquals }, initialState);
	}

	async getRefs(query: GitRefQuery, token?: CancellationToken): Promise<GitRef[]> {
		return this.delegate.getRefs(this.rootUri, query, token);
	}

	async diffBetweenWithStats(ref1: string, ref2: string, path?: string): Promise<GitDiffChange[]> {
		return this.delegate.diffBetweenWithStats(this.rootUri, ref1, ref2, path);
	}

	async diffBetweenWithStats2(ref: string, path?: string, options?: IGitDiffOptions): Promise<GitDiffChange[]> {
		return this.delegate.diffBetweenWithStats2(this.rootUri, ref, path, options);
	}
}
