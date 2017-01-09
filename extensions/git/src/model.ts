/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, EventEmitter, Event, SCMResource, SCMResourceDecorations, SCMResourceGroup } from 'vscode';
import { Repository, IRef, IFileStatus, IRemote } from './git';
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

	private _onDidChange = new EventEmitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(private _repositoryRoot: string, private repository: Repository) {

	}

	get repositoryRoot(): string {
		return this._repositoryRoot;
	}

	private _status: IFileStatus[];
	get status(): IFileStatus[] {
		return this._status;
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
			this._update();
		} else {
			this.eventuallyUpdate();
		}
	}

	@debounce(500)
	private eventuallyUpdate(): void {
		this._update();
	}

	@decorate(throttle)
	private async _update(): Promise<void> {
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

		this._status = status;
		this._HEAD = HEAD;
		this._refs = refs;
		this._remotes = remotes;
		this._onDidChange.fire();
	}
}