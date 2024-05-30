/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../tsServer/protocol/protocol';
import { API } from '../tsServer/api';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Condition, conditionalRegistration, requireMinVersion } from './util/dependentRegistration';
import { Disposable } from '../utils/dispose';
import { DocumentSelector } from '../configuration/documentSelector';
import { LanguageDescription } from '../configuration/languageDescription';
import * as typeConverters from '../typeConverters';

class TagClosing extends Disposable {
	public static readonly minVersion = API.v300;

	private _disposed = false;
	private _timeout: NodeJS.Timeout | undefined = undefined;
	private _cancel: vscode.CancellationTokenSource | undefined = undefined;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
		super();
		vscode.workspace.onDidChangeTextDocument(
			event => this.onDidChangeTextDocument(event),
			null,
			this._disposables);
	}

	public override dispose() {
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
		{ document, contentChanges, reason }: vscode.TextDocumentChangeEvent
	) {
		if (contentChanges.length === 0 || reason === vscode.TextDocumentChangeReason.Undo || reason === vscode.TextDocumentChangeReason.Redo) {
			return;
		}

		const activeDocument = vscode.window.activeTextEditor?.document;
		if (document !== activeDocument) {
			return;
		}

		const filepath = this.client.toOpenTsFilePath(document);
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

		const lastChange = contentChanges[contentChanges.length - 1];
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

function requireActiveDocumentSetting(
	selector: vscode.DocumentSelector,
	language: LanguageDescription,
) {
	return new Condition(
		() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !vscode.languages.match(selector, editor.document)) {
				return false;
			}

			return !!vscode.workspace.getConfiguration(language.id, editor.document).get('autoClosingTags');
		},
		handler => {
			return vscode.Disposable.from(
				vscode.window.onDidChangeActiveTextEditor(handler),
				vscode.workspace.onDidOpenTextDocument(handler),
				vscode.workspace.onDidChangeConfiguration(handler));
		});
}

export function register(
	selector: DocumentSelector,
	language: LanguageDescription,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireMinVersion(client, TagClosing.minVersion),
		requireActiveDocumentSetting(selector.syntax, language)
	], () => new TagClosing(client));
}
