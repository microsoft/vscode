/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostHeadlessTerminal } from '../../node/agentHostHeadlessTerminal.js';
import pkg from '@xterm/headless';

type XtermTerminal = pkg.Terminal;
const { Terminal: XtermTerminal } = pkg;

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

	test('responds to DEC DSR cursor position queries', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('\x1b[?6n');

		assert.strictEqual(responses.join(''), '\x1b[?1;1R');
	});

	test('filters non-cursor terminal responses', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('\x1b[5n'); // status report
		await terminal.writePtyData('\x1b[c'); // DA1
		await terminal.writePtyData('\x1b[0c'); // DA1
		await terminal.writePtyData('\x1b[>c'); // DA2
		await terminal.writePtyData('\x1b[>0c'); // DA2

		assert.deepStrictEqual(responses, []);
	});

	test('does not emit response data for normal terminal output', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('normal output\r\n');

		assert.deepStrictEqual(responses, []);
	});

	test('tracks bracketed paste mode', async () => {
		const terminal = createTerminal();

		assert.strictEqual(terminal.isBracketedPasteMode(), false);
		await terminal.writePtyData('\x1b[?2004h');
		assert.strictEqual(terminal.isBracketedPasteMode(), true);
		await terminal.writePtyData('\x1b[?2004l');
		assert.strictEqual(terminal.isBracketedPasteMode(), false);
	});

	test('resolves alt-buffer promise on alternate buffer entry', async () => {
		const terminal = createTerminal();
		const altBufferStore = disposables.add(new DisposableStore());
		const altBufferPromise = terminal.createAltBufferPromise(altBufferStore);
		let resolved = false;
		void altBufferPromise.then(() => resolved = true);

		assert.strictEqual(terminal.isInAltBuffer(), false);
		await terminal.writePtyData('\x1b[?1049h');
		assert.strictEqual(terminal.isInAltBuffer(), true);
		await altBufferPromise;
		assert.strictEqual(resolved, true);

		await terminal.writePtyData('\x1b[?1049h');
		assert.strictEqual(terminal.isInAltBuffer(), true);

		await terminal.writePtyData('\x1b[?1049l');
		assert.strictEqual(terminal.isInAltBuffer(), false);
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
		let xterm: XtermTerminal | undefined;
		let shouldThrow = true;
		const terminal = disposables.add(new AgentHostHeadlessTerminal({
			cols: 80,
			rows: 24,
			scrollback: 0,
			logService: new NullLogService(),
			terminalFactory: options => {
				xterm = new XtermTerminal(options);
				const originalWrite = xterm.write.bind(xterm);
				xterm.write = (data, callback) => {
					if (shouldThrow) {
						shouldThrow = false;
						throw new Error('synthetic write failure');
					}
					originalWrite(data, callback);
				};
				return xterm;
			}
		}));
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('\x1b[6n');
		await terminal.writePtyData('\x1b[6n');

		assert.deepStrictEqual(responses, ['\x1b[1;1R']);
	});

	test('resize updates the cursor position reported by the mirror', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		terminal.resize(5, 4);
		await terminal.writePtyData('\x1b[999;999H\x1b[6n');

		assert.strictEqual(responses.join(''), '\x1b[4;5R');
	});

	test('clear resets the cursor position', async () => {
		const terminal = createTerminal();
		const responses: string[] = [];
		disposables.add(terminal.onResponseData(data => responses.push(data)));

		await terminal.writePtyData('\x1b[10;10H');
		terminal.clear();
		await terminal.writePtyData('\x1b[6n');

		assert.strictEqual(responses.join(''), '\x1b[1;1R');
	});
});
