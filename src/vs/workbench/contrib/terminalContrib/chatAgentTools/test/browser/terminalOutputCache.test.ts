/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalToolId } from '../../browser/tools/toolIds.js';
import { TerminalOutputCache } from '../../browser/tools/terminalOutputCache.js';

function input(command: string, cwd = '/repo') {
	return { command, cwd };
}

suite('TerminalOutputCache', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lookup returns recorded value for a cacheable command', () => {
		const cache = new TerminalOutputCache(() => 1000);
		cache.record(TerminalToolId.RunInTerminal, input('git status'), 'clean');
		const hit = cache.lookup(TerminalToolId.RunInTerminal, input('git status'));
		strictEqual(hit?.text, 'clean');
	});

	test('keys include cwd so same command in different cwd does not collide', () => {
		const cache = new TerminalOutputCache(() => 1000);
		cache.record(TerminalToolId.RunInTerminal, input('git status', '/a'), 'A');
		cache.record(TerminalToolId.RunInTerminal, input('git status', '/b'), 'B');
		strictEqual(cache.lookup(TerminalToolId.RunInTerminal, input('git status', '/a'))?.text, 'A');
		strictEqual(cache.lookup(TerminalToolId.RunInTerminal, input('git status', '/b'))?.text, 'B');
	});

	test('Fast class expires after 30s', () => {
		let now = 0;
		const cache = new TerminalOutputCache(() => now);
		now = 1000;
		cache.record(TerminalToolId.RunInTerminal, input('git status'), 'A');
		now = 1000 + 31_000;
		strictEqual(cache.lookup(TerminalToolId.RunInTerminal, input('git status')), undefined);
	});

	test('Slow class survives past the Fast TTL', () => {
		let now = 0;
		const cache = new TerminalOutputCache(() => now);
		now = 1000;
		cache.record(TerminalToolId.RunInTerminal, input('git log --oneline -n 5'), 'A');
		now = 1000 + 60_000;
		ok(cache.lookup(TerminalToolId.RunInTerminal, input('git log --oneline -n 5')));
	});

	test('mutation invalidates same-program reads', () => {
		const cache = new TerminalOutputCache(() => 1000);
		cache.record(TerminalToolId.RunInTerminal, input('git status'), 'clean');
		// git commit is a mutation that invalidates other git entries in the same cwd.
		cache.observe(TerminalToolId.RunInTerminal, input('git commit -m hi'));
		strictEqual(cache.lookup(TerminalToolId.RunInTerminal, input('git status')), undefined);
	});

	test('mutation in different cwd does not invalidate', () => {
		const cache = new TerminalOutputCache(() => 1000);
		cache.record(TerminalToolId.RunInTerminal, input('git status', '/a'), 'A');
		cache.observe(TerminalToolId.RunInTerminal, input('git commit -m hi', '/b'));
		ok(cache.lookup(TerminalToolId.RunInTerminal, input('git status', '/a')));
	});

	test('non-cacheable command does not populate cache', () => {
		const cache = new TerminalOutputCache(() => 1000);
		cache.record(TerminalToolId.RunInTerminal, input('rm -rf node_modules'), 'gone');
		strictEqual(cache.lookup(TerminalToolId.RunInTerminal, input('rm -rf node_modules')), undefined);
	});

	test('invalidateCwd clears entries for that cwd only', () => {
		const cache = new TerminalOutputCache(() => 1000);
		cache.record(TerminalToolId.RunInTerminal, input('git status', '/a'), 'A');
		cache.record(TerminalToolId.RunInTerminal, input('git status', '/b'), 'B');
		cache.invalidateCwd('/a');
		strictEqual(cache.lookup(TerminalToolId.RunInTerminal, input('git status', '/a')), undefined);
		ok(cache.lookup(TerminalToolId.RunInTerminal, input('git status', '/b')));
	});
});
