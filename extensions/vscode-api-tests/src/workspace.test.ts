/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { createRandomFile, deleteFile, closeAllEditors, pathEquals } from './utils';
import { join, basename } from 'path';
import * as fs from 'fs';

suite('workspace-namespace', () => {

	teardown(closeAllEditors);

	test('MarkdownString', function () {
		let md = new vscode.MarkdownString();
		assert.equal(md.value, '');
		assert.equal(md.isTrusted, undefined);

		md = new vscode.MarkdownString('**bold**');
		assert.equal(md.value, '**bold**');

		md.appendText('**bold?**');
		assert.equal(md.value, '**bold**\\*\\*bold?\\*\\*');

		md.appendMarkdown('**bold**');
		assert.equal(md.value, '**bold**\\*\\*bold?\\*\\***bold**');
	});


	test('textDocuments', () => {
		assert.ok(Array.isArray(vscode.workspace.textDocuments));
		assert.throws(() => (<any>vscode.workspace).textDocuments = null);
	});

	test('rootPath', () => {
		if (vscode.workspace.rootPath) {
			assert.ok(pathEquals(vscode.workspace.rootPath, join(__dirname, '../testWorkspace')));
		}
		assert.throws(() => vscode.workspace.rootPath = 'farboo');
	});

	test('openTextDocument', () => {
		let len = vscode.workspace.textDocuments.length;
		return vscode.workspace.openTextDocument(join(vscode.workspace.rootPath || '', './simple.txt')).then(doc => {
			assert.ok(doc);
			assert.equal(vscode.workspace.textDocuments.length, len + 1);
		});
	});

	test('openTextDocument, illegal path', () => {
		return vscode.workspace.openTextDocument('funkydonky.txt').then(doc => {
			throw new Error('missing error');
		}, err => {
			// good!
		});
	});

	test('openTextDocument, untitled is dirty', function () {
		return vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + join(vscode.workspace.rootPath || '', './newfile.txt'))).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);
		});
	});

	test('openTextDocument, untitled with host', function () {
		const uri = vscode.Uri.parse('untitled://localhost/c%24/Users/jrieken/code/samples/foobar.txt');
		return vscode.workspace.openTextDocument(uri).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
		});
	});

	test('openTextDocument, untitled without path', function () {
		return vscode.workspace.openTextDocument().then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);
		});
	});

	test('openTextDocument, untitled without path but language ID', function () {
		return vscode.workspace.openTextDocument({ language: 'xml' }).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.equal(doc.languageId, 'xml');
			assert.ok(doc.isDirty);
		});
	});

	test('openTextDocument, untitled without path but language ID and content', function () {
		return vscode.workspace.openTextDocument({ language: 'html', content: '<h1>Hello world!</h1>' }).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.equal(doc.languageId, 'html');
			assert.ok(doc.isDirty);
			assert.equal(doc.getText(), '<h1>Hello world!</h1>');
		});
	});

	test('openTextDocument, untitled closes on save', function (done) {
		const path = join(vscode.workspace.rootPath || '', './newfile.txt');

		return vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + path)).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);

			let closed: vscode.TextDocument;
			let d0 = vscode.workspace.onDidCloseTextDocument(e => closed = e);

			return vscode.window.showTextDocument(doc).then(() => {
				return doc.save().then(() => {
					assert.ok(closed === doc);
					assert.ok(!doc.isDirty);
					assert.ok(fs.existsSync(path));

					d0.dispose();

					return deleteFile(vscode.Uri.file(join(vscode.workspace.rootPath || '', './newfile.txt'))).then(() => done(null));
				});
			});

		});
	});

	test('openTextDocument, uri scheme/auth/path', function () {

		let registration = vscode.workspace.registerTextDocumentContentProvider('sc', {
			provideTextDocumentContent() {
				return 'SC';
			}
		});

		return Promise.all([
			vscode.workspace.openTextDocument(vscode.Uri.parse('sc://auth')).then(doc => {
				assert.equal(doc.uri.authority, 'auth');
				assert.equal(doc.uri.path, '');
			}),
			vscode.workspace.openTextDocument(vscode.Uri.parse('sc:///path')).then(doc => {
				assert.equal(doc.uri.authority, '');
				assert.equal(doc.uri.path, '/path');
			}),
			vscode.workspace.openTextDocument(vscode.Uri.parse('sc://auth/path')).then(doc => {
				assert.equal(doc.uri.authority, 'auth');
				assert.equal(doc.uri.path, '/path');
			})
		]).then(() => {
			registration.dispose();
		});
	});

	test('eol, read', () => {
		const a = createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.equal(doc.eol, vscode.EndOfLine.LF);
			});
		});
		const b = createRandomFile('foo\nbar\nbar\r\nbaz').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.equal(doc.eol, vscode.EndOfLine.LF);
			});
		});
		const c = createRandomFile('foo\r\nbar\r\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.equal(doc.eol, vscode.EndOfLine.CRLF);
			});
		});
		return Promise.all([a, b, c]);
	});

	test('eol, change via editor', () => {
		return createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.equal(doc.eol, vscode.EndOfLine.LF);
				return vscode.window.showTextDocument(doc).then(editor => {
					return editor.edit(builder => builder.setEndOfLine(vscode.EndOfLine.CRLF));

				}).then(value => {
					assert.ok(value);
					assert.ok(doc.isDirty);
					assert.equal(doc.eol, vscode.EndOfLine.CRLF);
				});
			});
		});
	});

	test('eol, change via applyEdit', () => {
		return createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.equal(doc.eol, vscode.EndOfLine.LF);

				const edit = new vscode.WorkspaceEdit();
				edit.set(file, [vscode.TextEdit.setEndOfLine(vscode.EndOfLine.CRLF)]);
				return vscode.workspace.applyEdit(edit).then(value => {
					assert.ok(value);
					assert.ok(doc.isDirty);
					assert.equal(doc.eol, vscode.EndOfLine.CRLF);
				});
			});
		});
	});

	test('eol, change via onWillSave', () => {

		let called = false;
		let sub = vscode.workspace.onWillSaveTextDocument(e => {
			called = true;
			e.waitUntil(Promise.resolve([vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF)]));
		});

		return createRandomFile('foo\r\nbar\r\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.equal(doc.eol, vscode.EndOfLine.CRLF);
				const edit = new vscode.WorkspaceEdit();
				edit.set(file, [vscode.TextEdit.insert(new vscode.Position(0, 0), '-changes-')]);

				return vscode.workspace.applyEdit(edit).then(success => {
					assert.ok(success);
					return doc.save();

				}).then(success => {
					assert.ok(success);
					assert.ok(called);
					assert.ok(!doc.isDirty);
					assert.equal(doc.eol, vscode.EndOfLine.LF);
					sub.dispose();
				});
			});
		});
	});

	test('events: onDidOpenTextDocument, onDidChangeTextDocument, onDidSaveTextDocument', () => {
		return createRandomFile().then(file => {
			let disposables: vscode.Disposable[] = [];

			let onDidOpenTextDocument = false;
			disposables.push(vscode.workspace.onDidOpenTextDocument(e => {
				assert.ok(pathEquals(e.uri.fsPath, file.fsPath));
				onDidOpenTextDocument = true;
			}));

			let onDidChangeTextDocument = false;
			disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
				assert.ok(pathEquals(e.document.uri.fsPath, file.fsPath));
				onDidChangeTextDocument = true;
			}));

			let onDidSaveTextDocument = false;
			disposables.push(vscode.workspace.onDidSaveTextDocument(e => {
				assert.ok(pathEquals(e.uri.fsPath, file.fsPath));
				onDidSaveTextDocument = true;
			}));

			return vscode.workspace.openTextDocument(file).then(doc => {
				return vscode.window.showTextDocument(doc).then((editor) => {
					return editor.edit((builder) => {
						builder.insert(new vscode.Position(0, 0), 'Hello World');
					}).then(applied => {
						return doc.save().then(saved => {
							assert.ok(onDidOpenTextDocument);
							assert.ok(onDidChangeTextDocument);
							assert.ok(onDidSaveTextDocument);

							while (disposables.length) {
								const item = disposables.pop();
								if (item) {
									item.dispose();
								}
							}

							return deleteFile(file);
						});
					});
				});
			});
		});
	});

	test('openTextDocument, with selection', function () {
		return createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				return vscode.window.showTextDocument(doc, { selection: new vscode.Range(new vscode.Position(1, 1), new vscode.Position(1, 2)) }).then(editor => {
					assert.equal(editor.selection.start.line, 1);
					assert.equal(editor.selection.start.character, 1);
					assert.equal(editor.selection.end.line, 1);
					assert.equal(editor.selection.end.character, 2);
				});
			});
		});
	});

	test('registerTextDocumentContentProvider, simple', function () {

		let registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return uri.toString();
			}
		});

		const uri = vscode.Uri.parse('foo://testing/virtual.js');
		return vscode.workspace.openTextDocument(uri).then(doc => {
			assert.equal(doc.getText(), uri.toString());
			assert.equal(doc.isDirty, false);
			assert.equal(doc.uri.toString(), uri.toString());
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, constrains', function () {

		// built-in
		assert.throws(function () {
			vscode.workspace.registerTextDocumentContentProvider('untitled', { provideTextDocumentContent() { return null; } });
		});
		// built-in
		assert.throws(function () {
			vscode.workspace.registerTextDocumentContentProvider('file', { provideTextDocumentContent() { return null; } });
		});

		// missing scheme
		return vscode.workspace.openTextDocument(vscode.Uri.parse('notThere://foo/far/boo/bar')).then(() => {
			assert.ok(false, 'expected failure');
		}, err => {
			// expected
		});
	});

	test('registerTextDocumentContentProvider, multiple', function () {

		// duplicate registration
		let registration1 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				if (uri.authority === 'foo') {
					return '1';
				}
			}
		});
		let registration2 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				if (uri.authority === 'bar') {
					return '2';
				}
			}
		});

		return Promise.all([
			vscode.workspace.openTextDocument(vscode.Uri.parse('foo://foo/bla')).then(doc => { assert.equal(doc.getText(), '1'); }),
			vscode.workspace.openTextDocument(vscode.Uri.parse('foo://bar/bla')).then(doc => { assert.equal(doc.getText(), '2'); })
		]).then(() => {
			registration1.dispose();
			registration2.dispose();
		});
	});

	test('registerTextDocumentContentProvider, evil provider', function () {

		// duplicate registration
		let registration1 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return '1';
			}
		});
		let registration2 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri): string {
				throw new Error('fail');
			}
		});

		return vscode.workspace.openTextDocument(vscode.Uri.parse('foo://foo/bla')).then(doc => {
			assert.equal(doc.getText(), '1');
			registration1.dispose();
			registration2.dispose();
		});
	});

	test('registerTextDocumentContentProvider, invalid text', function () {

		let registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return <any>123;
			}
		});
		return vscode.workspace.openTextDocument(vscode.Uri.parse('foo://auth/path')).then(() => {
			assert.ok(false, 'expected failure');
		}, err => {
			// expected
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, show virtual document', function () {

		let registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return 'I am virtual';
			}
		});

		return vscode.workspace.openTextDocument(vscode.Uri.parse('foo://something/path')).then(doc => {
			return vscode.window.showTextDocument(doc).then(editor => {

				assert.ok(editor.document === doc);
				assert.equal(editor.document.getText(), 'I am virtual');
				registration.dispose();
			});
		});
	});

	test('registerTextDocumentContentProvider, open/open document', function () {

		let callCount = 0;
		let registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				callCount += 1;
				return 'I am virtual';
			}
		});

		const uri = vscode.Uri.parse('foo://testing/path');

		return Promise.all([vscode.workspace.openTextDocument(uri), vscode.workspace.openTextDocument(uri)]).then(docs => {
			let [first, second] = docs;
			assert.ok(first === second);
			assert.ok(vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString()));
			assert.equal(callCount, 1);
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, empty doc', function () {

		let registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return '';
			}
		});

		const uri = vscode.Uri.parse('foo:doc/empty');

		return vscode.workspace.openTextDocument(uri).then(doc => {
			assert.equal(doc.getText(), '');
			assert.equal(doc.uri.toString(), uri.toString());
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, change event', function () {

		let callCount = 0;
		let emitter = new vscode.EventEmitter<vscode.Uri>();

		let registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			onDidChange: emitter.event,
			provideTextDocumentContent(uri) {
				return 'call' + (callCount++);
			}
		});

		const uri = vscode.Uri.parse('foo://testing/path3');

		return vscode.workspace.openTextDocument(uri).then(doc => {

			assert.equal(callCount, 1);
			assert.equal(doc.getText(), 'call0');

			return new Promise((resolve, reject) => {

				let subscription = vscode.workspace.onDidChangeTextDocument(event => {
					subscription.dispose();
					assert.ok(event.document === doc);
					assert.equal(event.document.getText(), 'call1');
					resolve();
				});

				emitter.fire(doc.uri);

				registration.dispose();
			});
		});
	});

	test('findFiles', () => {
		return vscode.workspace.findFiles('*.js').then((res) => {
			assert.equal(res.length, 1);
			assert.equal(basename(vscode.workspace.asRelativePath(res[0])), 'far.js');
		});
	}).timeout(60 * 1000); // Increase timeout for search-based test

	// TODO@Joh this test fails randomly
	// test('findFiles, cancellation', () => {

	// 	const source = new CancellationTokenSource();
	// 	const token = source.token; // just to get an instance first
	// 	source.cancel();

	// 	return vscode.workspace.findFiles('*.js', null, 100, token).then((res) => {
	// 		assert.equal(res, void 0);
	// 	});
	// });

	test('applyEdit', () => {

		return vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + join(vscode.workspace.rootPath || '', './new2.txt'))).then(doc => {
			let edit = new vscode.WorkspaceEdit();
			edit.insert(doc.uri, new vscode.Position(0, 0), new Array(1000).join('Hello World'));
			return vscode.workspace.applyEdit(edit);
		});
	});
});
