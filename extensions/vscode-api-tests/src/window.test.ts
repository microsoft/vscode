/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window, ViewColumn, TextEditorViewColumnChangeEvent, Uri, Selection, Position} from 'vscode';
import {join} from 'path';
import {cleanUp, pathEquals} from './utils';

suite('window namespace tests', () => {

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

	test('editor, UN-active text editor', () => {
		assert.equal(window.visibleTextEditors.length, 0);
		assert.ok(window.activeTextEditor === undefined);
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
		});

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
			});
		});
	});

	test('issue #5362 - Incorrect TextEditor passed by onDidChangeTextEditorSelection', (done) => {
		const file10Path = join(workspace.rootPath, './10linefile.ts');
		const file30Path = join(workspace.rootPath, './30linefile.ts');

		let finished = false;
		let failOncePlease = (err:Error) => {
			if (finished) {
				return;
			}
			finished = true;
			done(err);
		};

		let passOncePlease = () => {
			if (finished) {
				return;
			}
			finished = true;
			done(null);
		};

		let subscription = window.onDidChangeTextEditorSelection((e) => {
			let lineCount = e.textEditor.document.lineCount;
			let pos1 = e.textEditor.selections[0].active.line;
			let pos2 = e.selections[0].active.line;

			if (pos1 !== pos2) {
				failOncePlease(new Error('received invalid selection changed event!'));
				return;
			}

			if (pos1 >= lineCount) {
				failOncePlease(new Error(`Cursor position (${pos1}) is not valid in the document ${e.textEditor.document.fileName} that has ${lineCount} lines.`));
				return;
			}
		});

		// Open 10 line file, show it in slot 1, set cursor to line 10
		// Open 30 line file, show it in slot 1, set cursor to line 30
		// Open 10 line file, show it in slot 1
		// Open 30 line file, show it in slot 1
		workspace.openTextDocument(file10Path).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then((editor10line) => {
			editor10line.selection = new Selection(new Position(9,0), new Position(9, 0));
		}).then(() => {
			return workspace.openTextDocument(file30Path);
		}).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then((editor30line) => {
			editor30line.selection = new Selection(new Position(29,0), new Position(29, 0));
		}).then(() => {
			return workspace.openTextDocument(file10Path);
		}).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then(() => {
			return workspace.openTextDocument(file30Path);
		}).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then(() => {
			subscription.dispose();
		}).then(passOncePlease, failOncePlease);
	});

	test('#7013 - input without options', function () {

		let p = window.showInputBox();
		assert.ok(typeof p === 'object');
	});
});
