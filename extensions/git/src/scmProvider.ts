/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, Disposable, SCMProvider, SCMResource, SCMResourceDecorations, SCMResourceGroup, EventEmitter, Event } from 'vscode';
import { Model } from './model';
import * as path from 'path';

enum Theme {
	Light,
	Dark
}

const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');

function getIconUri(iconName: string, theme: Theme): Uri {
	const themeName = theme === Theme.Light ? 'light' : 'dark';
	return Uri.file(path.join(iconsRootPath, themeName, `${iconName}.svg`));
}

enum Status {
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

class Resource implements SCMResource {

	get uri(): Uri { return this._uri; }

	get decorations(): SCMResourceDecorations {
		let iconPath: Uri | undefined;
		let strikeThrough = false;

		switch (this.type) {
			case Status.MODIFIED:
				iconPath = getIconUri('refresh', Theme.Light);
				break;
			case Status.DELETED:
				iconPath = getIconUri('refresh', Theme.Light);
				strikeThrough = true;
				break;
		}

		return { iconPath, strikeThrough };
	}

	constructor(private _uri: Uri, private type: any) {

	}
}

class ResourceGroup implements SCMResourceGroup {

	get id(): string { return this._id; }
	get label(): string { return this._label; }
	get resources(): SCMResource[] { return this._resources; }

	constructor(private _id: string, private _label: string, private _resources: SCMResource[]) {

	}
}

class MergeGroup extends ResourceGroup {
	constructor(resources: SCMResource[]) {
		super('merge', 'Merge Changes', resources);
	}
}

class IndexGroup extends ResourceGroup {
	constructor(resources: SCMResource[]) {
		super('index', 'Staged Changes', resources);
	}
}

class WorkingTreeGroup extends ResourceGroup {
	constructor(resources: SCMResource[]) {
		super('workingTree', 'Changes', resources);
	}
}

export class GitSCMProvider implements SCMProvider {

	private disposables: Disposable[] = [];

	private _resources: SCMResourceGroup[] = [];
	get resources(): SCMResourceGroup[] { return this._resources; }

	private _onDidChange = new EventEmitter<SCMResourceGroup[]>();
	get onDidChange(): Event<SCMResourceGroup[]> { return this._onDidChange.event; }

	get label(): string { return 'Git'; }

	constructor(private model: Model) {
		model.onDidChange(this.onModelChange, this, this.disposables);
		model.update(true);
	}

	getOriginalResource(uri: Uri): Uri | undefined {
		if (uri.scheme !== 'file') {
			return void 0;
		}

		return uri.with({ scheme: 'git-index' });
	}

	private onModelChange(): void {
		const status = this.model.status;
		const index: SCMResource[] = [];
		const workingTree: SCMResource[] = [];
		const merge: SCMResource[] = [];

		status.forEach(raw => {
			const uri = Uri.file(path.join(this.model.repositoryRoot, raw.path));

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

		const resources: SCMResourceGroup[] = [];

		if (merge.length > 0) {
			resources.push(new MergeGroup(merge));
		}

		if (index.length > 0) {
			resources.push(new IndexGroup(index));
		}

		if (workingTree.length > 0) {
			resources.push(new WorkingTreeGroup(workingTree));
		}

		this._resources = resources;
		this._onDidChange.fire(resources);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}