/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, Command, EventEmitter, Event, SourceControlResourceState, SourceControlResourceDecorations, Disposable, window, workspace } from 'vscode';
import { Git, Repository, Ref, Branch, Remote, PushOptions, Commit, GitErrorCodes, GitError } from './git';
import { anyEvent, eventToPromise, filterEvent, mapEvent, EmptyDisposable, combinedDisposable, dispose } from './util';
import { memoize, throttle, debounce } from './decorators';
import { watch } from './watch';
import * as path from 'path';
import * as nls from 'vscode-nls';

const timeout = (millis: number) => new Promise(c => setTimeout(c, millis));

const localize = nls.loadMessageBundle();
const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');

function getIconUri(iconName: string, theme: string): Uri {
	return Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
}

export enum State {
	Uninitialized,
	Idle,
	NotAGitRepository
}

export enum Status {
	INDEX_MODIFIED,
	INDEX_ADDED,
	INDEX_DELETED,
	INDEX_RENAMED,
	INDEX_COPIED,

	MODIFIED,
	DELETED,
	UNTRACKED,
	IGNORED,

	ADDED_BY_US,
	ADDED_BY_THEM,
	DELETED_BY_US,
	DELETED_BY_THEM,
	BOTH_ADDED,
	BOTH_DELETED,
	BOTH_MODIFIED
}

export class Resource implements SourceControlResourceState {

	@memoize
	get resourceUri(): Uri {
		if (this.renameResourceUri && (this._type === Status.MODIFIED || this._type === Status.DELETED || this._type === Status.INDEX_RENAMED)) {
			return this.renameResourceUri;
		}

		return this._resourceUri;
	}

	@memoize
	get command(): Command {
		return {
			command: 'git.openResource',
			title: localize('open', "Open"),
			arguments: [this]
		};
	}

	get resourceGroup(): ResourceGroup { return this._resourceGroup; }
	get type(): Status { return this._type; }
	get original(): Uri { return this._resourceUri; }
	get renameResourceUri(): Uri | undefined { return this._renameResourceUri; }

	private static Icons = {
		light: {
			Modified: getIconUri('status-modified', 'light'),
			Added: getIconUri('status-added', 'light'),
			Deleted: getIconUri('status-deleted', 'light'),
			Renamed: getIconUri('status-renamed', 'light'),
			Copied: getIconUri('status-copied', 'light'),
			Untracked: getIconUri('status-untracked', 'light'),
			Ignored: getIconUri('status-ignored', 'light'),
			Conflict: getIconUri('status-conflict', 'light'),
		},
		dark: {
			Modified: getIconUri('status-modified', 'dark'),
			Added: getIconUri('status-added', 'dark'),
			Deleted: getIconUri('status-deleted', 'dark'),
			Renamed: getIconUri('status-renamed', 'dark'),
			Copied: getIconUri('status-copied', 'dark'),
			Untracked: getIconUri('status-untracked', 'dark'),
			Ignored: getIconUri('status-ignored', 'dark'),
			Conflict: getIconUri('status-conflict', 'dark')
		}
	};

	private getIconPath(theme: string): Uri | undefined {
		switch (this.type) {
			case Status.INDEX_MODIFIED: return Resource.Icons[theme].Modified;
			case Status.MODIFIED: return Resource.Icons[theme].Modified;
			case Status.INDEX_ADDED: return Resource.Icons[theme].Added;
			case Status.INDEX_DELETED: return Resource.Icons[theme].Deleted;
			case Status.DELETED: return Resource.Icons[theme].Deleted;
			case Status.INDEX_RENAMED: return Resource.Icons[theme].Renamed;
			case Status.INDEX_COPIED: return Resource.Icons[theme].Copied;
			case Status.UNTRACKED: return Resource.Icons[theme].Untracked;
			case Status.IGNORED: return Resource.Icons[theme].Ignored;
			case Status.BOTH_DELETED: return Resource.Icons[theme].Conflict;
			case Status.ADDED_BY_US: return Resource.Icons[theme].Conflict;
			case Status.DELETED_BY_THEM: return Resource.Icons[theme].Conflict;
			case Status.ADDED_BY_THEM: return Resource.Icons[theme].Conflict;
			case Status.DELETED_BY_US: return Resource.Icons[theme].Conflict;
			case Status.BOTH_ADDED: return Resource.Icons[theme].Conflict;
			case Status.BOTH_MODIFIED: return Resource.Icons[theme].Conflict;
			default: return void 0;
		}
	}

	private get strikeThrough(): boolean {
		switch (this.type) {
			case Status.DELETED:
			case Status.BOTH_DELETED:
			case Status.DELETED_BY_THEM:
			case Status.DELETED_BY_US:
				return true;
			default:
				return false;
		}
	}

	get decorations(): SourceControlResourceDecorations {
		const light = { iconPath: this.getIconPath('light') };
		const dark = { iconPath: this.getIconPath('dark') };

		return { strikeThrough: this.strikeThrough, light, dark };
	}

	constructor(
		private _resourceGroup: ResourceGroup,
		private _resourceUri: Uri,
		private _type: Status,
		private _renameResourceUri?: Uri
	) { }
}

export abstract class ResourceGroup {

	get id(): string { return this._id; }
	get contextKey(): string { return this._id; }
	get label(): string { return this._label; }
	get resources(): Resource[] { return this._resources; }

	constructor(private _id: string, private _label: string, private _resources: Resource[]) {

	}
}

export class MergeGroup extends ResourceGroup {

	static readonly ID = 'merge';

	constructor(resources: Resource[] = []) {
		super(MergeGroup.ID, localize('merge changes', "Merge Changes"), resources);
	}
}

export class IndexGroup extends ResourceGroup {

	static readonly ID = 'index';

	constructor(resources: Resource[] = []) {
		super(IndexGroup.ID, localize('staged changes', "Staged Changes"), resources);
	}
}

export class WorkingTreeGroup extends ResourceGroup {

	static readonly ID = 'workingTree';

	constructor(resources: Resource[] = []) {
		super(WorkingTreeGroup.ID, localize('changes', "Changes"), resources);
	}
}

export enum Operation {
	Status = 1 << 0,
	Add = 1 << 1,
	RevertFiles = 1 << 2,
	Commit = 1 << 3,
	Clean = 1 << 4,
	Branch = 1 << 5,
	Checkout = 1 << 6,
	Reset = 1 << 7,
	Fetch = 1 << 8,
	Pull = 1 << 9,
	Push = 1 << 10,
	Sync = 1 << 11,
	Init = 1 << 12,
	Show = 1 << 13,
	Stage = 1 << 14,
	GetCommitTemplate = 1 << 15
}

// function getOperationName(operation: Operation): string {
// 	switch (operation) {
// 		case Operation.Status: return 'Status';
// 		case Operation.Add: return 'Add';
// 		case Operation.RevertFiles: return 'RevertFiles';
// 		case Operation.Commit: return 'Commit';
// 		case Operation.Clean: return 'Clean';
// 		case Operation.Branch: return 'Branch';
// 		case Operation.Checkout: return 'Checkout';
// 		case Operation.Reset: return 'Reset';
// 		case Operation.Fetch: return 'Fetch';
// 		case Operation.Pull: return 'Pull';
// 		case Operation.Push: return 'Push';
// 		case Operation.Sync: return 'Sync';
// 		case Operation.Init: return 'Init';
// 		case Operation.Show: return 'Show';
// 		case Operation.Stage: return 'Stage';
// 		case Operation.GetCommitTemplate: return 'GetCommitTemplate';
// 		default: return 'unknown';
// 	}
// }

function isReadOnly(operation: Operation): boolean {
	switch (operation) {
		case Operation.Show:
		case Operation.GetCommitTemplate:
			return true;
		default:
			return false;
	}
}

function shouldShowProgress(operation: Operation): boolean {
	switch (operation) {
		case Operation.Fetch:
			return false;
		default:
			return true;
	}
}

export interface Operations {
	isIdle(): boolean;
	isRunning(operation: Operation): boolean;
}

class OperationsImpl implements Operations {

	constructor(private readonly operations: number = 0) {
		// noop
	}

	start(operation: Operation): OperationsImpl {
		return new OperationsImpl(this.operations | operation);
	}

	end(operation: Operation): OperationsImpl {
		return new OperationsImpl(this.operations & ~operation);
	}

	isRunning(operation: Operation): boolean {
		return (this.operations & operation) !== 0;
	}

	isIdle(): boolean {
		return this.operations === 0;
	}
}

export interface CommitOptions {
	all?: boolean;
	amend?: boolean;
	signoff?: boolean;
}

export class Model implements Disposable {

	private _onDidChangeRepository = new EventEmitter<Uri>();
	readonly onDidChangeRepository: Event<Uri> = this._onDidChangeRepository.event;

	private _onDidChangeState = new EventEmitter<State>();
	readonly onDidChangeState: Event<State> = this._onDidChangeState.event;

	private _onDidChangeResources = new EventEmitter<void>();
	readonly onDidChangeResources: Event<void> = this._onDidChangeResources.event;

	@memoize
	get onDidChange(): Event<void> {
		return anyEvent<any>(this.onDidChangeState, this.onDidChangeResources);
	}

	private _onRunOperation = new EventEmitter<Operation>();
	readonly onRunOperation: Event<Operation> = this._onRunOperation.event;

	private _onDidRunOperation = new EventEmitter<Operation>();
	readonly onDidRunOperation: Event<Operation> = this._onDidRunOperation.event;

	@memoize
	get onDidChangeOperations(): Event<void> {
		return anyEvent(this.onRunOperation as Event<any>, this.onDidRunOperation as Event<any>);
	}

	private _mergeGroup = new MergeGroup([]);
	get mergeGroup(): MergeGroup { return this._mergeGroup; }

	private _indexGroup = new IndexGroup([]);
	get indexGroup(): IndexGroup { return this._indexGroup; }

	private _workingTreeGroup = new WorkingTreeGroup([]);
	get workingTreeGroup(): WorkingTreeGroup { return this._workingTreeGroup; }

	private _HEAD: Branch | undefined;
	get HEAD(): Branch | undefined {
		return this._HEAD;
	}

	private _refs: Ref[] = [];
	get refs(): Ref[] {
		return this._refs;
	}

	private _remotes: Remote[] = [];
	get remotes(): Remote[] {
		return this._remotes;
	}

	private _operations = new OperationsImpl();
	get operations(): Operations { return this._operations; }

	private repository: Repository;

	private _state = State.Uninitialized;
	get state(): State { return this._state; }
	set state(state: State) {
		this._state = state;
		this._onDidChangeState.fire(state);

		this._HEAD = undefined;
		this._refs = [];
		this._remotes = [];
		this._mergeGroup = new MergeGroup();
		this._indexGroup = new IndexGroup();
		this._workingTreeGroup = new WorkingTreeGroup();
		this._onDidChangeResources.fire();
	}

	private onWorkspaceChange: Event<Uri>;
	private repositoryDisposable: Disposable = EmptyDisposable;
	private disposables: Disposable[] = [];

	constructor(
		private _git: Git,
		private workspaceRootPath: string
	) {
		const fsWatcher = workspace.createFileSystemWatcher('**');
		this.onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
		this.disposables.push(fsWatcher);

		this.status();
	}

	async whenIdle(): Promise<void> {
		while (!this.operations.isIdle()) {
			await eventToPromise(this.onDidRunOperation);
		}
	}

	@throttle
	async init(): Promise<void> {
		if (this.state !== State.NotAGitRepository) {
			return;
		}

		await this._git.init(this.workspaceRootPath);
		await this.status();
	}

	@throttle
	async status(): Promise<void> {
		await this.run(Operation.Status);
	}

	async add(...resources: Resource[]): Promise<void> {
		await this.run(Operation.Add, () => this.repository.add(resources.map(r => r.resourceUri.fsPath)));
	}

	async stage(uri: Uri, contents: string): Promise<void> {
		const relativePath = path.relative(this.repository.root, uri.fsPath).replace(/\\/g, '/');
		await this.run(Operation.Stage, () => this.repository.stage(relativePath, contents));
	}

	async revertFiles(...resources: Resource[]): Promise<void> {
		await this.run(Operation.RevertFiles, () => this.repository.revertFiles('HEAD', resources.map(r => r.resourceUri.fsPath)));
	}

	async commit(message: string, opts: CommitOptions = Object.create(null)): Promise<void> {
		await this.run(Operation.Commit, async () => {
			if (opts.all) {
				await this.repository.add([]);
			}

			await this.repository.commit(message, opts);
		});
	}

	async clean(...resources: Resource[]): Promise<void> {
		await this.run(Operation.Clean, async () => {
			const toClean: string[] = [];
			const toCheckout: string[] = [];

			resources.forEach(r => {
				switch (r.type) {
					case Status.UNTRACKED:
					case Status.IGNORED:
						toClean.push(r.resourceUri.fsPath);
						break;

					default:
						toCheckout.push(r.resourceUri.fsPath);
						break;
				}
			});

			const promises: Promise<void>[] = [];

			if (toClean.length > 0) {
				promises.push(this.repository.clean(toClean));
			}

			if (toCheckout.length > 0) {
				promises.push(this.repository.checkout('', toCheckout));
			}

			await Promise.all(promises);
		});
	}

	async branch(name: string): Promise<void> {
		await this.run(Operation.Branch, () => this.repository.branch(name, true));
	}

	async checkout(treeish: string): Promise<void> {
		await this.run(Operation.Checkout, () => this.repository.checkout(treeish, []));
	}

	async getCommit(ref: string): Promise<Commit> {
		return await this.repository.getCommit(ref);
	}

	async reset(treeish: string, hard?: boolean): Promise<void> {
		await this.run(Operation.Reset, () => this.repository.reset(treeish, hard));
	}

	@throttle
	async fetch(): Promise<void> {
		await this.run(Operation.Fetch, () => this.repository.fetch());
	}

	async pull(rebase?: boolean): Promise<void> {
		await this.run(Operation.Pull, () => this.repository.pull(rebase));
	}

	async push(remote?: string, name?: string, options?: PushOptions): Promise<void> {
		await this.run(Operation.Push, () => this.repository.push(remote, name, options));
	}

	@throttle
	async sync(): Promise<void> {
		await this.run(Operation.Sync, async () => {
			await this.repository.pull();

			const shouldPush = this.HEAD ? this.HEAD.ahead > 0 : true;

			if (shouldPush) {
				await this.repository.push();
			}
		});
	}

	async show(ref: string, uri: Uri): Promise<string> {
		return await this.run(Operation.Show, async () => {
			const relativePath = path.relative(this.repository.root, uri.fsPath).replace(/\\/g, '/');
			const result = await this.repository.git.exec(this.repository.root, ['show', `${ref}:${relativePath}`]);

			if (result.exitCode !== 0) {
				throw new GitError({
					message: localize('cantshow', "Could not show object"),
					exitCode: result.exitCode
				});
			}

			return result.stdout;
		});
	}

	async getCommitTemplate(): Promise<string> {
		return await this.run(Operation.GetCommitTemplate, async () => this.repository.getCommitTemplate());
	}

	private async run<T>(operation: Operation, runOperation: () => Promise<T> = () => Promise.resolve<any>(null)): Promise<T> {
		const run = async () => {
			this._operations = this._operations.start(operation);
			this._onRunOperation.fire(operation);

			try {
				await this.assertIdleState();

				const result = await this.retryRun(runOperation);

				if (!isReadOnly(operation)) {
					await this.updateModelState();
				}

				return result;
			} catch (err) {
				if (err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
					this.repositoryDisposable.dispose();

					const disposables: Disposable[] = [];
					this.onWorkspaceChange(this.onFSChange, this, disposables);
					this.repositoryDisposable = combinedDisposable(disposables);

					this.state = State.NotAGitRepository;
				}

				throw err;
			} finally {
				this._operations = this._operations.end(operation);
				this._onDidRunOperation.fire(operation);
			}
		};

		return shouldShowProgress(operation)
			? window.withScmProgress(run)
			: run();
	}

	private async retryRun<T>(runOperation: () => Promise<T> = () => Promise.resolve<any>(null)): Promise<T> {
		let attempt = 0;

		while (true) {
			try {
				attempt++;
				return await runOperation();
			} catch (err) {
				if (err.gitErrorCode === GitErrorCodes.RepositoryIsLocked && attempt <= 10) {
					// quatratic backoff
					await timeout(Math.pow(attempt, 2) * 50);
				} else {
					throw err;
				}
			}
		}
	}

	/* We use the native Node `watch` for faster, non debounced events.
	 * That way we hopefully get the events during the operations we're
	 * performing, thus sparing useless `git status` calls to refresh
	 * the model's state.
	 */
	private async assertIdleState(): Promise<void> {
		if (this.state === State.Idle) {
			return;
		}

		this.repositoryDisposable.dispose();

		const disposables: Disposable[] = [];
		const repositoryRoot = await this._git.getRepositoryRoot(this.workspaceRootPath);
		this.repository = this._git.open(repositoryRoot);

		const dotGitPath = path.join(repositoryRoot, '.git');
		const { event: onRawGitChange, disposable: watcher } = watch(dotGitPath);
		disposables.push(watcher);

		const onGitChange = mapEvent(onRawGitChange, ({ filename }) => Uri.file(path.join(dotGitPath, filename)));
		const onRelevantGitChange = filterEvent(onGitChange, uri => !/\/\.git\/index\.lock$/.test(uri.fsPath));
		onRelevantGitChange(this.onFSChange, this, disposables);
		onRelevantGitChange(this._onDidChangeRepository.fire, this._onDidChangeRepository, disposables);

		const onNonGitChange = filterEvent(this.onWorkspaceChange, uri => !/\/\.git\//.test(uri.fsPath));
		onNonGitChange(this.onFSChange, this, disposables);

		this.repositoryDisposable = combinedDisposable(disposables);
		this.state = State.Idle;
	}

	@throttle
	private async updateModelState(): Promise<void> {
		const status = await this.repository.getStatus();
		let HEAD: Branch | undefined;

		try {
			HEAD = await this.repository.getHEAD();

			if (HEAD.name) {
				try {
					HEAD = await this.repository.getBranch(HEAD.name);
				} catch (err) {
					// noop
				}
			}
		} catch (err) {
			// noop
		}

		const [refs, remotes] = await Promise.all([this.repository.getRefs(), this.repository.getRemotes()]);

		this._HEAD = HEAD;
		this._refs = refs;
		this._remotes = remotes;

		const index: Resource[] = [];
		const workingTree: Resource[] = [];
		const merge: Resource[] = [];

		status.forEach(raw => {
			const uri = Uri.file(path.join(this.repository.root, raw.path));
			const renameUri = raw.rename ? Uri.file(path.join(this.repository.root, raw.rename)) : undefined;

			switch (raw.x + raw.y) {
				case '??': return workingTree.push(new Resource(this.workingTreeGroup, uri, Status.UNTRACKED));
				case '!!': return workingTree.push(new Resource(this.workingTreeGroup, uri, Status.IGNORED));
				case 'DD': return merge.push(new Resource(this.mergeGroup, uri, Status.BOTH_DELETED));
				case 'AU': return merge.push(new Resource(this.mergeGroup, uri, Status.ADDED_BY_US));
				case 'UD': return merge.push(new Resource(this.mergeGroup, uri, Status.DELETED_BY_THEM));
				case 'UA': return merge.push(new Resource(this.mergeGroup, uri, Status.ADDED_BY_THEM));
				case 'DU': return merge.push(new Resource(this.mergeGroup, uri, Status.DELETED_BY_US));
				case 'AA': return merge.push(new Resource(this.mergeGroup, uri, Status.BOTH_ADDED));
				case 'UU': return merge.push(new Resource(this.mergeGroup, uri, Status.BOTH_MODIFIED));
			}

			let isModifiedInIndex = false;

			switch (raw.x) {
				case 'M': index.push(new Resource(this.indexGroup, uri, Status.INDEX_MODIFIED)); isModifiedInIndex = true; break;
				case 'A': index.push(new Resource(this.indexGroup, uri, Status.INDEX_ADDED)); break;
				case 'D': index.push(new Resource(this.indexGroup, uri, Status.INDEX_DELETED)); break;
				case 'R': index.push(new Resource(this.indexGroup, uri, Status.INDEX_RENAMED, renameUri)); break;
				case 'C': index.push(new Resource(this.indexGroup, uri, Status.INDEX_COPIED)); break;
			}

			switch (raw.y) {
				case 'M': workingTree.push(new Resource(this.workingTreeGroup, uri, Status.MODIFIED, renameUri)); break;
				case 'D': workingTree.push(new Resource(this.workingTreeGroup, uri, Status.DELETED, renameUri)); break;
			}
		});

		this._mergeGroup = new MergeGroup(merge);
		this._indexGroup = new IndexGroup(index);
		this._workingTreeGroup = new WorkingTreeGroup(workingTree);
		this._onDidChangeResources.fire();
	}

	private onFSChange(uri: Uri): void {
		const config = workspace.getConfiguration('git');
		const autorefresh = config.get<boolean>('autorefresh');

		if (!autorefresh) {
			return;
		}

		if (!this.operations.isIdle()) {
			return;
		}

		this.eventuallyUpdateWhenIdleAndWait();
	}

	@debounce(1000)
	private eventuallyUpdateWhenIdleAndWait(): void {
		this.updateWhenIdleAndWait();
	}

	@throttle
	private async updateWhenIdleAndWait(): Promise<void> {
		await this.whenIdle();
		await this.status();
		await timeout(5000);
	}

	dispose(): void {
		this.repositoryDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}