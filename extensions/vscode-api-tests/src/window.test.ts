/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window, ViewColumn, TextEditor} from 'vscode';
import {join} from 'path';
import {cleanUp, pathEquals} from './utils';

suite("window namespace tests", () => {

	teardown(cleanUp);

	test('editor, active text editor', () => {
		return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			return window.showTextDocument(doc).then((editor) => {
				const active = window.activeTextEditor;
				assert.ok(active);
				assert.ok(pathEquals(active.document.uri.fsPath, doc.uri.fsPath));
			});
		});
	});

	test('editor, assign and check view columns', () => {

		return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			let p1 = window.showTextDocument(doc, ViewColumn.One).then(editor => {
				assert.equal(editor.viewColumn, ViewColumn.One);
			});
			let p2 = window.showTextDocument(doc, ViewColumn.Two).then(editor => {
				assert.equal(editor.viewColumn, ViewColumn.Two);
			});
			let p3 = window.showTextDocument(doc, ViewColumn.Three).then(editor => {
				assert.equal(editor.viewColumn, ViewColumn.Three);
			});
			return Promise.all([p1, p2, p3]);
		});
	});

	test('editor, onDidChangeTextEditorViewColumn', () => {

		let actualTextEditor: TextEditor;
		let actualViewColumn: ViewColumn;

		let registration = window.onDidChangeTextEditorViewColumn(event => {
			actualTextEditor = event.textEditor;
			actualViewColumn = event.viewColumn;
		});

		return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			return window.showTextDocument(doc, ViewColumn.One).then(editor => {
				assert.ok(actualTextEditor === editor);
				assert.ok(actualViewColumn === editor.viewColumn);
				registration.dispose();
			});
		});
	});
});