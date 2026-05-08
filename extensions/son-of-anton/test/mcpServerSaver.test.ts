/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	listMcpServers,
	saveMcpServer,
	deleteMcpServer,
	type McpServerConfig,
} from '../src/onboarding/mcpServerSaver';

/**
 * In-memory fake of the Memento-style `WorkspaceConfiguration` API. Mirrors
 * the surface area `mcpServerSaver` actually touches — `get`, `update` and
 * `has` — so individual tests can assert against the resulting array without
 * needing a real VS Code runtime.
 */
function makeConfig(initial: Record<string, unknown> = {}): vscode.WorkspaceConfiguration {
	const data: Record<string, unknown> = { ...initial };
	const cfg = {
		get<T>(key: string, defaultValue?: T): T | undefined {
			const v = data[key];
			return v === undefined ? defaultValue : (v as T);
		},
		has(key: string): boolean {
			return Object.prototype.hasOwnProperty.call(data, key);
		},
		inspect(): undefined { return undefined; },
		update(key: string, value: unknown): Thenable<void> {
			data[key] = value;
			return Promise.resolve();
		},
	};
	return cfg as unknown as vscode.WorkspaceConfiguration;
}

function read(config: vscode.WorkspaceConfiguration): unknown {
	return config.get<unknown>('mcp.servers');
}

suite('mcpServerSaver', () => {
	test('listMcpServers returns the array from settings, dropping malformed entries', async () => {
		const config = makeConfig({
			'mcp.servers': [
				{ name: 'good', command: 'node', args: ['a.js'] },
				{ name: '', command: 'node' },
				null,
				{ name: 'no-command' },
				{ name: 'with-env', command: 'python', env: { TOKEN: 'x' } },
			],
		});
		const servers = await listMcpServers(config);
		assert.deepStrictEqual(
			servers.map(s => ({ name: s.name, command: s.command, args: s.args, env: s.env })),
			[
				{ name: 'good', command: 'node', args: ['a.js'], env: undefined },
				{ name: 'with-env', command: 'python', args: undefined, env: { TOKEN: 'x' } },
			],
		);
	});

	test('listMcpServers returns empty array when setting is missing or wrong type', async () => {
		const empty = await listMcpServers(makeConfig());
		const wrongType = await listMcpServers(makeConfig({ 'mcp.servers': 'not-an-array' }));
		assert.deepStrictEqual({ empty, wrongType }, { empty: [], wrongType: [] });
	});

	test('saveMcpServer add appends a new entry and rejects duplicate names', async () => {
		const config = makeConfig({ 'mcp.servers': [{ name: 'one', command: 'node' }] });
		const ok = await saveMcpServer(
			{ name: 'two', command: 'python', args: ['srv.py'] },
			'add',
			config,
		);
		const dup = await saveMcpServer(
			{ name: 'two', command: 'python', args: ['srv.py'] },
			'add',
			config,
		);
		assert.deepStrictEqual(
			{ ok: ok.ok, dup: dup.ok, dupMessage: dup.message, persisted: read(config) },
			{
				ok: true,
				dup: false,
				dupMessage: 'An MCP server named "two" already exists.',
				persisted: [
					{ name: 'one', command: 'node' },
					{ name: 'two', command: 'python', args: ['srv.py'] },
				],
			},
		);
	});

	test('saveMcpServer edit updates by name and preserves other entries', async () => {
		const config = makeConfig({
			'mcp.servers': [
				{ name: 'alpha', command: 'node', args: ['old.js'] },
				{ name: 'beta', command: 'python' },
			],
		});
		const result = await saveMcpServer(
			{ name: 'alpha', command: 'node', args: ['new.js'], env: { K: 'V' }, cwd: '/tmp' },
			'edit',
			config,
		);
		assert.deepStrictEqual(
			{ ok: result.ok, persisted: read(config) },
			{
				ok: true,
				persisted: [
					{ name: 'alpha', command: 'node', args: ['new.js'], env: { K: 'V' }, cwd: '/tmp' },
					{ name: 'beta', command: 'python' },
				],
			},
		);
	});

	test('saveMcpServer rejects empty name, invalid characters, and missing command', async () => {
		const config = makeConfig({ 'mcp.servers': [] });
		const empty = await saveMcpServer({ name: '', command: 'node' }, 'add', config);
		const invalid = await saveMcpServer({ name: 'has space', command: 'node' }, 'add', config);
		const noCommand = await saveMcpServer({ name: 'ok', command: '' }, 'add', config);
		const punctuation = await saveMcpServer({ name: 'has.dot', command: 'node' }, 'add', config);
		assert.deepStrictEqual(
			[empty, invalid, noCommand, punctuation].map(r => ({ ok: r.ok, message: r.message })),
			[
				{ ok: false, message: 'Name is required.' },
				{ ok: false, message: 'Name may only contain letters, numbers, dashes and underscores.' },
				{ ok: false, message: 'Command is required.' },
				{ ok: false, message: 'Name may only contain letters, numbers, dashes and underscores.' },
			],
		);
		// Failed validations must not mutate the array.
		assert.deepStrictEqual(read(config), []);
	});

	test('saveMcpServer normalises empty optionals before persisting', async () => {
		const config = makeConfig({ 'mcp.servers': [] });
		await saveMcpServer(
			{ name: 'clean', command: 'node', args: [], env: {}, cwd: '   ' },
			'add',
			config,
		);
		assert.deepStrictEqual(read(config), [{ name: 'clean', command: 'node' }]);
	});

	test('deleteMcpServer removes by name and is a no-op for missing names', async () => {
		const config = makeConfig({
			'mcp.servers': [
				{ name: 'keep', command: 'node' },
				{ name: 'drop', command: 'python' },
			],
		});
		const removed = await deleteMcpServer('drop', config);
		const missing = await deleteMcpServer('not-there', config);
		const noName = await deleteMcpServer('', config);
		assert.deepStrictEqual(
			{
				removed: removed.ok,
				missing: missing.ok,
				noName: noName.ok,
				persisted: read(config),
			},
			{
				removed: true,
				missing: true,
				noName: false,
				persisted: [{ name: 'keep', command: 'node' }],
			},
		);
	});

	test('saveMcpServer rejects malformed env / args payloads', async () => {
		const config = makeConfig({ 'mcp.servers': [] });
		const badArgs = await saveMcpServer(
			{ name: 'a', command: 'node', args: ['ok', 5 as unknown as string] },
			'add',
			config,
		);
		const badEnv = await saveMcpServer(
			{ name: 'a', command: 'node', env: { K: 5 as unknown as string } },
			'add',
			config,
		);
		const ref: Pick<McpServerConfig, 'name'> = { name: 'a' };
		assert.deepStrictEqual(
			{ badArgs: badArgs.ok, badEnv: badEnv.ok, persisted: read(config), name: ref.name },
			{ badArgs: false, badEnv: false, persisted: [], name: 'a' },
		);
	});
});
