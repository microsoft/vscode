/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { Model } from '../model';
import { Repository as BaseRepository, Resource } from '../repository';
import { InputBox, Git, API, Repository, Remote, RepositoryState, Branch, ForcePushMode, Ref, Submodule, Commit, Change, RepositoryUIState, Status, LogOptions, APIState, CommitOptions, RefType, CredentialsProvider, BranchQuery, PushErrorHandler, PublishEvent, FetchOptions, RemoteSourceProvider, RemoteSourcePublisher, PostCommitCommandsProvider, RefQuery, BranchProtectionProvider, InitOptions, SourceControlHistoryItemDetailsProvider, GitErrorCodes, CloneOptions, CommitShortStat } from './git';
import { Event, SourceControlInputBox, Uri, SourceControl, Disposable, commands, CancellationToken } from 'vscode';
import { combinedDisposable, filterEvent, mapEvent } from '../util';
import { toGitUri } from '../uri';
import { GitExtensionImpl } from './extension';
import { GitBaseApi } from '../git-base';
import { PickRemoteSourceOptions } from '../typings/git-base';
import { OperationKind, OperationResult } from '../operation';
import { CloneManager } from '../cloneManager';

class ApiInputBox implements InputBox {
	#inputBox: SourceControlInputBox;

	constructor(inputBox: SourceControlInputBox) { this.#inputBox = inputBox; }

	set value(value: string) { this.#inputBox.value = value; }
	get value(): string { return this.#inputBox.value; }
}

export class ApiChange implements Change {
	#resource: Resource;
	constructor(resource: Resource) { this.#resource = resource; }

	get uri(): Uri { return this.#resource.resourceUri; }
	get originalUri(): Uri { return this.#resource.original; }
	get renameUri(): Uri | undefined { return this.#resource.renameResourceUri; }
	get status(): Status { return this.#resource.type; }
}

export class ApiRepositoryState implements RepositoryState {
	#repository: BaseRepository;
	readonly onDidChange: Event<void>;

	constructor(repository: BaseRepository) {
		this.#repository = repository;
		this.onDidChange = this.#repository.onDidRunGitStatus;
	}

	get HEAD(): Branch | undefined { return this.#repository.HEAD; }
	/**
	 * @deprecated Use ApiRepository.getRefs() instead.
	 */
	get refs(): Ref[] { console.warn('Deprecated. Use ApiRepository.getRefs() instead.'); return []; }
	get remotes(): Remote[] { return [...this.#repository.remotes]; }
	get submodules(): Submodule[] { return [...this.#repository.submodules]; }
	get rebaseCommit(): Commit | undefined { return this.#repository.rebaseCommit; }

	get mergeChanges(): Change[] { return this.#repository.mergeGroup.resourceStates.map(r => new ApiChange(r)); }
	get indexChanges(): Change[] { return this.#repository.indexGroup.resourceStates.map(r => new ApiChange(r)); }
	get workingTreeChanges(): Change[] { return this.#repository.workingTreeGroup.resourceStates.map(r => new ApiChange(r)); }
	get untrackedChanges(): Change[] { return this.#repository.untrackedGroup.resourceStates.map(r => new ApiChange(r)); }
}

export class ApiRepositoryUIState implements RepositoryUIState {
	#sourceControl: SourceControl;
	readonly onDidChange: Event<void>;

	constructor(sourceControl: SourceControl) {
		this.#sourceControl = sourceControl;
		this.onDidChange = mapEvent<boolean, void>(this.#sourceControl.onDidChangeSelection, () => null);
	}

	get selected(): boolean { return this.#sourceControl.selected; }
}

export class ApiRepository implements Repository {
	#repository: BaseRepository;

	readonly rootUri: Uri;
	readonly inputBox: InputBox;
	readonly state: RepositoryState;
	readonly ui: RepositoryUIState;

	readonly onDidCommit: Event<void>;
	readonly onDidCheckout: Event<void>;

	constructor(repository: BaseRepository) {
		this.#repository = repository;

		this.rootUri = Uri.file(this.#repository.root);
		this.inputBox = new ApiInputBox(this.#repository.inputBox);
		this.state = new ApiRepositoryState(this.#repository);
		this.ui = new ApiRepositoryUIState(this.#repository.sourceControl);

		this.onDidCommit = mapEvent<OperationResult, void>(
			filterEvent(this.#repository.onDidRunOperation, e => e.operation.kind === OperationKind.Commit), () => null);
		this.onDidCheckout = mapEvent<OperationResult, void>(
			filterEvent(this.#repository.onDidRunOperation, e => e.operation.kind === OperationKind.Checkout || e.operation.kind === OperationKind.CheckoutTracking), () => null);
	}

	apply(patch: string, reverse?: boolean): Promise<void> {
		return this.#repository.apply(patch, reverse);
	}

	getConfigs(): Promise<{ key: string; value: string }[]> {
		return this.#repository.getConfigs();
	}

	getConfig(key: string): Promise<string> {
		return this.#repository.getConfig(key);
	}

	setConfig(key: string, value: string): Promise<string> {
		return this.#repository.setConfig(key, value);
	}

	unsetConfig(key: string): Promise<string> {
		return this.#repository.unsetConfig(key);
	}

	getGlobalConfig(key: string): Promise<string> {
		return this.#repository.getGlobalConfig(key);
	}

	getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }> {
		return this.#repository.getObjectDetails(treeish, path);
	}

	detectObjectType(object: string): Promise<{ mimetype: string; encoding?: string }> {
		return this.#repository.detectObjectType(object);
	}

	buffer(ref: string, filePath: string): Promise<Buffer> {
		return this.#repository.buffer(ref, filePath);
	}

	show(ref: string, path: string): Promise<string> {
		return this.#repository.show(ref, path);
	}

	getCommit(ref: string): Promise<Commit> {
		return this.#repository.getCommit(ref);
	}

	add(paths: string[]) {
		return this.#repository.add(paths.map(p => Uri.file(p)));
	}

	revert(paths: string[]) {
		return this.#repository.revert(paths.map(p => Uri.file(p)));
	}

	clean(paths: string[]) {
		return this.#repository.clean(paths.map(p => Uri.file(p)));
	}

	diff(cached?: boolean) {
		return this.#repository.diff(cached);
	}

	diffWithHEAD(): Promise<Change[]>;
	diffWithHEAD(path: string): Promise<string>;
	diffWithHEAD(path?: string): Promise<string | Change[]> {
		return this.#repository.diffWithHEAD(path);
	}

	diffWithHEADShortStats(path?: string): Promise<CommitShortStat> {
		return this.#repository.diffWithHEADShortStats(path);
	}

	diffWith(ref: string): Promise<Change[]>;
	diffWith(ref: string, path: string): Promise<string>;
	diffWith(ref: string, path?: string): Promise<string | Change[]> {
		return this.#repository.diffWith(ref, path);
	}

	diffIndexWithHEAD(): Promise<Change[]>;
	diffIndexWithHEAD(path: string): Promise<string>;
	diffIndexWithHEAD(path?: string): Promise<string | Change[]> {
		return this.#repository.diffIndexWithHEAD(path);
	}

	diffIndexWithHEADShortStats(path?: string): Promise<CommitShortStat> {
		return this.#repository.diffIndexWithHEADShortStats(path);
	}

	diffIndexWith(ref: string): Promise<Change[]>;
	diffIndexWith(ref: string, path: string): Promise<string>;
	diffIndexWith(ref: string, path?: string): Promise<string | Change[]> {
		return this.#repository.diffIndexWith(ref, path);
	}

	diffBlobs(object1: string, object2: string): Promise<string> {
		return this.#repository.diffBlobs(object1, object2);
	}

	diffBetween(ref1: string, ref2: string): Promise<Change[]>;
	diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
	diffBetween(ref1: string, ref2: string, path?: string): Promise<string | Change[]> {
		return this.#repository.diffBetween(ref1, ref2, path);
	}

	hashObject(data: string): Promise<string> {
		return this.#repository.hashObject(data);
	}

	createBranch(name: string, checkout: boolean, ref?: string | undefined): Promise<void> {
		return this.#repository.branch(name, checkout, ref);
	}

	deleteBranch(name: string, force?: boolean): Promise<void> {
		return this.#repository.deleteBranch(name, force);
	}

	getBranch(name: string): Promise<Branch> {
		return this.#repository.getBranch(name);
	}

	getBranches(query: BranchQuery, cancellationToken?: CancellationToken): Promise<Ref[]> {
		return this.#repository.getBranches(query, cancellationToken);
	}

	getBranchBase(name: string): Promise<Branch | undefined> {
		return this.#repository.getBranchBase(name);
	}

	setBranchUpstream(name: string, upstream: string): Promise<void> {
		return this.#repository.setBranchUpstream(name, upstream);
	}

	getRefs(query: RefQuery, cancellationToken?: CancellationToken): Promise<Ref[]> {
		return this.#repository.getRefs(query, cancellationToken);
	}

	checkIgnore(paths: string[]): Promise<Set<string>> {
		return this.#repository.checkIgnore(paths);
	}

	getMergeBase(ref1: string, ref2: string): Promise<string | undefined> {
		return this.#repository.getMergeBase(ref1, ref2);
	}

	tag(name: string, message: string, ref?: string | undefined): Promise<void> {
		return this.#repository.tag({ name, message, ref });
	}

	deleteTag(name: string): Promise<void> {
		return this.#repository.deleteTag(name);
	}

	status(): Promise<void> {
		return this.#repository.status();
	}

	checkout(treeish: string): Promise<void> {
		return this.#repository.checkout(treeish);
	}

	addRemote(name: string, url: string): Promise<void> {
		return this.#repository.addRemote(name, url);
	}

	removeRemote(name: string): Promise<void> {
		return this.#repository.removeRemote(name);
	}

	renameRemote(name: string, newName: string): Promise<void> {
		return this.#repository.renameRemote(name, newName);
	}

	fetch(arg0?: FetchOptions | string | undefined,
		ref?: string | undefined,
		depth?: number | undefined,
		prune?: boolean | undefined
	): Promise<void> {
		if (arg0 !== undefined && typeof arg0 !== 'string') {
			return this.#repository.fetch(arg0);
		}

		return this.#repository.fetch({ remote: arg0, ref, depth, prune });
	}

	pull(unshallow?: boolean): Promise<void> {
		return this.#repository.pull(undefined, unshallow);
	}

	push(remoteName?: string, branchName?: string, setUpstream: boolean = false, force?: ForcePushMode): Promise<void> {
		return this.#repository.pushTo(remoteName, branchName, setUpstream, force);
	}

	blame(path: string): Promise<string> {
		return this.#repository.blame(path);
	}

	log(options?: LogOptions): Promise<Commit[]> {
		return this.#repository.log(options);
	}

	commit(message: string, opts?: CommitOptions): Promise<void> {
		return this.#repository.commit(message, { ...opts, postCommitCommand: null });
	}

	merge(ref: string): Promise<void> {
		return this.#repository.merge(ref);
	}

	mergeAbort(): Promise<void> {
		return this.#repository.mergeAbort();
	}

	applyStash(index?: number): Promise<void> {
		return this.#repository.applyStash(index);
	}

	popStash(index?: number): Promise<void> {
		return this.#repository.popStash(index);
	}

	dropStash(index?: number): Promise<void> {
		return this.#repository.dropStash(index);
	}

	createWorktree(options?: { path?: string; commitish?: string; branch?: string }): Promise<string> {
		return this.#repository.createWorktree(options);
	}

	deleteWorktree(path: string, options?: { force?: boolean }): Promise<void> {
		return this.#repository.deleteWorktree(path, options);
	}

	migrateChanges(sourceRepositoryPath: string, options?: { confirmation?: boolean; deleteFromSource?: boolean; untracked?: boolean }): Promise<void> {
		return this.#repository.migrateChanges(sourceRepositoryPath, options);
	}
}

export class ApiGit implements Git {
	#model: Model;

	private _env: { [key: string]: string } | undefined;

	constructor(model: Model) { this.#model = model; }

	get path(): string { return this.#model.git.path; }

	get env(): { [key: string]: string } {
		if (this._env === undefined) {
			this._env = Object.freeze(this.#model.git.env);
		}

		return this._env;
	}
}

export class ApiImpl implements API {
	#model: Model;
	#cloneManager: CloneManager;
	readonly git: ApiGit;

	constructor(privates: { model: Model; cloneManager: CloneManager }) {
		this.#model = privates.model;
		this.#cloneManager = privates.cloneManager;
		this.git = new ApiGit(this.#model);
	}

	get state(): APIState {
		return this.#model.state;
	}

	get onDidChangeState(): Event<APIState> {
		return this.#model.onDidChangeState;
	}

	get onDidPublish(): Event<PublishEvent> {
		return this.#model.onDidPublish;
	}

	get onDidOpenRepository(): Event<Repository> {
		return mapEvent(this.#model.onDidOpenRepository, r => new ApiRepository(r));
	}

	get onDidCloseRepository(): Event<Repository> {
		return mapEvent(this.#model.onDidCloseRepository, r => new ApiRepository(r));
	}

	get repositories(): Repository[] {
		return this.#model.repositories.map(r => new ApiRepository(r));
	}

	toGitUri(uri: Uri, ref: string): Uri {
		return toGitUri(uri, ref);
	}

	getRepository(uri: Uri): Repository | null {
		const result = this.#model.getRepository(uri);
		return result ? new ApiRepository(result) : null;
	}

	async getRepositoryRoot(uri: Uri): Promise<Uri | null> {
		const repository = this.getRepository(uri);
		if (repository) {
			return repository.rootUri;
		}

		try {
			const root = await this.#model.git.getRepositoryRoot(uri.fsPath);
			return Uri.file(root);
		} catch (err) {
			if (
				err.gitErrorCode === GitErrorCodes.NotAGitRepository ||
				err.gitErrorCode === GitErrorCodes.NotASafeGitRepository
			) {
				return null;
			}

			throw err;
		}
	}

	async getRepositoryWorkspace(uri: Uri): Promise<Uri[] | null> {
		const workspaces = this.#model.repositoryCache.get(uri.toString());
		return workspaces ? workspaces.map(r => Uri.file(r.workspacePath)) : null;
	}

	async init(root: Uri, options?: InitOptions): Promise<Repository | null> {
		const path = root.fsPath;
		await this.#model.git.init(path, options);
		await this.#model.openRepository(path);
		return this.getRepository(root) || null;
	}

	async clone(uri: Uri, options?: CloneOptions): Promise<Uri | null> {
		const parentPath = options?.parentPath?.fsPath;
		const result = await this.#cloneManager.clone(uri.toString(), { parentPath, recursive: options?.recursive, ref: options?.ref, postCloneAction: options?.postCloneAction });
		return result ? Uri.file(result) : null;
	}

	async openRepository(root: Uri): Promise<Repository | null> {
		if (root.scheme !== 'file') {
			return null;
		}

		await this.#model.openRepository(root.fsPath);
		return this.getRepository(root) || null;
	}

	registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable {
		const disposables: Disposable[] = [];

		if (provider.publishRepository) {
			disposables.push(this.#model.registerRemoteSourcePublisher(provider as RemoteSourcePublisher));
		}
		disposables.push(GitBaseApi.getAPI().registerRemoteSourceProvider(provider));

		return combinedDisposable(disposables);
	}

	registerRemoteSourcePublisher(publisher: RemoteSourcePublisher): Disposable {
		return this.#model.registerRemoteSourcePublisher(publisher);
	}

	registerCredentialsProvider(provider: CredentialsProvider): Disposable {
		return this.#model.registerCredentialsProvider(provider);
	}

	registerPostCommitCommandsProvider(provider: PostCommitCommandsProvider): Disposable {
		return this.#model.registerPostCommitCommandsProvider(provider);
	}

	registerPushErrorHandler(handler: PushErrorHandler): Disposable {
		return this.#model.registerPushErrorHandler(handler);
	}

	registerSourceControlHistoryItemDetailsProvider(provider: SourceControlHistoryItemDetailsProvider): Disposable {
		return this.#model.registerSourceControlHistoryItemDetailsProvider(provider);
	}

	registerBranchProtectionProvider(root: Uri, provider: BranchProtectionProvider): Disposable {
		return this.#model.registerBranchProtectionProvider(root, provider);
	}
}

function getRefType(type: RefType): string {
	switch (type) {
		case RefType.Head: return 'Head';
		case RefType.RemoteHead: return 'RemoteHead';
		case RefType.Tag: return 'Tag';
	}

	return 'unknown';
}

function getStatus(status: Status): string {
	switch (status) {
		case Status.INDEX_MODIFIED: return 'INDEX_MODIFIED';
		case Status.INDEX_ADDED: return 'INDEX_ADDED';
		case Status.INDEX_DELETED: return 'INDEX_DELETED';
		case Status.INDEX_RENAMED: return 'INDEX_RENAMED';
		case Status.INDEX_COPIED: return 'INDEX_COPIED';
		case Status.MODIFIED: return 'MODIFIED';
		case Status.DELETED: return 'DELETED';
		case Status.UNTRACKED: return 'UNTRACKED';
		case Status.IGNORED: return 'IGNORED';
		case Status.INTENT_TO_ADD: return 'INTENT_TO_ADD';
		case Status.INTENT_TO_RENAME: return 'INTENT_TO_RENAME';
		case Status.TYPE_CHANGED: return 'TYPE_CHANGED';
		case Status.ADDED_BY_US: return 'ADDED_BY_US';
		case Status.ADDED_BY_THEM: return 'ADDED_BY_THEM';
		case Status.DELETED_BY_US: return 'DELETED_BY_US';
		case Status.DELETED_BY_THEM: return 'DELETED_BY_THEM';
		case Status.BOTH_ADDED: return 'BOTH_ADDED';
		case Status.BOTH_DELETED: return 'BOTH_DELETED';
		case Status.BOTH_MODIFIED: return 'BOTH_MODIFIED';
	}

	return 'UNKNOWN';
}

export function registerAPICommands(extension: GitExtensionImpl): Disposable {
	const disposables: Disposable[] = [];

	disposables.push(commands.registerCommand('git.api.getRepositories', () => {
		const api = extension.getAPI(1);
		return api.repositories.map(r => r.rootUri.toString());
	}));

	disposables.push(commands.registerCommand('git.api.getRepositoryState', (uri: string) => {
		const api = extension.getAPI(1);
		const repository = api.getRepository(Uri.parse(uri));

		if (!repository) {
			return null;
		}

		const state = repository.state;

		const ref = (ref: Ref | undefined) => (ref && { ...ref, type: getRefType(ref.type) });
		const change = (change: Change) => ({
			uri: change.uri.toString(),
			originalUri: change.originalUri.toString(),
			renameUri: change.renameUri?.toString(),
			status: getStatus(change.status)
		});

		return {
			HEAD: ref(state.HEAD),
			refs: state.refs.map(ref),
			remotes: state.remotes,
			submodules: state.submodules,
			rebaseCommit: state.rebaseCommit,
			mergeChanges: state.mergeChanges.map(change),
			indexChanges: state.indexChanges.map(change),
			workingTreeChanges: state.workingTreeChanges.map(change)
		};
	}));

	disposables.push(commands.registerCommand('git.api.getRemoteSources', (opts?: PickRemoteSourceOptions) => {
		return commands.executeCommand('git-base.api.getRemoteSources', opts);
	}));

	return Disposable.from(...disposables);
}
