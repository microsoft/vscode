/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position, Range, CompletionItemProvider, CompletionItemKind, TextDocument, CancellationToken, CompletionItem, window, commands, Uri, ProviderResult, TextEditor, SnippetString } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';
import { FileLocationRequestArgs, DocCommandTemplateResponse } from '../protocol';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

const tryCompleteJsDocCommand = '_typeScript.tryCompleteJsDoc';


class JsDocCompletionItem extends CompletionItem {
	constructor(file: Uri, position: Position) {
		super('/** */', CompletionItemKind.Snippet);
		this.detail = localize('typescript.jsDocCompletionItem.documentation', 'JSDoc comment');
		this.insertText = '';
		this.sortText = '\0';
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
		commands.registerCommand(
			tryCompleteJsDocCommand,
			(file: Uri, position: Position) => this.tryCompleteJsDoc(file, position));
	}

	public provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<CompletionItem[]> {
		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		// Only show the JSdoc completion when the everything before the cursor is whitespace
		// or could be the opening of a comment
		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character);
		if (prefix.match(/^\s*$|\/\*\*\s*$|^\s*\/\*\*+\s*$/)) {
			return [new JsDocCompletionItem(document.uri, position)];
		}
		return [];
	}

	public resolveCompletionItem(item: CompletionItem, _token: CancellationToken) {
		return item;
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
				return this.tryInsertJsDocFromTemplate(editor, file, start)
					.then((didInsertFromTemplate: boolean) => {
						if (didInsertFromTemplate) {
							return true;
						}
						return this.tryInsertDefaultDoc(editor, start);
					});
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
				return editor.insertSnippet(
					this.templateToSnippet(res.body.newText),
					position,
					{ undoStopBefore: false, undoStopAfter: true });
			}, () => false);
	}

	private templateToSnippet(template: string): SnippetString {
		let snippetIndex = 1;
		template = template.replace(/^\s*(?=(\/|[ ]\*))/gm, '');
		template = template.replace(/^(\/\*\*\s*\*[ ]*)$/m, (x) => x + `\$0`);
		template = template.replace(/\* @param([ ]\{\S+\})?\s+(\S+)\s*$/gm, (_param, type, post) => {
			let out = '* @param ';
			if (type === ' {any}') {
				out += `{\$\{${snippetIndex++}:\any\}} `;
			} else if (type) {
				out += type + ' ';
			}
			out += post + ` \${${snippetIndex++}}`;
			return out;
		});
		return new SnippetString(template);
	}

	/**
	 * Insert the default JSDoc
	 */
	private tryInsertDefaultDoc(editor: TextEditor, position: Position): Thenable<boolean> {
		const snippet = new SnippetString(`/**\n * $0\n */`);
		return editor.insertSnippet(snippet, position, { undoStopBefore: false, undoStopAfter: true });
	}
}