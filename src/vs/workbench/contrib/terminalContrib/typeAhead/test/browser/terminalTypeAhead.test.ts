/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IBuffer, Terminal } from '@xterm/xterm';
import { SinonStub, stub, useFakeTimers } from 'sinon';
import { Emitter } from '../../../../../../base/common/event.js';
import { CharPredictState, IPrediction, PredictionStats, TypeAheadAddon } from '../../browser/terminalTypeAheadAddon.js';
import { IBeforeProcessDataEvent, ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { DEFAULT_LOCAL_ECHO_EXCLUDE, type ITerminalTypeAheadConfiguration } from '../../common/terminalTypeAheadConfiguration.js';

const CSI = `\x1b[`;

const enum CursorMoveDirection {
	Back = 'D',
	Forwards = 'C',
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
			try {
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
			} finally {
				clock.restore();
			}
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
				`${CSI}X`, // delete character
				`${CSI}1;38;5;1m`, // reset style
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
			expectProcessed('x', `${CSI}?25l${CSI}0ml${CSI}2;5H${CSI}0mx${CSI}?25h`);
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
				`${CSI}2;81H`, // move to end of line
				`${CSI}?25h`
			].join(''));
		});
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

	undoAllPredictions() {
		this._timeline?.undoAllPredictions();
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
	const csiEmitter = ds.add(new Emitter<number[]>());

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
		onData: (s: string) => onData.fire(s),
		csiEmitter,
		onTitleChange,
		dispose: () => ds.dispose(),
		terminal: {
			cols: 80,
			rows: 5,
			onResize: new Emitter<void>().event,
			onData: onData.event,
			onTitleChange: onTitleChange.event,
			parser: {
				registerCsiHandler(_: unknown, callback: () => void) {
					ds.add(csiEmitter.event(callback));
				},
			},
			write(line: string) {
				written.push(line);
			},
			_core: {
				_inputHandler: {
					_curAttrData: mockCell('', cursorAttrs)
				},
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
			if (typeof prop === 'string' && attrs.hasOwnProperty(prop)) {
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
