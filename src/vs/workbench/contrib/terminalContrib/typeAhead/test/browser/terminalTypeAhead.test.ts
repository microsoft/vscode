/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IBuffer, Terminal } from '@xterm/xterm';
import { SinonStub, stub, useFakeTimers } from 'sinon';
import { Emitter } from '../../../../../../base/common/event.js';
import { timeout } from '../../../../../../base/common/async.js';
import { CharPredictState, IPrediction, PredictionStats, TypeAheadAddon } from '../../browser/terminalTypeAheadAddon.js';
import { IBeforeProcessDataEvent, ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { DEFAULT_LOCAL_ECHO_EXCLUDE, type ITerminalTypeAheadConfiguration } from '../../common/terminalTypeAheadConfiguration.js';
import { isString } from '../../../../../../base/common/types.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { writeP } from '../../../../terminal/browser/terminalTestHelpers.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { IXtermCore, XtermAttributes } from '../../../../terminal/browser/xterm-private.js';
import { Random } from '../../../../../../editor/test/common/core/random.js';

const CSI = `\x1b[`;

const enum CursorMoveDirection {
	Back = 'D',
	Forwards = 'C',
}

function colorMode(palette: boolean, rgb: boolean) {
	// P16 and P256 are distinct storage encodings of the same rendered palette mode.
	if (palette) {
		return 'palette';
	}
	return rgb ? 'rgb' : 'default';
}

function attributes(cell: XtermAttributes) {
	return {
		foreground: [colorMode(cell.isFgPalette(), cell.isFgRGB()), cell.getFgColor()],
		background: [colorMode(cell.isBgPalette(), cell.isBgRGB()), cell.getBgColor()],
		underline: [cell.getUnderlineStyle(), colorMode(cell.isUnderlineColorPalette(), cell.isUnderlineColorRGB()), cell.getUnderlineColor()],
		bold: !!cell.isBold(),
		dim: !!cell.isDim(),
		italic: !!cell.isItalic(),
		blink: !!cell.isBlink(),
		inverse: !!cell.isInverse(),
		invisible: !!cell.isInvisible(),
		strikethrough: !!cell.isStrikethrough(),
		overline: !!cell.isOverline()
	};
}

function snapshotTerminal(terminal: Terminal) {
	const buffer = terminal.buffer.active;
	const core = (terminal as Terminal & { _core: IXtermCore })._core;
	return {
		modes: terminal.modes,
		bufferType: buffer.type,
		cursorX: buffer.cursorX,
		cursorY: buffer.cursorY,
		baseY: buffer.baseY,
		hidden: core.coreService.isCursorHidden,
		attributes: attributes(core._inputHandler._curAttrData),
		lines: Array.from({ length: buffer.length }, (_, y) => {
			const line = buffer.getLine(y)!;
			return {
				wrapped: line.isWrapped,
				cells: Array.from({ length: line.length }, (_, x) => {
					const cell = line.getCell(x)!;
					return {
						// NUL and literal single-width blanks render identically; retain every attribute.
						chars: cell.getWidth() === 1 ? cell.getChars() || ' ' : cell.getChars(),
						width: cell.getWidth(),
						...attributes(cell)
					};
				})
			};
		})
	};
}

suite('Workbench - Terminal Typeahead', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	suite('PredictionStats', () => {
		let stats: PredictionStats;
		let add: Emitter<IPrediction>;
		let succeed: Emitter<IPrediction>;
		let fail: Emitter<IPrediction>;

		setup(() => {
			add = ds.add(new Emitter<IPrediction>());
			succeed = ds.add(new Emitter<IPrediction>());
			fail = ds.add(new Emitter<IPrediction>());

			// eslint-disable-next-line local/code-no-any-casts
			stats = ds.add(new PredictionStats({
				onPredictionAdded: add.event,
				onPredictionSucceeded: succeed.event,
				onPredictionFailed: fail.event,
			} as any));
		});

		test('creates sane data', () => {
			const stubs = createPredictionStubs(5);
			const clock = useFakeTimers();
			ds.add(toDisposable(() => clock.restore()));
			for (const s of stubs) { add.fire(s); }

			for (let i = 0; i < stubs.length; i++) {
				clock.tick(100);
				(i % 2 ? fail : succeed).fire(stubs[i]);
			}

			assert.strictEqual(stats.accuracy, 3 / 5);
			assert.strictEqual(stats.sampleSize, 5);
			assert.deepStrictEqual(stats.latency, {
				count: 3,
				min: 100,
				max: 500,
				median: 300
			});
		});

		test('sorts latencies numerically', () => {
			const stubs = createPredictionStubs(3);
			const clock = useFakeTimers();
			ds.add(toDisposable(() => clock.restore()));
			for (const s of stubs) { add.fire(s); }

			clock.tick(5);
			succeed.fire(stubs[0]);
			clock.tick(45);
			succeed.fire(stubs[1]);
			clock.tick(150);
			succeed.fire(stubs[2]);

			assert.deepStrictEqual(stats.latency, {
				count: 3,
				min: 5,
				max: 200,
				median: 50
			});
		});

		test('circular buffer', () => {
			const bufferSize = 24;
			const stubs = createPredictionStubs(bufferSize * 2);

			for (const s of stubs.slice(0, bufferSize)) { add.fire(s); succeed.fire(s); }
			assert.strictEqual(stats.accuracy, 1);

			for (const s of stubs.slice(bufferSize, bufferSize * 3 / 2)) { add.fire(s); fail.fire(s); }
			assert.strictEqual(stats.accuracy, 0.5);

			for (const s of stubs.slice(bufferSize * 3 / 2)) { add.fire(s); fail.fire(s); }
			assert.strictEqual(stats.accuracy, 0);
		});
	});

	suite('timeline', () => {
		let onBeforeProcessData: Emitter<IBeforeProcessDataEvent>;
		let publicLog: SinonStub;
		let config: ITerminalTypeAheadConfiguration;
		let addon: TestTypeAheadAddon;

		const predictedHelloo = [
			`${CSI}?25l`, // hide cursor
			`${CSI}2;7H`, // move cursor
			'o', // new character
			`${CSI}2;8H`, // place cursor back at end of line
			`${CSI}?25h`, // show cursor
		].join('');

		const expectProcessed = (input: string, output: string) => {
			const evt = { data: input };
			onBeforeProcessData.fire(evt);
			assert.strictEqual(JSON.stringify(evt.data), JSON.stringify(output));
		};

		setup(() => {
			onBeforeProcessData = ds.add(new Emitter<IBeforeProcessDataEvent>());
			config = upcastPartial<ITerminalTypeAheadConfiguration>({
				localEchoStyle: 'italic',
				localEchoLatencyThreshold: 0,
				localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE,
			});
			publicLog = stub();
			addon = new TestTypeAheadAddon(
				upcastPartial<ITerminalProcessManager>({ onBeforeProcessData: onBeforeProcessData.event }),
				new TestConfigurationService({ terminal: { integrated: { ...config } } }),
				upcastPartial<ITelemetryService>({ publicLog })
			);
			addon.unlockMakingPredictions();
		});

		teardown(() => {
			addon.dispose();
		});

		test('predicts a single character', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');
			t.expectWritten(`${CSI}3mo${CSI}23m`);
		});

		test('validates character prediction', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');
			expectProcessed('o', predictedHelloo);
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('predicts tilde and subsequent characters', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('~/x');
			t.expectWritten(`${CSI}3m~${CSI}23m${CSI}3m/${CSI}23m${CSI}3mx${CSI}23m`);
			onBeforeProcessData.fire({ data: '~/x' });
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('clears multi-character predictions without a server response', () => {
			const clock = useFakeTimers();
			ds.add(toDisposable(() => clock.restore()));
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('ab');
			t.clearWritten();
			clock.tick(500);
			t.expectWritten(`${CSI}2;8H${CSI}0m${CSI}X${CSI}2;7H${CSI}0m${CSI}X${CSI}0m`);
		});

		test('does not run scheduled work after disposal', () => {
			const clock = useFakeTimers();
			ds.add(toDisposable(() => clock.restore()));
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('a');
			onBeforeProcessData.fire({ data: 'a' });
			addon.dispose();
			t.clearWritten();
			clock.runAll();
			assert.deepStrictEqual({ writes: t.written, telemetryCalls: publicLog.callCount }, { writes: [], telemetryCalls: 0 });
		});

		test('keeps predictions on within the latency hysteresis band', () => {
			addon.dispose();
			addon = new TestTypeAheadAddon(
				upcastPartial<ITerminalProcessManager>({ onBeforeProcessData: onBeforeProcessData.event }),
				new TestConfigurationService({ terminal: { integrated: { ...config, localEchoLatencyThreshold: 30 } } }),
				upcastPartial<ITelemetryService>({ publicLog })
			);
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			const stubs = [
				stub(addon.stats!, 'sampleSize').get(() => 6),
				stub(addon.stats!, 'accuracy').get(() => 1),
				stub(addon.stats!, 'latency').get(() => ({ count: 6, min: 40, median: 40, max: 40 }))
			];
			ds.add(toDisposable(() => stubs.forEach(s => s.restore())));
			addon.reevaluateNow();
			stubs[2].get(() => ({ count: 6, min: 20, median: 20, max: 20 }));
			addon.reevaluateNow();
			const withinBand = addon.isShowing;
			stubs[2].get(() => ({ count: 6, min: 10, median: 10, max: 10 }));
			addon.reevaluateNow();
			assert.deepStrictEqual([withinBand, addon.isShowing], [true, false]);
		});

		test('validates zsh prediction (#112842)', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');
			expectProcessed('o', predictedHelloo);

			t.onData('x');
			expectProcessed('\box', [
				`${CSI}?25l`, // hide cursor
				`${CSI}2;8H`, // move cursor
				'\box', // new data
				`${CSI}2;9H`, // place cursor back at end of line
				`${CSI}?25h`, // show cursor
			].join(''));
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('does not validate zsh prediction on differing lookbehindn (#112842)', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');
			expectProcessed('o', predictedHelloo);

			t.onData('x');
			expectProcessed('\bqx', [
				`${CSI}?25l`, // hide cursor
				`${CSI}2;8H`, // move cursor cursor
				`${CSI}0m`, // restore the empty cell's attributes
				`${CSI}X`, // delete character
				`${CSI}0m`, // reset style
				'\bqx', // new data
				`${CSI}?25h`, // show cursor
			].join(''));
			assert.strictEqual(addon.stats?.accuracy, 0.5);
		});

		test('rolls back character prediction', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');

			expectProcessed('q', [
				`${CSI}?25l`, // hide cursor
				`${CSI}2;7H`, // move cursor cursor
				`${CSI}0m`, // restore the empty cell's attributes
				`${CSI}X`, // delete character
				`${CSI}0m`, // reset style
				'q', // new character
				`${CSI}?25h`, // show cursor
			].join(''));
			assert.strictEqual(addon.stats?.accuracy, 0);
		});

		test('handles left arrow when we hit the boundary', () => {
			const t = ds.add(createMockTerminal({ lines: ['|'] }));
			addon.activate(t.terminal);
			addon.unlockNavigating();

			const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x!;
			t.onData(`${CSI}${CursorMoveDirection.Back}`);
			t.expectWritten('');

			// Trigger rollback because we don't expect this data
			onBeforeProcessData.fire({ data: 'xy' });

			assert.strictEqual(
				addon.physicalCursor(t.terminal.buffer.active)?.x,
				// The cursor should not have changed because we've hit the
				// boundary (start of prompt)
				cursorXBefore);
		});

		test('handles right arrow when we hit the boundary', () => {
			const t = ds.add(createMockTerminal({ lines: ['|'] }));
			addon.activate(t.terminal);
			addon.unlockNavigating();

			const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x!;
			t.onData(`${CSI}${CursorMoveDirection.Forwards}`);
			t.expectWritten('');

			// Trigger rollback because we don't expect this data
			onBeforeProcessData.fire({ data: 'xy' });

			assert.strictEqual(
				addon.physicalCursor(t.terminal.buffer.active)?.x,
				// The cursor should not have changed because we've hit the
				// boundary (end of prompt)
				cursorXBefore);
		});

		test('internal cursor state is reset when all predictions are undone', () => {
			const t = ds.add(createMockTerminal({ lines: ['|'] }));
			addon.activate(t.terminal);
			addon.unlockNavigating();

			const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x!;
			t.onData(`${CSI}${CursorMoveDirection.Back}`);
			t.expectWritten('');
			addon.undoAllPredictions();

			assert.strictEqual(
				addon.physicalCursor(t.terminal.buffer.active)?.x,
				// The cursor should not have changed because we've hit the
				// boundary (start of prompt)
				cursorXBefore);
		});

		test('restores cursor graphics mode', () => {
			const t = ds.add(createMockTerminal({
				lines: ['hello|'],
				cursorAttrs: { isAttributeDefault: false, isBold: true, isFgPalette: true, getFgColor: 1 },
			}));
			addon.activate(t.terminal);
			t.onData('o');

			expectProcessed('q', [
				`${CSI}?25l`, // hide cursor
				`${CSI}2;7H`, // move cursor cursor
				`${CSI}0m`, // restore the empty cell's attributes
				`${CSI}X`, // delete character
				`${CSI}0;1;38;5;1m`, // reset style
				'q', // new character
				`${CSI}?25h`, // show cursor
			].join(''));
			assert.strictEqual(addon.stats?.accuracy, 0);
		});

		test('validates against and applies graphics mode on predicted', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');
			expectProcessed(`${CSI}4mo`, [
				`${CSI}?25l`, // hide cursor
				`${CSI}2;7H`, // move cursor
				`${CSI}4m`, // new PTY's style
				'o', // new character
				`${CSI}2;8H`, // place cursor back at end of line
				`${CSI}?25h`, // show cursor
			].join(''));
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('ignores cursor hides or shows', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('o');
			expectProcessed(`${CSI}?25lo${CSI}?25h`, [
				`${CSI}?25l`, // hide cursor from PTY
				`${CSI}?25l`, // hide cursor
				`${CSI}2;7H`, // move cursor
				'o', // new character
				`${CSI}?25h`, // show cursor from PTY
				`${CSI}2;8H`, // place cursor back at end of line
				`${CSI}?25h`, // show cursor
			].join(''));
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('matches backspace at EOL (bash style)', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('\x7F');
			expectProcessed(`\b${CSI}K`, `\b${CSI}K`);
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('matches backspace at EOL (zsh style)', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('\x7F');
			expectProcessed('\b \b', '\b \b');
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('gradually matches backspace', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);
			t.onData('\x7F');
			expectProcessed('\b', '');
			expectProcessed(' \b', '\b \b');
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		test('restores old character after invalid backspace', () => {
			const t = ds.add(createMockTerminal({ lines: ['hel|lo'] }));
			addon.activate(t.terminal);
			addon.unlockNavigating();
			t.onData('\x7F');
			t.expectWritten(`${CSI}2;4H${CSI}X`);
			expectProcessed('x', `${CSI}?25l${CSI}2;4H${CSI}0ml${CSI}2;5H${CSI}0mx${CSI}?25h`);
			assert.strictEqual(addon.stats?.accuracy, 0);
		});

		test('waits for validation before deleting to left of cursor', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);

			// initially should not backspace (until the server confirms it)
			t.onData('\x7F');
			t.expectWritten('');
			expectProcessed('\b \b', '\b \b');
			t.cursor.x--;

			// enter input on the column...
			t.onData('o');
			onBeforeProcessData.fire({ data: 'o' });
			t.cursor.x++;
			t.clearWritten();

			// now that the column is 'unlocked', we should be able to predict backspace on it
			t.onData('\x7F');
			t.expectWritten(`${CSI}2;6H${CSI}X`);
		});

		test('waits for first valid prediction on a line', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.lockMakingPredictions();
			addon.activate(t.terminal);

			t.onData('o');
			t.expectWritten('');
			expectProcessed('o', 'o');

			t.onData('o');
			t.expectWritten(`${CSI}3mo${CSI}23m`);
		});

		test('disables on title change', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.activate(t.terminal);

			addon.reevaluateNow();
			assert.strictEqual(addon.isShowing, true, 'expected to show initially');

			t.onTitleChange.fire('foo - VIM.exe');
			addon.reevaluateNow();
			assert.strictEqual(addon.isShowing, false, 'expected to hide when vim is open');

			t.onTitleChange.fire('foo - git.exe');
			addon.reevaluateNow();
			assert.strictEqual(addon.isShowing, true, 'expected to show again after vim closed');
		});

		test('adds line wrap prediction even if behind a boundary', () => {
			const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
			addon.lockMakingPredictions();
			addon.activate(t.terminal);

			t.onData('hi'.repeat(50));
			t.expectWritten('');
			expectProcessed('hi', [
				`${CSI}?25l`, // hide cursor
				'hi', // this greeting characters
				...new Array(36).fill(`${CSI}3mh${CSI}23m${CSI}3mi${CSI}23m`), // rest of the greetings that fit on this line
				`${CSI}0m`,
				`${CSI}?25h`
			].join(''));
		});
	});

	suite('xterm reconciliation', () => {
		let terminal: Terminal;
		let addon: TestTypeAheadAddon;
		let onBeforeProcessData: Emitter<IBeforeProcessDataEvent>;
		let configurationService: TestConfigurationService;
		let config: ITerminalTypeAheadConfiguration;

		const input = async (data: string, wasUserInput = true) => {
			terminal.input(data, wasUserInput);
			await writeP(terminal, '');
		};
		const queueServer = (data: string) => {
			const event = { data };
			onBeforeProcessData.fire(event);
			terminal.write(event.data);
			return event.data;
		};
		const server = async (data: string) => {
			const processed = queueServer(data);
			await writeP(terminal, '');
			return processed;
		};
		const state = () => ({
			lines: Array.from({ length: terminal.rows }, (_, y) => terminal.buffer.active.getLine(terminal.buffer.active.baseY + y)?.translateToString(true)),
			cursorX: terminal.buffer.active.cursorX,
			cursorY: terminal.buffer.active.cursorY,
			baseY: terminal.buffer.active.baseY
		});
		const configureStyle = (style: string) => {
			config.localEchoStyle = style;
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		};

		setup(async () => {
			const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			terminal = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 20, rows: 3 }));
			onBeforeProcessData = ds.add(new Emitter<IBeforeProcessDataEvent>());
			config = upcastPartial<ITerminalTypeAheadConfiguration>({
				localEchoStyle: '#ff0000',
				localEchoLatencyThreshold: 0,
				localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE
			});
			configurationService = new TestConfigurationService({ terminal: { integrated: config } });
			addon = ds.add(new TestTypeAheadAddon(
				upcastPartial<ITerminalProcessManager>({ onBeforeProcessData: onBeforeProcessData.event }),
				configurationService,
				upcastPartial<ITelemetryService>({ publicLog: () => { } })
			));
			await writeP(terminal, '$ ');
			addon.activate(terminal);
			await input('a');
			await server('a');
		});

		test('matches cursor movement after characters in a single echo', async () => {
			await input(`bc${CSI}D`);
			await server(`bc${CSI}D`);
			assert.deepStrictEqual({ ...state(), accuracy: addon.stats?.accuracy }, {
				lines: ['$ abc', '', ''], cursorX: 4, cursorY: 0, baseY: 0, accuracy: 1
			});
		});

		test('positions output after a coalesced character and newline echo', async () => {
			await input('b\r');
			await server('b\r\nout\r\n$ ');
			assert.deepStrictEqual(state(), {
				lines: ['$ ab', 'out', '$ '], cursorX: 2, cursorY: 2, baseY: 0
			});
		});

		test('positions output after a coalesced character and left-arrow echo', async () => {
			await input(`b${CSI}D`);
			await server(`b${CSI}DX`);
			assert.deepStrictEqual(state(), {
				lines: ['$ aX', '', ''], cursorX: 4, cursorY: 0, baseY: 0
			});
		});

		test('positions output after a coalesced character and right-arrow echo', async () => {
			await input('bc');
			await server('bc');
			await input(`${CSI}2D`);
			await server(`${CSI}2D`);
			await input(`x${CSI}C`);
			await server(`x${CSI}CY`);
			assert.deepStrictEqual(state(), {
				lines: ['$ axcY', '', ''], cursorX: 6, cursorY: 0, baseY: 0
			});
		});

		test('positions output after coalesced right-arrow and backspace echoes', async () => {
			await input('bc');
			await server('bc');
			await input(`${CSI}D`);
			await server('\b');
			await input(`${CSI}C\x7f`);
			await server(`${CSI}C\b \bx`);
			assert.deepStrictEqual(state(), {
				lines: ['$ abx', '', ''], cursorX: 5, cursorY: 0, baseY: 0
			});
		});

		for (const echo of ['\b \b', `\b${CSI}K`]) {
			test(`preserves pending characters after backspace confirmation ${JSON.stringify(echo)}`, async () => {
				await input('bc');
				await server('bc');
				await input('\x7fd', false);
				const predicted = state();
				await server(echo);
				const confirmedBackspace = state();
				await server('d');
				const expected = { lines: ['$ abd', '', ''], cursorX: 5, cursorY: 0, baseY: 0 };
				assert.deepStrictEqual([predicted, confirmedBackspace, state()], [expected, expected, expected]);
			});
		}

		for (const { initial, confirmed, attributes } of [
			{ initial: '0', confirmed: '32', attributes: [2, false, false] },
			{ initial: '0', confirmed: '4', attributes: [-1, true, false] },
			{ initial: '1', confirmed: '0', attributes: [-1, false, false] }
		]) {
			test(`restores confirmed ${confirmed} attributes when rejecting a queued backspace`, async () => {
				await server(`${CSI}${initial}m`);
				await input(`bc${CSI}D\x7f`, false);
				await server(`${CSI}${confirmed}mb${CSI}${confirmed}mc\b`);
				const pending = state();
				await server('\x07');
				const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
				assert.deepStrictEqual([pending, state(), [cell.getFgColor(), !!cell.isUnderline(), !!cell.isBold()]], [
					{ lines: ['$ a c', '', ''], cursorX: 3, cursorY: 0, baseY: 0 },
					{ lines: ['$ abc', '', ''], cursorX: 4, cursorY: 0, baseY: 0 },
					attributes
				]);
			});
		}

		test('preserves a replacement prediction over a confirmed backspaced character', async () => {
			await input(`bc${CSI}D\x7fd`, false);
			await server(`${CSI}32mb`);
			const predicted = state();
			await server('c\b');
			const confirmedMove = state();
			await server('\b \b');
			const confirmedBackspace = state();
			await server('d');
			const expected = { lines: ['$ adc', '', ''], cursorX: 4, cursorY: 0, baseY: 0 };
			assert.deepStrictEqual([predicted, confirmedMove, confirmedBackspace, state()], [expected, expected, expected, expected]);
		});

		test('restores a rejected mid-line backspace at its saved position', async () => {
			await input('b');
			await server('b');
			await input(`c${CSI}D\x7f`);
			await server(`c${CSI}D\bc \b\b`);
			assert.deepStrictEqual(state(), {
				lines: ['$ ac ', '', ''], cursorX: 3, cursorY: 0, baseY: 0
			});
		});

		test('does not erase the next cell when restoring an empty backspaced cell', async () => {
			await server(`${CSI}1;5HZ${CSI}1;5H`);
			await input('\x7f');
			addon.undoAllPredictions();
			await writeP(terminal, '');
			assert.deepStrictEqual(state(), {
				lines: ['$ a Z', '', ''], cursorX: 4, cursorY: 0, baseY: 0
			});
		});

		test('does not interpret Alt+Shift+D as a left arrow', async () => {
			await input('\x1bD');
			assert.deepStrictEqual(state(), { lines: ['$ a', '', ''], cursorX: 3, cursorY: 0, baseY: 0 });
		});

		for (const [save, restore] of [['\x1b7', '\x1b8'], [`${CSI}?1049h`, `${CSI}?1049l`]]) {
			test(`restores the authoritative pen after ${JSON.stringify(restore)}`, async () => {
				await server(`${CSI}31m${save}${CSI}0m`);
				await input('b');
				await server('b');
				await server(restore);
				await input('c');
				await server('c');
				const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
				assert.deepStrictEqual([cell.getChars(), cell.getFgColor()], ['c', 1]);
			});
		}

		for (const { mode, position } of [{ mode: '4h', position: '' }, { mode: '?7l', position: `${CSI}20G` }]) {
			test(`does not predict while mode ${mode} is active`, async () => {
				await server(position + CSI + mode);
				const before = state();
				await input('b');
				assert.deepStrictEqual(state(), before);
			});
		}

		test('rolls back displayed predictions on disposal', async () => {
			await input('b');
			addon.dispose();
			await server('b');
			assert.deepStrictEqual(state(), { lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0 });
		});

		test('does not predict newlines that would scroll', async () => {
			await server(`${CSI}2;1H`);
			await input('\r\r', false);
			const predicted = state();
			addon.undoAllPredictions();
			await writeP(terminal, '');
			assert.deepStrictEqual([predicted, state()], [
				{ lines: ['$ a', '', ''], cursorX: 0, cursorY: 2, baseY: 0 },
				{ lines: ['$ a', '', ''], cursorX: 0, cursorY: 1, baseY: 0 }
			]);
		});

		test('restores truecolor foreground and background on rollback', async () => {
			await server(`${CSI}38;2;18;52;86;48;2;101;67;33m`);
			await input('b');
			await server('c');
			const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
			assert.deepStrictEqual([cell.getChars(), cell.getFgColor(), cell.getBgColor()], ['c', 0x123456, 0x654321]);
		});

		for (const nextInput of ['', 'd']) {
			test(`preserves authoritative pen attributes across queued reconciliation with input ${JSON.stringify(nextInput)}`, async () => {
				await input('bc');
				queueServer(`${CSI}31mb`);
				if (nextInput) {
					terminal.input(nextInput, false);
				}
				queueServer(nextInput ? 'cd' : 'x');
				await writeP(terminal, '');
				const expected = nextInput ? 'bcd' : 'bx';
				const cells = Array.from(expected, (_, x) => terminal.buffer.active.getLine(0)!.getCell(x + 3)!);
				const pen = (terminal as Terminal & { _core: IXtermCore })._core._inputHandler._curAttrData;
				assert.deepStrictEqual([cells.map(cell => [cell.getChars(), cell.getFgColor()]), pen.getFgColor()], [Array.from(expected, char => [char, 1]), 1]);
			});
		}

		test('waits for queued server output before establishing a new prediction cursor', async () => {
			addon.reset();
			await input('bc', false);
			queueServer('bx');
			terminal.input('d', false);
			await server('d');
			assert.deepStrictEqual(state(), { lines: ['$ abxd', '', ''], cursorX: 6, cursorY: 0, baseY: 0 });
		});

		test('waits for the echo of a key typed while output is unparsed', async () => {
			await input('b');
			queueServer('b');
			terminal.input('c');
			await writeP(terminal, '');
			await input('d');
			const beforeEcho = state();
			await server('c');
			await server('d');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0 },
				{ lines: ['$ abcd', '', ''], cursorX: 6, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('resynchronizes after multiple keys are typed while output is unparsed', async () => {
			await input('b');
			queueServer('b');
			terminal.input('c');
			terminal.input('d');
			await writeP(terminal, '');
			await server('c');
			await input('e');
			const beforeRemainingEchoes = state();
			await server('d');
			await server('e');
			await input('f');
			const beforeResynchronizingEcho = state();
			await server('f');
			await input('g');
			const afterResynchronizing = state();
			await server('g');
			assert.deepStrictEqual([beforeRemainingEchoes, beforeResynchronizingEcho, afterResynchronizing, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 },
				{ lines: ['$ abcde', '', ''], cursorX: 7, cursorY: 0, baseY: 0 },
				{ lines: ['$ abcdefg', '', ''], cursorX: 9, cursorY: 0, baseY: 0 },
				{ lines: ['$ abcdefg', '', ''], cursorX: 9, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('waits for each echo of a repeated key typed while output is unparsed', async () => {
			await input('b');
			queueServer('b');
			terminal.input('u');
			terminal.input('l');
			await writeP(terminal, '');
			await server('u');
			await input('l');
			const beforeFirstL = state();
			await server('l');
			await input('x');
			const beforeSecondL = state();
			await server('l');
			await server('x');
			assert.deepStrictEqual([beforeFirstL, beforeSecondL, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ abu', '', ''], cursorX: 5, cursorY: 0, baseY: 0 },
				{ lines: ['$ abul', '', ''], cursorX: 6, cursorY: 0, baseY: 0 },
				{ lines: ['$ abullx', '', ''], cursorX: 8, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('waits for the echo of a key typed while a reconciled echo is unparsed', async () => {
			await input('bc');
			queueServer('b');
			terminal.input('d');
			await writeP(terminal, '');
			await input('e');
			const beforeEcho = state();
			await server('c');
			await server('d');
			await server('e');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 },
				{ lines: ['$ abcde', '', ''], cursorX: 7, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('waits for the echo of a key typed while a partial echo is buffered', async () => {
			await input('\x7f');
			await server('\b');
			await input('x');
			await server(`${CSI}K`);
			await input('y');
			const beforeEcho = state();
			await server('x');
			await server('y');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ ', '', ''], cursorX: 2, cursorY: 0, baseY: 0 },
				{ lines: ['$ xy', '', ''], cursorX: 4, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('waits for the echo of a key typed while an escape sequence is incomplete', async () => {
			await input('b');
			await server('b');
			await server(`${CSI}0`);
			await input('c');
			await server('m');
			await input('d');
			const beforeEcho = state();
			await server('c');
			await server('d');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0 },
				{ lines: ['$ abcd', '', ''], cursorX: 6, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		// Shift+F3 is encoded like a cursor position report; here the shell binds it to moving left.
		for (const { name, key } of [{ name: 'a cursor key', key: `${CSI}D` }, { name: 'Shift+F3', key: `${CSI}1;2R` }]) {
			test(`waits for the echo of ${name} typed while output is unparsed`, async () => {
				await input('b');
				queueServer('b');
				terminal.input(key);
				await writeP(terminal, '');
				await input('X');
				const beforeEcho = state();
				await server('\b');
				await server('Xb\b');
				assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
					{ lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0 },
					{ lines: ['$ aXb', '', ''], cursorX: 4, cursorY: 0, baseY: 0, accuracy: 1 }
				]);
			});
		}

		test('waits for the echo of a paste while output is unparsed', async () => {
			await input('b');
			queueServer('b');
			terminal.input(`${CSI}200~xyz${CSI}201~`);
			await writeP(terminal, '');
			await input('W');
			const beforeEcho = state();
			await server('xyz');
			await server('W');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0 },
				{ lines: ['$ abxyzW', '', ''], cursorX: 8, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('does not wait for a terminal reply sent while output is unparsed', async () => {
			await server(`${CSI}6n`);
			await input('b');
			const beforeEcho = state();
			await server('b');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0 },
				{ lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('does not wait for a clipboard reply sent while output is unparsed', async () => {
			await input('b');
			queueServer('b');
			// The clipboard addon answers OSC 52 queries this way.
			terminal.input('\x1b]52;c;eA==\x07', false);
			await writeP(terminal, '');
			await input('c');
			const beforeEcho = state();
			await server('c');
			assert.deepStrictEqual([beforeEcho, { ...state(), accuracy: addon.stats?.accuracy }], [
				{ lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 },
				{ lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0, accuracy: 1 }
			]);
		});

		test('does not navigate on the previous row after a queued prompt', async () => {
			await input('\rb', false);
			queueServer('\r\n$ b');
			terminal.input(`${CSI}Dc`, false);
			await server(`${CSI}Dcb${CSI}D`);
			assert.deepStrictEqual(state(), { lines: ['$ a', '$ cb', ''], cursorX: 3, cursorY: 1, baseY: 0 });
		});

		for (const data of ['b', '\x7f']) {
			test(`restores blank-cell background after rejecting ${JSON.stringify(data)}`, async () => {
				if (data === '\x7f') {
					await server(`${CSI}C`);
				}
				await server(`${CSI}48;5;42m`);
				await input(data, false);
				await server('\x07');
				const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
				const pen = (terminal as Terminal & { _core: IXtermCore })._core._inputHandler._curAttrData;
				assert.deepStrictEqual([cell.getChars(), cell.getBgColor(), pen.getBgColor()], ['', -1, 42]);
			});
		}

		for (const foreground of ['31', '38;2;18;52;86']) {
			test(`preserves inherited underline color after restoring ${foreground}`, async () => {
				await server(`${CSI}${foreground}m`);
				await input('b');
				await server('\x07');
				await server(`${CSI}4;32mx`);
				const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
				assert.deepStrictEqual([cell.getChars(), cell.getFgColor(), cell.getUnderlineColor()], ['x', 2, 2]);
			});
		}

		test('preserves explicit underline color when restoring pen attributes', async () => {
			await server(`${CSI}31;4:3;58;2;18;52;86m`);
			await input('b');
			await server('\x07');
			await server(`${CSI}32mx`);
			const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
			assert.deepStrictEqual([cell.getChars(), cell.getFgColor(), cell.getUnderlineColor(), cell.getUnderlineStyle()], ['x', 2, 0x123456, 3]);
		});

		test('preserves the styled space from a confirmed backspace echo', async () => {
			await server(`${CSI}4m`);
			await input('b');
			await server('b');
			await input('\x7f');
			await server('\b \b');
			const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
			assert.deepStrictEqual([cell.getChars(), !!cell.isUnderline()], [' ', true]);
		});

		test('restores a confirmed styled space when a replacement prediction fails', async () => {
			await server(`${CSI}4m`);
			await input('bc');
			await server('bc');
			await input('\x7fd', false);
			await server('\b \b');
			await server('\x07');
			const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
			assert.deepStrictEqual([cell.getChars(), !!cell.isUnderline()], [' ', true]);
		});

		for (const { sequence, color } of [
			{ sequence: '38;2;18;52;86', color: 0x123456 },
			{ sequence: '38:2::18:52:86', color: 0x123456 },
			{ sequence: '38;5;1', color: 1 },
			{ sequence: '38:5:1', color: 1 }
		]) {
			test(`restores color ${sequence} after prediction styling`, async () => {
				await server(`${CSI}${sequence}m`);
				await input('b');
				await server('b');
				await server('x');
				const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
				const restoredColor = cell.getFgColor();
				await server(`${CSI}38;2;255;0;0m`);
				await input('c');
				await server('c');
				await server('y');
				const nextCell = terminal.buffer.active.getLine(0)!.getCell(6)!;
				assert.deepStrictEqual([restoredColor, nextCell.getChars(), nextCell.getFgColor()], [color, 'y', 0xff0000]);
			});
		}

		test('does not interpret palette colors as font attributes', async () => {
			configureStyle('dim');
			await server(`${CSI}38;5;1m`);
			await input('b');
			await server('b');
			await server('x');
			const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
			assert.deepStrictEqual([cell.getChars(), !!cell.isBold(), !!cell.isDim()], ['x', false, false]);
		});

		test('preserves pen attributes when rolling back over styled text', async () => {
			await server(`${CSI}31;1mb${CSI}0m\b`);
			await input('c');
			addon.undoAllPredictions();
			await server('x');
			const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
			assert.deepStrictEqual([cell.getChars(), cell.isFgDefault(), !!cell.isBold()], ['x', true, false]);
		});

		for (const { style, sequence, attributes } of [
			{ style: '#ff0000', sequence: '31', attributes: [false, 1, false, 0] },
			{ style: 'bold', sequence: '1', attributes: [true, undefined, true, 0] },
			{ style: 'underlined', sequence: '4:3', attributes: [true, undefined, false, 3] }
		]) {
			test(`preserves ${sequence} attributes when promoting ${style} predictions`, async () => {
				configureStyle(style);
				addon.reset();
				await input('bc');
				await server(`${CSI}${sequence}mb`);
				await server('c');
				const cells = [3, 4].map(x => terminal.buffer.active.getLine(0)!.getCell(x)!);
				assert.deepStrictEqual(cells.map(cell => [
					cell.isFgDefault(), cell.isFgPalette() ? cell.getFgColor() : undefined, !!cell.isBold(), cell.getUnderlineStyle()
				]), [attributes, attributes]);
			});
		}

		test('tracks real prediction-colored SGR after a styled generation promotion', async () => {
			addon.reset();
			await input('bc');
			await server(`${CSI}31mb`);
			await server('c');
			await server(`${CSI}38;2;255;0;0m`);
			await input('d');
			await server('d');
			await server('x');
			const cell = terminal.buffer.active.getLine(0)!.getCell(6)!;
			assert.deepStrictEqual([cell.getChars(), cell.getFgColor()], ['x', 0xff0000]);
		});

		test('does not copy cell attributes to the pen when rolling back cursor movement', async () => {
			await server(`${CSI}31;1mbc${CSI}0m\b`);
			await input(`${CSI}D`);
			await server('x');
			const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
			assert.deepStrictEqual([cell.getChars(), cell.isFgDefault(), !!cell.isBold()], ['x', true, false]);
		});

		test('restores extended pen attributes after a failed prediction', async () => {
			await server(`${CSI}9;53;4:3;58:2::18:52:86m`);
			await input('b');
			await server('c');
			const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
			assert.deepStrictEqual([
				cell.getChars(), !!cell.isStrikethrough(), !!cell.isOverline(), cell.getUnderlineStyle(), cell.getUnderlineColor()
			], ['c', true, true, 3, 0x123456]);
		});

		for (const sequence of ['1', '31;1', '4:3;1']) {
			test(`preserves matched styling ${sequence} when rolling back`, async () => {
				await input('bc');
				await server(`${CSI}${sequence}mbx`);
				const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
				assert.deepStrictEqual([cell.getChars(), !!cell.isBold()], ['x', true]);
			});
		}

		for (const enter of ['', '\r']) {
			test(`validates a new prompt after saturated scrollback with input ${JSON.stringify(enter)}`, async () => {
				terminal.options.scrollback = 3;
				await server('\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n$ ');
				await input('x');
				await server('x');
				if (enter) {
					await input(enter);
				}
				await server('\r\nPassword: ');
				await input('s\x7f\x7f');
				assert.deepStrictEqual(state(), {
					lines: ['6', '$ x', 'Password: '], cursorX: 10, cursorY: 2, baseY: 3
				});
			});
		}

		for (const move of [`${CSI}1;5C`, '\x1bf']) {
			test(`ignores no-op word movement ${JSON.stringify(move)}`, async () => {
				await input('bc');
				await server('bc');
				await input(move);
				await input('d');
				await server('d');
				assert.deepStrictEqual({ ...state(), accuracy: addon.stats?.accuracy }, {
					lines: ['$ abcd', '', ''], cursorX: 6, cursorY: 0, baseY: 0, accuracy: 1
				});
			});
		}

		test('streams idle control strings without injecting predictions into their payload', async () => {
			const titles: string[] = [];
			ds.add(terminal.onTitleChange(title => titles.push(title)));
			const start = await server('\x1b]0;ti');
			await input('b');
			const middle = await server('t');
			const end = await server('le\x07');
			await server('b');
			assert.deepStrictEqual({ ...state(), titles, chunks: [start, middle, end] }, {
				lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0,
				titles: ['title'], chunks: ['\x1b]0;ti', 't', 'le\x07']
			});
		});

		test('releases buffered echoes when predictions are undone', async () => {
			await input('\x7f');
			await server('\b');
			addon.undoAllPredictions();
			await writeP(terminal, '');
			const cursorAfterUndo = terminal.buffer.active.cursorX;
			await server(' \b');
			assert.deepStrictEqual({ ...state(), cursorAfterUndo }, { lines: ['$  ', '', ''], cursorX: 2, cursorY: 0, baseY: 0, cursorAfterUndo: 2 });
		});

		test('preserves a hidden cursor while reconciling predictions', async () => {
			await input('b');
			await server(`b${CSI}?25l`);
			const xterm = terminal as Terminal & { _core: IXtermCore };
			assert.strictEqual(xterm._core.coreService.isCursorHidden, true);
		});

		test('releases buffered escape sequences when predictions are hidden', async () => {
			await input('b');
			await server(CSI);
			addon.showPredictions(false);
			await server('31mc');
			assert.deepStrictEqual(state(), { lines: ['$ ac', '', ''], cursorX: 4, cursorY: 0, baseY: 0 });
		});

		test('does not reapply a partial escape already written while hidden', async () => {
			addon.showPredictions(false);
			await input('b');
			await server(CSI);
			addon.showPredictions(true);
			await server('31mb');
			addon.showPredictions(true);
			assert.deepStrictEqual({ ...state(), showing: addon.isShowing }, {
				lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0, showing: true
			});
		});

		test('does not duplicate hidden input after the final prediction matches', async () => {
			addon.showPredictions(false);
			await input('b');
			const first = await server(`b${CSI}`);
			const second = await server('31mhello');
			addon.showPredictions(true);
			assert.deepStrictEqual([first, second, addon.isShowing], [`b${CSI}`, '31mhello', true]);
		});

		for (const omit of [`${CSI}?25l`, `${CSI}6n`]) {
			test(`keeps a backspace pending across ${JSON.stringify(omit)}`, async () => {
				await input('\x7f');
				await server(omit);
				await server('\b \b');
				assert.deepStrictEqual({ ...state(), accuracy: addon.stats?.accuracy }, {
					lines: ['$  ', '', ''], cursorX: 2, cursorY: 0, baseY: 0, accuracy: 1
				});
			});
		}

		test('matches characters with interleaved style and cursor visibility', async () => {
			await input('b');
			await server(`${CSI}31m${CSI}?25lb`);
			assert.strictEqual(addon.stats?.accuracy, 1);
		});

		for (const { start, end } of [
			{ start: '\x1b]0;ti', end: 'tle\x07' },
			{ start: '\x1b]0;title\x1b', end: '\\' },
			{ start: '\x1bP$q', end: 'x\x1b\\' }
		]) {
			test(`preserves fragmented control string ${JSON.stringify(start)}`, async () => {
				const titles: string[] = [];
				ds.add(terminal.onTitleChange(title => titles.push(title)));
				await input('b');
				await server('b' + start);
				await server(end);
				assert.deepStrictEqual({ ...state(), titles }, {
					lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0,
					titles: start.startsWith('\x1b]') ? ['title'] : []
				});
			});
		}

		test('keeps an incomplete control string intact when predictions are cancelled', async () => {
			const titles: string[] = [];
			ds.add(terminal.onTitleChange(title => titles.push(title)));
			await input('b');
			await server('b\x1b]0;ti');
			addon.undoAllPredictions();
			await input('c');
			await server('tle\x07c');
			assert.deepStrictEqual({ ...state(), titles }, {
				lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0, titles: ['title']
			});
		});

		test('does not restore an erased cell after queued backspace and insertion', async () => {
			await input('bc');
			await server('bc');
			await input('\x7fd', false);
			await server('\b \b');
			addon.undoAllPredictions();
			await writeP(terminal, '');
			assert.deepStrictEqual(state(), { lines: ['$ ab ', '', ''], cursorX: 4, cursorY: 0, baseY: 0 });
		});

		test('restores confirmed character styling after a promoted backspace fails', async () => {
			await input('b');
			await input('\x7f');
			await server('b');
			await server('x');
			const cell = terminal.buffer.active.getLine(0)!.getCell(3)!;
			assert.deepStrictEqual([cell.getChars(), cell.isFgDefault()], ['b', true]);
		});

		test('restores a newly validated tentative character after backspace rejection', async () => {
			addon.reset();
			await input('b');
			await input('\x7f');
			await server('b');
			await server('x');
			assert.deepStrictEqual(state(), { lines: ['$ abx', '', ''], cursorX: 5, cursorY: 0, baseY: 0 });
		});

		test('moves by a word across unflushed character predictions', async () => {
			terminal.input('bc', false);
			terminal.input('\x1bb', false);
			await writeP(terminal, '');
			assert.deepStrictEqual(state(), { lines: ['$ abc', '', ''], cursorX: 2, cursorY: 0, baseY: 0 });
		});

		test('uses tentative wrap coordinates when a later boundary matches', async () => {
			terminal.reset();
			addon.reset();
			await server('1'.repeat(19));
			await input('ab');
			await server('a \r');
			assert.deepStrictEqual(state(), {
				lines: ['1'.repeat(19) + 'a', 'b', ''], cursorX: 1, cursorY: 1, baseY: 0
			});
		});

		const fishScenarios = [
			{
				name: 'colored command and backspace',
				keys: [...'echo hi', '\x7f', 'x'],
				replies: [
					`e\r${CSI}3C\b${CSI}31me${CSI}39m\r${CSI}3C${CSI}90mcho ${CSI}39m\r${CSI}3C`,
					`${CSI}31mc${CSI}90mho ${CSI}39m\r${CSI}4C`,
					`${CSI}31mh${CSI}90mo ${CSI}39m\r${CSI}5C`,
					`${CSI}31mo${CSI}90m ${CSI}39m\r${CSI}6C${CSI}4D${CSI}32mecho${CSI}90m ${CSI}39m\r${CSI}6C`,
					`${CSI}32m ${CSI}39m\r${CSI}7C\b \r${CSI}7C`,
					`h\r${CSI}8C\bh\r${CSI}8C`, `i\r${CSI}9C`, `\b${CSI}K\r${CSI}8C`, `x\r${CSI}9C`
				]
			},
			{
				name: 'mid-line insertion and navigation',
				initial: `${CSI}32mecho${CSI}39m hi`,
				keys: [`${CSI}D`, `${CSI}D`, 'X', '\x7f', `${CSI}C`],
				replies: [`\r${CSI}8C`, `\r${CSI}7C`, `Xhi\r${CSI}8C\bXhi\r${CSI}8C`, `\bhi${CSI}K\r${CSI}7C`, `\r${CSI}8C`]
			},
			{
				name: 'typo corrected into a valid command',
				initial: `${CSI}31mec${CSI}90mho ${CSI}39m\r${CSI}4C`,
				keys: ['x', 'o', '\x7f', '\x7f', 'h', 'o'],
				replies: [
					`${CSI}31mx${CSI}39m${CSI}K\r${CSI}5C`, `${CSI}31mo${CSI}39m\r${CSI}6C`,
					`\b${CSI}K\r${CSI}5C`, `\b${CSI}K\r${CSI}4C`,
					`${CSI}31mh${CSI}39m\r${CSI}5C${CSI}90mo ${CSI}39m\r${CSI}5C`,
					`${CSI}31mo${CSI}90m ${CSI}39m\r${CSI}6C${CSI}4D${CSI}32mecho${CSI}90m ${CSI}39m\r${CSI}6C`
				]
			},
			{
				name: 'autosuggestion acceptance',
				initial: `${CSI}32mecho${CSI}90m ${CSI}39m\r${CSI}6C`,
				keys: [`${CSI}C`, '\x7f'],
				replies: [`${CSI}4Decho \r${CSI}7C${CSI}5D${CSI}32mecho${CSI}39m \r${CSI}7C`, `\b${CSI}K\r${CSI}6C`]
			}
		];
		for (const fragmented of [false, true]) {
			test(`keeps fish autosuggestions and recoloring from confirming later keystrokes, fragmented=${fragmented}`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 40, rows: 3 }));
				terminal.resize(40, 3);
				terminal.reset();
				addon.reset();
				addon.showPredictions(true);
				await server('$ ');
				await writeP(control, '$ ');
				await input('echo', false);
				const replies = fishScenarios[0].replies.slice(0, 4);
				for (const chunk of fragmented ? replies[0] : [replies[0]]) {
					await server(chunk);
				}
				assert.deepStrictEqual({ ...addon.pendingPredictionState, cursorX: terminal.buffer.active.cursorX }, { count: 3, hasIncompleteInput: false, cursorX: 6 });
				for (const reply of replies.slice(1)) {
					for (const chunk of fragmented ? reply : [reply]) {
						await server(chunk);
					}
				}
				await writeP(control, replies.join(''));
				assert.deepStrictEqual({ terminal: snapshotTerminal(terminal), accuracy: addon.stats?.accuracy, pending: addon.pendingPredictionState }, {
					terminal: snapshotTerminal(control), accuracy: 1, pending: { count: 0, hasIncompleteInput: false }
				});
			});
		}

		for (const ending of ['\x07', 'timeout']) {
			test(`restores a fish repaint underneath a rejected prediction on ${ending}`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 20, rows: 3 }));
				await writeP(control, '$ a');
				await input('bc', false);
				const repaint = `b\r${CSI}4C${CSI}90mz${CSI}32mq${CSI}39m\r${CSI}4C`;
				await server(repaint);
				await writeP(control, repaint);
				assert.deepStrictEqual(addon.pendingPredictionState, { count: 1, hasIncompleteInput: false });
				if (ending === 'timeout') {
					const partial = `${CSI}90mzz`;
					await server(partial);
					await writeP(control, partial);
					await timeout(510);
				} else {
					await server(ending);
					await writeP(control, ending);
				}
				await writeP(terminal, '');
				assert.deepStrictEqual(snapshotTerminal(terminal), snapshotTerminal(control));
			});
		}

		test('matches fish cursor resets in both directions', async () => {
			await input('bc');
			await server('bc');
			await input(`${CSI}D${CSI}C`);
			await server(`\r${CSI}4C\r${CSI}5C`);
			assert.deepStrictEqual({ ...state(), accuracy: addon.stats?.accuracy, pending: addon.pendingPredictionState }, {
				lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0, accuracy: 1, pending: { count: 0, hasIncompleteInput: false }
			});
		});

		for (const { keys, replies, line } of [
			{ keys: 'he', line: '$ git che', replies: [`${CSI}36;4mh${CSI}39;24m${CSI}K\r${CSI}8C${CSI}2D${CSI}36mch${CSI}39m\r${CSI}8C`, `${CSI}36me${CSI}39m\r${CSI}9C`] },
			{ keys: 'he', line: '$ git che', replies: [`${CSI}36;4mhe${CSI}39;24m${CSI}K\r${CSI}9C${CSI}3D${CSI}36mche${CSI}39m\r${CSI}9C`] },
			{ keys: '\x7fh', line: '$ git h', replies: [`\b${CSI}K\r${CSI}6C`, `h\r${CSI}7C\b${CSI}36mh${CSI}39m\r${CSI}7C`] }
		]) {
			test(`keeps pending predictions across a fish autosuggestion erase for ${JSON.stringify(keys)} in ${replies.length} replies`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 40, rows: 3 }));
				const both = async (data: string) => {
					await server(data);
					await writeP(control, data);
				};
				terminal.resize(40, 3);
				terminal.reset();
				addon.reset();
				addon.showPredictions(true);
				await both('$ git ');
				await input('c');
				await both(`c\r${CSI}7C\b${CSI}36;4mc${CSI}39;24m\r${CSI}7C${CSI}90mool-notes.txt ${CSI}39m\r${CSI}7C`);
				await input(keys, false);
				await both(replies[0]);
				const afterFirstReply = { line: state().lines[0], cursorX: state().cursorX, pending: addon.pendingPredictionState.count };
				for (const reply of replies.slice(1)) {
					await both(reply);
				}
				assert.deepStrictEqual({ afterFirstReply, terminal: snapshotTerminal(terminal), accuracy: addon.stats?.accuracy }, {
					afterFirstReply: { line, cursorX: line.length, pending: replies.length - 1 },
					terminal: snapshotTerminal(control),
					accuracy: 1
				});
			});
		}

		const psReadLineRender = (text: string, cursorColumn: number) =>
			`${CSI}6n${CSI}?25l${CSI}1;18H${CSI}0m${CSI}93m${text}${CSI}39;49m${CSI}0m${CSI}1;${cursorColumn}H${CSI}?12l${CSI}?25h`;
		for (const burst of [false, true]) {
			test(`matches PSReadLine full-line repaints, burst=${burst}`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 60, rows: 3 }));
				const both = async (data: string) => {
					await server(data);
					await writeP(control, data);
				};
				terminal.resize(60, 3);
				terminal.reset();
				addon.reset();
				addon.showPredictions(true);
				await both(`${CSI}?1h\x1b=PS /private/tmp> `);
				const keys = ['e', 'c', 'h', '\x7f', '\x1bOD', 'x'];
				const replies = [
					psReadLineRender('e', 19), psReadLineRender('ec', 20), psReadLineRender('ech', 21),
					psReadLineRender('ec ', 20), `${CSI}6n${CSI}1;19H`, psReadLineRender('exc', 20)
				];
				const pendingAfterFirstReply: number[] = [];
				if (burst) {
					await input(keys.slice(0, 3).join(''), false);
					for (const reply of replies.slice(0, 3)) {
						await both(reply);
						pendingAfterFirstReply.push(addon.pendingPredictionState.count!);
					}
					for (let i = 3; i < keys.length; i++) {
						await input(keys[i]);
						await both(replies[i]);
					}
				} else {
					for (let i = 0; i < keys.length; i++) {
						await input(keys[i]);
						await both(replies[i]);
						assert.deepStrictEqual(snapshotTerminal(terminal), snapshotTerminal(control), `key ${i}`);
					}
				}
				assert.deepStrictEqual({ terminal: snapshotTerminal(terminal), accuracy: addon.stats?.accuracy, pendingAfterFirstReply }, {
					terminal: snapshotTerminal(control), accuracy: 1, pendingAfterFirstReply: burst ? [2, 1, 0] : []
				});
			});
		}

		test('shows a split PSReadLine echo of a key typed while a partial echo is buffered', async () => {
			const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 60, rows: 3 }));
			const both = async (data: string) => {
				await server(data);
				await writeP(control, data);
			};
			// A pty read can end a render before its final cursor placement.
			const splitRender = (text: string) => {
				const render = psReadLineRender(text, 18 + text.length);
				const placement = render.lastIndexOf(`${CSI}1;`);
				return [render.slice(0, placement), render.slice(placement)];
			};
			terminal.resize(60, 3);
			terminal.reset();
			addon.reset();
			addon.showPredictions(true);
			await both(`${CSI}?1h\x1b=PS /private/tmp> `);
			const [e, ec] = [splitRender('e'), splitRender('ec')];
			await input('e');
			await both(e[0]);
			await input('c');
			await both(e[1]);
			await both(ec[0]);
			const afterEcho = { line: state().lines[0], cursorX: state().cursorX };
			await both(ec[1]);
			assert.deepStrictEqual({ afterEcho, terminal: snapshotTerminal(terminal), accuracy: addon.stats?.accuracy }, {
				afterEcho: { line: 'PS /private/tmp> ec', cursorX: 19 },
				terminal: snapshotTerminal(control),
				accuracy: 1
			});
		});

		test('matches a fish mid-line backspace followed by its repaint', async () => {
			const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 40, rows: 3 }));
			const both = async (data: string) => {
				await server(data);
				await writeP(control, data);
			};
			terminal.resize(40, 3);
			terminal.reset();
			addon.reset();
			addon.showPredictions(true);
			await both(`$ echo \r${CSI}7Cabc\r${CSI}10C${CSI}8Decho ${CSI}36mabc${CSI}39m\r${CSI}10C`);
			await input(`${CSI}D`);
			await both(`\r${CSI}9C`);
			await input('\x7f');
			await both(`\b${CSI}36mc${CSI}39m${CSI}K\r${CSI}8C`);
			assert.deepStrictEqual({ terminal: snapshotTerminal(terminal), accuracy: addon.stats?.accuracy }, { terminal: snapshotTerminal(control), accuracy: 1 });
		});

		for (const repaint of ['\u754c', `${CSI}20Cz`, `${CSI}1K`]) {
			test(`falls back safely for unsupported fish repaint ${JSON.stringify(repaint)}`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 20, rows: 3 }));
				await writeP(control, '$ a');
				await input('bc', false);
				const reply = `b\r${CSI}4C${repaint}\r${CSI}4C`;
				await server(reply);
				await writeP(control, reply);
				assert.deepStrictEqual({ terminal: snapshotTerminal(terminal), pending: addon.pendingPredictionState }, {
					terminal: snapshotTerminal(control), pending: { count: 0, hasIncompleteInput: false }
				});
			});
		}

		for (const scenario of fishScenarios) {
			for (const burst of [false, true]) {
				for (const fragmented of [false, true]) {
					test(`fish ${scenario.name}, burst=${burst}, fragmented=${fragmented}`, async () => {
						const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
						const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 40, rows: 3 }));
						terminal.resize(40, 3);
						terminal.reset();
						addon.reset();
						addon.showPredictions(true);
						await server('$ ' + (scenario.initial ?? ''));
						await writeP(control, '$ ' + (scenario.initial ?? ''));
						const reply = async (data: string) => {
							for (const chunk of fragmented ? data : [data]) {
								queueServer(chunk);
								await writeP(terminal, '');
							}
							await writeP(control, data);
						};
						if (burst) {
							await input(scenario.keys.join(''), false);
							await reply(scenario.replies.join(''));
						} else {
							for (let i = 0; i < scenario.keys.length; i++) {
								await input(scenario.keys[i]);
								await reply(scenario.replies[i]);
								assert.deepStrictEqual(snapshotTerminal(terminal), snapshotTerminal(control), `key ${i}`);
							}
						}
						assert.deepStrictEqual(snapshotTerminal(terminal), snapshotTerminal(control));
					});
				}
			}
		}

		for (const wrap of [' \r', ` \r${CSI}K`]) {
			test(`restores scrolled-in cells after rejecting predictions past wrap ${JSON.stringify(wrap)}`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 5, rows: 3 }));
				const both = async (data: string) => {
					await server(data);
					await writeP(control, data);
				};
				terminal.resize(5, 3);
				terminal.reset();
				addon.reset();
				addon.showPredictions(true);
				await both(`\r\n\r\n${CSI}4;48;5;42m$ a`);
				await input('b');
				await both('b');
				await input('cxy');
				await both(`c${wrap}`);
				await both('\x07');
				assert.deepStrictEqual(snapshotTerminal(terminal), snapshotTerminal(control));
			});
		}

		test('does not withhold a typed space after a deferred wrap', async () => {
			terminal.resize(5, 3);
			addon.showPredictions(true);
			await input('bc ');
			await server('bc');
			await server(' ');
			assert.deepStrictEqual(state(), { lines: ['$ abc', ' ', ''], cursorX: 1, cursorY: 1, baseY: 0 });
		});

		test('preserves pending wrap between separate server echoes', async () => {
			await server('1'.repeat(16));
			await input('bc');
			await server('b');
			await server('c');
			assert.deepStrictEqual(state(), {
				lines: ['$ a' + '1'.repeat(16) + 'b', 'c', ''], cursorX: 1, cursorY: 1, baseY: 0
			});
		});

		for (const row of [0, 2]) {
			test(`reconciles consecutive mismatches across pending wrap on row ${row}`, async () => {
				terminal.resize(5, 3);
				addon.showPredictions(true);
				if (row) {
					await server(`${CSI}3;1H$ `);
					await input('a');
					await server('a');
				}
				await input('b');
				await server('b');
				await input('c');
				await server('e');
				await input('d');
				await server('x');
				assert.deepStrictEqual(state(), row ? {
					lines: ['', '$ abe', 'x'], cursorX: 1, cursorY: 2, baseY: 1
				} : {
					lines: ['$ abe', 'x', ''], cursorX: 1, cursorY: 1, baseY: 0
				});
			});
		}

		test('keeps boundary backspace coordinates at the left margin', async () => {
			terminal.reset();
			addon.reset();
			await server('');
			await input('\x7f');
			await server('\b \b');
			await input('y');
			await server('y');
			await input('k');
			await server('k');
			assert.deepStrictEqual({ ...state(), virtualX: addon.physicalCursor(terminal.buffer.active)?.x }, {
				lines: ['yk', '', ''], cursorX: 2, cursorY: 0, baseY: 0, virtualX: 2
			});
		});

		for (const { sequence, accuracy } of [
			{ sequence: '\x9b?25l', accuracy: 1 },
			{ sequence: `${CSI}?25;1l`, accuracy: 0.5 }
		]) {
			test(`preserves cursor visibility from ${JSON.stringify(sequence)}`, async () => {
				await input('b');
				await server(sequence + 'b');
				const xterm = terminal as Terminal & { _core: IXtermCore };
				assert.deepStrictEqual([xterm._core.coreService.isCursorHidden, addon.stats?.accuracy], [true, accuracy]);
			});
		}

		for (const chunks of [
			[`${CSI}?25l`, 'b'],
			[CSI, '?25l', 'b'],
			['\x9b', '?25l', 'b']
		]) {
			test(`preserves cursor visibility across queued writes ${JSON.stringify(chunks)}`, async () => {
				await input('b', false);
				for (const data of chunks) {
					const event = { data };
					onBeforeProcessData.fire(event);
					terminal.write(event.data);
				}
				await writeP(terminal, '');
				const xterm = terminal as Terminal & { _core: IXtermCore };
				assert.deepStrictEqual({ ...state(), hidden: xterm._core.coreService.isCursorHidden }, {
					lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0, hidden: true
				});
			});
		}

		for (const hidden of [false, true]) {
			for (const { start, end } of [
				{ start: '\x1b]0;foo', end: '\x07' },
				{ start: '\x1bPfoo', end: '\x1b\\' }
			]) {
				test(`preserves C1 cursor visibility ${hidden} interrupting ${JSON.stringify(start)}`, async () => {
					await server(hidden ? `${CSI}?25h` : `${CSI}?25l`);
					await input('b');
					await server(`${start}\x9b?25${hidden ? 'l' : 'h'}${end}b`);
					const xterm = terminal as Terminal & { _core: IXtermCore };
					assert.deepStrictEqual({ ...state(), hidden: xterm._core.coreService.isCursorHidden }, {
						lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0, hidden
					});
				});
			}
		}

		for (const modes of ['25;6', '6;25']) {
			test(`reconciles cursor-changing DEC modes ${modes}`, async () => {
				await input('b');
				await server(`${CSI}?${modes}hb`);
				assert.deepStrictEqual(state(), {
					lines: ['b a', '', ''], cursorX: 1, cursorY: 0, baseY: 0
				});
			});
		}

		for (const start of ['\x1b]0;foo', '\x1bPfoo']) {
			test(`recognizes unterminated C1 interruption of ${JSON.stringify(start)}`, async () => {
				await input('b');
				await server(`${start}\x9b?25lb`);
				await input('c');
				const predicted = state();
				await server('c');
				const xterm = terminal as Terminal & { _core: IXtermCore };
				assert.deepStrictEqual([predicted, state(), xterm._core.coreService.isCursorHidden], [
					{ lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 },
					{ lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 },
					true
				]);
			});
		}

		for (const data of [`${CSI}Dx`, '\x7f']) {
			test(`does not destroy wide cells when cancelling ${JSON.stringify(data)}`, async () => {
				await server('\u754c');
				await input(data);
				addon.undoAllPredictions();
				await writeP(terminal, '');
				assert.deepStrictEqual(state(), {
					lines: ['$ a\u754c', '', ''], cursorX: 5, cursorY: 0, baseY: 0
				});
			});
		}

		test('restores wide cells when the shell rejects one-column navigation', async () => {
			await server('\u754c');
			await input(`${CSI}Dx`);
			await server(`${CSI}2D`);
			assert.deepStrictEqual(state(), {
				lines: ['$ a\u754c', '', ''], cursorX: 3, cursorY: 0, baseY: 0
			});
		});

		for (const reset of [`${CSI}!p`, '\x9b!p', '\x1bc']) {
			test(`preserves cursor visibility after reset ${JSON.stringify(reset)}`, async () => {
				await server(`${CSI}?25l`);
				await input('b');
				await server(reset);
				const xterm = terminal as Terminal & { _core: IXtermCore };
				assert.strictEqual(xterm._core.coreService.isCursorHidden, false);
			});
		}

		test('does not interpret an escape with intermediates as a reset', async () => {
			await server(`${CSI}?25l`);
			await input('b');
			await server('\x1b#cb');
			const xterm = terminal as Terminal & { _core: IXtermCore };
			assert.deepStrictEqual({ ...state(), hidden: xterm._core.coreService.isCursorHidden }, {
				lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0, hidden: true
			});
		});

		test('matches a wrapped line with fragmented zsh clearing', async () => {
			terminal.reset();
			addon.reset();
			await server('1'.repeat(19));
			await input('ab');
			await server('a');
			await server(' \r' + CSI);
			await server('Kb');
			assert.deepStrictEqual({ ...state(), accuracy: addon.stats?.accuracy }, {
				lines: ['1'.repeat(19) + 'a', 'b', ''], cursorX: 1, cursorY: 1, baseY: 0, accuracy: 1
			});
		});

		for (const { style, sequence, flags } of [
			{ style: 'dim', sequence: '2', flags: [false, true, false, 0, false] },
			{ style: 'bold', sequence: '1', flags: [true, false, false, 0, false] },
			{ style: 'dim', sequence: '4:1', flags: [false, false, false, 1, false] },
			{ style: 'bold', sequence: '4:2', flags: [false, false, false, 2, false] },
			{ style: 'italic', sequence: '4:3', flags: [false, false, false, 3, false] },
			{ style: 'italic', sequence: '3;23', flags: [false, false, false, 0, false] },
			{ style: 'underlined', sequence: '4:3', flags: [false, false, false, 3, false] },
			{ style: 'underlined', sequence: '4;24', flags: [false, false, false, 0, false] },
			{ style: 'inverted', sequence: '7;27', flags: [false, false, false, 0, false] }
		]) {
			test(`preserves ${sequence} attributes with ${style} predictions`, async () => {
				configureStyle(style);
				await server(`${CSI}${sequence}m`);
				await input('b');
				await server('b');
				await server('x');
				const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
				assert.deepStrictEqual([
					!!cell.isBold(), !!cell.isDim(), !!cell.isItalic(), cell.getUnderlineStyle(), !!cell.isInverse()
				], flags);
			});
		}

		test('does not reset foreground when a bright background is set', async () => {
			await server(`${CSI}31;100m`);
			await input('b');
			await server('b');
			await server('x');
			const cell = terminal.buffer.active.getLine(0)!.getCell(4)!;
			assert.deepStrictEqual([cell.getFgColor(), cell.getBgColor()], [1, 8]);
		});

		test('requires validation again after a tentative character fails', async () => {
			addon.reset();
			await input('b');
			await server('\x07');
			await input('c');
			assert.deepStrictEqual(state(), { lines: ['$ a', '', ''], cursorX: 3, cursorY: 0, baseY: 0 });
		});

		test('predicts a right arrow back to the known end of input', async () => {
			await input('bc');
			await server('bc');
			await input(`${CSI}D`);
			await server('\b');
			await input(`${CSI}C`);
			assert.deepStrictEqual(state(), { lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 });
		});

		test('uses the end of coalesced input when predicting a right arrow', async () => {
			await input(`bc${CSI}D${CSI}C`);
			assert.deepStrictEqual(state(), { lines: ['$ abc', '', ''], cursorX: 5, cursorY: 0, baseY: 0 });
		});

		test('does not predict word movement into the prompt', async () => {
			await server('\r' + `${CSI}Kprompt`);
			addon.reset();
			await input('a');
			await server('a');
			await input('\x1bb');
			assert.deepStrictEqual(state(), { lines: ['prompta', '', ''], cursorX: 7, cursorY: 0, baseY: 0 });
		});

		test('retains the tentative cursor when pending generations become visible', async () => {
			addon.reset();
			addon.showPredictions(false);
			await input('bc');
			addon.showPredictions(true);
			assert.strictEqual(addon.tentativeCursor(terminal.buffer.active)?.x, 5);
		});

		test('retains queued coordinates while predictions are hidden', async () => {
			await input('bc');
			addon.showPredictions(false);
			await input('d');
			assert.strictEqual(addon.tentativeCursor(terminal.buffer.active)?.x, 6);
		});

		test('uses the first tentative character as zsh lookbehind', async () => {
			addon.reset();
			await input('b');
			await server('b');
			await input('c');
			await server('\bbc');
			await input('d');
			await server('\bcd');
			assert.deepStrictEqual({ ...state(), accuracy: addon.stats?.accuracy }, {
				lines: ['$ abcd', '', ''], cursorX: 6, cursorY: 0, baseY: 0, accuracy: 1
			});
		});

		test('preserves styling of zsh lookbehind repaints when backspaces are rolled back', async () => {
			await input('b');
			await server(`${CSI}31m\bab`);
			await input('\x7f\x7f', false);
			addon.undoAllPredictions();
			await writeP(terminal, '');
			const cells = [2, 3].map(x => terminal.buffer.active.getLine(0)!.getCell(x)!);
			assert.deepStrictEqual(cells.map(cell => [cell.getChars(), cell.getFgColor()]), [['a', 1], ['b', 1]]);
		});

		test('preserves styling across coalesced zsh lookbehind repaints', async () => {
			await input('bc');
			await server(`${CSI}31m\bab\bbc`);
			await input('\x7f\x7f\x7f', false);
			addon.undoAllPredictions();
			await writeP(terminal, '');
			const cells = [2, 3, 4].map(x => terminal.buffer.active.getLine(0)!.getCell(x)!);
			assert.deepStrictEqual(cells.map(cell => [cell.getChars(), cell.getFgColor()]), [['a', 1], ['b', 1], ['c', 1]]);
		});

		for (const sequence of [`${CSI}31m`, `${CSI}2C`, `${CSI}?25l`]) {
			test(`preserves fragmented CSI ${JSON.stringify(sequence)}`, async () => {
				for (let split = 1; split < sequence.length; split++) {
					terminal.reset();
					addon.reset();
					await server('$ ');
					await input('a');
					await server('a');
					await input('b');
					await server(sequence.slice(0, split));
					await server(sequence.slice(split) + 'b');
					assert.deepStrictEqual(state(), {
						lines: [sequence === `${CSI}2C` ? '$ a  b' : '$ ab', '', ''],
						cursorX: sequence === `${CSI}2C` ? 6 : 4, cursorY: 0, baseY: 0
					});
				}
			});
		}

		test('streams a long fragmented control string instead of withholding it', async () => {
			await input('b');
			const payload = 'x'.repeat(10 * 1024);
			const first = await server(`\x1b]9999;${payload}`);
			const second = await server(payload);
			await server('\x07b');
			assert.deepStrictEqual({ first, streamed: second.endsWith(payload), ...state(), pending: addon.pendingPredictionState }, {
				first: '', streamed: true, lines: ['$ ab', '', ''], cursorX: 4, cursorY: 0, baseY: 0, pending: { count: 0, hasIncompleteInput: false }
			});
		});

		test('erases a rolled back blank cell with its saved style after restoring a styled cell', async () => {
			const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			const control = ds.add(new TerminalCtor({ allowProposedApi: true, cols: 20, rows: 3 }));
			const styledCell = `${CSI}5G${CSI}41mZ${CSI}0m${CSI}4G`;
			await writeP(control, '$ a' + styledCell);
			await server(styledCell);
			await input('bc');
			addon.undoAllPredictions();
			await writeP(terminal, '');
			assert.deepStrictEqual(snapshotTerminal(terminal), snapshotTerminal(control));
		});

		test('does not predict with an underline pen that SGR cannot reproduce', async () => {
			await server(`${CSI}4:3m\x1b7${CSI}24m\x1b8`);
			const before = state();
			await input('b');
			assert.deepStrictEqual(state(), before);
		});
	});

	suite('deterministic differential fuzzing', () => {
		type Edit = 'type' | 'backspace' | 'left' | 'right' | 'wordLeft' | 'wordRight' | 'home' | 'end' | 'delete' | 'killStart' | 'killEnd';
		interface Editor {
			text: string;
			cursor: number;
		}
		interface Operation {
			input: string;
			reply: string;
		}
		type TraceEntry = { input: string; wasUserInput: boolean } | { server: string; rewritten: string } | { parseAt: number };
		type Snapshot = ReturnType<typeof snapshotTerminal>;

		const patterns: readonly (readonly Edit[])[] = [
			['type', 'type', 'left', 'backspace', 'type'],
			['type', 'backspace', 'type', 'type'],
			['type', 'type', 'left', 'type', 'right'],
			['left', 'type', 'right', 'backspace', 'backspace', 'type']
		];
		const extendedPatterns: readonly (readonly Edit[])[] = [
			...patterns,
			['wordLeft', 'type', 'wordRight', 'backspace', 'type'],
			['type', 'home', 'delete', 'end', 'type'],
			['left', 'killEnd', 'type', 'backspace', 'type'],
			['type', 'left', 'killStart', 'type', 'right']
		];
		const styles = [
			'0', '31', '38;5;123;48;5;42', '38;2;18;52;86;48;2;101;67;33',
			'38:2::18:52:86', '1;2;3', '22;23;24;27', '4:3;58:2::12:34:56', '7;9;53', '29;55;39;49'
		];
		// xterm.js restores the saved pen without its extended underline attributes, leaving hidden state
		// that no SGR can reproduce. Predictions are suspended for a visibly inconsistent underline (see
		// 'does not predict with an underline pen that SGR cannot reproduce'); normalize the rest here.
		const restoreSavedPen = `${CSI}24;59m`;
		const controls = [
			'\x1b]0;fuzz\x07', '\x1b]0;fuzz\x1b\\', '\x1bPignored\x1b\\', '\x1b_ignored\x1b\\',
			`${CSI}4h`, `${CSI}4l`, `${CSI}?7h`, `${CSI}?7l`, `${CSI}?45h`, `${CSI}?45l`,
			`${CSI}?2004h`, `${CSI}?2004l`, `${CSI}?1h`, `${CSI}?1l`, `${CSI}?2026h`, `${CSI}?2026l`,
			`${CSI}?1049h`, `${CSI}?1049l${restoreSavedPen}`, '\x1b7', `\x1b8${restoreSavedPen}`
		];

		function firstDifference(actual: Snapshot, expected: Snapshot) {
			for (const key of ['modes', 'bufferType', 'cursorX', 'cursorY', 'baseY', 'hidden', 'attributes'] as const) {
				if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
					return `${key}: ${JSON.stringify(actual[key])} !== ${JSON.stringify(expected[key])}`;
				}
			}
			for (let y = 0; y < Math.max(actual.lines.length, expected.lines.length); y++) {
				const actualLine = actual.lines[y];
				const expectedLine = expected.lines[y];
				if (!actualLine || !expectedLine) {
					return `line ${y}: ${JSON.stringify(actualLine)} !== ${JSON.stringify(expectedLine)}`;
				}
				for (let x = 0; x < Math.max(actualLine.cells.length, expectedLine.cells.length); x++) {
					if (JSON.stringify(actualLine.cells[x]) !== JSON.stringify(expectedLine.cells[x])) {
						return `line ${y}, cell ${x}: ${JSON.stringify(actualLine.cells[x])} !== ${JSON.stringify(expectedLine.cells[x])}`;
					}
				}
				if (actualLine.wrapped !== expectedLine.wrapped) {
					return `line ${y} wrapped: ${actualLine.wrapped} !== ${expectedLine.wrapped}`;
				}
			}
			return undefined;
		}

		function generateBurst(random: Random, editor: Editor, extended: boolean): Operation[] {
			const operations: Operation[] = [];
			// Keep shell repaints on one physical line; Enter still exercises scrolling.
			if (editor.text.length >= 10) {
				operations.push({ input: '\r', reply: '\r\n$ ' });
				editor.text = '';
				editor.cursor = 0;
			}
			const availablePatterns = extended ? extendedPatterns : patterns;
			for (const edit of availablePatterns[random.nextIntRange(0, availablePatterns.length)]) {
				let input: string;
				let reply: string;
				const tail = editor.text.slice(editor.cursor);
				if (edit === 'type') {
					input = 'bcdef '[random.nextIntRange(0, 6)];
					const character = random.nextIntRange(0, 8) === 0 ? input.toUpperCase() : input;
					reply = editor.cursor > 0 && random.nextIntRange(0, 4) === 0
						? `\b${editor.text[editor.cursor - 1]}${character}`
						: character;
					reply += tail + (tail.length ? `${CSI}${tail.length}D` : '');
					editor.text = editor.text.slice(0, editor.cursor) + character + tail;
					editor.cursor++;
				} else if (edit === 'backspace') {
					input = '\x7f';
					if (editor.cursor === 0 || random.nextIntRange(0, 10) === 0) {
						reply = '\x07';
					} else {
						if (tail.length) {
							reply = `\b${tail} ${CSI}${tail.length + 1}D`;
						} else {
							reply = random.nextIntRange(0, 2) === 0 ? '\b \b' : `\b${CSI}K`;
						}
						editor.text = editor.text.slice(0, editor.cursor - 1) + tail;
						editor.cursor--;
					}
				} else if (edit === 'delete' || edit === 'killStart' || edit === 'killEnd') {
					input = edit === 'delete' ? `${CSI}3~` : edit === 'killStart' ? '\x15' : '\x0b';
					if (edit === 'killStart') {
						reply = editor.cursor ? `${CSI}${editor.cursor}D${CSI}${editor.cursor}P` : '\x07';
						editor.text = tail;
						editor.cursor = 0;
					} else if (edit === 'killEnd') {
						reply = tail.length ? `${CSI}K` : '\x07';
						editor.text = editor.text.slice(0, editor.cursor);
					} else {
						reply = tail.length ? `${CSI}P` : '\x07';
						editor.text = editor.text.slice(0, editor.cursor) + tail.slice(1);
					}
				} else if (edit === 'home' || edit === 'end') {
					input = edit === 'home' ? '\x01' : '\x05';
					const count = edit === 'home' ? editor.cursor : tail.length;
					reply = count ? `${CSI}${count}${edit === 'home' ? 'D' : 'C'}` : '\x07';
					editor.cursor = edit === 'home' ? 0 : editor.text.length;
				} else if (edit === 'wordLeft' || edit === 'wordRight') {
					const left = edit === 'wordLeft';
					input = random.nextIntRange(0, 2) === 0 ? `\x1b${left ? 'b' : 'f'}` : `${CSI}1;5${left ? 'D' : 'C'}`;
					const count = left
						? editor.text.slice(0, editor.cursor).match(/[a-z]+[^a-z]*$/i)?.[0].length ?? editor.cursor
						: tail.match(/^[^a-z]*[a-z]+/i)?.[0].length ?? tail.length;
					reply = count ? `${CSI}${count}${left ? 'D' : 'C'}` : '\x07';
					editor.cursor += left ? -count : count;
				} else {
					const available = edit === 'left' ? editor.cursor : tail.length;
					const count = Math.min(available, random.nextIntRange(1, 3));
					input = `${CSI}${count > 1 ? count : ''}${edit === 'left' ? 'D' : 'C'}`;
					reply = count === 0 ? '\x07' : input;
					if (edit === 'left' && count === 1 && random.nextIntRange(0, 2) === 0) {
						reply = '\b';
					}
					editor.cursor += edit === 'left' ? -count : count;
				}
				if (random.nextIntRange(0, 4) === 0) {
					reply = `${CSI}${styles[random.nextIntRange(0, styles.length)]}m` + reply;
				}
				if (random.nextIntRange(0, 5) === 0) {
					reply = `${CSI}?25${random.nextIntRange(0, 2) === 0 ? 'l' : 'h'}` + reply;
				}
				if (extended && random.nextIntRange(0, 5) === 0) {
					reply = controls[random.nextIntRange(0, controls.length)] + reply;
				}
				operations.push({ input, reply });
			}
			return operations;
		}

		function generateFishBurst(random: Random, editor: Editor): Operation[] {
			const operations: Operation[] = [];
			if (editor.text.length >= 10) {
				operations.push({ input: '\r', reply: '\r\n$ ' });
				editor.text = '';
				editor.cursor = 0;
			}
			for (const edit of patterns[random.nextIntRange(0, patterns.length)]) {
				let input: string;
				let reply: string;
				const tail = editor.text.slice(editor.cursor);
				if (edit === 'type') {
					input = 'bcdef '[random.nextIntRange(0, 6)];
					reply = `${CSI}${styles[random.nextIntRange(0, styles.length)]}m${input}${tail}${CSI}39m${random.nextIntRange(0, 4) === 0 ? `${CSI}K` : ''}`;
					editor.text = editor.text.slice(0, editor.cursor) + input + tail;
					editor.cursor++;
				} else if (edit === 'backspace') {
					input = '\x7f';
					reply = editor.cursor ? `\b${tail}${CSI}K` : '\x07';
					if (editor.cursor) {
						editor.text = editor.text.slice(0, --editor.cursor) + tail;
					}
				} else {
					input = `${CSI}${edit === 'left' ? 'D' : 'C'}`;
					editor.cursor = Math.max(0, Math.min(editor.text.length, editor.cursor + (edit === 'left' ? -1 : 1)));
					reply = '';
				}
				const reposition = `\r${CSI}${editor.cursor + 2}C`;
				reply += reposition;
				if (random.nextIntRange(0, 2) === 0 && editor.text.length) {
					const rewind = editor.cursor ? `${CSI}${editor.cursor}D` : '';
					reply += `${rewind}${CSI}32m${editor.text}${CSI}39m${reposition}`;
				}
				if (random.nextIntRange(0, 2) === 0) {
					reply += `${CSI}90m${tail}go${CSI}39m${reposition}`;
				}
				operations.push({ input, reply });
			}
			return operations;
		}

		/** Models PSReadLine, which queries the cursor and redraws the whole line with absolute positioning. */
		function generatePowerShellBurst(random: Random, editor: Editor, row: number): Operation[] {
			const operations: Operation[] = [];
			const at = (column: number) => `${CSI}${row + 1};${column + 3}H`;
			const render = (previousLength: number) => `${CSI}6n${CSI}?25l${at(0)}${CSI}0m${CSI}${styles[random.nextIntRange(0, styles.length)]}m${editor.text}${CSI}39;49m${CSI}0m`
				+ ' '.repeat(Math.max(0, previousLength - editor.text.length)) + `${at(editor.cursor)}${CSI}?12l${CSI}?25h`;
			if (editor.text.length >= 10) {
				operations.push({ input: '\r', reply: `${render(editor.text.length)}\r\n$ ` });
				editor.text = '';
				editor.cursor = 0;
				row = Math.min(row + 1, 2);
			}
			for (const edit of patterns[random.nextIntRange(0, patterns.length)]) {
				const previousLength = editor.text.length;
				let input: string;
				let reply: string;
				if (edit === 'type') {
					input = 'bcdef '[random.nextIntRange(0, 6)];
					editor.text = editor.text.slice(0, editor.cursor) + input + editor.text.slice(editor.cursor);
					editor.cursor++;
					reply = render(previousLength);
				} else if (edit === 'backspace') {
					input = '\x7f';
					if (editor.cursor) {
						editor.text = editor.text.slice(0, editor.cursor - 1) + editor.text.slice(editor.cursor);
						editor.cursor--;
					}
					reply = render(previousLength);
				} else {
					input = `\x1bO${edit === 'left' ? 'D' : 'C'}`;
					editor.cursor = Math.max(0, Math.min(editor.text.length, editor.cursor + (edit === 'left' ? -1 : 1)));
					reply = `${CSI}6n${at(editor.cursor)}`;
				}
				operations.push({ input, reply });
			}
			return operations;
		}

		function generateWrappingBurst(random: Random, editor: Editor, cols: number): Operation[] {
			const operations: Operation[] = [];
			for (let i = 0, count = random.nextIntRange(3, 10); i < count; i++) {
				let input: string;
				let reply: string;
				if (random.nextIntRange(0, 12) === 0) {
					input = '\r';
					reply = '\r\n$ ';
					editor.cursor = 2;
				} else if (editor.cursor > 0 && editor.cursor < cols && random.nextIntRange(0, 5) === 0) {
					input = '\x7f';
					reply = random.nextIntRange(0, 2) === 0 ? '\b \b' : `\b${CSI}K`;
					editor.cursor--;
				} else {
					input = 'bcdef '[random.nextIntRange(0, 6)];
					reply = random.nextIntRange(0, 8) === 0 ? input.toUpperCase() : input;
					if (editor.cursor === cols) {
						editor.cursor = 0;
					}
					if (++editor.cursor === cols && (i === count - 1 || random.nextIntRange(0, 2) === 0)) {
						reply += random.nextIntRange(0, 2) === 0 ? ' \r' : ` \r${CSI}K`;
						editor.cursor = 0;
					}
				}
				if (random.nextIntRange(0, 4) === 0) {
					reply = `${CSI}${styles[random.nextIntRange(0, styles.length)]}m` + reply;
				}
				operations.push({ input, reply });
			}
			return operations;
		}

		// Replay with --grep 'deterministic differential fuzzing (wrapping |extended |fish |powershell )?seed <seed>$'; extend this seed list or stepCount for a larger fixed budget.
		const stepCount = 128;
		const seeds = [1, 7, 42, 1337, 65537, 12648430, 305419896, 3735928559, ...Array.from({ length: 56 }, (_, i) => Math.imul(i + 1, 0x9E3779B1) >>> 0)];
		for (const { seed, profile } of seeds.flatMap(seed => ['basic', 'extended', ...(seeds.indexOf(seed) < 16 ? ['fish', 'powershell'] : []), 'wrapping'].map(profile => ({ seed, profile })))) {
			test(`${profile === 'basic' ? '' : profile + ' '}seed ${seed}`, async () => {
				const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
				const random = Random.create(seed);
				// Freeze xterm's parser time budget as well as the addon's debounce/idle clocks.
				const clock = useFakeTimers({ now: 0, toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
				const store = ds.add(new DisposableStore());
				const trace: TraceEntry[] = [];
				let step = -1;
				const context = () => `seed=${seed}, profile=${profile}, step=${step}, trace=${JSON.stringify(trace)}`;
				const record = (entry: TraceEntry) => {
					trace.push(entry);
					if (trace.length > 80) {
						trace.shift();
					}
				};
				try {
					const cols = profile === 'wrapping' ? random.nextIntRange(5, 12) : 20;
					const terminal = store.add(new TerminalCtor({ allowProposedApi: true, cols, rows: 3, scrollback: 20 }));
					const control = store.add(new TerminalCtor({ allowProposedApi: true, cols, rows: 3, scrollback: 20 }));
					const onBeforeProcessData = store.add(new Emitter<IBeforeProcessDataEvent>());
					const configurationService = new TestConfigurationService({
						terminal: { integrated: { localEchoStyle: '#ff0000', localEchoLatencyThreshold: 0, localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE } }
					});
					store.add(configurationService.onDidChangeConfigurationEmitter);
					const addon = store.add(new TestTypeAheadAddon(
						upcastPartial<ITerminalProcessManager>({ onBeforeProcessData: onBeforeProcessData.event }),
						configurationService,
						upcastPartial<ITelemetryService>({ publicLog: () => { } })
					));
					const parse = (milliseconds = 1) => {
						let completed = 0;
						for (const t of [terminal, control]) {
							t.write('', () => completed++);
						}
						record({ parseAt: clock.now + milliseconds });
						clock.tick(milliseconds);
						if (completed !== 2) {
							assert.fail(`Parser did not drain: ${context()}`);
						}
					};
					const input = (data: string, wasUserInput: boolean) => {
						record({ input: data, wasUserInput });
						terminal.input(data, wasUserInput);
					};
					const server = (data: string) => {
						const event = { data };
						onBeforeProcessData.fire(event);
						record({ server: data, rewritten: event.data });
						terminal.write(event.data);
						control.write(data);
					};
					const assertSettled = () => {
						const actual = { terminal: snapshotTerminal(terminal), predictions: addon.pendingPredictionState };
						const expected = { terminal: snapshotTerminal(control), predictions: { count: 0, hasIncompleteInput: false } };
						try {
							assert.deepStrictEqual(actual, expected);
						} catch {
							assert.deepStrictEqual(actual, expected, `${context()}, difference=${firstDifference(actual.terminal, expected.terminal) ?? 'predictions'}`);
						}
					};

					server('$ ');
					parse();
					addon.activate(terminal);
					input('a', true);
					server('a');
					parse();
					assertSettled();

					const editor: Editor = { text: 'a', cursor: profile === 'wrapping' ? 3 : 1 };
					for (step = 0; step < stepCount; step++) {
						const operations = profile === 'wrapping' ? generateWrappingBurst(random, editor, cols)
							: profile === 'fish' ? generateFishBurst(random, editor)
								: profile === 'powershell' ? generatePowerShellBurst(random, editor, control.buffer.active.cursorY)
									: generateBurst(random, editor, profile === 'extended');
						let pending = '';
						const deliver = () => {
							const length = random.nextIntRange(0, 3) === 0
								? pending.length
								: random.nextIntRange(1, Math.min(12, pending.length) + 1);
							server(pending.slice(0, length));
							pending = pending.slice(length);
						};
						for (let i = 0; i < operations.length;) {
							const batch = operations.slice(i, i + random.nextIntRange(1, 4));
							i += batch.length;
							input(batch.map(operation => operation.input).join(''), random.nextIntRange(0, 2) === 0);
							pending += batch.map(operation => operation.reply).join('');
							if (profile !== 'basic' && random.nextIntRange(0, 12) === 0) {
								parse(501);
							}
							if (random.nextIntRange(0, 3) === 0) {
								parse();
							}
							if (pending.length && random.nextIntRange(0, 2) === 0) {
								deliver();
								if (random.nextIntRange(0, 2) === 0) {
									parse();
								}
							}
						}
						while (pending.length) {
							deliver();
							if (random.nextIntRange(0, 2) === 0) {
								parse();
							}
						}
						parse();
						assertSettled();
					}
					assert.ok(addon.isShowing && addon.stats && addon.stats.sampleSize > 1, `No active prediction coverage: ${context()}`);
				} finally {
					try {
						store.dispose();
					} finally {
						clock.restore();
					}
				}
			});
		}
	});
});

class TestTypeAheadAddon extends TypeAheadAddon {
	unlockMakingPredictions() {
		this._lastRow = { y: 1, startingX: 100, endingX: 100, charState: CharPredictState.Validated };
	}

	lockMakingPredictions() {
		this._lastRow = undefined;
	}

	unlockNavigating() {
		this._lastRow = { y: 1, startingX: 1, endingX: 1, charState: CharPredictState.Validated };
	}

	reevaluateNow() {
		this._reevaluatePredictorStateNow(this.stats!, this._timeline!);
	}

	get isShowing() {
		return !!this._timeline?.isShowingPredictions;
	}

	get pendingPredictionState() {
		return { count: this._timeline?.length, hasIncompleteInput: this._timeline?.hasIncompleteInput };
	}

	undoAllPredictions() {
		this._timeline?.undoAllPredictions();
	}

	showPredictions(show: boolean) {
		this._timeline?.setShowPredictions(show);
	}

	physicalCursor(buffer: IBuffer) {
		return this._timeline?.physicalCursor(buffer);
	}

	tentativeCursor(buffer: IBuffer) {
		return this._timeline?.tentativeCursor(buffer);
	}
}

function upcastPartial<T>(v: Partial<T>): T {
	return v as T;
}

function createPredictionStubs(n: number) {
	return new Array(n).fill(0).map(stubPrediction);
}

function stubPrediction(): IPrediction {
	return {
		apply: () => '',
		rollback: () => '',
		matches: () => 0,
		rollForwards: () => '',
	};
}

function createMockTerminal({ lines, cursorAttrs }: {
	lines: string[];
	cursorAttrs?: any;
}) {
	const ds = new DisposableStore();
	const written: string[] = [];
	const cursor = { y: 1, x: 1 };
	const onTitleChange = ds.add(new Emitter<string>());
	const onData = ds.add(new Emitter<string>());
	const onUserInput = ds.add(new Emitter<void>());
	const onWriteParsed = ds.add(new Emitter<void>());

	for (let y = 0; y < lines.length; y++) {
		const line = lines[y];
		if (line.includes('|')) {
			cursor.y = y + 1;
			cursor.x = line.indexOf('|') + 1;
			lines[y] = line.replace('|', ''); // CodeQL [SM02383] replacing the first occurrence is intended
			break;
		}
	}

	return {
		written,
		cursor,
		expectWritten: (s: string) => {
			assert.strictEqual(JSON.stringify(written.join('')), JSON.stringify(s));
			written.splice(0, written.length);
		},
		clearWritten: () => written.splice(0, written.length),
		onData: (s: string) => {
			onUserInput.fire();
			onData.fire(s);
		},
		onTitleChange,
		dispose: () => ds.dispose(),
		terminal: {
			cols: 80,
			rows: 5,
			registerMarker: () => undefined,
			modes: { insertMode: false, wraparoundMode: true },
			onResize: new Emitter<void>().event,
			onData: onData.event,
			onWriteParsed: onWriteParsed.event,
			onTitleChange: onTitleChange.event,
			write(line: string) {
				written.push(line);
			},
			_core: {
				coreService: { isCursorHidden: false, onUserInput: onUserInput.event },
				_inputHandler: {
					_curAttrData: mockCell('', cursorAttrs)
				},
				_writeBuffer: { _pendingData: 0 },
				writeSync() {

				}
			},
			buffer: {
				active: {
					type: 'normal',
					baseY: 0,
					get cursorY() { return cursor.y; },
					get cursorX() { return cursor.x; },
					getLine(y: number) {
						const s = lines[y - 1] || '';
						return {
							length: s.length,
							getCell: (x: number) => mockCell(s[x - 1] || ''),
							translateToString: (trim: boolean, start = 0, end = s.length) => {
								const out = s.slice(start, end);
								return trim ? out.trimRight() : out;
							},
						};
					},
				}
			}
		} as unknown as Terminal
	};
}

function mockCell(char: string, attrs: { [key: string]: unknown } = {}) {
	return new Proxy({}, {
		get(_, prop) {
			if (isString(prop) && attrs.hasOwnProperty(prop)) {
				return () => attrs[prop];
			}

			switch (prop) {
				case 'getWidth':
					return () => 1;
				case 'getChars':
					return () => char;
				case 'getCode':
					return () => char.charCodeAt(0) || 0;
				case 'isAttributeDefault':
					return () => true;
				default:
					return String(prop).startsWith('is') ? (() => false) : (() => 0);
			}
		},
	});
}
