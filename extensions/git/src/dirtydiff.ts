/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, TextEditor, window, workspace } from 'vscode';
import { IDisposable, dispose, mapEvent } from './util';

type TextEditorsEvent = Event<TextEditor[]>;

type IDecoration = void;

class ResourceDecorator implements IDisposable {

	private textEditors: TextEditor[] = [];

	constructor(private path: string) {
		// console.log(`creating: ${this.path}`);
	}

	add(textEditor: TextEditor): void {
		this.remove(textEditor);
		this.textEditors.push(textEditor);
	}

	remove(textEditor: TextEditor): void {
		this.textEditors = this.textEditors.filter(e => e !== textEditor);
	}

	get count(): number {
		return this.textEditors.length;
	}

	dispose(): void {
		// console.log(`disposing: ${this.path}`);
	}
}

export class DirtyDiff implements IDisposable {

	private textEditors: { editor: TextEditor; path: string; }[] = [];
	private decorators: { [uri: string]: ResourceDecorator } = Object.create(null);
	private disposables: IDisposable[] = [];

	constructor() {
		const onVisibleTextEditorsChange = mapEvent(window.onDidChangeActiveTextEditor, () => window.visibleTextEditors);
		onVisibleTextEditorsChange(this.onDidVisibleEditorsChange, this, this.disposables);
		this.onDidVisibleEditorsChange(window.visibleTextEditors);

		const watcher = workspace.createFileSystemWatcher('**');

		this.disposables.push(watcher);
	}

	private onDidVisibleEditorsChange(textEditors: TextEditor[]) {
		const added = textEditors.filter(a => this.textEditors.every(({ editor }) => a !== editor)).map(editor => ({ editor, path: workspace.asRelativePath(editor.document.uri) }));
		const removed = this.textEditors.filter(({ editor }) => textEditors.every(b => editor !== b));
		this.textEditors = textEditors.map(editor => ({ editor, path: workspace.asRelativePath(editor.document.uri) }));

		removed.forEach(({ editor, path }) => {
			const decorator = this.decorators[path];
			decorator.remove(editor);

			if (decorator.count === 0) {
				decorator.dispose();
				delete this.decorators[path];
			}
		});

		added.forEach(({ editor, path }) => {
			const decorator = this.decorators[path] || (this.decorators[path] = new ResourceDecorator(path));
			decorator.add(editor);
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}