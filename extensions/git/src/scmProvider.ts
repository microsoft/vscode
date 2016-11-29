/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, Disposable, SCMProvider, SCMResource, SCMResourceGroup, EventEmitter, Event } from 'vscode';
import { Model } from './model';
import * as path from 'path';

const Status: any = {};

class GitSCMResource implements SCMResource {

	get uri(): Uri { return this._uri; }

	constructor(private _uri: Uri, type: any) {

	}
}

class GitSCMResourceGroup implements SCMResourceGroup {
	resources: GitSCMResource[] = [];
}

export class GitSCMProvider implements SCMProvider {

	private disposables: Disposable[] = [];

	private merge: GitSCMResourceGroup = new GitSCMResourceGroup();
	private index: GitSCMResourceGroup = new GitSCMResourceGroup();
	private workingTree: GitSCMResourceGroup = new GitSCMResourceGroup();

	get resourceGroups(): SCMResourceGroup[] {
		return [this.merge, this.index, this.workingTree];
	}

	private _onDidChangeResourceGroup = new EventEmitter<SCMResourceGroup>();
	get onDidChangeResourceGroup(): Event<SCMResourceGroup> { return this._onDidChangeResourceGroup.event; }

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
		const index: GitSCMResource[] = [];
		const workingTree: GitSCMResource[] = [];
		const merge: GitSCMResource[] = [];

		status.forEach(raw => {
			const uri = Uri.file(path.join(this.model.repositoryRoot, raw.path));

			switch (raw.x + raw.y) {
				case '??': return workingTree.push(new GitSCMResource(uri, Status.UNTRACKED));
				case '!!': return workingTree.push(new GitSCMResource(uri, Status.IGNORED));
				case 'DD': return merge.push(new GitSCMResource(uri, Status.BOTH_DELETED));
				case 'AU': return merge.push(new GitSCMResource(uri, Status.ADDED_BY_US));
				case 'UD': return merge.push(new GitSCMResource(uri, Status.DELETED_BY_THEM));
				case 'UA': return merge.push(new GitSCMResource(uri, Status.ADDED_BY_THEM));
				case 'DU': return merge.push(new GitSCMResource(uri, Status.DELETED_BY_US));
				case 'AA': return merge.push(new GitSCMResource(uri, Status.BOTH_ADDED));
				case 'UU': return merge.push(new GitSCMResource(uri, Status.BOTH_MODIFIED));
			}

			let isModifiedInIndex = false;

			switch (raw.x) {
				case 'M': index.push(new GitSCMResource(uri, Status.INDEX_MODIFIED)); isModifiedInIndex = true; break;
				case 'A': index.push(new GitSCMResource(uri, Status.INDEX_ADDED)); break;
				case 'D': index.push(new GitSCMResource(uri, Status.INDEX_DELETED)); break;
				case 'R': index.push(new GitSCMResource(uri, Status.INDEX_RENAMED/*, raw.rename*/)); break;
				case 'C': index.push(new GitSCMResource(uri, Status.INDEX_COPIED)); break;
			}

			switch (raw.y) {
				case 'M': workingTree.push(new GitSCMResource(uri, Status.MODIFIED/*, raw.rename*/)); break;
				case 'D': workingTree.push(new GitSCMResource(uri, Status.DELETED/*, raw.rename*/)); break;
			}
		});

		this.merge.resources = merge;
		this.index.resources = index;
		this.workingTree.resources = workingTree;

		this._onDidChangeResourceGroup.fire(this.merge);
		this._onDidChangeResourceGroup.fire(this.index);
		this._onDidChangeResourceGroup.fire(this.workingTree);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}