/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNoRpcFromEntry, assertNoRpc, disposeAll } from '../utils';
import * as vscode from 'vscode';

suite('vscode', function () {

	const dispo: vscode.Disposable[] = [];

	teardown(() => {
		assertNoRpc();
		disposeAll(dispo);
	});

	test('no rpc', function () {
		assertNoRpc();
	});

	test('no rpc, createTextEditorDecorationType(...)', function () {
		const item = vscode.window.createTextEditorDecorationType({});
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TextEditorDecorationType']);
	});

	test('no rpc, createOutputChannel(...)', function () {
		const item = vscode.window.createOutputChannel('hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'OutputChannel']);
	});

	test('no rpc, createDiagnosticCollection(...)', function () {
		const item = vscode.languages.createDiagnosticCollection();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'DiagnosticCollection']);
	});

	test('no rpc, createQuickPick(...)', function () {
		const item = vscode.window.createQuickPick();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'QuickPick']);
	});

	test('no rpc, createInputBox(...)', function () {
		const item = vscode.window.createInputBox();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'InputBox']);
	});

	test('no rpc, createStatusBarItem(...)', function () {
		const item = vscode.window.createStatusBarItem();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'StatusBarItem']);
	});

	test('no rpc, createSourceControl(...)', function () {
		this.skip();
		const item = vscode.scm.createSourceControl('foo', 'Hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'SourceControl']);
	});

	test('no rpc, createCommentController(...)', function () {
		this.skip();
		const item = vscode.comments.createCommentController('foo', 'Hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'CommentController']);
	});

	test('no rpc, createWebviewPanel(...)', function () {
		const item = vscode.window.createWebviewPanel('webview', 'Hello', vscode.ViewColumn.Active);
		dispo.push(item);
		assertNoRpcFromEntry([item, 'WebviewPanel']);
	});

	test('no rpc, createTreeView(...)', function () {
		const treeDataProvider = new class implements vscode.TreeDataProvider<string> {
			getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
				return new vscode.TreeItem(element);
			}
			getChildren(_element?: string): vscode.ProviderResult<string[]> {
				return ['foo', 'bar'];
			}
		};
		const item = vscode.window.createTreeView('test.treeId', { treeDataProvider });
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TreeView']);
	});

	test('no rpc, createNotebookEditorDecorationType(...)', function () {
		const item = vscode.notebook.createNotebookEditorDecorationType({ top: {} });
		dispo.push(item);
		assertNoRpcFromEntry([item, 'NotebookEditorDecorationType']);
	});
});
