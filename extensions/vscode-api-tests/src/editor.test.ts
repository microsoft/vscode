/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { join } from 'path';
import { workspace, window, Position, Range, commands, TextEditor, TextDocument, TextEditorCursorStyle, TextEditorLineNumbersStyle, SnippetString, Selection, ViewColumn } from 'vscode';
import { createRandomFile, deleteFile, cleanUp } from './utils';

suite('editor tests', () => {

	teardown(cleanUp);

	function withRandomFileEditor(initialContents: string, run: (editor: TextEditor, doc: TextDocument) => Thenable<void>): Thenable<boolean> {
		return createRandomFile(initialContents).then(file => {
			return workspace.openTextDocument(file).then(doc => {
				return window.showTextDocument(doc).then((editor) => {
					return run(editor, doc).then(_ => {
						if (doc.isDirty) {
							return doc.save().then(saved => {
								assert.ok(saved);
								assert.ok(!doc.isDirty);
								return deleteFile(file);
							});
						} else {
							return deleteFile(file);
						}
					});
				});
			});
		});
	}

	test('insert snippet', () => {
		const snippetString = new SnippetString()
			.appendText('This is a ')
			.appendTabstop()
			.appendPlaceholder('placeholder')
			.appendText(' snippet');

		return withRandomFileEditor('', (editor, doc) => {
			return editor.insertSnippet(snippetString).then(inserted => {
				assert.ok(inserted);
				assert.equal(doc.getText(), 'This is a placeholder snippet');
				assert.ok(doc.isDirty);
			});
		});
	});

	test('insert snippet with replacement, editor selection', () => {
		const snippetString = new SnippetString()
			.appendText('has been');

		return withRandomFileEditor('This will be replaced', (editor, doc) => {
			editor.selection = new Selection(
				new Position(0, 5),
				new Position(0, 12)
			);

			return editor.insertSnippet(snippetString).then(inserted => {
				assert.ok(inserted);
				assert.equal(doc.getText(), 'This has been replaced');
				assert.ok(doc.isDirty);
			});
		});
	});

	test('insert snippet with replacement, selection as argument', () => {
		const snippetString = new SnippetString()
			.appendText('has been');

		return withRandomFileEditor('This will be replaced', (editor, doc) => {
			const selection = new Selection(
				new Position(0, 5),
				new Position(0, 12)
			);

			return editor.insertSnippet(snippetString, selection).then(inserted => {
				assert.ok(inserted);
				assert.equal(doc.getText(), 'This has been replaced');
				assert.ok(doc.isDirty);
			});
		});
	});

	test('make edit', () => {
		return withRandomFileEditor('', (editor, doc) => {
			return editor.edit((builder) => {
				builder.insert(new Position(0, 0), 'Hello World');
			}).then(applied => {
				assert.ok(applied);
				assert.equal(doc.getText(), 'Hello World');
				assert.ok(doc.isDirty);
			});
		});
	});

	test('issue #6281: Edits fail to validate ranges correctly before applying', () => {
		return withRandomFileEditor('Hello world!', (editor, doc) => {
			return editor.edit((builder) => {
				builder.replace(new Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE), 'new');
			}).then(applied => {
				assert.ok(applied);
				assert.equal(doc.getText(), 'new');
				assert.ok(doc.isDirty);
			});
		});
	});

	test('issue #20867: vscode.window.visibleTextEditors returns closed document 1/2', () => {

		return withRandomFileEditor('Hello world!', editor => {

			const p = new Promise((resolve, reject) => {
				const sub = workspace.onDidCloseTextDocument(doc => {
					try {
						sub.dispose();
						assert.ok(window.activeTextEditor === undefined);
						assert.equal(window.visibleTextEditors.length, 0);
						resolve();
					} catch (e) {
						reject(e);
					}
				});
			});

			return Promise.all([
				commands.executeCommand('workbench.action.closeAllEditors'),
				p
			]).then(() => undefined);
		});
	});

	test('issue #20867: vscode.window.visibleTextEditors returns closed document 2/2', () => {

		const file10Path = join(workspace.rootPath || '', './10linefile.ts');
		const file30Path = join(workspace.rootPath || '', './30linefile.ts');

		return Promise.all([
			workspace.openTextDocument(file10Path),
			workspace.openTextDocument(file30Path)
		]).then(docs => {
			return Promise.all([
				window.showTextDocument(docs[0], ViewColumn.One),
				window.showTextDocument(docs[1], ViewColumn.Two),
			]);
		}).then(editors => {

			const p = new Promise((resolve, reject) => {
				const sub = workspace.onDidCloseTextDocument(doc => {
					try {
						sub.dispose();
						assert.ok(window.activeTextEditor === editors[1]);
						assert.ok(window.visibleTextEditors[0] === editors[1]);
						assert.equal(window.visibleTextEditors.length, 1);
						resolve();
					} catch (e) {
						reject(e);
					}
				});
			});

			// hide doesn't what it means because it triggers a close event and because it
			// detached the editor. For this test that's what we want.
			editors[0].hide();
			return p;
		});
	});

	function executeReplace(editor: TextEditor, range: Range, text: string, undoStopBefore: boolean, undoStopAfter: boolean): Thenable<boolean> {
		return editor.edit((builder) => {
			builder.replace(range, text);
		}, { undoStopBefore: undoStopBefore, undoStopAfter: undoStopAfter });
	}

	test('TextEditor.edit can control undo/redo stack 1', () => {
		return withRandomFileEditor('Hello world!', (editor, doc) => {
			return executeReplace(editor, new Range(0, 0, 0, 1), 'h', false, false).then(applied => {
				assert.ok(applied);
				assert.equal(doc.getText(), 'hello world!');
				assert.ok(doc.isDirty);
				return executeReplace(editor, new Range(0, 1, 0, 5), 'ELLO', false, false);
			}).then(applied => {
				assert.ok(applied);
				assert.equal(doc.getText(), 'hELLO world!');
				assert.ok(doc.isDirty);
				return commands.executeCommand('undo');
			}).then(_ => {
				assert.equal(doc.getText(), 'Hello world!');
			});
		});
	});

	test('TextEditor.edit can control undo/redo stack 2', () => {
		return withRandomFileEditor('Hello world!', (editor, doc) => {
			return executeReplace(editor, new Range(0, 0, 0, 1), 'h', false, false).then(applied => {
				assert.ok(applied);
				assert.equal(doc.getText(), 'hello world!');
				assert.ok(doc.isDirty);
				return executeReplace(editor, new Range(0, 1, 0, 5), 'ELLO', true, false);
			}).then(applied => {
				assert.ok(applied);
				assert.equal(doc.getText(), 'hELLO world!');
				assert.ok(doc.isDirty);
				return commands.executeCommand('undo');
			}).then(_ => {
				assert.equal(doc.getText(), 'hello world!');
			});
		});
	});

	test('issue #16573: Extension API: insertSpaces and tabSize are undefined', () => {
		return withRandomFileEditor('Hello world!\n\tHello world!', (editor, doc) => {

			assert.equal(editor.options.tabSize, 4);
			assert.equal(editor.options.insertSpaces, false);
			assert.equal(editor.options.cursorStyle, TextEditorCursorStyle.Line);
			assert.equal(editor.options.lineNumbers, TextEditorLineNumbersStyle.On);

			editor.options = {
				tabSize: 2
			};

			assert.equal(editor.options.tabSize, 2);
			assert.equal(editor.options.insertSpaces, false);
			assert.equal(editor.options.cursorStyle, TextEditorCursorStyle.Line);
			assert.equal(editor.options.lineNumbers, TextEditorLineNumbersStyle.On);

			editor.options.tabSize = 'invalid';

			assert.equal(editor.options.tabSize, 2);
			assert.equal(editor.options.insertSpaces, false);
			assert.equal(editor.options.cursorStyle, TextEditorCursorStyle.Line);
			assert.equal(editor.options.lineNumbers, TextEditorLineNumbersStyle.On);

			return Promise.resolve();
		});
	});
});
