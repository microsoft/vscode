/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js'; import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { waitForState } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { GitRepository } from '../../contrib/git/browser/gitService.js';
import { IGitExtensionDelegate, IGitService, GitRef, GitRefQuery, GitRefType, GitRepositoryState, GitBranch, GitChange, GitDiffChange, IGitRepository } from '../../contrib/git/common/gitService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostGitExtensionShape, GitDiffChangeDto, GitRefTypeDto, GitRepositoryStateDto, MainContext, MainThreadGitExtensionShape } from '../common/extHost.protocol.js';

function toGitRefType(type: GitRefTypeDto): GitRefType {
	switch (type) {
		case GitRefTypeDto.Head: return GitRefType.Head;
		case GitRefTypeDto.RemoteHead: return GitRefType.RemoteHead;
		case GitRefTypeDto.Tag: return GitRefType.Tag;
		default: throw new Error(`Unknown GitRefType: ${type}`);
	}
}

function toGitDiffChange(dto: GitDiffChangeDto): GitDiffChange {
	return {
		uri: URI.revive(dto.uri),
		originalUri: dto.originalUri ? URI.revive(dto.originalUri) : undefined,
		modifiedUri: dto.modifiedUri ? URI.revive(dto.modifiedUri) : undefined,
		insertions: dto.insertions,
		deletions: dto.deletions,
	};
}

function toGitRepositoryState(dto: GitRepositoryStateDto | undefined): GitRepositoryState {
	return {
		HEAD: dto?.HEAD ? {
			type: toGitRefType(dto.HEAD.type),
			name: dto.HEAD.name,
			commit: dto.HEAD.commit,
			remote: dto.HEAD.remote,
			upstream: dto.HEAD.upstream,
			ahead: dto.HEAD.ahead,
			behind: dto.HEAD.behind,
		} satisfies GitBranch : undefined,
		remotes: dto?.remotes ?? [],
		mergeChanges: dto?.mergeChanges?.map(c => ({
			uri: URI.revive(c.uri),
			originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
			modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
		} satisfies GitChange)) ?? [],
		indexChanges: dto?.indexChanges?.map(c => ({
			uri: URI.revive(c.uri),
			originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
			modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
		} satisfies GitChange)) ?? [],
		workingTreeChanges: dto?.workingTreeChanges?.map(c => ({
			uri: URI.revive(c.uri),
			originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
			modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
		} satisfies GitChange)) ?? [],
		untrackedChanges: dto?.untrackedChanges?.map(c => ({
			uri: URI.revive(c.uri),
			originalUri: c.originalUri ? URI.revive(c.originalUri) : undefined,
			modifiedUri: c.modifiedUri ? URI.revive(c.modifiedUri) : undefined,
		} satisfies GitChange)) ?? [],
	};
}

@extHostNamedCustomer(MainContext.MainThreadGitExtension)
export class MainThreadGitExtensionService extends Disposable implements MainThreadGitExtensionShape, IGitExtensionDelegate {
	private readonly _proxy: ExtHostGitExtensionShape;
	private readonly _openRepositorySequencer = new Sequencer();

	private _repositoryHandles = new ResourceMap<number>();
	private _repositories = new Map<number, IGitRepository>();

	get repositories(): Iterable<IGitRepository> {
		return this._repositories.values();
	}

	constructor(
		extHostContext: IExtHostContext,
		@IGitService private readonly gitService: IGitService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostGitExtension);
		this._initializeDelegate();
	}

	private async _initializeDelegate(): Promise<void> {
		// Check whether the vscode.git extension is available in the extension host
		// process before setting the delegate. The delegate should only be set once,
		// for the extension host process that runs the vscode.git extension
		const isExtensionAvailable = await this._proxy.$isGitExtensionAvailable();

		if (isExtensionAvailable && !this._store.isDisposed) {
			this._register(this.gitService.setDelegate(this));
		}
	}

	async openRepository(uri: URI): Promise<IGitRepository | undefined> {
		return this._openRepositorySequencer.queue(async () => {
			// Open the repository
			const result = await this._proxy.$openRepository(uri);
			if (!result) {
				return undefined;
			}

			const repositoryRootUri = URI.revive(result.rootUri);

			// Create a new repository and store it in the maps
			const state = toGitRepositoryState(result.state);
			const repository = new GitRepository(repositoryRootUri, state, this);

			this._repositories.set(result.handle, repository);
			this._repositoryHandles.set(repositoryRootUri, result.handle);

			// Wait for the repository to be fully initialized before returning it
			await waitForState(repository.state, state => state.HEAD !== undefined);

			return repository;
		});
	}

	async getRefs(root: URI, query: GitRefQuery, token?: CancellationToken): Promise<GitRef[]> {
		const handle = this._repositoryHandles.get(root);
		if (handle === undefined) {
			return [];
		}

		const result = await this._proxy.$getRefs(handle, query, token);

		if (token?.isCancellationRequested) {
			return [];
		}

		return result.map(ref => ({
			...ref,
			type: toGitRefType(ref.type)
		} satisfies GitRef));
	}

	async diffBetweenWithStats(root: URI, ref1: string, ref2: string, path?: string): Promise<GitDiffChange[]> {
		const handle = this._repositoryHandles.get(root);
		if (handle === undefined) {
			return [];
		}

		const result = await this._proxy.$diffBetweenWithStats(handle, ref1, ref2, path);
		return result.map(toGitDiffChange);
	}

	async diffBetweenWithStats2(root: URI, ref: string, path?: string): Promise<GitDiffChange[]> {
		const handle = this._repositoryHandles.get(root);
		if (handle === undefined) {
			return [];
		}

		const result = await this._proxy.$diffBetweenWithStats2(handle, ref, path);
		return result.map(toGitDiffChange);
	}

	async $onDidChangeRepository(handle: number): Promise<void> {
		const repository = this._repositories.get(handle);
		if (!repository) {
			return;
		}

		const state = await this._proxy.$getRepositoryState(handle);
		if (!state) {
			return;
		}

		// Update the repository state
		repository.updateState(toGitRepositoryState(state));
	}
}
