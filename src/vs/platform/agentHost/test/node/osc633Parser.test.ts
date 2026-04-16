/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Osc633EventType, Osc633Parser } from '../../node/osc633Parser.js';

suite('Osc633Parser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let parser: Osc633Parser;

	setup(() => {
		parser = new Osc633Parser();
	});

	// -- Helper to build OSC 633 sequences --------------------------------

	function osc633(payload: string, terminator: 'bel' | 'st' = 'bel'): string {
		const term = terminator === 'bel' ? '\x07' : '\x1b\\';
		return `\x1b]633;${payload}${term}`;
	}

	// -- Basic sequence extraction ----------------------------------------

	test('no sequences returns data unchanged with no events', () => {
		const result = parser.parse('hello world');
		assert.deepStrictEqual(result, {
			cleanedData: 'hello world',
			events: [],
		});
	});

	test('PromptStart (A) with BEL terminator', () => {
		const result = parser.parse(`before${osc633('A')}after`);
		assert.deepStrictEqual(result, {
			cleanedData: 'beforeafter',
			events: [{ type: Osc633EventType.PromptStart }],
		});
	});

	test('CommandStart (B)', () => {
		const result = parser.parse(osc633('B'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{ type: Osc633EventType.CommandStart }],
		});
	});

	test('CommandExecuted (C)', () => {
		const result = parser.parse(osc633('C'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{ type: Osc633EventType.CommandExecuted }],
		});
	});

	test('CommandFinished (D) without exit code', () => {
		const result = parser.parse(osc633('D'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{ type: Osc633EventType.CommandFinished, exitCode: undefined }],
		});
	});

	test('CommandFinished (D) with exit code 0', () => {
		const result = parser.parse(osc633('D;0'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{ type: Osc633EventType.CommandFinished, exitCode: 0 }],
		});
	});

	test('CommandFinished (D) with non-zero exit code', () => {
		const result = parser.parse(osc633('D;127'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{ type: Osc633EventType.CommandFinished, exitCode: 127 }],
		});
	});

	test('CommandLine (E) with command and nonce', () => {
		const result = parser.parse(osc633('E;echo\\x20hello;my-nonce'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{
				type: Osc633EventType.CommandLine,
				commandLine: 'echo hello',
				nonce: 'my-nonce',
			}],
		});
	});

	test('CommandLine (E) without nonce', () => {
		const result = parser.parse(osc633('E;ls\\x20-la'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{
				type: Osc633EventType.CommandLine,
				commandLine: 'ls -la',
				nonce: undefined,
			}],
		});
	});

	test('CommandLine (E) with escaped backslash', () => {
		const result = parser.parse(osc633('E;echo\\x20\\\\hello'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{
				type: Osc633EventType.CommandLine,
				commandLine: 'echo \\hello',
				nonce: undefined,
			}],
		});
	});

	test('Property (P) Cwd', () => {
		const result = parser.parse(osc633('P;Cwd=/home/user'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{
				type: Osc633EventType.Property,
				key: 'Cwd',
				value: '/home/user',
			}],
		});
	});

	test('Property (P) without value is ignored', () => {
		const result = parser.parse(osc633('P;NoEquals'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [],
		});
	});

	// -- ST terminator ----------------------------------------------------

	test('PromptStart (A) with ST terminator', () => {
		const result = parser.parse(`before${osc633('A', 'st')}after`);
		assert.deepStrictEqual(result, {
			cleanedData: 'beforeafter',
			events: [{ type: Osc633EventType.PromptStart }],
		});
	});

	// -- Multiple sequences in one chunk ----------------------------------

	test('multiple sequences in one chunk', () => {
		const data = `prompt${osc633('A')}$ ${osc633('B')}${osc633('E;ls;nonce1')}${osc633('C')}file1\nfile2\n${osc633('D;0')}`;
		const result = parser.parse(data);
		assert.deepStrictEqual(result, {
			cleanedData: 'prompt$ file1\nfile2\n',
			events: [
				{ type: Osc633EventType.PromptStart },
				{ type: Osc633EventType.CommandStart },
				{ type: Osc633EventType.CommandLine, commandLine: 'ls', nonce: 'nonce1' },
				{ type: Osc633EventType.CommandExecuted },
				{ type: Osc633EventType.CommandFinished, exitCode: 0 },
			],
		});
	});

	// -- Non-633 OSC sequences are preserved ------------------------------

	test('non-633 OSC sequences are preserved in output', () => {
		const nonOsc = '\x1b]0;window title\x07';
		const result = parser.parse(`before${nonOsc}after`);
		assert.deepStrictEqual(result, {
			cleanedData: `before${nonOsc}after`,
			events: [],
		});
	});

	test('non-633 OSC sequences preserve ST terminator in output', () => {
		const nonOsc = '\x1b]0;window title\x1b\\';
		const result = parser.parse(`before${nonOsc}after`);
		assert.deepStrictEqual(result, {
			cleanedData: `before${nonOsc}after`,
			events: [],
		});
	});

	// -- Partial sequences across chunks ----------------------------------

	test('sequence split across two chunks (split in payload)', () => {
		const r1 = parser.parse('before\x1b]633;');
		assert.strictEqual(r1.cleanedData, 'before');
		assert.deepStrictEqual(r1.events, []);

		const r2 = parser.parse('A\x07after');
		assert.strictEqual(r2.cleanedData, 'after');
		assert.deepStrictEqual(r2.events, [{ type: Osc633EventType.PromptStart }]);
	});

	test('sequence split across two chunks (split at ESC of ST terminator)', () => {
		// First chunk ends with ESC (potential start of ST)
		const r1 = parser.parse('data\x1b]633;D;42\x1b');
		assert.strictEqual(r1.cleanedData, 'data');
		assert.deepStrictEqual(r1.events, []);

		// Second chunk starts with \ (completing ST)
		const r2 = parser.parse('\\more');
		assert.strictEqual(r2.cleanedData, 'more');
		assert.deepStrictEqual(r2.events, [{ type: Osc633EventType.CommandFinished, exitCode: 42 }]);
	});

	test('non-633 OSC sequence split at ESC of ST terminator preserves ST', () => {
		const r1 = parser.parse('before\x1b]0;window title\x1b');
		assert.strictEqual(r1.cleanedData, 'before');
		assert.deepStrictEqual(r1.events, []);

		const r2 = parser.parse('\\after');
		assert.strictEqual(r2.cleanedData, '\x1b]0;window title\x1b\\after');
		assert.deepStrictEqual(r2.events, []);
	});

	test('sequence split across three chunks', () => {
		const r1 = parser.parse('\x1b]63');
		assert.strictEqual(r1.cleanedData, '');
		assert.deepStrictEqual(r1.events, []);

		const r2 = parser.parse('3;C');
		assert.strictEqual(r2.cleanedData, '');
		assert.deepStrictEqual(r2.events, []);

		const r3 = parser.parse('\x07output');
		assert.strictEqual(r3.cleanedData, 'output');
		assert.deepStrictEqual(r3.events, [{ type: Osc633EventType.CommandExecuted }]);
	});

	// -- Full command lifecycle -------------------------------------------

	test('full command lifecycle with interleaved data', () => {
		const allEvents: typeof result.events = [];
		let allCleaned = '';

		// Prompt appears
		let result = parser.parse(`${osc633('A')}user@host:~ $ ${osc633('B')}`);
		allEvents.push(...result.events);
		allCleaned += result.cleanedData;

		// User types command, shell reports it and executes
		result = parser.parse(`${osc633('E;echo\\x20hi;nonce1')}${osc633('C')}`);
		allEvents.push(...result.events);
		allCleaned += result.cleanedData;

		// Command output
		result = parser.parse('hi\r\n');
		allEvents.push(...result.events);
		allCleaned += result.cleanedData;

		// Command finishes
		result = parser.parse(`${osc633('D;0')}${osc633('A')}`);
		allEvents.push(...result.events);
		allCleaned += result.cleanedData;

		assert.strictEqual(allCleaned, 'user@host:~ $ hi\r\n');
		assert.deepStrictEqual(allEvents, [
			{ type: Osc633EventType.PromptStart },
			{ type: Osc633EventType.CommandStart },
			{ type: Osc633EventType.CommandLine, commandLine: 'echo hi', nonce: 'nonce1' },
			{ type: Osc633EventType.CommandExecuted },
			{ type: Osc633EventType.CommandFinished, exitCode: 0 },
			{ type: Osc633EventType.PromptStart },
		]);
	});

	// -- Edge cases -------------------------------------------------------

	test('empty string', () => {
		const result = parser.parse('');
		assert.deepStrictEqual(result, { cleanedData: '', events: [] });
	});

	test('data with regular ANSI escape sequences (non-OSC) passes through', () => {
		const ansi = '\x1b[31mred\x1b[0m';
		const result = parser.parse(ansi);
		assert.deepStrictEqual(result, { cleanedData: ansi, events: [] });
	});

	test('CommandLine (E) with semicolons in command', () => {
		// Semicolons in the command line should be escaped as \x3b
		const result = parser.parse(osc633('E;echo\\x3b\\x20hello;my-nonce'));
		assert.deepStrictEqual(result, {
			cleanedData: '',
			events: [{
				type: Osc633EventType.CommandLine,
				commandLine: 'echo; hello',
				nonce: 'my-nonce',
			}],
		});
	});
});
