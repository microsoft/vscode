/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vi } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { IObservable } from '../../../../util/vs/base/common/observableInternal';
import { observableValue } from '../../../../util/vs/base/common/observableInternal/observables/observableValue';
import { URI } from '../../../../util/vs/base/common/uri';
import { IGitService, RepoContext } from '../../../git/common/gitService';
import { Branch, Change, Commit, CommitOptions, CommitShortStat, DiffChange, LogOptions, Ref, RefQuery, RepositoryAccessDetails, RepositoryState } from '../../../git/vscode/git';

/**
 * A configurable mock implementation of IGitService for testing.
 * Tracks call counts and allows setting return values for methods.
 */
export class MockGitService implements IGitService {
	declare readonly _serviceBrand: undefined;

	private _repositoryFetchUrls: Pick<RepoContext, 'rootUri' | 'remoteFetchUrls'> | undefined;
	public getRepositoryFetchUrlsCallCount = 0;

	private readonly _onDidCloseRepository = new Emitter<RepoContext>();
	public readonly onDidCloseRepository: Event<RepoContext> = this._onDidCloseRepository.event;

	public readonly onDidOpenRepository: Event<RepoContext> = Event.None;
	public readonly onDidFinishInitialization: Event<void> = Event.None;
	public readonly activeRepository: IObservable<RepoContext | undefined> = observableValue('test-git-activeRepo', undefined);
	public repositories: RepoContext[] = [];
	public isInitialized = true;

	/**
	 * Sets the return value for getRepositoryFetchUrls.
	 */
	setRepositoryFetchUrls(value: Pick<RepoContext, 'rootUri' | 'remoteFetchUrls'> | undefined): void {
		this._repositoryFetchUrls = value;
	}

	getRecentRepositories(): Iterable<RepositoryAccessDetails> {
		return [];
	}

	initRepository(_uri: URI): Promise<RepoContext | undefined> {
		return Promise.resolve(undefined);
	}

	getRepositoryFetchUrls = vi.fn().mockImplementation((): Promise<Pick<RepoContext, 'rootUri' | 'remoteFetchUrls'> | undefined> => {
		this.getRepositoryFetchUrlsCallCount++;
		return Promise.resolve(this._repositoryFetchUrls);
	});

	/**
	 * Fires the onDidCloseRepository event with the given repository context.
	 */
	fireDidCloseRepository(repo: RepoContext): void {
		this._onDidCloseRepository.fire(repo);
	}

	getRepository(_uri: URI, _forceOpen?: boolean): Promise<RepoContext | undefined> {
		return Promise.resolve(undefined);
	}

	getRepositoryState(uri: URI, forceOpen?: boolean): Promise<RepositoryState | undefined> {
		return Promise.resolve(undefined);
	}

	initialize(): Promise<void> {
		return Promise.resolve();
	}

	add(_uri: URI, _paths: string[]): Promise<void> {
		return Promise.resolve();
	}

	restore(_uri: URI, _paths: string[], _options?: { staged?: boolean; ref?: string }): Promise<void> {
		return Promise.resolve();
	}

	log(_uri: URI, _options?: LogOptions): Promise<Commit[] | undefined> {
		return Promise.resolve(undefined);
	}

	diffBetween(_uri: URI, _ref1: string, _ref2: string): Promise<Change[] | undefined> {
		return Promise.resolve(undefined);
	}

	diffBetweenWithStats(_uri: URI, _ref1: string, _ref2: string, _path?: string): Promise<DiffChange[] | undefined> {
		return Promise.resolve(undefined);
	}

	diffBetweenWithStats2(uri: URI, ref: string, path?: string): Promise<DiffChange[] | undefined> {
		return Promise.resolve(undefined);
	}

	diffBetweenPatch(uri: URI, ref1: string, ref2: string, path?: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	diffWith(_uri: URI, _ref: string): Promise<Change[] | undefined> {
		return Promise.resolve(undefined);
	}

	diffIndexWithHEADShortStats(_uri: URI): Promise<CommitShortStat | undefined> {
		return Promise.resolve(undefined);
	}

	fetch(_uri: URI, _remote?: string, _ref?: string, _depth?: number): Promise<void> {
		return Promise.resolve();
	}

	getMergeBase(_uri: URI, _ref1: string, _ref2: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	createWorktree(_uri: URI, _options?: { path?: string; commitish?: string; branch?: string }): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	deleteWorktree(_uri: URI, _path: string, _options?: { force?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	migrateChanges(_uri: URI, _sourceRepositoryUri: URI, _options?: { confirmation?: boolean; deleteFromSource?: boolean; untracked?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	applyPatch(uri: URI, patch: string): Promise<void> {
		return Promise.resolve();
	}

	checkout(_uri: URI, _treeish: string): Promise<void> {
		return Promise.resolve();
	}

	merge(_uri: URI, _ref: string): Promise<void> {
		return Promise.resolve();
	}

	push(_uri: URI): Promise<void> {
		return Promise.resolve();
	}

	rebase(_uri: URI, _branch: string): Promise<void> {
		return Promise.resolve();
	}

	commit(uri: URI, message: string | undefined, opts?: CommitOptions): Promise<void> {
		return Promise.resolve();
	}

	getBranch(_uri: URI, _name: string): Promise<Branch | undefined> {
		return Promise.resolve(undefined);
	}

	getBranchBase(_uri: URI, _name: string): Promise<Branch | undefined> {
		return Promise.resolve(undefined);
	}

	getRefs(uri: URI, query: RefQuery, cancellationToken?: CancellationToken): Promise<Ref[]> {
		return Promise.resolve([]);
	}

	isBranchProtected(_uri: URI, _branch?: string | Branch): Promise<boolean | undefined> {
		return Promise.resolve(undefined);
	}

	generateRandomBranchName(_uri: URI): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	exec(uri: URI, args: string[], env?: Record<string, string>): Promise<string> {
		return Promise.resolve('');
	}

	dispose(): void {
		this._onDidCloseRepository.dispose();
	}
}
