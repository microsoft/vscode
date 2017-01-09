/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {
	Uri, Disposable, SCMProvider, SCMResource,
	SCMResourceGroup, EventEmitter, Event, commands
} from 'vscode';
import { Model, Status, WorkingTreeGroup, IndexGroup, MergeGroup, Resource, ResourceGroup } from './model';
import * as path from 'path';

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

	commit(message: string): void {
		console.log('commit', message);
	}

	open(resource: Resource): Thenable<void> {
		const fileName = path.basename(resource.uri.fsPath);
		const indexUri = resource.uri.with({ scheme: 'git-index' });

		switch (resource.type) {
			case Status.UNTRACKED: return commands.executeCommand<void>('vscode.open', resource.uri);
			case Status.MODIFIED: return commands.executeCommand<void>('vscode.diff', indexUri, resource.uri, `${fileName} (HEAD) ↔ ${fileName}`);
			case Status.DELETED: return commands.executeCommand<void>('vscode.open', indexUri);
			// TODO@joao: rest!
		}

		return Promise.resolve();
	}

	drag(resource: Resource, resourceGroup: ResourceGroup): void {
		console.log('drag', resource, resourceGroup);
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