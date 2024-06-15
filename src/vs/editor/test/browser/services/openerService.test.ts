/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { NullCommandService } from 'vs/platform/commands/test/common/nullCommandService';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { matchesScheme, matchesSomeScheme } from 'vs/base/common/network';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';

suite('OpenerService', function () {
	const themeService = new TestThemeService();
	const editorService = new TestCodeEditorService(themeService);

	let lastCommand: { id: string; args: any[] } | undefined;

	const commandService = new (class implements ICommandService {
		declare readonly _serviceBrand: undefined;
		onWillExecuteCommand = () => Disposable.None;
		onDidExecuteCommand = () => Disposable.None;
		executeCommand(id: string, ...args: any[]): Promise<any> {
			lastCommand = { id, args };
			return Promise.resolve(undefined);
		}
	})();

	setup(function () {
		lastCommand = undefined;
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('delegate to editorService, scheme:///fff', async function () {
		const openerService = new OpenerService(editorService, NullCommandService);
		await openerService.open(URI.parse('another:///somepath'));
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection, undefined);
	});

	test('delegate to editorService, scheme:///fff#L123', async function () {
		const openerService = new OpenerService(editorService, NullCommandService);

		await openerService.open(URI.parse('file:///somepath#L23'));
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startLineNumber, 23);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startColumn, 1);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endLineNumber, undefined);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endColumn, undefined);
		assert.strictEqual(editorService.lastInput!.resource.fragment, '');

		await openerService.open(URI.parse('another:///somepath#L23'));
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startLineNumber, 23);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startColumn, 1);

		await openerService.open(URI.parse('another:///somepath#L23,45'));
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startLineNumber, 23);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startColumn, 45);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endLineNumber, undefined);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endColumn, undefined);
		assert.strictEqual(editorService.lastInput!.resource.fragment, '');
	});

	test('delegate to editorService, scheme:///fff#123,123', async function () {
		const openerService = new OpenerService(editorService, NullCommandService);

		await openerService.open(URI.parse('file:///somepath#23'));
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startLineNumber, 23);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startColumn, 1);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endLineNumber, undefined);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endColumn, undefined);
		assert.strictEqual(editorService.lastInput!.resource.fragment, '');

		await openerService.open(URI.parse('file:///somepath#23,45'));
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startLineNumber, 23);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.startColumn, 45);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endLineNumber, undefined);
		assert.strictEqual((editorService.lastInput!.options as ITextEditorOptions)!.selection!.endColumn, undefined);
		assert.strictEqual(editorService.lastInput!.resource.fragment, '');
	});

	test('delegate to commandsService, command:someid', async function () {
		const openerService = new OpenerService(editorService, commandService);

		const id = `aCommand${Math.random()}`;
		store.add(CommandsRegistry.registerCommand(id, function () { }));

		assert.strictEqual(lastCommand, undefined);
		await openerService.open(URI.parse('command:' + id));
		assert.strictEqual(lastCommand, undefined);
	});


	test('delegate to commandsService, command:someid, 2', async function () {
		const openerService = new OpenerService(editorService, commandService);

		const id = `aCommand${Math.random()}`;
		store.add(CommandsRegistry.registerCommand(id, function () { }));

		await openerService.open(URI.parse('command:' + id).with({ query: '\"123\"' }), { allowCommands: true });
		assert.strictEqual(lastCommand!.id, id);
		assert.strictEqual(lastCommand!.args.length, 1);
		assert.strictEqual(lastCommand!.args[0], '123');

		await openerService.open(URI.parse('command:' + id), { allowCommands: true });
		assert.strictEqual(lastCommand!.id, id);
		assert.strictEqual(lastCommand!.args.length, 0);

		await openerService.open(URI.parse('command:' + id).with({ query: '123' }), { allowCommands: true });
		assert.strictEqual(lastCommand!.id, id);
		assert.strictEqual(lastCommand!.args.length, 1);
		assert.strictEqual(lastCommand!.args[0], 123);

		await openerService.open(URI.parse('command:' + id).with({ query: JSON.stringify([12, true]) }), { allowCommands: true });
		assert.strictEqual(lastCommand!.id, id);
		assert.strictEqual(lastCommand!.args.length, 2);
		assert.strictEqual(lastCommand!.args[0], 12);
		assert.strictEqual(lastCommand!.args[1], true);
	});

	test('links are protected by validators', async function () {
		const openerService = new OpenerService(editorService, commandService);

		store.add(openerService.registerValidator({ shouldOpen: () => Promise.resolve(false) }));

		const httpResult = await openerService.open(URI.parse('https://www.microsoft.com'));
		const httpsResult = await openerService.open(URI.parse('https://www.microsoft.com'));
		assert.strictEqual(httpResult, false);
		assert.strictEqual(httpsResult, false);
	});

	test('links validated by validators go to openers', async function () {
		const openerService = new OpenerService(editorService, commandService);

		store.add(openerService.registerValidator({ shouldOpen: () => Promise.resolve(true) }));

		let openCount = 0;
		store.add(openerService.registerOpener({
			open: (resource: URI) => {
				openCount++;
				return Promise.resolve(true);
			}
		}));

		await openerService.open(URI.parse('http://microsoft.com'));
		assert.strictEqual(openCount, 1);
		await openerService.open(URI.parse('https://microsoft.com'));
		assert.strictEqual(openCount, 2);
	});

	test('links aren\'t manipulated before being passed to validator: PR #118226', async function () {
		const openerService = new OpenerService(editorService, commandService);

		store.add(openerService.registerValidator({
			shouldOpen: (resource) => {
				// We don't want it to convert strings into URIs
				assert.strictEqual(resource instanceof URI, false);
				return Promise.resolve(false);
			}
		}));
		await openerService.open('https://wwww.microsoft.com');
		await openerService.open('https://www.microsoft.com??params=CountryCode%3DUSA%26Name%3Dvscode"');
	});

	test('links validated by multiple validators', async function () {
		const openerService = new OpenerService(editorService, commandService);

		let v1 = 0;
		openerService.registerValidator({
			shouldOpen: () => {
				v1++;
				return Promise.resolve(true);
			}
		});

		let v2 = 0;
		openerService.registerValidator({
			shouldOpen: () => {
				v2++;
				return Promise.resolve(true);
			}
		});

		let openCount = 0;
		openerService.registerOpener({
			open: (resource: URI) => {
				openCount++;
				return Promise.resolve(true);
			}
		});

		await openerService.open(URI.parse('http://microsoft.com'));
		assert.strictEqual(openCount, 1);
		assert.strictEqual(v1, 1);
		assert.strictEqual(v2, 1);
		await openerService.open(URI.parse('https://microsoft.com'));
		assert.strictEqual(openCount, 2);
		assert.strictEqual(v1, 2);
		assert.strictEqual(v2, 2);
	});

	test('links invalidated by first validator do not continue validating', async function () {
		const openerService = new OpenerService(editorService, commandService);

		let v1 = 0;
		openerService.registerValidator({
			shouldOpen: () => {
				v1++;
				return Promise.resolve(false);
			}
		});

		let v2 = 0;
		openerService.registerValidator({
			shouldOpen: () => {
				v2++;
				return Promise.resolve(true);
			}
		});

		let openCount = 0;
		openerService.registerOpener({
			open: (resource: URI) => {
				openCount++;
				return Promise.resolve(true);
			}
		});

		await openerService.open(URI.parse('http://microsoft.com'));
		assert.strictEqual(openCount, 0);
		assert.strictEqual(v1, 1);
		assert.strictEqual(v2, 0);
		await openerService.open(URI.parse('https://microsoft.com'));
		assert.strictEqual(openCount, 0);
		assert.strictEqual(v1, 2);
		assert.strictEqual(v2, 0);
	});

	test('matchesScheme', function () {
		assert.ok(matchesScheme('https://microsoft.com', 'https'));
		assert.ok(matchesScheme('http://microsoft.com', 'http'));
		assert.ok(matchesScheme('hTTPs://microsoft.com', 'https'));
		assert.ok(matchesScheme('httP://microsoft.com', 'http'));
		assert.ok(matchesScheme(URI.parse('https://microsoft.com'), 'https'));
		assert.ok(matchesScheme(URI.parse('http://microsoft.com'), 'http'));
		assert.ok(matchesScheme(URI.parse('hTTPs://microsoft.com'), 'https'));
		assert.ok(matchesScheme(URI.parse('httP://microsoft.com'), 'http'));
		assert.ok(!matchesScheme(URI.parse('https://microsoft.com'), 'http'));
		assert.ok(!matchesScheme(URI.parse('htt://microsoft.com'), 'http'));
		assert.ok(!matchesScheme(URI.parse('z://microsoft.com'), 'http'));
	});

	test('matchesSomeScheme', function () {
		assert.ok(matchesSomeScheme('https://microsoft.com', 'http', 'https'));
		assert.ok(matchesSomeScheme('http://microsoft.com', 'http', 'https'));
		assert.ok(!matchesSomeScheme('x://microsoft.com', 'http', 'https'));
	});

	test('resolveExternalUri', async function () {
		const openerService = new OpenerService(editorService, NullCommandService);

		try {
			await openerService.resolveExternalUri(URI.parse('file:///Users/user/folder'));
			assert.fail('Should not reach here');
		} catch {
			// OK
		}

		const disposable = openerService.registerExternalUriResolver({
			async resolveExternalUri(uri) {
				return { resolved: uri, dispose() { } };
			}
		});

		const result = await openerService.resolveExternalUri(URI.parse('file:///Users/user/folder'));
		assert.deepStrictEqual(result.resolved.toString(), 'file:///Users/user/folder');
		disposable.dispose();
	});

	test('vscode.open command can\'t open HTTP URL with hash (#) in it [extension development] #140907', async function () {
		const openerService = new OpenerService(editorService, NullCommandService);

		const actual: string[] = [];

		openerService.setDefaultExternalOpener({
			async openExternal(href) {
				actual.push(href);
				return true;
			}
		});

		const href = 'https://gitlab.com/viktomas/test-project/merge_requests/new?merge_request%5Bsource_branch%5D=test-%23-hash';
		const uri = URI.parse(href);

		assert.ok(await openerService.open(uri));
		assert.ok(await openerService.open(href));

		assert.deepStrictEqual(actual, [
			encodeURI(uri.toString(true)), // BAD, the encoded # (%23) is double encoded to %2523 (% is double encoded)
			href // good
		]);
	});
});
