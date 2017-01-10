/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, EventEmitter, Event, SCMResource, SCMResourceDecorations, SCMResourceGroup } from 'vscode';
import { Repository, IRef, IRemote, IFileStatus } from './git';
import { throttle } from './util';
import { decorate, debounce } from 'core-decorators';
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
	get resources(): SCMResource[] { return this._resources; }

	constructor(private _id: string, private _label: string, private _resources: SCMResource[]) {

	}
}

export class MergeGroup extends ResourceGroup {
	constructor(resources: SCMResource[]) {
		super('merge', 'Merge Changes', resources);
	}
}

export class IndexGroup extends ResourceGroup {
	constructor(resources: SCMResource[]) {
		super('index', 'Staged Changes', resources);
	}
}

export class WorkingTreeGroup extends ResourceGroup {
	constructor(resources: SCMResource[]) {
		super('workingTree', 'Changes', resources);
	}
}

export class Model {

	private _onDidChange = new EventEmitter<SCMResourceGroup[]>();
	readonly onDidChange: Event<SCMResourceGroup[]> = this._onDidChange.event;

	private _resources: ResourceGroup[] = [];
	get resources(): ResourceGroup[] { return this._resources; }

	constructor(private _repositoryRoot: string, private repository: Repository) {

	}

	get repositoryRoot(): string {
		return this._repositoryRoot;
	}

	private _HEAD: IRef | undefined;
	get HEAD(): IRef | undefined {
		return this._HEAD;
	}

	private _refs: IRef[];
	get refs(): IRef[] {
		return this._refs;
	}

	private _remotes: IRemote[];
	get remotes(): IRemote[] {
		return this._remotes;
	}

	update(now = false): void {
		if (now) {
			this.updateNow();
		} else {
			this.eventuallyUpdate();
		}
	}

	@debounce(500)
	private eventuallyUpdate(): void {
		this.updateNow();
	}

	@decorate(throttle)
	private async updateNow(): Promise<void> {
		const status = await this.repository.getStatus();
		let HEAD: IRef | undefined;

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
		this._resources = this.getResources(status);

		this._onDidChange.fire(this._resources);
	}

	private getResources(status: IFileStatus[]): ResourceGroup[] {
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

		const resources: ResourceGroup[] = [];

		if (merge.length > 0) {
			resources.push(new MergeGroup(merge));
		}

		if (index.length > 0) {
			resources.push(new IndexGroup(index));
		}

		if (workingTree.length > 0) {
			resources.push(new WorkingTreeGroup(workingTree));
		}

		return resources;
	}

	async stage(...resources: Resource[]): Promise<void> {
		const paths = resources.map(r => r.uri.fsPath);
		await this.repository.add(paths);
		await this.updateNow();
	}

	async unstage(...resources: Resource[]): Promise<void> {
		const paths = resources.map(r => r.uri.fsPath);
		await this.repository.revertFiles('HEAD', paths);
		await this.updateNow();
	}
}