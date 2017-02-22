/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position, Selection, Range, CompletionItemProvider, CompletionItemKind, TextDocument, CancellationToken, CompletionItem, window, commands, Uri, ProviderResult, TextEditor } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';
import { FileLocationRequestArgs, DocCommandTemplateResponse } from '../protocol';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

const tryCompleteJsDocCommand = '_typeScript.tryCompleteJsDoc';


class JsDocCompletionItem extends CompletionItem {
	constructor(file: Uri, position: Position) {
		super('/** */', CompletionItemKind.Snippet);
		this.documentation = localize('typescript.jsDocCompletionItem.detail', 'JSDoc comment');
		this.insertText = '';
		this.command = {
			title: 'Try Complete Js Doc',
			command: tryCompleteJsDocCommand,
			arguments: [file, position]
		};
	}
}

export default class JsDocCompletionHelper implements CompletionItemProvider {

	constructor(
		private client: ITypescriptServiceClient,
	) {
		window.onDidChangeTextEditorSelection(e => {
			if (e.textEditor.document.languageId !== 'typescript'
				&& e.textEditor.document.languageId !== 'typescriptreact'
				&& e.textEditor.document.languageId !== 'javascript'
				&& e.textEditor.document.languageId !== 'javascriptreact'
			) {
				return;
			}

			const selection = e.selections[0];
			if (!selection.start.isEqual(selection.end)) {
				return;
			}
			if (this.shouldAutoShowJsDocSuggestion(e.textEditor.document, selection.start)) {
				return commands.executeCommand('editor.action.triggerSuggest');
			}
			return;
		});

		commands.registerCommand(
			tryCompleteJsDocCommand,
			(file: Uri, position: Position) => this.tryCompleteJsDoc(file, position));
	}

	public provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<CompletionItem[]> {
		const file = this.client.normalizePath(document.uri);
		if (file) {
			return [new JsDocCompletionItem(document.uri, position)];
		}
		return [];
	}

	public resolveCompletionItem(item: CompletionItem, _token: CancellationToken) {
		return item;
	}

	private shouldAutoShowJsDocSuggestion(document: TextDocument, position: Position): boolean {
		const line = document.lineAt(position.line).text;

		// Ensure line starts with '/**' then cursor
		const prefix = line.slice(0, position.character).match(/^\s*(\/\*\*+)\s*$/);
		if (prefix === null) {
			return false;
		}

		// Ensure there is no content after the cursor besides possibly the end of the comment
		const suffix = line.slice(position.character).match(/^\s*\**\/?$/);
		return suffix !== null;
	}

	/**
	 * Try to insert a jsdoc comment, using a template provide by typescript
	 * if possible, otherwise falling back to a default comment format.
	 */
	private tryCompleteJsDoc(resource: Uri, position: Position): Thenable<boolean> {
		const file = this.client.normalizePath(resource);
		if (!file) {
			return Promise.resolve(false);
		}

		const editor = window.activeTextEditor;
		if (!editor || editor.document.uri.fsPath !== resource.fsPath) {
			return Promise.resolve(false);
		}

		return this.prepForDocCompletion(editor, position)
			.then((start: Position) => {
				return this.tryInsertJsDocFromTemplate(editor, file, start);
			})
			.then((didInsertFromTemplate: boolean) => {
				if (didInsertFromTemplate) {
					return true;
				}
				return this.tryInsertDefaultDoc(editor, position);
			});
	}

	/**
	 * Prepare the area around the position for insertion of the jsdoc.
	 *
	 * Removes any the prefix and suffix of a possible jsdoc
	 */
	private prepForDocCompletion(editor: TextEditor, position: Position): Thenable<Position> {
		const line = editor.document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character).match(/\/\**\s*$/);
		const suffix = line.slice(position.character).match(/^\s*\**\//);
		if (!prefix && !suffix) {
			// Nothing to remove
			return Promise.resolve(position);
		}

		const start = position.translate(0, prefix ? -prefix[0].length : 0);
		return editor.edit(
			edits => {
				edits.delete(new Range(start, position.translate(0, suffix ? suffix[0].length : 0)));
			}, {
				undoStopBefore: true,
				undoStopAfter: false
			}).then(() => start);
	}

	private tryInsertJsDocFromTemplate(editor: TextEditor, file: string, position: Position): Promise<boolean> {
		const args: FileLocationRequestArgs = {
			file: file,
			line: position.line + 1,
			offset: position.character + 1
		};
		return this.client.execute('docCommentTemplate', args)
			.then((res: DocCommandTemplateResponse) => {
				if (!res || !res.body) {
					return false;
				}
				const commentText = res.body.newText;
				return editor.edit(
					edits => edits.insert(position, commentText),
					{ undoStopBefore: false, undoStopAfter: true });
			}, () => false)
			.then((didInsertComment: boolean) => {
				if (didInsertComment) {
					const newCursorPosition = new Position(position.line + 1, editor.document.lineAt(position.line + 1).text.length);
					editor.selection = new Selection(newCursorPosition, newCursorPosition);
				}
				return didInsertComment;
			});
	}

	/**
	 * Insert the default JSDoc
	 */
	private tryInsertDefaultDoc(editor: TextEditor, position: Position): Thenable<boolean> {
		const line = editor.document.lineAt(position.line).text;
		const spaceBefore = line.slice(0, position.character).match(/^\s*$/);

		const indent = spaceBefore ? spaceBefore[0] : '';
		return editor.edit(
			edits => edits.insert(position, `/**\n${indent} * \n${indent} */`),
			{ undoStopBefore: false, undoStopAfter: true })
			.then((didInsert: boolean) => {
				if (didInsert) {
					const newCursorPosition = new Position(position.line + 1, editor.document.lineAt(position.line + 1).text.length);
					editor.selection = new Selection(newCursorPosition, newCursorPosition);
				}
				return didInsert;
			});
	}


}