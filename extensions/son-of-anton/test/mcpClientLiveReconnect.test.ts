/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { diffServerConfigs, type McpServerConfig } from 'son-of-anton-core/mcp/McpClient';

/**
 * Re-derive the same signature the production code uses so tests can build
 * realistic "active" inputs without exposing the helper itself. Keeping this
 * mirror small means a future refactor of the production hash will surface
 * here as a deliberate update rather than a silent test failure.
 */
function signatureOf(cfg: McpServerConfig): string {
	const env = cfg.env
		? Object.keys(cfg.env).sort().reduce<Record<string, string>>((acc, k) => {
			acc[k] = cfg.env![k];
			return acc;
		}, {})
		: undefined;
	return JSON.stringify({
		command: cfg.command,
		args: cfg.args ?? [],
		env: env ?? {},
		cwd: cfg.cwd ?? '',
	});
}

function asActive(cfgs: McpServerConfig[]): { name: string; signature: string }[] {
	return cfgs.map(c => ({ name: c.name, signature: signatureOf(c) }));
}

suite('McpClient live reconnect', () => {
	test('diffServerConfigs categorises add / remove / modify / unchanged correctly', () => {
		const oldConfigs: McpServerConfig[] = [
			{ name: 'keep', command: 'node', args: ['srv.js'] },
			{ name: 'change-args', command: 'python', args: ['old.py'] },
			{ name: 'gone', command: 'bash', args: ['/tmp/x.sh'] },
		];
		const newConfigs: McpServerConfig[] = [
			{ name: 'keep', command: 'node', args: ['srv.js'] },
			{ name: 'change-args', command: 'python', args: ['new.py'] },
			{ name: 'fresh', command: 'deno', args: ['run', 'srv.ts'] },
		];

		const delta = diffServerConfigs(asActive(oldConfigs), newConfigs);

		assert.deepStrictEqual(
			{
				added: delta.added.map(c => c.name),
				removed: delta.removed,
				modified: delta.modified.map(c => c.name),
				unchanged: delta.unchanged,
			},
			{
				added: ['fresh'],
				removed: ['gone'],
				modified: ['change-args'],
				unchanged: ['keep'],
			},
		);
	});

	test('modifying args, env or cwd is treated as a modification', () => {
		const old: McpServerConfig[] = [
			{ name: 'a', command: 'node', args: ['v1.js'] },
			{ name: 'b', command: 'python', env: { TOKEN: 'old' } },
			{ name: 'c', command: 'bash', cwd: '/tmp/old' },
			{ name: 'd', command: 'node', args: ['stable.js'] },
		];
		const next: McpServerConfig[] = [
			{ name: 'a', command: 'node', args: ['v2.js'] },
			{ name: 'b', command: 'python', env: { TOKEN: 'new' } },
			{ name: 'c', command: 'bash', cwd: '/tmp/new' },
			{ name: 'd', command: 'node', args: ['stable.js'] },
		];

		const delta = diffServerConfigs(asActive(old), next);

		assert.deepStrictEqual(
			{
				modified: delta.modified.map(c => c.name).sort(),
				unchanged: [...delta.unchanged].sort(),
				added: delta.added.map(c => c.name),
				removed: delta.removed,
			},
			{
				modified: ['a', 'b', 'c'],
				unchanged: ['d'],
				added: [],
				removed: [],
			},
		);
	});

	test('removing a server is reported as removed (so the runtime can disconnect it)', () => {
		const old: McpServerConfig[] = [
			{ name: 'keeper', command: 'node' },
			{ name: 'doomed', command: 'python', args: ['srv.py'] },
		];
		const next: McpServerConfig[] = [
			{ name: 'keeper', command: 'node' },
		];

		const delta = diffServerConfigs(asActive(old), next);

		assert.deepStrictEqual(
			{ added: delta.added, removed: delta.removed, modified: delta.modified, unchanged: delta.unchanged },
			{ added: [], removed: ['doomed'], modified: [], unchanged: ['keeper'] },
		);
	});

	test('no-op config change (same content, different references) yields empty deltas', () => {
		const old: McpServerConfig[] = [
			{ name: 'one', command: 'node', args: ['srv.js'], env: { K: 'V' }, cwd: '/tmp' },
			{ name: 'two', command: 'python', args: ['svc.py'] },
		];
		// Re-create with fresh references but identical content — the diff
		// should treat both as unchanged so no spurious reconnects fire.
		const next: McpServerConfig[] = [
			{ name: 'one', command: 'node', args: ['srv.js'], env: { K: 'V' }, cwd: '/tmp' },
			{ name: 'two', command: 'python', args: ['svc.py'] },
		];

		const delta = diffServerConfigs(asActive(old), next);

		assert.deepStrictEqual(
			{
				added: delta.added,
				removed: delta.removed,
				modified: delta.modified,
				unchanged: [...delta.unchanged].sort(),
			},
			{ added: [], removed: [], modified: [], unchanged: ['one', 'two'] },
		);
	});

	test('env key reorder is not treated as a modification', () => {
		// `Object.keys` iteration order on plain JSON is insertion-order, so
		// without a sort the signature would flip when the user re-saves a
		// server with the same env vars in a different order. The production
		// `signatureOf` sorts keys; this test pins that invariant down.
		const old: McpServerConfig[] = [
			{ name: 'a', command: 'node', env: { A: '1', B: '2' } },
		];
		const next: McpServerConfig[] = [
			{ name: 'a', command: 'node', env: { B: '2', A: '1' } },
		];

		const delta = diffServerConfigs(asActive(old), next);

		assert.deepStrictEqual(
			{ modified: delta.modified, unchanged: delta.unchanged },
			{ modified: [], unchanged: ['a'] },
		);
	});
});
