/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { join } from 'path';
import { commands, Position, Range, Uri, ViewColumn, window, workspace } from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

suite('vscode API - commands', () => {

	teardown(assertNoRpc);

	test('getCommands', function (done) {

		let p1 = commands.getCommands().then(commands => {
			let hasOneWithUnderscore = false;
			for (let command of commands) {
				if (command[0] === '_') {
					hasOneWithUnderscore = true;
					break;
				}
			}
			assert.ok(hasOneWithUnderscore);
		}, done);

		let p2 = commands.getCommands(true).then(commands => {
			let hasOneWithUnderscore = false;
			for (let command of commands) {
				if (command[0] === '_') {
					hasOneWithUnderscore = true;
					break;
				}
			}
			assert.ok(!hasOneWithUnderscore);
		}, done);

		Promise.all([p1, p2]).then(() => {
			done();
		}, done);
	});

	test('command with args', async function () {

		let args: IArguments;
		let registration = commands.registerCommand('t1', function () {
			args = arguments;
		});

		await commands.executeCommand('t1', 'start');
		registration.dispose();
		assert.ok(args!);
		assert.strictEqual(args!.length, 1);
		assert.strictEqual(args![0], 'start');
	});

	test('editorCommand with extra args', function () {

		let args: IArguments;
		let registration = commands.registerTextEditorCommand('t1', function () {
			args = arguments;
		});

		return workspace.openTextDocument(join(workspace.rootPath || '', './far.js')).then(doc => {
			return window.showTextDocument(doc).then(_editor => {
				return commands.executeCommand('t1', 12345, commands);
			}).then(() => {
				assert.ok(args);
				assert.strictEqual(args.length, 4);
				assert.ok(args[2] === 12345);
				assert.ok(args[3] === commands);
				registration.dispose();
			});
		});

	});

	test('api-command: vscode.diff', function () {

		let registration = workspace.registerTextDocumentContentProvider('sc', {
			provideTextDocumentContent(uri) {
				return `content of URI <b>${uri.toString()}</b>#${Math.random()}`;
			}
		});


		let a = commands.executeCommand('vscode.diff', Uri.parse('sc:a'), Uri.parse('sc:b'), 'DIFF').then(value => {
			assert.ok(value === undefined);
			registration.dispose();
		});

		let b = commands.executeCommand('vscode.diff', Uri.parse('sc:a'), Uri.parse('sc:b')).then(value => {
			assert.ok(value === undefined);
			registration.dispose();
		});

		let c = commands.executeCommand('vscode.diff', Uri.parse('sc:a'), Uri.parse('sc:b'), 'Title', { selection: new Range(new Position(1, 1), new Position(1, 2)) }).then(value => {
			assert.ok(value === undefined);
			registration.dispose();
		});

		let d = commands.executeCommand('vscode.diff').then(() => assert.ok(false), () => assert.ok(true));
		let e = commands.executeCommand('vscode.diff', 1, 2, 3).then(() => assert.ok(false), () => assert.ok(true));

		return Promise.all([a, b, c, d, e]);
	});

	test('api-command: vscode.open', async function () {
		let uri = Uri.parse(workspace.workspaceFolders![0].uri.toString() + '/far.js');

		await commands.executeCommand('vscode.open', uri);
		assert.strictEqual(window.activeTextEditor?.viewColumn, ViewColumn.One);
		assert.strictEqual(window.tabGroups.groups[0].activeTab?.group.viewColumn, ViewColumn.One);

		await commands.executeCommand('vscode.open', uri, ViewColumn.Two);
		assert.strictEqual(window.activeTextEditor?.viewColumn, ViewColumn.Two);
		assert.strictEqual(window.tabGroups.groups[1].activeTab?.group.viewColumn, ViewColumn.Two);

		await commands.executeCommand('vscode.open', uri, ViewColumn.One);
		assert.strictEqual(window.activeTextEditor?.viewColumn, ViewColumn.One);
		assert.strictEqual(window.tabGroups.groups[0].activeTab?.group.viewColumn, ViewColumn.One);

		let e1: Error | undefined = undefined;
		try {
			await commands.executeCommand('vscode.open');
		} catch (error) {
			e1 = error;
		}
		assert.ok(e1);

		let e2: Error | undefined = undefined;
		try {
			await commands.executeCommand('vscode.open', uri, true);
		} catch (error) {
			e2 = error;
		}
		assert.ok(e2);


		// we support strings but only http/https. those we cannot test but we can
		// enforce that other schemes are treated strict
		try {
			await commands.executeCommand('vscode.open', 'file:///some/path/not/http');
			assert.fail('expecting exception');
		} catch {
			assert.ok(true);
		}

	});

	test('api-command: vscode.open with untitled supports associated resource (#138925)', async function () {
		let uri = Uri.parse(workspace.workspaceFolders![0].uri.toString() + '/untitled-file.txt').with({ scheme: 'untitled' });
		await commands.executeCommand('vscode.open', uri).then(() => assert.ok(true), () => assert.ok(false));

		// untitled with associated resource are dirty from the beginning
		assert.ok(window.activeTextEditor?.document.isDirty);

		return closeAllEditors();
	});
});
