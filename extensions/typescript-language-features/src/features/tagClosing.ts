/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { ConditionalRegistration, ConfigurationDependentRegistration, VersionDependentRegistration } from '../utils/dependentRegistration';
import { Disposable } from '../utils/dispose';
import * as typeConverters from '../utils/typeConverters';

class TagClosing extends Disposable {
	public static readonly minVersion = API.v300;

	private _disposed = false;
	private _timeout: NodeJS.Timer | undefined = undefined;
	private _cancel: vscode.CancellationTokenSource | undefined = undefined;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
		super();
		vscode.workspace.onDidChangeTextDocument(
			event => this.onDidChangeTextDocument(event.document, event.contentChanges),
			null,
			this._disposables);
	}

	public dispose() {
		super.dispose();
		this._disposed = true;

		if (this._timeout) {
			clearTimeout(this._timeout);
			this._timeout = undefined;
		}

		if (this._cancel) {
			this._cancel.cancel();
			this._cancel.dispose();
			this._cancel = undefined;
		}
	}

	private onDidChangeTextDocument(
		document: vscode.TextDocument,
		changes: readonly vscode.TextDocumentContentChangeEvent[]
	) {
		const activeDocument = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
		if (document !== activeDocument || changes.length === 0) {
			return;
		}

		const filepath = this.client.toOpenedFilePath(document);
		if (!filepath) {
			return;
		}

		if (typeof this._timeout !== 'undefined') {
			clearTimeout(this._timeout);
		}

		if (this._cancel) {
			this._cancel.cancel();
			this._cancel.dispose();
			this._cancel = undefined;
		}

		const lastChange = changes[changes.length - 1];
		const lastCharacter = lastChange.text[lastChange.text.length - 1];
		if (lastChange.rangeLength > 0 || lastCharacter !== '>' && lastCharacter !== '/') {
			return;
		}

		const priorCharacter = lastChange.range.start.character > 0
			? document.getText(new vscode.Range(lastChange.range.start.translate({ characterDelta: -1 }), lastChange.range.start))
			: '';
		if (priorCharacter === '>') {
			return;
		}

		const version = document.version;
		this._timeout = setTimeout(async () => {
			this._timeout = undefined;

			if (this._disposed) {
				return;
			}

			const addedLines = lastChange.text.split(/\r\n|\n/g);
			const position = addedLines.length <= 1
				? lastChange.range.start.translate({ characterDelta: lastChange.text.length })
				: new vscode.Position(lastChange.range.start.line + addedLines.length - 1, addedLines[addedLines.length - 1].length);

			const args: Proto.JsxClosingTagRequestArgs = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
			this._cancel = new vscode.CancellationTokenSource();
			const response = await this.client.execute('jsxClosingTag', args, this._cancel.token);
			if (response.type !== 'response' || !response.body) {
				return;
			}

			if (this._disposed) {
				return;
			}

			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				return;
			}

			const insertion = response.body;
			const activeDocument = activeEditor.document;
			if (document === activeDocument && activeDocument.version === version) {
				activeEditor.insertSnippet(
					this.getTagSnippet(insertion),
					this.getInsertionPositions(activeEditor, position));
			}
		}, 100);
	}

	private getTagSnippet(closingTag: Proto.TextInsertion): vscode.SnippetString {
		const snippet = new vscode.SnippetString();
		snippet.appendPlaceholder('', 0);
		snippet.appendText(closingTag.newText);
		return snippet;
	}

	private getInsertionPositions(editor: vscode.TextEditor, position: vscode.Position) {
		const activeSelectionPositions = editor.selections.map(s => s.active);
		return activeSelectionPositions.some(p => p.isEqual(position))
			? activeSelectionPositions
			: position;
	}
}

export class ActiveDocumentDependentRegistration extends Disposable {
	private readonly _registration: ConditionalRegistration;

	constructor(
		private readonly selector: vscode.DocumentSelector,
		register: () => vscode.Disposable,
	) {
		super();
		this._registration = this._register(new ConditionalRegistration(register));
		vscode.window.onDidChangeActiveTextEditor(this.update, this, this._disposables);
		vscode.workspace.onDidOpenTextDocument(this.onDidOpenDocument, this, this._disposables);
		this.update();
	}

	private update() {
		const editor = vscode.window.activeTextEditor;
		const enabled = !!(editor && vscode.languages.match(this.selector, editor.document));
		this._registration.update(enabled);
	}

	private onDidOpenDocument(openedDocument: vscode.TextDocument) {
		if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === openedDocument) {
			// The active document's language may have changed
			this.update();
		}
	}
}

export function register(
	selector: vscode.DocumentSelector,
	modeId: string,
	client: ITypeScriptServiceClient,
) {
	return new VersionDependentRegistration(client, TagClosing.minVersion, () =>
		new ConfigurationDependentRegistration(modeId, 'autoClosingTags', () =>
			new ActiveDocumentDependentRegistration(selector, () =>
				new TagClosing(client))));
}
