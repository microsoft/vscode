/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { join } from 'path';
import {
	languages, workspace, commands, Uri, Diagnostic, Range, Command, Disposable, CancellationToken,
	CompletionList, CompletionItem, CompletionItemKind, TextDocument, Position
} from 'vscode';

suite('languages namespace tests', () => {

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
		let uri = Uri.file(join(workspace.rootPath || '', './bower.json'));

		let jsonDocumentFilter = [{ language: 'json', pattern: '**/package.json' }, { language: 'json', pattern: '**/bower.json' }, { language: 'json', pattern: '**/.bower.json' }];

		let r1 = languages.registerCompletionItemProvider(jsonDocumentFilter, {
			provideCompletionItems: (document: TextDocument, position: Position, token: CancellationToken): CompletionItem[] => {
				let proposal = new CompletionItem('foo');
				proposal.kind = CompletionItemKind.Property;
				ran = true;
				return [proposal];
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