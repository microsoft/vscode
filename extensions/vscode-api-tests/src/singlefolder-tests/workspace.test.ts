/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import { basename, join, posix } from 'path';
import * as vscode from 'vscode';
import { TestFS } from '../memfs';
import { assertNoRpc, closeAllEditors, createRandomFile, delay, deleteFile, disposeAll, pathEquals, revertAllDirty, rndName, testFs, withLogDisabled } from '../utils';

suite('vscode API - workspace', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('MarkdownString', function () {
		let md = new vscode.MarkdownString();
		assert.strictEqual(md.value, '');
		assert.strictEqual(md.isTrusted, undefined);

		md = new vscode.MarkdownString('**bold**');
		assert.strictEqual(md.value, '**bold**');

		md.appendText('**bold?**');
		assert.strictEqual(md.value, '**bold**\\*\\*bold?\\*\\*');

		md.appendMarkdown('**bold**');
		assert.strictEqual(md.value, '**bold**\\*\\*bold?\\*\\***bold**');
	});


	test('textDocuments', () => {
		assert.ok(Array.isArray(vscode.workspace.textDocuments));
		assert.throws(() => (<any>vscode.workspace).textDocuments = null);
	});

	test('rootPath', () => {
		assert.ok(pathEquals(vscode.workspace.rootPath!, join(__dirname, '../../testWorkspace')));
		assert.throws(() => (vscode.workspace as any).rootPath = 'farboo');
	});

	test('workspaceFile', () => {
		assert.ok(!vscode.workspace.workspaceFile);
	});

	test('workspaceFolders', () => {
		if (vscode.workspace.workspaceFolders) {
			assert.strictEqual(vscode.workspace.workspaceFolders.length, 1);
			assert.ok(pathEquals(vscode.workspace.workspaceFolders[0].uri.fsPath, join(__dirname, '../../testWorkspace')));
		}
	});

	test('getWorkspaceFolder', () => {
		const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(join(__dirname, '../../testWorkspace/far.js')));
		assert.ok(!!folder);

		if (folder) {
			assert.ok(pathEquals(folder.uri.fsPath, join(__dirname, '../../testWorkspace')));
		}
	});

	test('openTextDocument', async () => {
		const uri = await createRandomFile();

		// not yet there
		const existing1 = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
		assert.strictEqual(existing1, undefined);

		// open and assert its there
		const doc = await vscode.workspace.openTextDocument(uri);
		assert.ok(doc);
		assert.strictEqual(doc.uri.toString(), uri.toString());
		const existing2 = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
		assert.strictEqual(existing2 === doc, true);
	});

	test('openTextDocument, illegal path', () => {
		return vscode.workspace.openTextDocument('funkydonky.txt').then(_doc => {
			throw new Error('missing error');
		}, _err => {
			// good!
		});
	});

	test('openTextDocument, untitled is dirty', async function () {
		return vscode.workspace.openTextDocument(vscode.workspace.workspaceFolders![0].uri.with({ scheme: 'untitled', path: posix.join(vscode.workspace.workspaceFolders![0].uri.path, 'newfile.txt') })).then(doc => {
			assert.strictEqual(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);
		});
	});

	test('openTextDocument, untitled with host', function () {
		const uri = vscode.Uri.parse('untitled://localhost/c%24/Users/jrieken/code/samples/foobar.txt');
		return vscode.workspace.openTextDocument(uri).then(doc => {
			assert.strictEqual(doc.uri.scheme, 'untitled');
		});
	});

	test('openTextDocument, untitled without path', function () {
		return vscode.workspace.openTextDocument().then(doc => {
			assert.strictEqual(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);
		});
	});

	test('openTextDocument, untitled without path but language ID', function () {
		return vscode.workspace.openTextDocument({ language: 'xml' }).then(doc => {
			assert.strictEqual(doc.uri.scheme, 'untitled');
			assert.strictEqual(doc.languageId, 'xml');
			assert.ok(doc.isDirty);
		});
	});

	test('openTextDocument, untitled without path but language ID and content', function () {
		return vscode.workspace.openTextDocument({ language: 'html', content: '<h1>Hello world!</h1>' }).then(doc => {
			assert.strictEqual(doc.uri.scheme, 'untitled');
			assert.strictEqual(doc.languageId, 'html');
			assert.ok(doc.isDirty);
			assert.strictEqual(doc.getText(), '<h1>Hello world!</h1>');
		});
	});

	test('openTextDocument, untitled closes on save', function () {
		const path = join(vscode.workspace.rootPath || '', './newfile.txt');

		return vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + path)).then(doc => {
			assert.strictEqual(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);

			const closedDocuments: vscode.TextDocument[] = [];
			const d0 = vscode.workspace.onDidCloseTextDocument(e => closedDocuments.push(e));

			return vscode.window.showTextDocument(doc).then(() => {
				return doc.save().then((didSave: boolean) => {

					assert.strictEqual(didSave, true, `FAILED to save${doc.uri.toString()}`);

					const closed = closedDocuments.filter(close => close.uri.toString() === doc.uri.toString())[0];
					assert.ok(closed);
					assert.ok(closed === doc);
					assert.ok(!doc.isDirty);
					assert.ok(fs.existsSync(path));

					d0.dispose();
					fs.unlinkSync(join(vscode.workspace.rootPath || '', './newfile.txt'));
				});
			});

		});
	});

	test('openTextDocument, uri scheme/auth/path', function () {

		const registration = vscode.workspace.registerTextDocumentContentProvider('sc', {
			provideTextDocumentContent() {
				return 'SC';
			}
		});

		return Promise.all([
			vscode.workspace.openTextDocument(vscode.Uri.parse('sc://auth')).then(doc => {
				assert.strictEqual(doc.uri.authority, 'auth');
				assert.strictEqual(doc.uri.path, '');
			}),
			vscode.workspace.openTextDocument(vscode.Uri.parse('sc:///path')).then(doc => {
				assert.strictEqual(doc.uri.authority, '');
				assert.strictEqual(doc.uri.path, '/path');
			}),
			vscode.workspace.openTextDocument(vscode.Uri.parse('sc://auth/path')).then(doc => {
				assert.strictEqual(doc.uri.authority, 'auth');
				assert.strictEqual(doc.uri.path, '/path');
			})
		]).then(() => {
			registration.dispose();
		});
	});

	test('openTextDocument, actual casing first', async function () {

		const fs = new TestFS('this-fs', false);
		const reg = vscode.workspace.registerFileSystemProvider(fs.scheme, fs, { isCaseSensitive: fs.isCaseSensitive });

		const uriOne = vscode.Uri.parse('this-fs:/one');
		const uriTwo = vscode.Uri.parse('this-fs:/two');
		const uriONE = vscode.Uri.parse('this-fs:/ONE'); // same resource, different uri
		const uriTWO = vscode.Uri.parse('this-fs:/TWO');

		fs.writeFile(uriOne, Buffer.from('one'), { create: true, overwrite: true });
		fs.writeFile(uriTwo, Buffer.from('two'), { create: true, overwrite: true });

		// lower case (actual case) comes first
		const docOne = await vscode.workspace.openTextDocument(uriOne);
		assert.strictEqual(docOne.uri.toString(), uriOne.toString());

		const docONE = await vscode.workspace.openTextDocument(uriONE);
		assert.strictEqual(docONE === docOne, true);
		assert.strictEqual(docONE.uri.toString(), uriOne.toString());
		assert.strictEqual(docONE.uri.toString() !== uriONE.toString(), true); // yep

		// upper case (NOT the actual case) comes first
		const docTWO = await vscode.workspace.openTextDocument(uriTWO);
		assert.strictEqual(docTWO.uri.toString(), uriTWO.toString());

		const docTwo = await vscode.workspace.openTextDocument(uriTwo);
		assert.strictEqual(docTWO === docTwo, true);
		assert.strictEqual(docTwo.uri.toString(), uriTWO.toString());
		assert.strictEqual(docTwo.uri.toString() !== uriTwo.toString(), true); // yep

		reg.dispose();
	});

	test('eol, read', () => {
		const a = createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.strictEqual(doc.eol, vscode.EndOfLine.LF);
			});
		});
		const b = createRandomFile('foo\nbar\nbar\r\nbaz').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.strictEqual(doc.eol, vscode.EndOfLine.LF);
			});
		});
		const c = createRandomFile('foo\r\nbar\r\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.strictEqual(doc.eol, vscode.EndOfLine.CRLF);
			});
		});
		return Promise.all([a, b, c]);
	});

	test('eol, change via editor', () => {
		return createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.strictEqual(doc.eol, vscode.EndOfLine.LF);
				return vscode.window.showTextDocument(doc).then(editor => {
					return editor.edit(builder => builder.setEndOfLine(vscode.EndOfLine.CRLF));

				}).then(value => {
					assert.ok(value);
					assert.ok(doc.isDirty);
					assert.strictEqual(doc.eol, vscode.EndOfLine.CRLF);
				});
			});
		});
	});

	test('eol, change via applyEdit', () => {
		return createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				assert.strictEqual(doc.eol, vscode.EndOfLine.LF);

				const edit = new vscode.WorkspaceEdit();
				edit.set(file, [vscode.TextEdit.setEndOfLine(vscode.EndOfLine.CRLF)]);
				return vscode.workspace.applyEdit(edit).then(value => {
					assert.ok(value);
					assert.ok(doc.isDirty);
					assert.strictEqual(doc.eol, vscode.EndOfLine.CRLF);
				});
			});
		});
	});

	test('eol, change via onWillSave', async function () {
		let called = false;
		const sub = vscode.workspace.onWillSaveTextDocument(e => {
			called = true;
			e.waitUntil(Promise.resolve([vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF)]));
		});

		const file = await createRandomFile('foo\r\nbar\r\nbar');
		const doc = await vscode.workspace.openTextDocument(file);
		assert.strictEqual(doc.eol, vscode.EndOfLine.CRLF);

		const edit = new vscode.WorkspaceEdit();
		edit.set(file, [vscode.TextEdit.insert(new vscode.Position(0, 0), '-changes-')]);
		const successEdit = await vscode.workspace.applyEdit(edit);
		assert.ok(successEdit);

		const successSave = await doc.save();
		assert.ok(successSave);
		assert.ok(called);
		assert.ok(!doc.isDirty);
		assert.strictEqual(doc.eol, vscode.EndOfLine.LF);
		sub.dispose();
	});


	test('events: onDidOpenTextDocument, onDidChangeTextDocument, onDidSaveTextDocument', async () => {
		const file = await createRandomFile();
		const disposables: vscode.Disposable[] = [];

		await revertAllDirty(); // needed for a clean state for `onDidSaveTextDocument` (#102365)

		const onDidOpenTextDocument = new Set<vscode.TextDocument>();
		const onDidChangeTextDocument = new Set<vscode.TextDocument>();
		const onDidSaveTextDocument = new Set<vscode.TextDocument>();

		disposables.push(vscode.workspace.onDidOpenTextDocument(e => {
			onDidOpenTextDocument.add(e);
		}));

		disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
			onDidChangeTextDocument.add(e.document);
		}));

		disposables.push(vscode.workspace.onDidSaveTextDocument(e => {
			onDidSaveTextDocument.add(e);
		}));

		const doc = await vscode.workspace.openTextDocument(file);
		const editor = await vscode.window.showTextDocument(doc);

		await editor.edit((builder) => {
			builder.insert(new vscode.Position(0, 0), 'Hello World');
		});
		await doc.save();

		assert.ok(Array.from(onDidOpenTextDocument).find(e => e.uri.toString() === file.toString()), 'did Open: ' + file.toString());
		assert.ok(Array.from(onDidChangeTextDocument).find(e => e.uri.toString() === file.toString()), 'did Change: ' + file.toString());
		assert.ok(Array.from(onDidSaveTextDocument).find(e => e.uri.toString() === file.toString()), 'did Save: ' + file.toString());

		disposeAll(disposables);
		return deleteFile(file);
	});

	test('events: onDidSaveTextDocument fires even for non dirty file when saved', async () => {
		const file = await createRandomFile();
		const disposables: vscode.Disposable[] = [];

		await revertAllDirty(); // needed for a clean state for `onDidSaveTextDocument` (#102365)

		const onDidSaveTextDocument = new Set<vscode.TextDocument>();

		disposables.push(vscode.workspace.onDidSaveTextDocument(e => {
			onDidSaveTextDocument.add(e);
		}));

		const doc = await vscode.workspace.openTextDocument(file);
		await vscode.window.showTextDocument(doc);
		await vscode.commands.executeCommand('workbench.action.files.save');

		assert.ok(onDidSaveTextDocument);
		assert.ok(Array.from(onDidSaveTextDocument).find(e => e.uri.toString() === file.toString()), 'did Save: ' + file.toString());
		disposeAll(disposables);
		return deleteFile(file);
	});

	test('openTextDocument, with selection', function () {
		return createRandomFile('foo\nbar\nbar').then(file => {
			return vscode.workspace.openTextDocument(file).then(doc => {
				return vscode.window.showTextDocument(doc, { selection: new vscode.Range(new vscode.Position(1, 1), new vscode.Position(1, 2)) }).then(editor => {
					assert.strictEqual(editor.selection.start.line, 1);
					assert.strictEqual(editor.selection.start.character, 1);
					assert.strictEqual(editor.selection.end.line, 1);
					assert.strictEqual(editor.selection.end.character, 2);
				});
			});
		});
	});

	test('registerTextDocumentContentProvider, simple', function () {

		const registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return uri.toString();
			}
		});

		const uri = vscode.Uri.parse('foo://testing/virtual.js');
		return vscode.workspace.openTextDocument(uri).then(doc => {
			assert.strictEqual(doc.getText(), uri.toString());
			assert.strictEqual(doc.isDirty, false);
			assert.strictEqual(doc.uri.toString(), uri.toString());
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
		}, _err => {
			// expected
		});
	});

	test('registerTextDocumentContentProvider, multiple', function () {

		// duplicate registration
		const registration1 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				if (uri.authority === 'foo') {
					return '1';
				}
				return undefined;
			}
		});
		const registration2 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				if (uri.authority === 'bar') {
					return '2';
				}
				return undefined;
			}
		});

		return Promise.all([
			vscode.workspace.openTextDocument(vscode.Uri.parse('foo://foo/bla')).then(doc => { assert.strictEqual(doc.getText(), '1'); }),
			vscode.workspace.openTextDocument(vscode.Uri.parse('foo://bar/bla')).then(doc => { assert.strictEqual(doc.getText(), '2'); })
		]).then(() => {
			registration1.dispose();
			registration2.dispose();
		});
	});

	test('registerTextDocumentContentProvider, evil provider', function () {

		// duplicate registration
		const registration1 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(_uri) {
				return '1';
			}
		});
		const registration2 = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(_uri): string {
				throw new Error('fail');
			}
		});

		return vscode.workspace.openTextDocument(vscode.Uri.parse('foo://foo/bla')).then(doc => {
			assert.strictEqual(doc.getText(), '1');
			registration1.dispose();
			registration2.dispose();
		});
	});

	test('registerTextDocumentContentProvider, invalid text', function () {

		const registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(_uri) {
				return <any>123;
			}
		});
		return vscode.workspace.openTextDocument(vscode.Uri.parse('foo://auth/path')).then(() => {
			assert.ok(false, 'expected failure');
		}, _err => {
			// expected
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, show virtual document', function () {

		const registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(_uri) {
				return 'I am virtual';
			}
		});

		return vscode.workspace.openTextDocument(vscode.Uri.parse('foo://something/path')).then(doc => {
			return vscode.window.showTextDocument(doc).then(editor => {

				assert.ok(editor.document === doc);
				assert.strictEqual(editor.document.getText(), 'I am virtual');
				registration.dispose();
			});
		});
	});

	test('registerTextDocumentContentProvider, open/open document', function () {

		let callCount = 0;
		const registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(_uri) {
				callCount += 1;
				return 'I am virtual';
			}
		});

		const uri = vscode.Uri.parse('foo://testing/path');

		return Promise.all([vscode.workspace.openTextDocument(uri), vscode.workspace.openTextDocument(uri)]).then(docs => {
			const [first, second] = docs;
			assert.ok(first === second);
			assert.ok(vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString()));
			assert.strictEqual(callCount, 1);
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, empty doc', function () {

		const registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(_uri) {
				return '';
			}
		});

		const uri = vscode.Uri.parse('foo:doc/empty');

		return vscode.workspace.openTextDocument(uri).then(doc => {
			assert.strictEqual(doc.getText(), '');
			assert.strictEqual(doc.uri.toString(), uri.toString());
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, change event', async function () {

		let callCount = 0;
		const emitter = new vscode.EventEmitter<vscode.Uri>();

		const registration = vscode.workspace.registerTextDocumentContentProvider('foo', {
			onDidChange: emitter.event,
			provideTextDocumentContent(_uri) {
				return 'call' + (callCount++);
			}
		});

		const uri = vscode.Uri.parse('foo://testing/path3');
		const doc = await vscode.workspace.openTextDocument(uri);

		assert.strictEqual(callCount, 1);
		assert.strictEqual(doc.getText(), 'call0');

		return new Promise<void>(resolve => {

			const subscription = vscode.workspace.onDidChangeTextDocument(event => {
				assert.ok(event.document === doc);
				assert.strictEqual(event.document.getText(), 'call1');
				subscription.dispose();
				registration.dispose();
				resolve();
			});

			emitter.fire(doc.uri);
		});
	});

	test('findFiles', () => {
		return vscode.workspace.findFiles('**/image.png').then((res) => {
			assert.strictEqual(res.length, 2);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'image.png');
		});
	});

	test('findFiles - null exclude', async () => {
		await vscode.workspace.findFiles('**/file.txt').then((res) => {
			// search.exclude folder is still searched, files.exclude folder is not
			assert.strictEqual(res.length, 1);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'file.txt');
		});

		await vscode.workspace.findFiles('**/file.txt', null).then((res) => {
			// search.exclude and files.exclude folders are both searched
			assert.strictEqual(res.length, 2);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'file.txt');
		});
	});

	test('findFiles - exclude', () => {
		return vscode.workspace.findFiles('**/image.png').then((res) => {
			assert.strictEqual(res.length, 2);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'image.png');
		});
	});

	test('findFiles, exclude', () => {
		return vscode.workspace.findFiles('**/image.png', '**/sub/**').then((res) => {
			assert.strictEqual(res.length, 1);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'image.png');
		});
	});

	test('findFiles, cancellation', () => {

		const source = new vscode.CancellationTokenSource();
		const token = source.token; // just to get an instance first
		source.cancel();

		return vscode.workspace.findFiles('*.js', null, 100, token).then((res) => {
			assert.deepStrictEqual(res, []);
		});
	});

	test('`findFiles2`', () => {
		return vscode.workspace.findFiles2('**/image.png').then((res) => {
			assert.strictEqual(res.length, 2);
		});
	});

	test('findFiles2 - null exclude', async () => {
		await vscode.workspace.findFiles2('**/file.txt', { useDefaultExcludes: true, useDefaultSearchExcludes: false }).then((res) => {
			// file.exclude folder is still searched, search.exclude folder is not
			assert.strictEqual(res.length, 1);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'file.txt');
		});

		await vscode.workspace.findFiles2('**/file.txt', { useDefaultExcludes: false, useDefaultSearchExcludes: false }).then((res) => {
			// search.exclude and files.exclude folders are both searched
			assert.strictEqual(res.length, 2);
			assert.strictEqual(basename(vscode.workspace.asRelativePath(res[0])), 'file.txt');
		});
	});

	test('findFiles2, exclude', () => {
		return vscode.workspace.findFiles2('**/image.png', { exclude: '**/sub/**' }).then((res) => {
			res.forEach(r => console.log(r.toString()));
			assert.strictEqual(res.length, 1);
		});
	});

	test('findFiles2, cancellation', () => {

		const source = new vscode.CancellationTokenSource();
		const token = source.token; // just to get an instance first
		source.cancel();

		return vscode.workspace.findFiles2('*.js', {}, token).then((res) => {
			assert.deepStrictEqual(res, []);
		});
	});

	test('findTextInFiles', async () => {
		const options: vscode.FindTextInFilesOptions = {
			include: '*.ts',
			previewOptions: {
				matchLines: 1,
				charsPerLine: 100
			}
		};

		const results: vscode.TextSearchResult[] = [];
		await vscode.workspace.findTextInFiles({ pattern: 'foo' }, options, result => {
			results.push(result);
		});

		assert.strictEqual(results.length, 1);
		const match = <vscode.TextSearchMatch>results[0];
		assert(match.preview.text.indexOf('foo') >= 0);
		assert.strictEqual(basename(vscode.workspace.asRelativePath(match.uri)), '10linefile.ts');
	});

	test('findTextInFiles, cancellation', async () => {
		const results: vscode.TextSearchResult[] = [];
		const cancellation = new vscode.CancellationTokenSource();
		cancellation.cancel();

		await vscode.workspace.findTextInFiles({ pattern: 'foo' }, result => {
			results.push(result);
		}, cancellation.token);
	});

	test('applyEdit', async () => {
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + join(vscode.workspace.rootPath || '', './new2.txt')));

		const edit = new vscode.WorkspaceEdit();
		edit.insert(doc.uri, new vscode.Position(0, 0), new Array(1000).join('Hello World'));

		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, true);
		assert.strictEqual(doc.isDirty, true);
	});

	test('applyEdit should fail when editing deleted resource', withLogDisabled(async () => {
		const resource = await createRandomFile();

		const edit = new vscode.WorkspaceEdit();
		edit.deleteFile(resource);
		edit.insert(resource, new vscode.Position(0, 0), '');

		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, false);
	}));

	test('applyEdit should fail when renaming deleted resource', withLogDisabled(async () => {
		const resource = await createRandomFile();

		const edit = new vscode.WorkspaceEdit();
		edit.deleteFile(resource);
		edit.renameFile(resource, resource);

		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, false);
	}));

	test('applyEdit should fail when editing renamed from resource', withLogDisabled(async () => {
		const resource = await createRandomFile();
		const newResource = vscode.Uri.file(resource.fsPath + '.1');
		const edit = new vscode.WorkspaceEdit();
		edit.renameFile(resource, newResource);
		edit.insert(resource, new vscode.Position(0, 0), '');

		const success = await vscode.workspace.applyEdit(edit);
		assert.strictEqual(success, false);
	}));

	test('applyEdit "edit A -> rename A to B -> edit B"', async () => {
		await testEditRenameEdit(oldUri => oldUri.with({ path: oldUri.path + 'NEW' }));
	});

	test('applyEdit "edit A -> rename A to B (different case)" -> edit B', async () => {
		await testEditRenameEdit(oldUri => oldUri.with({ path: oldUri.path.toUpperCase() }));
	});

	test('applyEdit "edit A -> rename A to B (same case)" -> edit B', async () => {
		await testEditRenameEdit(oldUri => oldUri);
	});

	async function testEditRenameEdit(newUriCreator: (oldUri: vscode.Uri) => vscode.Uri): Promise<void> {
		const oldUri = await createRandomFile();
		const newUri = newUriCreator(oldUri);
		const edit = new vscode.WorkspaceEdit();
		edit.insert(oldUri, new vscode.Position(0, 0), 'BEFORE');
		edit.renameFile(oldUri, newUri);
		edit.insert(newUri, new vscode.Position(0, 0), 'AFTER');

		assert.ok(await vscode.workspace.applyEdit(edit));

		const doc = await vscode.workspace.openTextDocument(newUri);
		assert.strictEqual(doc.getText(), 'AFTERBEFORE');
		assert.strictEqual(doc.isDirty, true);
	}

	function nameWithUnderscore(uri: vscode.Uri) {
		return uri.with({ path: posix.join(posix.dirname(uri.path), `_${posix.basename(uri.path)}`) });
	}

	test('WorkspaceEdit: applying edits before and after rename duplicates resource #42633', withLogDisabled(async function () {
		const docUri = await createRandomFile();
		const newUri = nameWithUnderscore(docUri);

		const we = new vscode.WorkspaceEdit();
		we.insert(docUri, new vscode.Position(0, 0), 'Hello');
		we.insert(docUri, new vscode.Position(0, 0), 'Foo');
		we.renameFile(docUri, newUri);
		we.insert(newUri, new vscode.Position(0, 0), 'Bar');

		assert.ok(await vscode.workspace.applyEdit(we));
		const doc = await vscode.workspace.openTextDocument(newUri);
		assert.strictEqual(doc.getText(), 'BarHelloFoo');
	}));

	test('WorkspaceEdit: Problem recreating a renamed resource #42634', withLogDisabled(async function () {
		const docUri = await createRandomFile();
		const newUri = nameWithUnderscore(docUri);

		const we = new vscode.WorkspaceEdit();
		we.insert(docUri, new vscode.Position(0, 0), 'Hello');
		we.insert(docUri, new vscode.Position(0, 0), 'Foo');
		we.renameFile(docUri, newUri);

		we.createFile(docUri);
		we.insert(docUri, new vscode.Position(0, 0), 'Bar');

		assert.ok(await vscode.workspace.applyEdit(we));

		const newDoc = await vscode.workspace.openTextDocument(newUri);
		assert.strictEqual(newDoc.getText(), 'HelloFoo');
		const doc = await vscode.workspace.openTextDocument(docUri);
		assert.strictEqual(doc.getText(), 'Bar');
	}));

	test('WorkspaceEdit api - after saving a deleted file, it still shows up as deleted. #42667', withLogDisabled(async function () {
		const docUri = await createRandomFile();
		const we = new vscode.WorkspaceEdit();
		we.deleteFile(docUri);
		we.insert(docUri, new vscode.Position(0, 0), 'InsertText');

		assert.ok(!(await vscode.workspace.applyEdit(we)));
		try {
			await vscode.workspace.openTextDocument(docUri);
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}
	}));

	test('WorkspaceEdit: edit and rename parent folder duplicates resource #42641', async function () {

		const dir = vscode.Uri.parse(`${testFs.scheme}:/before-${rndName()}`);
		await testFs.createDirectory(dir);

		const docUri = await createRandomFile('', dir);
		const docParent = docUri.with({ path: posix.dirname(docUri.path) });
		const newParent = nameWithUnderscore(docParent);

		const we = new vscode.WorkspaceEdit();
		we.insert(docUri, new vscode.Position(0, 0), 'Hello');
		we.renameFile(docParent, newParent);

		assert.ok(await vscode.workspace.applyEdit(we));

		try {
			await vscode.workspace.openTextDocument(docUri);
			assert.ok(false);
		} catch (e) {
			assert.ok(true);
		}

		const newUri = newParent.with({ path: posix.join(newParent.path, posix.basename(docUri.path)) });
		const doc = await vscode.workspace.openTextDocument(newUri);
		assert.ok(doc);

		assert.strictEqual(doc.getText(), 'Hello');
	});

	test('WorkspaceEdit: rename resource followed by edit does not work #42638', withLogDisabled(async function () {
		const docUri = await createRandomFile();
		const newUri = nameWithUnderscore(docUri);

		const we = new vscode.WorkspaceEdit();
		we.renameFile(docUri, newUri);
		we.insert(newUri, new vscode.Position(0, 0), 'Hello');

		assert.ok(await vscode.workspace.applyEdit(we));

		const doc = await vscode.workspace.openTextDocument(newUri);
		assert.strictEqual(doc.getText(), 'Hello');
	}));

	test('WorkspaceEdit: create & override', withLogDisabled(async function () {

		const docUri = await createRandomFile('before');

		let we = new vscode.WorkspaceEdit();
		we.createFile(docUri);
		assert.ok(!await vscode.workspace.applyEdit(we));
		assert.strictEqual((await vscode.workspace.openTextDocument(docUri)).getText(), 'before');

		we = new vscode.WorkspaceEdit();
		we.createFile(docUri, { overwrite: true });
		assert.ok(await vscode.workspace.applyEdit(we));
		assert.strictEqual((await vscode.workspace.openTextDocument(docUri)).getText(), '');
	}));

	test('WorkspaceEdit: create & ignoreIfExists', withLogDisabled(async function () {
		const docUri = await createRandomFile('before');

		let we = new vscode.WorkspaceEdit();
		we.createFile(docUri, { ignoreIfExists: true });
		assert.ok(await vscode.workspace.applyEdit(we));
		assert.strictEqual((await vscode.workspace.openTextDocument(docUri)).getText(), 'before');

		we = new vscode.WorkspaceEdit();
		we.createFile(docUri, { overwrite: true, ignoreIfExists: true });
		assert.ok(await vscode.workspace.applyEdit(we));
		assert.strictEqual((await vscode.workspace.openTextDocument(docUri)).getText(), '');
	}));

	test('WorkspaceEdit: rename & ignoreIfExists', withLogDisabled(async function () {
		const aUri = await createRandomFile('aaa');
		const bUri = await createRandomFile('bbb');

		let we = new vscode.WorkspaceEdit();
		we.renameFile(aUri, bUri);
		assert.ok(!await vscode.workspace.applyEdit(we));

		we = new vscode.WorkspaceEdit();
		we.renameFile(aUri, bUri, { ignoreIfExists: true });
		assert.ok(await vscode.workspace.applyEdit(we));

		we = new vscode.WorkspaceEdit();
		we.renameFile(aUri, bUri, { overwrite: false, ignoreIfExists: true });
		assert.ok(!await vscode.workspace.applyEdit(we));

		we = new vscode.WorkspaceEdit();
		we.renameFile(aUri, bUri, { overwrite: true, ignoreIfExists: true });
		assert.ok(await vscode.workspace.applyEdit(we));
	}));

	test('WorkspaceEdit: delete & ignoreIfNotExists', withLogDisabled(async function () {

		const docUri = await createRandomFile();
		let we = new vscode.WorkspaceEdit();
		we.deleteFile(docUri, { ignoreIfNotExists: false });
		assert.ok(await vscode.workspace.applyEdit(we));

		we = new vscode.WorkspaceEdit();
		we.deleteFile(docUri, { ignoreIfNotExists: false });
		assert.ok(!await vscode.workspace.applyEdit(we));

		we = new vscode.WorkspaceEdit();
		we.deleteFile(docUri, { ignoreIfNotExists: true });
		assert.ok(await vscode.workspace.applyEdit(we));
	}));

	test('WorkspaceEdit: insert & rename multiple', async function () {

		const [f1, f2, f3] = await Promise.all([createRandomFile(), createRandomFile(), createRandomFile()]);

		const we = new vscode.WorkspaceEdit();
		we.insert(f1, new vscode.Position(0, 0), 'f1');
		we.insert(f2, new vscode.Position(0, 0), 'f2');
		we.insert(f3, new vscode.Position(0, 0), 'f3');

		const f1_ = nameWithUnderscore(f1);
		we.renameFile(f1, f1_);

		assert.ok(await vscode.workspace.applyEdit(we));

		assert.strictEqual((await vscode.workspace.openTextDocument(f3)).getText(), 'f3');
		assert.strictEqual((await vscode.workspace.openTextDocument(f2)).getText(), 'f2');
		assert.strictEqual((await vscode.workspace.openTextDocument(f1_)).getText(), 'f1');
		try {
			await vscode.workspace.fs.stat(f1);
			assert.ok(false);
		} catch {
			assert.ok(true);
		}
	});

	test('workspace.applyEdit drops the TextEdit if there is a RenameFile later #77735 (with opened editor)', async function () {
		await test77735(true);
	});

	test('workspace.applyEdit drops the TextEdit if there is a RenameFile later #77735 (without opened editor)', async function () {
		await test77735(false);
	});

	async function test77735(withOpenedEditor: boolean): Promise<void> {
		const docUriOriginal = await createRandomFile();
		const docUriMoved = docUriOriginal.with({ path: `${docUriOriginal.path}.moved` });
		await deleteFile(docUriMoved);

		if (withOpenedEditor) {
			const document = await vscode.workspace.openTextDocument(docUriOriginal);
			await vscode.window.showTextDocument(document);
		} else {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		}

		for (let i = 0; i < 4; i++) {
			const we = new vscode.WorkspaceEdit();
			let oldUri: vscode.Uri;
			let newUri: vscode.Uri;
			let expected: string;

			if (i % 2 === 0) {
				oldUri = docUriOriginal;
				newUri = docUriMoved;
				we.insert(oldUri, new vscode.Position(0, 0), 'Hello');
				expected = 'Hello';
			} else {
				oldUri = docUriMoved;
				newUri = docUriOriginal;
				we.delete(oldUri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)));
				expected = '';
			}

			we.renameFile(oldUri, newUri);
			assert.ok(await vscode.workspace.applyEdit(we));

			const document = await vscode.workspace.openTextDocument(newUri);
			assert.strictEqual(document.isDirty, true);

			const result = await document.save();
			assert.strictEqual(result, true, `save failed in iteration: ${i} (docUriOriginal: ${docUriOriginal.fsPath})`);
			assert.strictEqual(document.isDirty, false, `document still dirty in iteration: ${i} (docUriOriginal: ${docUriOriginal.fsPath})`);

			assert.strictEqual(document.getText(), expected);

			await delay(10);
		}
	}

	test('The api workspace.applyEdit failed for some case of mixing resourceChange and textEdit #80688, 1/2', async function () {
		const file1 = await createRandomFile();
		const file2 = await createRandomFile();
		const we = new vscode.WorkspaceEdit();
		we.insert(file1, new vscode.Position(0, 0), 'import1;');

		const file2Name = basename(file2.fsPath);
		const file2NewUri = vscode.Uri.joinPath(file2, `../new/${file2Name}`);
		we.renameFile(file2, file2NewUri);

		we.insert(file1, new vscode.Position(0, 0), 'import2;');
		await vscode.workspace.applyEdit(we);

		const document = await vscode.workspace.openTextDocument(file1);
		// const expected = 'import1;import2;';
		const expected2 = 'import2;import1;';
		assert.strictEqual(document.getText(), expected2);
	});

	test('The api workspace.applyEdit failed for some case of mixing resourceChange and textEdit #80688, 2/2', async function () {
		const file1 = await createRandomFile();
		const file2 = await createRandomFile();
		const we = new vscode.WorkspaceEdit();
		we.insert(file1, new vscode.Position(0, 0), 'import1;');
		we.insert(file1, new vscode.Position(0, 0), 'import2;');

		const file2Name = basename(file2.fsPath);
		const file2NewUri = vscode.Uri.joinPath(file2, `../new/${file2Name}`);
		we.renameFile(file2, file2NewUri);

		await vscode.workspace.applyEdit(we);

		const document = await vscode.workspace.openTextDocument(file1);
		const expected = 'import1;import2;';
		// const expected2 = 'import2;import1;';
		assert.strictEqual(document.getText(), expected);
	});


	test('[Bug] Failed to create new test file when in an untitled file #1261', async function () {
		const uri = vscode.Uri.parse('untitled:Untitled-5.test');
		const contents = `Hello Test File ${uri.toString()}`;
		const we = new vscode.WorkspaceEdit();
		we.createFile(uri, { ignoreIfExists: true });
		we.replace(uri, new vscode.Range(0, 0, 0, 0), contents);

		const success = await vscode.workspace.applyEdit(we);

		assert.ok(success);

		const doc = await vscode.workspace.openTextDocument(uri);
		assert.strictEqual(doc.getText(), contents);
	});

	test('Should send a single FileWillRenameEvent instead of separate events when moving multiple files at once#111867, 1/3', async function () {

		const file1 = await createRandomFile();
		const file2 = await createRandomFile();

		const file1New = await createRandomFile();
		const file2New = await createRandomFile();

		const event = new Promise<vscode.FileWillRenameEvent>(resolve => {
			const sub = vscode.workspace.onWillRenameFiles(e => {
				sub.dispose();
				resolve(e);
			});
		});

		const we = new vscode.WorkspaceEdit();
		we.renameFile(file1, file1New, { overwrite: true });
		we.renameFile(file2, file2New, { overwrite: true });
		await vscode.workspace.applyEdit(we);

		const e = await event;

		assert.strictEqual(e.files.length, 2);
		assert.strictEqual(e.files[0].oldUri.toString(), file1.toString());
		assert.strictEqual(e.files[1].oldUri.toString(), file2.toString());
	});

	test('WorkspaceEdit fails when creating then writing to file if file is open in the editor and is not empty #146964', async function () {
		const file1 = await createRandomFile();

		{
			// prepare: open file in editor, make sure it has contents
			const editor = await vscode.window.showTextDocument(file1);
			const prepEdit = new vscode.WorkspaceEdit();
			prepEdit.insert(file1, new vscode.Position(0, 0), 'Hello Here And There');
			const status = await vscode.workspace.applyEdit(prepEdit);

			assert.ok(status);
			assert.strictEqual(editor.document.getText(), 'Hello Here And There');
			assert.ok(vscode.window.activeTextEditor === editor);
		}

		const we = new vscode.WorkspaceEdit();
		we.createFile(file1, { overwrite: true, ignoreIfExists: false });
		we.set(file1, [new vscode.TextEdit(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), 'SOME TEXT')]);
		const status = await vscode.workspace.applyEdit(we);
		assert.ok(status);
		assert.strictEqual(vscode.window.activeTextEditor!.document.getText(), 'SOME TEXT');

	});

	test('Should send a single FileWillRenameEvent instead of separate events when moving multiple files at once#111867, 2/3', async function () {

		const event = new Promise<vscode.FileWillCreateEvent>(resolve => {
			const sub = vscode.workspace.onWillCreateFiles(e => {
				sub.dispose();
				resolve(e);
			});
		});

		const file1 = vscode.Uri.parse(`fake-fs:/${rndName()}`);
		const file2 = vscode.Uri.parse(`fake-fs:/${rndName()}`);

		const we = new vscode.WorkspaceEdit();
		we.createFile(file1, { overwrite: true });
		we.createFile(file2, { overwrite: true });
		await vscode.workspace.applyEdit(we);

		const e = await event;

		assert.strictEqual(e.files.length, 2);
		assert.strictEqual(e.files[0].toString(), file1.toString());
		assert.strictEqual(e.files[1].toString(), file2.toString());
	});

	test('Should send a single FileWillRenameEvent instead of separate events when moving multiple files at once#111867, 3/3', async function () {

		const file1 = await createRandomFile();
		const file2 = await createRandomFile();

		const event = new Promise<vscode.FileWillDeleteEvent>(resolve => {
			const sub = vscode.workspace.onWillDeleteFiles(e => {
				sub.dispose();
				resolve(e);
			});
		});

		const we = new vscode.WorkspaceEdit();
		we.deleteFile(file1);
		we.deleteFile(file2);
		await vscode.workspace.applyEdit(we);

		const e = await event;

		assert.strictEqual(e.files.length, 2);
		assert.strictEqual(e.files[0].toString(), file1.toString());
		assert.strictEqual(e.files[1].toString(), file2.toString());
	});

	test('issue #107739 - Redo of rename Java Class name has no effect', async () => {
		const file = await createRandomFile('hello');
		const fileName = basename(file.fsPath);

		const newFile = vscode.Uri.joinPath(file, `../${fileName}2`);

		// apply edit
		{
			const we = new vscode.WorkspaceEdit();
			we.insert(file, new vscode.Position(0, 5), '2');
			we.renameFile(file, newFile);
			await vscode.workspace.applyEdit(we);
		}

		// show the new document
		{
			const document = await vscode.workspace.openTextDocument(newFile);
			await vscode.window.showTextDocument(document);
			assert.strictEqual(document.getText(), 'hello2');
			assert.strictEqual(document.isDirty, true);
		}

		// undo and show the old document
		{
			await vscode.commands.executeCommand('undo');
			const document = await vscode.workspace.openTextDocument(file);
			await vscode.window.showTextDocument(document);
			assert.strictEqual(document.getText(), 'hello');
		}

		// redo and show the new document
		{
			await vscode.commands.executeCommand('redo');
			const document = await vscode.workspace.openTextDocument(newFile);
			await vscode.window.showTextDocument(document);
			assert.strictEqual(document.getText(), 'hello2');
			assert.strictEqual(document.isDirty, true);
		}

	});

	test('issue #110141 - TextEdit.setEndOfLine applies an edit and invalidates redo stack even when no change is made', async () => {
		const file = await createRandomFile('hello\nworld');

		const document = await vscode.workspace.openTextDocument(file);
		await vscode.window.showTextDocument(document);

		// apply edit
		{
			const we = new vscode.WorkspaceEdit();
			we.insert(file, new vscode.Position(0, 5), '2');
			await vscode.workspace.applyEdit(we);
		}

		// check the document
		{
			assert.strictEqual(document.getText(), 'hello2\nworld');
			assert.strictEqual(document.isDirty, true);
		}

		// apply no-op edit
		{
			const we = new vscode.WorkspaceEdit();
			we.set(file, [vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF)]);
			await vscode.workspace.applyEdit(we);
		}

		// undo
		{
			await vscode.commands.executeCommand('undo');
			assert.strictEqual(document.getText(), 'hello\nworld');
			assert.strictEqual(document.isDirty, false);
		}
	});

	test('SnippetString in WorkspaceEdit', async function (): Promise<any> {
		const file = await createRandomFile('hello\nworld');

		const document = await vscode.workspace.openTextDocument(file);
		const edt = await vscode.window.showTextDocument(document);

		assert.ok(edt === vscode.window.activeTextEditor);

		const we = new vscode.WorkspaceEdit();
		we.set(document.uri, [new vscode.SnippetTextEdit(new vscode.Range(0, 0, 0, 0), new vscode.SnippetString('${1:foo}${2:bar}'))]);
		const success = await vscode.workspace.applyEdit(we);
		if (edt !== vscode.window.activeTextEditor) {
			return this.skip();
		}

		assert.ok(success);
		assert.strictEqual(document.getText(), 'foobarhello\nworld');
		assert.deepStrictEqual(edt.selections, [new vscode.Selection(0, 0, 0, 3)]);
	});

	test('Support creating binary files in a WorkspaceEdit', async function (): Promise<any> {

		const fileUri = vscode.Uri.parse(`${testFs.scheme}:/${rndName()}`);
		const data = Buffer.from('Hello Binary Files');

		const ws = new vscode.WorkspaceEdit();
		ws.createFile(fileUri, { contents: data, ignoreIfExists: false, overwrite: false });

		const success = await vscode.workspace.applyEdit(ws);
		assert.ok(success);

		const actual = await vscode.workspace.fs.readFile(fileUri);

		assert.deepStrictEqual(actual, data);
	});

	test('saveAll', async () => {
		await testSave(true);
	});

	test('save', async () => {
		await testSave(false);
	});

	async function testSave(saveAll: boolean) {
		const file = await createRandomFile();
		const disposables: vscode.Disposable[] = [];

		await revertAllDirty(); // needed for a clean state for `onDidSaveTextDocument` (#102365)

		const onDidSaveTextDocument = new Set<vscode.TextDocument>();

		disposables.push(vscode.workspace.onDidSaveTextDocument(e => {
			onDidSaveTextDocument.add(e);
		}));

		const doc = await vscode.workspace.openTextDocument(file);
		await vscode.window.showTextDocument(doc);

		if (saveAll) {
			const edit = new vscode.WorkspaceEdit();
			edit.insert(doc.uri, new vscode.Position(0, 0), 'Hello World');

			await vscode.workspace.applyEdit(edit);
			assert.ok(doc.isDirty);

			await vscode.workspace.saveAll(false); // requires dirty documents
		} else {
			const res = await vscode.workspace.save(doc.uri); // enforces to save even when not dirty
			assert.ok(res?.toString() === doc.uri.toString());
		}

		assert.ok(onDidSaveTextDocument);
		assert.ok(Array.from(onDidSaveTextDocument).find(e => e.uri.toString() === file.toString()), 'did Save: ' + file.toString());
		disposeAll(disposables);
		return deleteFile(file);
	}
});
