/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, window, Position, Range, commands} from 'vscode';
import {createRandomFile, deleteFile, cleanUp} from './utils';

suite('editor tests', () => {

	teardown(cleanUp);

	function withRandomFileEditor(initialContents:string, run:(editor:vscode.TextEditor, doc:vscode.TextDocument)=>Thenable<void>): Thenable<boolean> {
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

	function executeReplace(editor:vscode.TextEditor, range:Range, text:string, undoStopBefore:boolean, undoStopAfter: boolean): Thenable<boolean> {
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
});
