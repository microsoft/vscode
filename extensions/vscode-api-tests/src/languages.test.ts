/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {join} from 'path';
import {languages, workspace, commands, Uri, Diagnostic, Range, Command, Disposable, CancellationToken,
	CompletionList, CompletionItem, CompletionItemKind, TextDocument, Position} from 'vscode';

suite('languages namespace tests', () => {

	test('diagnostic collection, forEach, clear, has', function () {
		let collection = languages.createDiagnosticCollection('test');
		assert.equal(collection.name, 'test');
		collection.dispose();
		assert.throws(() => collection.name);

		let c = 0;
		collection = languages.createDiagnosticCollection('test2');
		collection.forEach(() => c++);
		assert.equal(c, 0);

		collection.set(Uri.parse('foo:bar'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);
		collection.forEach(() => c++);
		assert.equal(c, 1);

		c = 0;
		collection.clear();
		collection.forEach(() => c++);
		assert.equal(c, 0);

		collection.set(Uri.parse('foo:bar1'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);
		collection.set(Uri.parse('foo:bar2'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);
		collection.forEach(() => c++);
		assert.equal(c, 2);

		assert.ok(collection.has(Uri.parse('foo:bar1')));
		assert.ok(collection.has(Uri.parse('foo:bar2')));
		assert.ok(!collection.has(Uri.parse('foo:bar3')));
		collection.delete(Uri.parse('foo:bar1'));
		assert.ok(!collection.has(Uri.parse('foo:bar1')));

		collection.dispose();
	});

	test('diagnostic collection, immutable read', function () {
		let collection = languages.createDiagnosticCollection('test');
		collection.set(Uri.parse('foo:bar'), [
			new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
		]);

		let array = collection.get(Uri.parse('foo:bar'));
		assert.throws(() => array.length = 0);
		assert.throws(() => array.pop());
		assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), 'evil'));

		collection.forEach((uri, array) => {
			assert.throws(() => array.length = 0);
			assert.throws(() => array.pop());
			assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), 'evil'));
		});

		array = collection.get(Uri.parse('foo:bar'));
		assert.equal(array.length, 2);

		collection.dispose();
	});

	test('diagnostics collection, set with dupliclated tuples', function () {
		let collection = languages.createDiagnosticCollection('test');
		let uri = Uri.parse('sc:hightower');
		collection.set([
			[uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-1')]],
			[Uri.parse('some:thing'), [new Diagnostic(new Range(0, 0, 1, 1), 'something')]],
			[uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-2')]],
		]);

		let array = collection.get(uri);
		assert.equal(array.length, 2);
		let [first, second] = array;
		assert.equal(first.message, 'message-1');
		assert.equal(second.message, 'message-2');

		// clear
		collection.delete(uri);
		assert.ok(!collection.has(uri));

		// bad tuple clears 1/2
		collection.set([
			[uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-1')]],
			[Uri.parse('some:thing'), [new Diagnostic(new Range(0, 0, 1, 1), 'something')]],
			[uri, undefined]
		]);
		assert.ok(!collection.has(uri));

		// clear
		collection.delete(uri);
		assert.ok(!collection.has(uri));

		// bad tuple clears 2/2
		collection.set([
			[uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-1')]],
			[Uri.parse('some:thing'), [new Diagnostic(new Range(0, 0, 1, 1), 'something')]],
			[uri, undefined],
			[uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-2')]],
			[uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-3')]],
		]);

		array = collection.get(uri);
		assert.equal(array.length, 2);
		[first, second] = array;
		assert.equal(first.message, 'message-2');
		assert.equal(second.message, 'message-3');

		collection.dispose();
	});

	test('diagnostics & CodeActionProvider', function (done) {

		class D2 extends Diagnostic {
			customProp = { complex() { } };
			constructor() {
				super(new Range(0, 2, 0, 7), 'sonntag');
			}
		};

		let diag1 = new Diagnostic(new Range(0, 0, 0, 5), 'montag');
		let diag2 = new D2();

		let ran = false;
		let uri = Uri.parse('ttt:path.far');

		let r1 = languages.registerCodeActionsProvider({ pattern: '*.far' }, {
			provideCodeActions(document, range, ctx): Command[] {

				assert.equal(ctx.diagnostics.length, 2);
				let [first, second] = ctx.diagnostics;
				assert.ok(first === diag1);
				assert.ok(second === diag2);
				assert.ok(diag2 instanceof D2);
				ran = true;
				return [];
			}
		});

		let r2 = workspace.registerTextDocumentContentProvider('ttt', {
			provideTextDocumentContent() {
				return 'this is some text';
			}
		});

		let r3 = languages.createDiagnosticCollection();
		r3.set(uri, [diag1]);

		let r4 = languages.createDiagnosticCollection();
		r4.set(uri, [diag2]);

		workspace.openTextDocument(uri).then(doc => {
			return commands.executeCommand('vscode.executeCodeActionProvider', uri, new Range(0, 0, 0, 10));
		}).then(commands => {
			try {
				assert.ok(ran);
				Disposable.from(r1, r2, r3, r4).dispose();
				done();
			} catch (e) {
				done(e);
			}
		}, done);
	});

	test('completions with document filters', function (done) {
		let ran = false;
		let uri = Uri.file(join(workspace.rootPath, './bower.json'));

		let jsonDocumentFilter = [{ language: 'json', pattern: '**/package.json' }, { language: 'json', pattern: '**/bower.json' }, { language: 'json', pattern: '**/.bower.json' }];

		let r1 = languages.registerCompletionItemProvider(jsonDocumentFilter, {
			provideCompletionItems: (document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] => {
				let proposal = new CompletionItem('foo');
				proposal.kind = CompletionItemKind.Property;
				ran = true;
				return [ proposal ];
			}
		});

		workspace.openTextDocument(uri).then(doc => {
			return commands.executeCommand('vscode.executeCompletionItemProvider', uri, new Position(1, 0));
		}).then((result: CompletionList) => {
			try {
				assert.equal(result.items[0].label, 'foo');
				assert.ok(ran);
				Disposable.from(r1).dispose();
				done();
			} catch (e) {
				done(e);
			}
		}, done);
	});
});