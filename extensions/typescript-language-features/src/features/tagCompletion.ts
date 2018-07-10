/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { VersionDependentRegistration, ConfigurationDependentRegistration, ConditionalRegistration } from '../utils/dependentRegistration';
import { disposeAll } from '../utils/dispose';
import * as typeConverters from '../utils/typeConverters';

class TagClosing {

	private _disposed = false;
	private timeout: NodeJS.Timer | undefined = undefined;

	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
		vscode.workspace.onDidChangeTextDocument(
			event => this.onDidChangeTextDocument(event.document, event.contentChanges),
			null,
			this.disposables);
	}

	public dispose() {
		disposeAll(this.disposables);
		this._disposed = true;
		this.timeout = undefined;
	}

	private onDidChangeTextDocument(
		document: vscode.TextDocument,
		changes: vscode.TextDocumentContentChangeEvent[]
	) {
		const activeDocument = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
		if (document !== activeDocument || changes.length === 0) {
			return;
		}

		const filepath = this.client.toPath(document.uri);
		if (!filepath) {
			return;
		}

		if (typeof this.timeout !== 'undefined') {
			clearTimeout(this.timeout);
		}

		const lastChange = changes[changes.length - 1];
		const lastCharacter = lastChange.text[lastChange.text.length - 1];
		if (lastChange.rangeLength > 0 || lastCharacter !== '>' && lastCharacter !== '/') {
			return;
		}

		const rangeStart = lastChange.range.start;
		const version = document.version;
		this.timeout = setTimeout(async () => {
			if (this._disposed) {
				return;
			}

			let position = new vscode.Position(rangeStart.line, rangeStart.character + lastChange.text.length);
			let body: Proto.TextInsertion | undefined = undefined;
			const args: Proto.JsxClosingTagRequestArgs = typeConverters.Position.toFileLocationRequestArgs(filepath, position);

			try {
				const response = await this.client.execute('jsxClosingTag', args, null as any);
				body = response && response.body;
				if (!body) {
					return;
				}
			} catch {
				return;
			}

			if (!this._disposed) {
				const activeEditor = vscode.window.activeTextEditor;
				if (activeEditor) {
					const activeDocument = activeEditor.document;
					if (document === activeDocument && activeDocument.version === version) {
						const selections = activeEditor.selections;
						const snippet = this.getTagSnippet(body);
						if (selections.length && selections.some(s => s.active.isEqual(position))) {
							activeEditor.insertSnippet(snippet, selections.map(s => s.active));
						} else {
							activeEditor.insertSnippet(snippet, position);
						}
					}
				}
			}

			this.timeout = void 0;
		}, 100);
	}

	private getTagSnippet(closingTag: Proto.TextInsertion): vscode.SnippetString {
		const snippet = new vscode.SnippetString();
		snippet.appendPlaceholder('', 0);
		snippet.appendText(closingTag.newText);
		return snippet;
	}
}

export class ActiveDocumentDependentRegistration {
	private readonly _registration: ConditionalRegistration;
	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly selector: vscode.DocumentSelector,
		register: () => vscode.Disposable,
	) {
		this._registration = new ConditionalRegistration(register);

		this.update();

		vscode.window.onDidChangeActiveTextEditor(() => {
			this.update();
		}, null, this._disposables);
	}

	public dispose() {
		disposeAll(this._disposables);
		this._registration.dispose();
	}

	private update() {
		const editor = vscode.window.activeTextEditor;
		const enabled = !!(editor && vscode.languages.match(this.selector, editor.document));
		this._registration.update(enabled);
	}
}

export function register(
	selector: vscode.DocumentSelector,
	modeId: string,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, API.v300, () =>
		new ConfigurationDependentRegistration(modeId, 'autoClosingTags', () =>
			new ActiveDocumentDependentRegistration(selector, () =>
				new TagClosing(client))));
}
