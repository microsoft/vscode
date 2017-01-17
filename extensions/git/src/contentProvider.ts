/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, Uri, Disposable, Event, EventEmitter } from 'vscode';
import * as path from 'path';
import { Git } from './git';

export class GitContentProvider {

	private disposables: Disposable[] = [];

	private onDidChangeEmitter = new EventEmitter<Uri>();
	get onDidChange(): Event<Uri> { return this.onDidChangeEmitter.event; }

	private uris = new Set<Uri>();

	constructor(private git: Git, private rootPath: string, onGitChange: Event<Uri>) {
		this.disposables.push(
			onGitChange(this.fireChangeEvents, this),
			workspace.registerTextDocumentContentProvider('git', this)
		);
	}

	private fireChangeEvents(): void {
		for (let uri of this.uris) {
			this.onDidChangeEmitter.fire(uri);
		}
	}

	async provideTextDocumentContent(uri: Uri): Promise<string> {
		const treeish = uri.query;
		const relativePath = path.relative(this.rootPath, uri.fsPath).replace(/\\/g, '/');

		try {
			const result = await this.git.exec(this.rootPath, ['show', `${treeish}:${relativePath}`]);

			if (result.exitCode !== 0) {
				this.uris.delete(uri);
				return '';
			}

			this.uris.add(uri);
			return result.stdout;
		} catch (err) {
			this.uris.delete(uri);
			return '';
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}