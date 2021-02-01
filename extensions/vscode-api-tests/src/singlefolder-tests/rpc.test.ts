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

	test('no rpc, createStatusBarItem(...)', function () {
		this.skip();
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
});
