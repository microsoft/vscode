/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { window, Uri, Disposable, Event, EventEmitter, DecorationData, DecorationProvider } from 'vscode';
import { Repository, GitResourceGroup } from './repository';
import { Model } from './model';

class GitDecorationProvider implements DecorationProvider {

	private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
	readonly onDidChangeDecorations: Event<Uri[]> = this._onDidChangeDecorations.event;

	private disposables: Disposable[] = [];
	private decorations = new Map<string, DecorationData>();

	constructor(private repository: Repository) {
		this.disposables.push(
			window.registerDecorationProvider(this, repository.root),
			repository.onDidRunOperation(this.onDidRunOperation, this)
		);
	}

	private onDidRunOperation(): void {
		let newDecorations = new Map<string, DecorationData>();
		this.collectDecorationData(this.repository.indexGroup, newDecorations);
		this.collectDecorationData(this.repository.workingTreeGroup, newDecorations);

		let uris: Uri[] = [];
		newDecorations.forEach((value, uriString) => {
			if (this.decorations.has(uriString)) {
				this.decorations.delete(uriString);
			} else {
				uris.push(Uri.parse(uriString));
			}
		});
		this.decorations.forEach((value, uriString) => {
			uris.push(Uri.parse(uriString));
		});
		this.decorations = newDecorations;
		this._onDidChangeDecorations.fire(uris);
	}

	private collectDecorationData(group: GitResourceGroup, bucket: Map<string, DecorationData>): void {
		group.resourceStates.forEach(r => {
			if (r.resourceDecoration) {
				bucket.set(r.original.toString(), r.resourceDecoration);
			}
		});
	}

	provideDecoration(uri: Uri): DecorationData | undefined {
		return this.decorations.get(uri.toString());
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}


export class GitDecorations {

	private disposables: Disposable[] = [];
	private providers = new Map<Repository, GitDecorationProvider>();

	constructor(private model: Model) {
		this.disposables.push(
			model.onDidOpenRepository(this.onDidOpenRepository, this),
			model.onDidCloseRepository(this.onDidCloseRepository, this)
		);
		model.repositories.forEach(this.onDidOpenRepository, this);
	}

	private onDidOpenRepository(repository: Repository): void {
		const provider = new GitDecorationProvider(repository);
		this.providers.set(repository, provider);
	}

	private onDidCloseRepository(repository: Repository): void {
		const provider = this.providers.get(repository);
		if (provider) {
			provider.dispose();
			this.providers.delete(repository);
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.providers.forEach(value => value.dispose);
		this.providers.clear();
	}
}
