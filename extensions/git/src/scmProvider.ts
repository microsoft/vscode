/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, Disposable, SCMProvider, SCMResourceGroup, Event, commands } from 'vscode';
import { Model, Status, Resource, ResourceGroup } from './model';
import * as path from 'path';

export class GitSCMProvider implements SCMProvider {

	private disposables: Disposable[] = [];

	get resources(): SCMResourceGroup[] { return this.model.resources; }
	get onDidChange(): Event<SCMResourceGroup[]> { return this.model.onDidChange; }
	get label(): string { return 'Git'; }

	constructor(private model: Model) {
		model.update(true);
	}

	commit(message: string): Thenable<void> {
		const all = this.model.indexGroup.resources.length === 0;

		return this.model.commit(message, { all });
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

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}