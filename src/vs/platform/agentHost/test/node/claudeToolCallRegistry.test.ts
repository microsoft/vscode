/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LogLevel, type ILogService } from '../../../log/common/log.js';
import { ClaudeToolCallRegistry } from '../../node/claude/claudeToolCallRegistry.js';

class CapturingLog implements Partial<ILogService> {
	readonly warns: string[] = [];
	warn(message: string): void { this.warns.push(message); }
	error(): void { /* unused */ }
	info(): void { /* unused */ }
	trace(): void { /* unused */ }
	debug(): void { /* unused */ }
	getLevel(): LogLevel { return LogLevel.Off; }
}

suite('claudeToolCallRegistry — Phase 8.5 input/info tracking', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('begin → appendInputDelta → finalize stashes rich info and parsed input', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_1', 'Bash', 'turn-1');
		registry.appendInputDelta('tu_1', '{"comma');
		registry.appendInputDelta('tu_1', 'nd":"git status"}');
		registry.finalize('tu_1');

		const entry = registry.lookup('tu_1');
		assert.deepStrictEqual(
			{
				turnId: entry?.turnId,
				toolName: entry?.toolName,
				parsedInput: entry?.info?.parsedInput,
				displayName: entry?.info?.displayName,
				invocationMessage: entry?.info?.invocationMessage,
				toolInput: entry?.info?.toolInput,
			},
			{
				turnId: 'turn-1',
				toolName: 'Bash',
				parsedInput: { command: 'git status' },
				displayName: 'Run shell command',
				invocationMessage: { markdown: 'Running `git status`' },
				toolInput: 'git status',
			},
		);
	});

	test('finalize with malformed JSON falls back to undefined parsedInput, preserves raw buffer as toolInput', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_2', 'Read', 'turn-1');
		registry.appendInputDelta('tu_2', '{not valid json');
		registry.finalize('tu_2');

		const entry = registry.lookup('tu_2');
		assert.deepStrictEqual(
			{
				parsedInput: entry?.info?.parsedInput,
				displayName: entry?.info?.displayName,
				invocationMessage: entry?.info?.invocationMessage,
				// Raw buffer preserved so the UI still shows the SDK's payload
				// instead of an empty input section.
				toolInput: entry?.info?.toolInput,
			},
			{
				parsedInput: undefined,
				displayName: 'Read file',
				invocationMessage: 'Reading file',
				toolInput: '{not valid json',
			},
		);
	});

	test('finalize with no deltas yields info with undefined parsedInput', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_3', 'Grep', 'turn-1');
		registry.finalize('tu_3');

		assert.deepStrictEqual(registry.lookup('tu_3')?.info?.parsedInput, undefined);
	});

	test('lookup before finalize returns attribution with undefined info', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_4', 'Bash', 'turn-2');
		registry.appendInputDelta('tu_4', '{"command":"ls"}');

		const entry = registry.lookup('tu_4');
		assert.deepStrictEqual(
			{ turnId: entry?.turnId, toolName: entry?.toolName, info: entry?.info },
			{ turnId: 'turn-2', toolName: 'Bash', info: undefined },
		);
	});

	test('lookup of unknown id returns undefined; appendInputDelta / finalize are no-ops on unknown id', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.appendInputDelta('nope', 'x');
		registry.finalize('nope');
		assert.strictEqual(registry.lookup('nope'), undefined);
	});

	test('complete removes the entry; subsequent lookup is undefined', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_5', 'Bash', 'turn-1');
		registry.finalize('tu_5');
		registry.complete('tu_5');
		assert.strictEqual(registry.lookup('tu_5'), undefined);
	});

	test('clearPending warns once per orphan and drains all entries', () => {
		const registry = new ClaudeToolCallRegistry();
		const log = new CapturingLog();
		registry.begin('tu_6', 'Bash', 'turn-1');
		registry.begin('tu_7', 'Read', 'turn-1');
		registry.clearPending(log as unknown as ILogService);

		assert.strictEqual(registry.lookup('tu_6'), undefined);
		assert.strictEqual(registry.lookup('tu_7'), undefined);
		assert.strictEqual(log.warns.length, 2);
		assert.ok(log.warns[0].includes('tu_6') && log.warns[0].includes('Bash'));
		assert.ok(log.warns[1].includes('tu_7') && log.warns[1].includes('Read'));
	});

	test('clearPending is a silent no-op when nothing is pending', () => {
		const registry = new ClaudeToolCallRegistry();
		const log = new CapturingLog();
		registry.clearPending(log as unknown as ILogService);
		assert.deepStrictEqual(log.warns, []);
	});

	test('seedParsedInput populates info from a pre-parsed object (inner subagent path)', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_seed', 'Bash', 'turn-1');
		registry.seedParsedInput('tu_seed', { command: 'git status', description: 'check' });

		const entry = registry.lookup('tu_seed');
		assert.deepStrictEqual({
			turnId: entry?.turnId,
			toolName: entry?.toolName,
			parsedInput: entry?.info?.parsedInput,
			invocationMessage: entry?.info?.invocationMessage,
			toolInput: entry?.info?.toolInput,
		}, {
			turnId: 'turn-1',
			toolName: 'Bash',
			parsedInput: { command: 'git status', description: 'check' },
			invocationMessage: { markdown: 'Running `git status`' },
			toolInput: 'git status',
		});
	});

	test('seedParsedInput with non-object input yields info with undefined parsedInput', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.begin('tu_seed_bad', 'Bash', 'turn-1');
		registry.seedParsedInput('tu_seed_bad', 'not an object');

		const info = registry.lookup('tu_seed_bad')?.info;
		assert.strictEqual(info?.parsedInput, undefined);
		assert.strictEqual(info?.toolInput, undefined);
	});

	test('seedParsedInput on unknown id is a silent no-op', () => {
		const registry = new ClaudeToolCallRegistry();
		registry.seedParsedInput('tu_unknown', { command: 'ls' });
		assert.strictEqual(registry.lookup('tu_unknown'), undefined);
	});
});
