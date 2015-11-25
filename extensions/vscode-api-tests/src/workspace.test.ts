/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, TextDocument, window, Position} from 'vscode';
import {createRandomFile, deleteFile, cleanUp} from './utils';
import {join} from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('workspace-namespace', () => {

	teardown((done) => {
		cleanUp().then(() => done(), (error) => done(error));
	});

	test('textDocuments', () => {
		assert.ok(Array.isArray(workspace.textDocuments));
		assert.throws(() => workspace.textDocuments = null);
	});

	test('rootPath', () => {
		assert.equal(workspace.rootPath, join(__dirname, '../testWorkspace'));
		assert.throws(() => workspace.rootPath = 'farboo');
	});

	test('openTextDocument', done => {
		workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			assert.ok(doc);
			done();
		}, err => {
			done(err);
		});
	});

	test('openTextDocument, illegal path', done => {
		workspace.openTextDocument('funkydonky.txt').then(doc => {
			done(new Error('missing error'));
		}, err => {
			done();
		});
	});

	test('events: onDidOpenTextDocument, onDidChangeTextDocument, onDidSaveTextDocument', (done) => {
		createRandomFile().then(file => {
			let disposables = [];

			let onDidOpenTextDocument = false;
			disposables.push(workspace.onDidOpenTextDocument(e => {
				assert.equal(e.uri.fsPath, file.fsPath);
				onDidOpenTextDocument = true;
			}));

			let onDidChangeTextDocument = false;
			disposables.push(workspace.onDidChangeTextDocument(e => {
				assert.equal(e.document.uri.fsPath, file.fsPath);
				onDidChangeTextDocument = true;
			}));

			let onDidSaveTextDocument = false;
			disposables.push(workspace.onDidSaveTextDocument(e => {
				assert.equal(e.uri.fsPath, file.fsPath);
				onDidSaveTextDocument = true;
			}));

			return workspace.openTextDocument(file).then(doc => {
				return window.showTextDocument(doc).then((editor) => {
					return editor.edit((builder) => {
						builder.insert(new Position(0, 0), 'Hello World');
					}).then(applied => {
						return doc.save().then(saved => {
							assert.ok(onDidOpenTextDocument);
							assert.ok(onDidChangeTextDocument);
							assert.ok(onDidSaveTextDocument);

							while (disposables.length) {
								disposables.pop().dispose();
							}

							return deleteFile(file);
						});
					});
				});
			});
		}).then(() => done(), (error) => done(error));
	});

	test('findFiles', done => {
		workspace.findFiles('*.js', null).then((res) => {
			assert.equal(res.length, 1);
			assert.equal(workspace.asRelativePath(res[0]), '/far.js');

			done();
		}, err => {
			done(err);
		});
	});
});