/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { scm, Uri, Disposable, SCMProvider, SCMResourceGroup, Event, commands, ProviderResult } from 'vscode';
import { Model, Status, Resource, ResourceGroup } from './model';
import * as path from 'path';

export class GitSCMProvider implements SCMProvider {

	private disposables: Disposable[] = [];

	get resources(): SCMResourceGroup[] { return this.model.resources; }
	get onDidChange(): Event<SCMResourceGroup[]> { return this.model.onDidChange; }
	get label(): string { return 'Git'; }

	constructor(private model: Model) {
		model.update();
		scm.registerSCMProvider('git', this);
	}

	commit(message: string): Thenable<void> {
		const all = this.model.indexGroup.resources.length === 0;

		return this.model.commit(message, { all });
	}

	open(resource: Resource): ProviderResult<void> {
		const left = this.getLeftResource(resource);
		const right = this.getRightResource(resource);
		const title = this.getTitle(resource);

		if (!left) {
			if (!right) {
				// TODO
				console.error('oh no');
				return;
			}

			return commands.executeCommand<void>('vscode.open', right);
		}

		return commands.executeCommand<void>('vscode.diff', left, right, title);
	}

	private getLeftResource(resource: Resource): Uri | undefined {
		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return resource.uri.with({ scheme: 'git', query: 'HEAD' });

			case Status.MODIFIED:
				const uriString = resource.uri.toString();
				const [indexStatus] = this.model.indexGroup.resources.filter(r => r.uri.toString() === uriString);
				const query = indexStatus ? '~' : 'HEAD';
				return resource.uri.with({ scheme: 'git', query });
		}
	}

	private getRightResource(resource: Resource): Uri | undefined {
		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_ADDED:
			case Status.INDEX_COPIED:
			case Status.INDEX_RENAMED:
				return resource.uri.with({ scheme: 'git' });

			case Status.INDEX_DELETED:
			case Status.DELETED:
				return resource.uri.with({ scheme: 'git', query: 'HEAD' });

			case Status.MODIFIED:
			case Status.UNTRACKED:
			case Status.IGNORED:
			case Status.BOTH_MODIFIED:
				return resource.uri;
		}
	}

	private getTitle(resource: Resource): string {
		const basename = path.basename(resource.uri.fsPath);

		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return `${basename} (Index)`;

			case Status.MODIFIED:
				return `${basename} (Working Tree)`;
		}

		return '';
	}

	drag(resource: Resource, resourceGroup: ResourceGroup): void {
		console.log('drag', resource, resourceGroup);
	}

	getOriginalResource(uri: Uri): Uri | undefined {
		if (uri.scheme !== 'file') {
			return;
		}

		return uri.with({ scheme: 'git' });
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}