/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, EventEmitter, Event, SCMResource, SCMResourceDecorations, SCMResourceGroup, Disposable } from 'vscode';
import { Repository, IRef, IBranch, IRemote, IPushOptions } from './git';
import { throttle, anyEvent, eventToPromise } from './util';
import { decorate, memoize, debounce } from 'core-decorators';
import * as path from 'path';

const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');

function getIconUri(iconName: string, theme: string): Uri {
	return Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
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

export class Resource implements SCMResource {

	get uri(): Uri { return this._uri; }
	get type(): Status { return this._type; }

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

	get decorations(): SCMResourceDecorations {
		const light = { iconPath: this.getIconPath('light') };
		const dark = { iconPath: this.getIconPath('dark') };

		return { strikeThrough: this.strikeThrough, light, dark };
	}

	constructor(private _uri: Uri, private _type: Status) {

	}
}

export class ResourceGroup implements SCMResourceGroup {

	get id(): string { return this._id; }
	get label(): string { return this._label; }
	get resources(): Resource[] { return this._resources; }

	constructor(private _id: string, private _label: string, private _resources: Resource[]) {

	}
}

export class MergeGroup extends ResourceGroup {

	static readonly ID = 'merge';

	constructor(resources: Resource[]) {
		super(MergeGroup.ID, 'Merge Changes', resources);
	}
}

export class IndexGroup extends ResourceGroup {

	static readonly ID = 'index';

	constructor(resources: Resource[]) {
		super(IndexGroup.ID, 'Staged Changes', resources);
	}
}

export class WorkingTreeGroup extends ResourceGroup {

	static readonly ID = 'workingTree';

	constructor(resources: Resource[]) {
		super(WorkingTreeGroup.ID, 'Changes', resources);
	}
}

export enum Operation {
	Status = 0o1,
	Stage = 0o2,
	Unstage = 0o4,
	Commit = 0o10,
	Clean = 0o20,
	Branch = 0o40,
	Checkout = 0o100,
	Fetch = 0o200,
	Sync = 0o400,
	Push = 0o1000
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

export class Model {

	private _onDidChange = new EventEmitter<SCMResourceGroup[]>();
	readonly onDidChange: Event<SCMResourceGroup[]> = this._onDidChange.event;

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

	get resources(): ResourceGroup[] {
		const result: ResourceGroup[] = [];

		if (this._mergeGroup.resources.length > 0) {
			result.push(this._mergeGroup);
		}

		if (this._indexGroup.resources.length > 0) {
			result.push(this._indexGroup);
		}

		result.push(this._workingTreeGroup);

		return result;
	}

	private _operations = new OperationsImpl();
	get operations(): Operations { return this._operations; }

	private disposables: Disposable[] = [];

	constructor(
		private _repositoryRoot: string,
		private repository: Repository,
		onWorkspaceChange: Event<Uri>
	) {
		onWorkspaceChange(this.onWorkspaceChange, this, this.disposables);
	}

	get repositoryRoot(): string {
		return this._repositoryRoot;
	}

	private _HEAD: IBranch | undefined;
	get HEAD(): IBranch | undefined {
		return this._HEAD;
	}

	private _refs: IRef[] = [];
	get refs(): IRef[] {
		return this._refs;
	}

	private _remotes: IRemote[] = [];
	get remotes(): IRemote[] {
		return this._remotes;
	}

	@decorate(throttle)
	async update(): Promise<void> {
		await this.run(Operation.Status, async () => {
			const status = await this.repository.getStatus();
			let HEAD: IBranch | undefined;

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
				const uri = Uri.file(path.join(this.repositoryRoot, raw.path));

				switch (raw.x + raw.y) {
					case '??': return workingTree.push(new Resource(uri, Status.UNTRACKED));
					case '!!': return workingTree.push(new Resource(uri, Status.IGNORED));
					case 'DD': return merge.push(new Resource(uri, Status.BOTH_DELETED));
					case 'AU': return merge.push(new Resource(uri, Status.ADDED_BY_US));
					case 'UD': return merge.push(new Resource(uri, Status.DELETED_BY_THEM));
					case 'UA': return merge.push(new Resource(uri, Status.ADDED_BY_THEM));
					case 'DU': return merge.push(new Resource(uri, Status.DELETED_BY_US));
					case 'AA': return merge.push(new Resource(uri, Status.BOTH_ADDED));
					case 'UU': return merge.push(new Resource(uri, Status.BOTH_MODIFIED));
				}

				let isModifiedInIndex = false;

				switch (raw.x) {
					case 'M': index.push(new Resource(uri, Status.INDEX_MODIFIED)); isModifiedInIndex = true; break;
					case 'A': index.push(new Resource(uri, Status.INDEX_ADDED)); break;
					case 'D': index.push(new Resource(uri, Status.INDEX_DELETED)); break;
					case 'R': index.push(new Resource(uri, Status.INDEX_RENAMED/*, raw.rename*/)); break;
					case 'C': index.push(new Resource(uri, Status.INDEX_COPIED)); break;
				}

				switch (raw.y) {
					case 'M': workingTree.push(new Resource(uri, Status.MODIFIED/*, raw.rename*/)); break;
					case 'D': workingTree.push(new Resource(uri, Status.DELETED/*, raw.rename*/)); break;
				}
			});

			this._mergeGroup = new MergeGroup(merge);
			this._indexGroup = new IndexGroup(index);
			this._workingTreeGroup = new WorkingTreeGroup(workingTree);

			this._onDidChange.fire(this.resources);
		});
	}

	@decorate(throttle)
	async stage(...resources: Resource[]): Promise<void> {
		await this.run(Operation.Stage, async () => {
			const paths = resources.map(r => r.uri.fsPath);
			await this.repository.add(paths);
			await this.update();
		});
	}

	@decorate(throttle)
	async unstage(...resources: Resource[]): Promise<void> {
		await this.run(Operation.Unstage, async () => {
			const paths = resources.map(r => r.uri.fsPath);
			await this.repository.revertFiles('HEAD', paths);
			await this.update();
		});
	}

	@decorate(throttle)
	async commit(message: string, opts: { all?: boolean, amend?: boolean, signoff?: boolean } = Object.create(null)): Promise<void> {
		await this.run(Operation.Commit, async () => {
			if (opts.all) {
				await this.repository.add([]);
			}

			await this.repository.commit(message, opts);
			await this.update();
		});
	}

	@decorate(throttle)
	async clean(...resources: Resource[]): Promise<void> {
		await this.run(Operation.Clean, async () => {
			const toClean: string[] = [];
			const toCheckout: string[] = [];

			resources.forEach(r => {
				switch (r.type) {
					case Status.UNTRACKED:
					case Status.IGNORED:
						toClean.push(r.uri.fsPath);
						break;

					default:
						toCheckout.push(r.uri.fsPath);
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
			await this.update();
		});
	}

	@decorate(throttle)
	async branch(name: string): Promise<void> {
		await this.run(Operation.Branch, async () => {
			await this.repository.branch(name, true);
			await this.update();
		});
	}

	@decorate(throttle)
	async checkout(treeish: string): Promise<void> {
		await this.run(Operation.Checkout, async () => {
			await this.repository.checkout(treeish, []);
			await this.update();
		});
	}

	@decorate(throttle)
	async fetch(): Promise<void> {
		await this.run(Operation.Fetch, async () => {
			await this.repository.fetch();
			await this.update();
		});
	}

	@decorate(throttle)
	async sync(): Promise<void> {
		await this.run(Operation.Sync, async () => {
			await this.repository.sync();
			await this.update();
		});
	}

	@decorate(throttle)
	async push(remote?: string, name?: string, options?: IPushOptions): Promise<void> {
		await this.run(Operation.Push, async () => {
			await this.repository.push(remote, name, options);
			await this.update();
		});
	}

	private async run(operation: Operation, fn: () => Promise<void>): Promise<void> {
		this._operations = this._operations.start(operation);
		this._onRunOperation.fire(operation);

		try {
			await fn();
		} finally {
			this._operations = this._operations.end(operation);
			this._onDidRunOperation.fire(operation);
		}
	}

	@debounce(1000)
	private onWorkspaceChange(): void {
		this.updateWhenIdleAndWait();
	}

	@decorate(throttle)
	private async updateWhenIdleAndWait(): Promise<void> {
		await this.whenIdle();
		await this.update();
		await new Promise(c => setTimeout(c, 7000));
	}

	private async whenIdle(): Promise<void> {
		while (!this.operations.isIdle()) {
			await eventToPromise(this.onDidRunOperation);
		}
	}
}