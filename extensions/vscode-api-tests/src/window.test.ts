/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window, commands, ViewColumn, TextEditor, TextEditorViewColumnChangeEvent, Uri} from 'vscode';
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

		let actualEvent: TextEditorViewColumnChangeEvent;

		let registration1 = workspace.registerTextDocumentContentProvider('bikes', {
			provideTextDocumentContent() {
				return 'mountainbiking,roadcycling';
			}
		})

		return Promise.all([
			workspace.openTextDocument(Uri.parse('bikes://testing/one')).then(doc => window.showTextDocument(doc, ViewColumn.One)),
			workspace.openTextDocument(Uri.parse('bikes://testing/two')).then(doc => window.showTextDocument(doc, ViewColumn.Two))
		]).then(editors => {

			let [one, two] = editors;

			return new Promise(resolve => {

				let registration2 = window.onDidChangeTextEditorViewColumn(event => {
					actualEvent = event;
					registration2.dispose();
					resolve();
				});

				// close editor 1, wait a little for the event to bubble
				one.hide();

			}).then(() => {
				assert.ok(actualEvent);
				assert.ok(actualEvent.textEditor === two);
				assert.ok(actualEvent.viewColumn === two.viewColumn);

				registration1.dispose();
			})
		});
	});
});