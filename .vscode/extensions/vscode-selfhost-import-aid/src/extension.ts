/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'path';

export async function activate(context: vscode.ExtensionContext) {

	const fileIndex = new class {

		private _currentRun?: Thenable<void>;

		private _disposables: vscode.Disposable[] = [];

		private readonly _index = new Map<string, vscode.Uri>();

		constructor() {
			const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts', false, true, false);
			this._disposables.push(watcher.onDidChange(e => { this._index.set(e.toString(), e); }));
			this._disposables.push(watcher.onDidDelete(e => { this._index.delete(e.toString()); }));
			this._disposables.push(watcher);

			this._refresh(false);
		}

		dispose(): void {
			for (const disposable of this._disposables) {
				disposable.dispose();
			}
			this._disposables = [];
			this._index.clear();
		}

		async all(token: vscode.CancellationToken) {

			await Promise.race([this._currentRun, new Promise<void>(resolve => token.onCancellationRequested(resolve))]);

			if (token.isCancellationRequested) {
				return undefined;
			}

			return Array.from(this._index.values());
		}

		private _refresh(clear: boolean) {
			// TODO@jrieken LATEST API! findFiles2New
			this._currentRun = vscode.workspace.findFiles('src/vs/**/*.ts', '{**/node_modules/**,**/extensions/**}').then(all => {
				if (clear) {
					this._index.clear();
				}
				for (const item of all) {
					this._index.set(item.toString(), item);
				}
			});
		}
	};

	const selector: vscode.DocumentSelector = 'typescript';

	function findNodeAtPosition(document: vscode.TextDocument, node: ts.Node, position: vscode.Position): ts.Node | undefined {
		if (node.getStart() <= document.offsetAt(position) && node.getEnd() >= document.offsetAt(position)) {
			return ts.forEachChild(node, child => findNodeAtPosition(document, child, position)) || node;
		}
		return undefined;
	}

	function findImportAt(document: vscode.TextDocument, position: vscode.Position): ts.ImportDeclaration | undefined {
		const sourceFile = ts.createSourceFile(document.fileName, document.getText(), ts.ScriptTarget.Latest, true);
		const node = findNodeAtPosition(document, sourceFile, position);
		if (node && ts.isStringLiteral(node) && ts.isImportDeclaration(node.parent)) {
			return node.parent;
		}
		return undefined;
	}

	const completionProvider = new class implements vscode.CompletionItemProvider {
		async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CompletionList | undefined> {

			const index = document.getText().lastIndexOf(' from \'');
			if (index < 0 || document.positionAt(index).line < position.line) {
				// line after last import is before position
				// -> no completion, safe a parse call
				return undefined;
			}

			const node = findImportAt(document, position);
			if (!node) {
				return undefined;
			}

			const range = new vscode.Range(document.positionAt(node.moduleSpecifier.pos), document.positionAt(node.moduleSpecifier.end));
			const uris = await fileIndex.all(token);

			if (!uris) {
				return undefined;
			}

			const result = new vscode.CompletionList();
			result.isIncomplete = true;

			for (const item of uris) {

				if (!item.path.endsWith('.ts')) {
					continue;
				}

				let relativePath = path.relative(path.dirname(document.uri.path), item.path);
				relativePath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;

				const label = path.basename(item.path, path.extname(item.path));
				const insertText = ` '${relativePath.replace(/\.ts$/, '.js')}'`;
				const filterText = ` '${label}'`;

				const completion = new vscode.CompletionItem({
					label: label,
					description: vscode.workspace.asRelativePath(item),
				});
				completion.kind = vscode.CompletionItemKind.File;
				completion.insertText = insertText;
				completion.filterText = filterText;
				completion.range = range;

				result.items.push(completion);
			}

			return result;
		}
	};

	class ImportCodeActions implements vscode.CodeActionProvider {

		static FixKind = vscode.CodeActionKind.QuickFix.append('esmImport');

		static SourceKind = vscode.CodeActionKind.SourceFixAll.append('esmImport');

		async provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): Promise<vscode.CodeAction[] | undefined> {

			if (context.only && ImportCodeActions.SourceKind.intersects(context.only)) {
				return this._provideFixAll(document, context, token);
			}

			return this._provideFix(document, range, context, token);
		}

		private async _provideFixAll(document: vscode.TextDocument, context: vscode.CodeActionContext, token: vscode.CancellationToken): Promise<vscode.CodeAction[] | undefined> {

			const diagnostics = context.diagnostics
				.filter(d => d.code === 2307)
				.sort((a, b) => b.range.start.compareTo(a.range.start));

			if (diagnostics.length === 0) {
				return undefined;
			}

			const uris = await fileIndex.all(token);
			if (!uris) {
				return undefined;
			}

			const result = new vscode.CodeAction(`Fix All ESM Imports`, ImportCodeActions.SourceKind);
			result.edit = new vscode.WorkspaceEdit();
			result.diagnostics = [];

			for (const diag of diagnostics) {

				const actions = this._provideFixesForDiag(document, diag, uris);

				if (actions.length === 0) {
					console.log(`ESM: no fixes for "${diag.message}"`);
					continue;
				}

				if (actions.length > 1) {
					console.log(`ESM: more than one fix for "${diag.message}", taking first`);
					console.log(actions);
				}

				const [first] = actions;
				result.diagnostics.push(diag);

				for (const [uri, edits] of first.edit!.entries()) {
					result.edit.set(uri, edits);
				}
			}
			// console.log(result.edit.get(document.uri));
			return [result];
		}

		private async _provideFix(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): Promise<vscode.CodeAction[] | undefined> {
			const uris = await fileIndex.all(token);
			if (!uris) {
				return [];
			}

			const diag = context.diagnostics.find(d => d.code === 2307 && d.range.intersection(range));
			return diag && this._provideFixesForDiag(document, diag, uris);
		}

		private _provideFixesForDiag(document: vscode.TextDocument, diag: vscode.Diagnostic, uris: Iterable<vscode.Uri>): vscode.CodeAction[] {

			const node = findImportAt(document, diag.range.start)?.moduleSpecifier;
			if (!node || !ts.isStringLiteral(node)) {
				return [];
			}

			const nodeRange = new vscode.Range(document.positionAt(node.pos), document.positionAt(node.end));
			const name = path.basename(node.text, path.extname(node.text));

			const result: vscode.CodeAction[] = [];

			for (const item of uris) {
				if (path.basename(item.path, path.extname(item.path)) === name) {
					let relativePath = path.relative(path.dirname(document.uri.path), item.path).replace(/\.ts$/, '.js');
					relativePath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;

					const action = new vscode.CodeAction(`Fix to '${relativePath}'`, ImportCodeActions.FixKind);
					action.edit = new vscode.WorkspaceEdit();
					action.edit.replace(document.uri, nodeRange, ` '${relativePath}'`);
					action.diagnostics = [diag];
					result.push(action);
				}
			}

			return result;
		}
	}

	context.subscriptions.push(fileIndex);
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, completionProvider));
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, new ImportCodeActions(), { providedCodeActionKinds: [ImportCodeActions.FixKind, ImportCodeActions.SourceKind] }));
}
