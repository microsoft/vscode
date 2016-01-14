/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, TextDocument, window, Position, Uri, CancellationTokenSource, Disposable} from 'vscode';
import {createRandomFile, deleteFile, cleanUp, pathEquals} from './utils';
import {join, basename} from 'path';
import * as fs from 'fs';

suite('workspace-namespace', () => {

	teardown(cleanUp);

	test('textDocuments', () => {
		assert.ok(Array.isArray(workspace.textDocuments));
		assert.throws(() => workspace.textDocuments = null);
	});

	test('rootPath', () => {
		assert.ok(pathEquals(workspace.rootPath, join(__dirname, '../testWorkspace')));
		assert.throws(() => workspace.rootPath = 'farboo');
	});

	test('openTextDocument', () => {
		return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			assert.ok(doc);
			assert.equal(workspace.textDocuments.length, 1);
		});
	});

	test('openTextDocument, illegal path', done => {
		workspace.openTextDocument('funkydonky.txt').then(doc => {
			done(new Error('missing error'));
		}, err => {
			done();
		});
	});

	test('openTextDocument, untitled is dirty', function(done) {
		if (process.platform === 'win32') {
			return done(); // TODO@Joh this test fails on windows
		}

		workspace.openTextDocument(Uri.parse('untitled://' + join(workspace.rootPath, './newfile.txt'))).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);
			done();
		});
	});

	test('openTextDocument, untitled closes on save', function() {
		const path = join(workspace.rootPath, './newfile.txt');

		return workspace.openTextDocument(Uri.parse('untitled://' + path)).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);

			let closed: TextDocument;
			let d0 = workspace.onDidCloseTextDocument(e => closed = e);

			return doc.save().then(() => {
				assert.ok(closed === doc);
				assert.ok(!doc.isDirty);
				assert.ok(fs.existsSync(path));

				d0.dispose();

				return deleteFile(Uri.file(join(workspace.rootPath, './newfile.txt')));
			});
		});
	});

	test('events: onDidOpenTextDocument, onDidChangeTextDocument, onDidSaveTextDocument', () => {
		return createRandomFile().then(file => {
			let disposables = [];

			let onDidOpenTextDocument = false;
			disposables.push(workspace.onDidOpenTextDocument(e => {
				assert.ok(pathEquals(e.uri.fsPath, file.fsPath));
				onDidOpenTextDocument = true;
			}));

			let onDidChangeTextDocument = false;
			disposables.push(workspace.onDidChangeTextDocument(e => {
				assert.ok(pathEquals(e.document.uri.fsPath, file.fsPath));
				onDidChangeTextDocument = true;
			}));

			let onDidSaveTextDocument = false;
			disposables.push(workspace.onDidSaveTextDocument(e => {
				assert.ok(pathEquals(e.uri.fsPath, file.fsPath));
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
		});
	});

	test('registerTextDocumentContentProvider, simple', function() {

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return uri.toString();
			}
		});

		const uri = Uri.parse('foo://testing/virtual.js');
		return workspace.openTextDocument(uri).then(doc => {
			assert.equal(doc.getText(), uri.toString());
			assert.equal(doc.isDirty, false);
			assert.equal(doc.uri.toString(), uri.toString());
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, constrains', function() {

		// built-in
		assert.throws(function() {
			workspace.registerTextDocumentContentProvider('untitled', { provideTextDocumentContent() { return null; } });
		});
		// built-in
		assert.throws(function() {
			workspace.registerTextDocumentContentProvider('file', { provideTextDocumentContent() { return null; } });
		});

		// duplicate registration
		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return uri.toString();
			}
		});
		assert.throws(function() {
			workspace.registerTextDocumentContentProvider('foo', { provideTextDocumentContent() { return null; } });
		});

		// unregister & register
		registration.dispose();
		registration = workspace.registerTextDocumentContentProvider('foo', { provideTextDocumentContent() { return null; } });
		registration.dispose();

		// missing scheme
		return workspace.openTextDocument(Uri.parse('notThere://foo/far/boo/bar')).then(() => {
			assert.ok(false, 'expected failure')
		}, err => {
			// expected
		})
	});

	test('registerTextDocumentContentProvider, show virtual document', function() {

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return 'I am virtual';
			}
		});

		return workspace.openTextDocument(Uri.parse('foo://something/path')).then(doc => {
			return window.showTextDocument(doc).then(editor => {

				assert.ok(editor.document === doc);
				assert.equal(editor.document.getText(), 'I am virtual');
				registration.dispose();
			})
		});
	});

	test('registerTextDocumentContentProvider, open/open document', function() {

		let callCount = 0;
		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				callCount += 1;
				return 'I am virtual';
			}
		});

		const uri = Uri.parse('foo://testing/path');

		return Promise.all([workspace.openTextDocument(uri), workspace.openTextDocument(uri)]).then(docs => {
			let [first, second] = docs;
			assert.ok(first === second);
			assert.ok(workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString()));
			assert.equal(callCount, 1);
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, change event', function() {

		let callCount = 0;
		let listeners: Function[] = [];
		let registration = workspace.registerTextDocumentContentProvider('foo', {
			onDidChange(callback, thisArg, disposables) {
				let actual = thisArg ? callback.bind(thisArg) : callback;
				listeners.push(actual);
				let subscription = new Disposable(() => {
					const idx = listeners.indexOf(actual);
					listeners.splice(idx, 1);
				});
				if (Array.isArray(disposables)) {
					disposables.push(subscription);
				}
				return subscription;
			},
			provideTextDocumentContent(uri) {
				return 'call' + (callCount++);
			}
		});

		const uri = Uri.parse('foo://testing/path2');

		return workspace.openTextDocument(uri).then(doc => {

			assert.equal(callCount, 1);
			assert.equal(doc.getText(), 'call0');

			return new Promise((resolve, reject) => {

				workspace.onDidChangeTextDocument(event => {
					assert.ok(event.document === doc);
					assert.equal(event.document.getText(), 'call1');
					resolve();
				});

				listeners.forEach(l => l(doc.uri));

				registration.dispose();
			});
		});
	});

	test('findFiles', () => {
		return workspace.findFiles('*.js', null).then((res) => {
			assert.equal(res.length, 1);
			assert.equal(basename(workspace.asRelativePath(res[0])), 'far.js');
		});
	});

	test('findFiles, cancellation', () => {

		const source = new CancellationTokenSource();
		const token = source.token; // just to get an instance first
		source.cancel();

		return workspace.findFiles('*.js', null, 100, token).then((res) => {
			assert.equal(res, void 0);
		});
	});
});
