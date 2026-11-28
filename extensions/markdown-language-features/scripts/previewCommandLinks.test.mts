/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchPreviewCommand, getPreviewCommandPermission } from '../src/preview/commandLinks.ts';

type CommandHost = Parameters<typeof dispatchPreviewCommand>[1];

/** Capture dispatches without loading VS Code; URI construction is tested separately in the extension host. */
function createHost() {
	const calls: { id: string; args: unknown[] }[] = [];
	const host: CommandHost = {
		createUri: components => ({ revivedUri: components }),
		getPermission: () => 'allowed',
		executeCommand: async (id, ...args) => { calls.push({ id, args }); },
	};
	return { calls, host };
}

describe('Preview command permissions', () => {
	it('requires trust and ignores Workspace and Folder grants', () => {
		const workspaceOnly = { workspaceValue: ['test.run'], workspaceFolderValue: ['test.run'], globalValue: undefined };
		assert.deepEqual([
			getPreviewCommandPermission('test.run', true, undefined),
			getPreviewCommandPermission('test.run', true, workspaceOnly),
			getPreviewCommandPermission('test.run', false, { globalValue: ['test.run'] }),
			getPreviewCommandPermission('test.run', true, { ...workspaceOnly, globalValue: ['test.run'] }),
		], ['notAllowed', 'notAllowed', 'untrustedWorkspace', 'allowed']);
	});

	it('matches complete, case-sensitive IDs without wildcard expansion', () => {
		const setting = { globalValue: ['test.run', '*', 'vscode.*'] };
		assert.deepEqual(['test.run', 'Test.run', 'test.runMore', 'vscode.open'].map(id => getPreviewCommandPermission(id, true, setting)), [
			'allowed', 'notAllowed', 'notAllowed', 'notAllowed',
		]);
	});

	for (const invalid of [null, 'test.run', {}, [42], [''], ['test.run', 'has space'], ['test.run\n'], ['test.\u0000run']]) {
		it(`rejects the entire malformed permission list ${JSON.stringify(invalid)}`, () => {
			assert.equal(getPreviewCommandPermission('test.run', true, { globalValue: invalid }), 'invalidConfiguration');
		});
	}
});

describe('Preview command dispatch', () => {
	it('decodes arguments once, preserves plus, and spreads positional JSON values', async () => {
		const { calls, host } = createHost();
		const values = ['a+b', '%20', '100%', 'a&b', 'Привет', 42, true, null, { value: ['nested'] }];
		const results = [
			await dispatchPreviewCommand('command:test.run', host),
			await dispatchPreviewCommand('command:test.run?%5B%5D', host),
			await dispatchPreviewCommand(`COMMAND:test%2Erun?${encodeURIComponent(JSON.stringify(values)).replace('%2B', '+')}`, host),
		];
		assert.deepEqual({ results, calls }, {
			results: ['executed', 'executed', 'executed'],
			calls: [{ id: 'test.run', args: [] }, { id: 'test.run', args: [] }, { id: 'test.run', args: values }],
		});
	});

	for (const href of [null, {}, [], 42, '', 'https://example.com', 'command:', 'command://test.run', 'command:test.run#fragment', 'command:test%ZZ', 'command:test%20run', 'command:test%0Arun', 'command:test.run\n']) {
		it(`rejects an invalid link before authorization: ${JSON.stringify(href)}`, async () => {
			const { calls, host } = createHost();
			host.getPermission = () => { throw new Error('Authorization must not be reached'); };
			assert.deepEqual([await dispatchPreviewCommand(href, host), calls], ['invalidLink', []]);
		});
	}

	for (const query of ['', '%ZZ', '%5B', '%7B%7D', 'null', '42', '%22secret%22']) {
		it(`rejects malformed or non-array arguments: ${JSON.stringify(query)}`, async () => {
			const { calls, host } = createHost();
			assert.deepEqual([await dispatchPreviewCommand(`command:test.run?${query}`, host), calls], ['invalidArguments', []]);
		});
	}

	it('preserves ordinary command data with scheme properties', async () => {
		const { calls, host } = createHost();
		const values = [
			{ scheme: 'dark', marker: true },
			{ scheme: 'dark' },
			{ scheme: 'dark', path: '/theme', marker: true },
			{ scheme: '', marker: true },
			{ scheme: 42, path: '/theme' },
			{ scheme: 'file', path: '/example.md', $mid: 2 },
			{ scheme: 'file', path: '/example.md', $mid: null },
			{ scheme: 'file', path: '/example.md', fsPath: '/extra-data' },
		];
		// setContext accepts arbitrary JSON values. A scheme property alone must
		// neither change that value into a URI nor discard its command-specific data.
		const results = [];
		for (const value of values) {
			results.push(await dispatchPreviewCommand(`command:setContext?${encodeURIComponent(JSON.stringify(['lab.actions', value]))}`, host));
		}
		assert.deepEqual({ results, calls }, {
			results: values.map(() => 'executed'),
			calls: values.map(value => ({ id: 'setContext', args: ['lab.actions', value] })),
		});
	});

	it('revives marked and narrowly shaped unmarked top-level URI objects', async () => {
		const { calls, host } = createHost();
		const components = { scheme: 'file', authority: '', path: '/a b/100%.md', query: 'a=b', fragment: 'section' };
		const minimal = { scheme: 'file', path: '/example.md' };
		const nested = { nested: components };
		const otherObject = { ...components, $mid: 2 };
		const args = [{ ...components, $mid: 1, fsPath: 'ignored' }, components, minimal, nested, otherObject];
		await dispatchPreviewCommand(`command:vscode.open?${encodeURIComponent(JSON.stringify(args))}`, host);
		assert.deepEqual(calls, [{ id: 'vscode.open', args: [{ revivedUri: components }, { revivedUri: components }, { revivedUri: minimal }, nested, otherObject] }]);
	});

	for (const arg of [{ $mid: 1 }, { $mid: 1, scheme: 42 }, { $mid: 1, scheme: '' }, { scheme: '', path: '/example.md' }, { scheme: 'bad scheme', path: '/example.md' }, { scheme: 'file', path: 42 }, { scheme: 'file', path: '/example.md', query: null }]) {
		it(`rejects invalid URI components: ${JSON.stringify(arg)}`, async () => {
			const { calls, host } = createHost();
			assert.deepEqual([await dispatchPreviewCommand(`command:test.run?${encodeURIComponent(JSON.stringify([arg]))}`, host), calls], ['invalidUri', []]);
		});
	}

	it('sanitizes native URI construction errors', async () => {
		const { calls, host } = createHost();
		host.createUri = () => { throw new Error('private URI'); };
		assert.deepEqual([await dispatchPreviewCommand('command:test.run?%5B%7B%22%24mid%22%3A1%2C%22scheme%22%3A%22file%22%7D%5D', host), calls], ['invalidUri', []]);
	});

	it('rechecks current trust and permissions on each invocation', async () => {
		const { calls, host } = createHost();
		let allowed = ['test.run'];
		let trusted = true;
		host.getPermission = id => getPreviewCommandPermission(id, trusted, { globalValue: allowed });
		const results = [await dispatchPreviewCommand('command:test.run', host)];
		allowed = [];
		results.push(await dispatchPreviewCommand('command:test.run', host));
		allowed = ['test.run'];
		trusted = false;
		results.push(await dispatchPreviewCommand('command:test.run', host));
		trusted = true;
		results.push(await dispatchPreviewCommand('command:test.run', host));
		assert.deepEqual({ results, calls }, {
			results: ['executed', 'notAllowed', 'untrustedWorkspace', 'executed'],
			calls: [{ id: 'test.run', args: [] }, { id: 'test.run', args: [] }],
		});
	});

	it('authorizes after URI revival and dispatches immediately after authorization', async () => {
		const order: string[] = [];
		await dispatchPreviewCommand('command:test.run?%5B%7B%22%24mid%22%3A1%2C%22scheme%22%3A%22file%22%7D%5D', {
			createUri: () => { order.push('uri'); return {}; },
			getPermission: () => { order.push('permission'); return 'allowed'; },
			executeCommand: async () => { order.push('execute'); },
		});
		assert.deepEqual(order, ['uri', 'permission', 'execute']);
	});

	it('authorizes only the requested outer command and preserves nested arguments', async () => {
		const { calls, host } = createHost();
		const args = [{ commands: ['nested.command'] }];
		host.getPermission = id => getPreviewCommandPermission(id, true, { globalValue: ['runCommands'] });
		const executed = await dispatchPreviewCommand(`command:runCommands?${encodeURIComponent(JSON.stringify(args))}`, host);
		host.getPermission = id => getPreviewCommandPermission(id, true, { globalValue: ['nested.command'] });
		const blocked = await dispatchPreviewCommand('command:runCommands', host);
		assert.deepEqual({ executed, blocked, calls }, { executed: 'executed', blocked: 'notAllowed', calls: [{ id: 'runCommands', args }] });
	});

	it('sanitizes synchronous and asynchronous failures and allows subsequent clicks', async () => {
		const { host } = createHost();
		host.executeCommand = () => { throw new Error('private synchronous failure'); };
		const sync = await dispatchPreviewCommand('command:test.run', host);
		host.executeCommand = async () => { throw new Error('private asynchronous failure'); };
		const async = await dispatchPreviewCommand('command:test.run', host);
		host.executeCommand = async () => 'private command result';
		assert.deepEqual([sync, async, await dispatchPreviewCommand('command:test.run', host)], ['failed', 'failed', 'executed']);
	});
});
