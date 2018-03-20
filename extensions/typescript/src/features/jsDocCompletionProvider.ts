/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, Range, CompletionItemProvider, CompletionItemKind, TextDocument, CancellationToken, CompletionItem, window, Uri, TextEditor, SnippetString, workspace } from 'vscode';

import { ITypeScriptServiceClient } from '../typescriptService';
import * as Proto from '../protocol';

import * as nls from 'vscode-nls';
import * as typeConverters from '../utils/typeConverters';
import { Command, CommandManager } from '../utils/commandManager';
const localize = nls.loadMessageBundle();

const configurationNamespace = 'jsDocCompletion';

namespace Configuration {
	export const enabled = 'enabled';
}

class JsDocCompletionItem extends CompletionItem {
	constructor(
		document: TextDocument,
		position: Position,
		shouldGetJSDocFromTSServer: boolean,
	) {
		super('/** */', CompletionItemKind.Snippet);
		this.detail = localize('typescript.jsDocCompletionItem.documentation', 'JSDoc comment');
		this.insertText = '';
		this.sortText = '\0';

		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character).match(/\/\**\s*$/);
		const suffix = line.slice(position.character).match(/^\s*\**\//);
		const start = position.translate(0, prefix ? -prefix[0].length : 0);
		this.range = new Range(
			start,
			position.translate(0, suffix ? suffix[0].length : 0));

		this.command = {
			title: 'Try Complete JSDoc',
			command: TryCompleteJsDocCommand.COMMAND_NAME,
			arguments: [document.uri, start, shouldGetJSDocFromTSServer]
		};
	}
}

export default class JsDocCompletionProvider implements CompletionItemProvider {

	constructor(
		private client: ITypeScriptServiceClient,
		commandManager: CommandManager
	) {
		commandManager.register(new TryCompleteJsDocCommand(client));
	}

	public async provideCompletionItems(
		document: TextDocument,
		position: Position,
		token: CancellationToken
	): Promise<CompletionItem[]> {
		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		// TODO: unregister provider when disabled
		const enableJsDocCompletions = workspace.getConfiguration(configurationNamespace, document.uri).get<boolean>(Configuration.enabled, true);
		if (!enableJsDocCompletions) {
			return [];
		}

		// Only show the JSdoc completion when the everything before the cursor is whitespace
		// or could be the opening of a comment
		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character);
		if (prefix.match(/^\s*$|\/\*\*\s*$|^\s*\/\*\*+\s*$/) === null) {
			return [];
		}

		const args: Proto.FileRequestArgs = {
			file
		};
		const response = await Promise.race([
			this.client.execute('navtree', args, token),
			new Promise<Proto.NavTreeResponse>((resolve) => setTimeout(resolve, 250))
		]);
		if (!response || !response.body) {
			return [];
		}

		const body = response.body;

		function matchesPosition(tree: Proto.NavigationTree): boolean {
			if (!tree.spans.length) {
				return false;
			}
			const span = typeConverters.Range.fromTextSpan(tree.spans[0]);
			if (position.line === span.start.line - 1 || position.line === span.start.line) {
				return true;
			}

			return tree.childItems ? tree.childItems.some(matchesPosition) : false;
		}

		if (!matchesPosition(body)) {
			return [];
		}

		return [new JsDocCompletionItem(document, position, enableJsDocCompletions)];
	}

	public resolveCompletionItem(item: CompletionItem, _token: CancellationToken) {
		return item;
	}
}

class TryCompleteJsDocCommand implements Command {
	public static readonly COMMAND_NAME = '_typeScript.tryCompleteJsDoc';
	public readonly id = TryCompleteJsDocCommand.COMMAND_NAME;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	/**
	 * Try to insert a jsdoc comment, using a template provide by typescript
	 * if possible, otherwise falling back to a default comment format.
	 */
	public async execute(resource: Uri, start: Position, shouldGetJSDocFromTSServer: boolean): Promise<boolean> {
		const file = this.client.normalizePath(resource);
		if (!file) {
			return false;
		}

		const editor = window.activeTextEditor;
		if (!editor || editor.document.uri.fsPath !== resource.fsPath) {
			return false;
		}

		if (!shouldGetJSDocFromTSServer) {
			return this.tryInsertDefaultDoc(editor, start);
		}

		const didInsertFromTemplate = await this.tryInsertJsDocFromTemplate(editor, file, start);
		if (didInsertFromTemplate) {
			return true;
		}
		return this.tryInsertDefaultDoc(editor, start);
	}

	private async tryInsertJsDocFromTemplate(editor: TextEditor, file: string, position: Position): Promise<boolean> {
		const snippet = await TryCompleteJsDocCommand.getSnippetTemplate(this.client, file, position);
		if (!snippet) {
			return false;
		}
		return editor.insertSnippet(
			snippet,
			position,
			{ undoStopBefore: false, undoStopAfter: true });
	}

	public static getSnippetTemplate(client: ITypeScriptServiceClient, file: string, position: Position): Promise<SnippetString | undefined> {
		const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
		return Promise.race([
			client.execute('docCommentTemplate', args),
			new Promise<Proto.DocCommandTemplateResponse>((_, reject) => setTimeout(reject, 250))
		]).then((res: Proto.DocCommandTemplateResponse) => {
			if (!res || !res.body) {
				return undefined;
			}
			// Workaround for #43619
			// docCommentTemplate previously returned undefined for empty jsdoc templates.
			// TS 2.7 now returns a single line doc comment, which breaks indentation.
			if (res.body.newText === '/** */') {
				return undefined;
			}
			return TryCompleteJsDocCommand.templateToSnippet(res.body.newText);
		}, () => undefined);
	}

	private static templateToSnippet(template: string): SnippetString {
		// TODO: use append placeholder
		let snippetIndex = 1;
		template = template.replace(/^\s*(?=(\/|[ ]\*))/gm, '');
		template = template.replace(/^(\/\*\*\s*\*[ ]*)$/m, (x) => x + `\$0`);
		template = template.replace(/\* @param([ ]\{\S+\})?\s+(\S+)\s*$/gm, (_param, type, post) => {
			let out = '* @param ';
			if (type === ' {any}' || type === ' {*}') {
				out += `{\$\{${snippetIndex++}:*\}} `;
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
