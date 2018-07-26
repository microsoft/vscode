/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Command, CommandManager } from '../utils/commandManager';
import { ConfigurationDependentRegistration } from '../utils/dependentRegistration';
import * as typeConverters from '../utils/typeConverters';


const localize = nls.loadMessageBundle();

class JsDocCompletionItem extends vscode.CompletionItem {
	constructor(
		document: vscode.TextDocument,
		position: vscode.Position
	) {
		super('/** */', vscode.CompletionItemKind.Snippet);
		this.detail = localize('typescript.jsDocCompletionItem.documentation', 'JSDoc comment');
		this.insertText = '';
		this.sortText = '\0';

		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character).match(/\/\**\s*$/);
		const suffix = line.slice(position.character).match(/^\s*\**\//);
		const start = position.translate(0, prefix ? -prefix[0].length : 0);
		this.range = new vscode.Range(
			start,
			position.translate(0, suffix ? suffix[0].length : 0));

		this.command = {
			title: 'Try Complete JSDoc',
			command: TryCompleteJsDocCommand.COMMAND_NAME,
			arguments: [document.uri, start]
		};
	}
}

class JsDocCompletionProvider implements vscode.CompletionItemProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient,
		commandManager: CommandManager
	) {
		commandManager.register(new TryCompleteJsDocCommand(client));
	}

	public async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.CompletionItem[]> {
		const file = this.client.toPath(document.uri);
		if (!file) {
			return [];
		}

		if (!this.isValidCursorPosition(document, position)) {
			return [];
		}

		if (!await this.isCommentableLocation(file, position, token)) {
			return [];
		}

		return [new JsDocCompletionItem(document, position)];
	}

	private async isCommentableLocation(
		file: string,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<boolean> {
		const args: Proto.FileRequestArgs = {
			file
		};
		const response = await Promise.race([
			this.client.execute('navtree', args, token),
			new Promise<Proto.NavTreeResponse>((resolve) => setTimeout(resolve, 250))
		]);

		if (!response || !response.body) {
			return false;
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

		return matchesPosition(body);
	}

	private isValidCursorPosition(document: vscode.TextDocument, position: vscode.Position): boolean {
		// Only show the JSdoc completion when the everything before the cursor is whitespace
		// or could be the opening of a comment
		const line = document.lineAt(position.line).text;
		const prefix = line.slice(0, position.character);
		return prefix.match(/^\s*$|\/\*\*\s*$|^\s*\/\*\*+\s*$/) !== null;
	}

	public resolveCompletionItem(item: vscode.CompletionItem, _token: vscode.CancellationToken) {
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
	public async execute(resource: vscode.Uri, start: vscode.Position): Promise<boolean> {
		const file = this.client.toPath(resource);
		if (!file) {
			return false;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.fsPath !== resource.fsPath) {
			return false;
		}

		const didInsertFromTemplate = await this.tryInsertJsDocFromTemplate(editor, file, start);
		if (didInsertFromTemplate) {
			return true;
		}

		return this.tryInsertDefaultDoc(editor, start);
	}

	private async tryInsertJsDocFromTemplate(editor: vscode.TextEditor, file: string, position: vscode.Position): Promise<boolean> {
		const snippet = await TryCompleteJsDocCommand.getSnippetTemplate(this.client, file, position);
		if (!snippet) {
			return false;
		}
		return editor.insertSnippet(
			snippet,
			position,
			{ undoStopBefore: false, undoStopAfter: true });
	}

	public static getSnippetTemplate(client: ITypeScriptServiceClient, file: string, position: vscode.Position): Promise<vscode.SnippetString | undefined> {
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
			return templateToSnippet(res.body.newText);
		}, () => undefined);
	}

	/**
	 * Insert the default JSDoc
	 */
	private tryInsertDefaultDoc(editor: vscode.TextEditor, position: vscode.Position): Thenable<boolean> {
		const snippet = new vscode.SnippetString(`/**\n * $0\n */`);
		return editor.insertSnippet(snippet, position, { undoStopBefore: false, undoStopAfter: true });
	}
}


export function templateToSnippet(template: string): vscode.SnippetString {
	// TODO: use append placeholder
	let snippetIndex = 1;
	template = template.replace(/\$/g, '\\$');
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
	return new vscode.SnippetString(template);
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	commandManager: CommandManager
): vscode.Disposable {
	return new ConfigurationDependentRegistration('jsDocCompletion', 'enabled', () => {
		return vscode.languages.registerCompletionItemProvider(selector,
			new JsDocCompletionProvider(client, commandManager),
			'*');
	});
}
