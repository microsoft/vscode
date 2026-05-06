/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostHeadlessTerminal } from '../../node/agentHostHeadlessTerminal.js';

suite('AgentHostHeadlessTerminal', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createTerminal(cols = 80, rows = 24): AgentHostHeadlessTerminal {
		return disposables.add(new AgentHostHeadlessTerminal({
			cols,
			rows,
			scrollback: 100,
			logService: new NullLogService(),
		}));
	}

	test('responds to DSR cursor position queries', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('abc\x1b[6n');

		assert.strictEqual(responses.join(''), '\x1b[1;4R');
	});

	test('filters non-cursor terminal responses', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('\x1b[5n');
		await terminal.writePtyData('\x1b[c');

		assert.deepStrictEqual(responses, []);
	});

	test('ignores writes after dispose', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		terminal.dispose();
		await terminal.writePtyData('abc\x1b[6n');

		assert.deepStrictEqual(responses, []);
	});

	test('write failure does not poison later writes', async () => {
		const terminal = createTerminal();
		const inner = (terminal as unknown as { _terminal: { write: (data: string, callback: () => void) => void } })._terminal;
		const originalWrite = inner.write.bind(inner);
		let shouldThrow = true;
		inner.write = (data: string, callback: () => void) => {
			if (shouldThrow) {
				shouldThrow = false;
				throw new Error('synthetic write failure');
			}
			originalWrite(data, callback);
		};

		await terminal.writePtyData('first');
		await terminal.writePtyData('second');

		assert.strictEqual(await terminal.getRecentRenderedText(), 'second');
	});

	test('tracks bracketed paste mode', async () => {
		const terminal = createTerminal();

		await terminal.writePtyData('\x1b[?2004h');
		assert.strictEqual(terminal.isBracketedPasteMode(), true);

		await terminal.writePtyData('\x1b[?2004l');
		assert.strictEqual(terminal.isBracketedPasteMode(), false);
	});

	test('tracks alternate buffer state', async () => {
		const terminal = createTerminal();

		await terminal.writePtyData('\x1b[?1049h');
		assert.strictEqual(terminal.isInAltBuffer(), true);

		await terminal.writePtyData('\x1b[?1049l');
		assert.strictEqual(terminal.isInAltBuffer(), false);
	});

	test('resizes the rendered buffer', async () => {
		const terminal = createTerminal(10, 4);

		terminal.resize(5, 4);
		await terminal.writePtyData('abcdefghij');

		assert.strictEqual(await terminal.getRecentRenderedText(), 'abcdefghij');
		assert.strictEqual(await terminal.getCursorLineText(), 'fghij');
	});

	test('clear resets rendered content', async () => {
		const terminal = createTerminal();

		await terminal.writePtyData('hello');
		assert.strictEqual(await terminal.getRecentRenderedText(), 'hello');

		terminal.clear();
		assert.strictEqual(await terminal.getRecentRenderedText(), '');
	});
});
