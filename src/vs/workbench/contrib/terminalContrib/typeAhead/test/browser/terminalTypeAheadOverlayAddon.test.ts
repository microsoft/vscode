/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Terminal } from '@xterm/xterm';
import { restore, spy, useFakeTimers } from 'sinon';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Random } from '../../../../../../editor/test/common/core/random.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import type { IBeforeProcessDataEvent, ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { OverlayTypeAheadAddon } from '../../browser/terminalTypeAheadOverlayAddon.js';
import type { IPredictedRow } from '../../browser/terminalTypeAheadOverlay.js';
import { DEFAULT_LOCAL_ECHO_EXCLUDE, type ITerminalTypeAheadConfiguration } from '../../common/terminalTypeAheadConfiguration.js';

const CSI = '\x1b[';

suite('Workbench - Terminal Overlay Typeahead', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: ReturnType<typeof createFixture>;

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		fixture = createFixture(ds.add(new DisposableStore()), TerminalCtor);
		fixture.server('$ ');
	});

	teardown(() => {
		fixture.dispose();
		restore();
	});

	test('keeps the first character private until echo and fails password input on row departure', () => {
		const { input, server, view, clock, addon } = fixture;
		const snapshots = [];
		input('a');
		snapshots.push(view());
		server('a');
		input('bc');
		snapshots.push(view());
		server('b');
		snapshots.push(view());
		server('c');
		snapshots.push(view());
		server('\r\nPassword: ');
		input('secret');
		snapshots.push(view());
		clock.tick(501);
		snapshots.push(view());
		input('\r');
		server('\r\n$ ');
		assert.deepStrictEqual({ snapshots, accuracy: addon.stats.accuracy, unwritten: fixture.unexpectedWrites() }, {
			snapshots: [
				{ text: '$', cursorX: 2, overlay: false },
				{ text: '$ abc', cursorX: 5, overlay: true },
				{ text: '$ abc', cursorX: 5, overlay: true },
				{ text: '$ abc', cursorX: 5, overlay: false },
				{ text: 'Password:', cursorX: 10, overlay: false },
				{ text: 'Password:', cursorX: 10, overlay: false }
			], accuracy: 1 / 3, unwritten: 0
		});
	});

	test('learns latency above the initial timeout from the hidden first keystroke', () => {
		const { input, server, view, clock } = fixture;
		input('a');
		clock.tick(1500);
		server('a');
		input('b');
		clock.tick(1500);
		const slow = view();
		server('b');
		assert.deepStrictEqual([slow, view()], [
			{ text: '$ ab', cursorX: 4, overlay: true },
			{ text: '$ ab', cursorX: 4, overlay: false }
		]);
	});

	test('does not place later keystrokes after one typed during unparsed output', () => {
		const { input, server, view, terminal, control, clock } = fixture;
		input('a');
		server('a');
		input('b');
		// The first write after user input parses synchronously; queue the echo behind it.
		terminal.write('');
		terminal.write('b');
		control.write('b');
		terminal.input('c', false);
		clock.tick(1);
		input('d');
		const typed = view();
		server('cd');
		assert.deepStrictEqual([typed, view()], [
			{ text: '$ ab', cursorX: 4, overlay: false },
			{ text: '$ abcd', cursorX: 6, overlay: false }
		]);
	});

	test('cancelled edits do not establish password echo evidence', () => {
		const { input, server, view, clock } = fixture;
		input('a\x7f');
		server('\x07');
		input('secret');
		const pending = view();
		clock.tick(501);
		assert.deepStrictEqual([pending, view()], [
			{ text: '$', cursorX: 2, overlay: false },
			{ text: '$', cursorX: 2, overlay: false }
		]);
	});

	for (const shell of ['bash', 'zsh']) {
		test(`composites typing and ${shell} echoes without buffer writes`, () => {
			const { input, server, view, terminal, addon } = fixture;
			input('a');
			server('a');
			input('bc');
			const snapshots = [view()];
			const authoritative = terminal.buffer.active.getLine(0)!.translateToString(true);
			const predictedCells = addon.row?.cells.length;
			server(shell === 'bash' ? 'b' : '\bab');
			snapshots.push(view());
			server(shell === 'bash' ? 'c' : '\bbc');
			snapshots.push(view());
			input('\x7f');
			snapshots.push(view());
			server(shell === 'bash' ? '\b \b' : '\b' + CSI + 'K');
			snapshots.push(view());
			assert.deepStrictEqual({ snapshots, authoritative, predictedCells, accuracy: addon.stats.accuracy, unwritten: fixture.unexpectedWrites() }, {
				snapshots: [
					{ text: '$ abc', cursorX: 5, overlay: true },
					{ text: '$ abc', cursorX: 5, overlay: true },
					{ text: '$ abc', cursorX: 5, overlay: false },
					{ text: '$ ab', cursorX: 4, overlay: true },
					{ text: '$ ab', cursorX: 4, overlay: false }
				], authoritative: '$ a', predictedCells: 2, accuracy: 1, unwritten: 0
			});
		});
	}

	test('edits in the middle and guards the prompt and unknown input end', () => {
		const { input, server, view } = fixture;
		input('abc');
		server('abc');
		input(`${CSI}D\x1bOD`);
		const snapshots = [view()];
		server(`${CSI}2D`);
		input('X');
		snapshots.push(view());
		server(`Xbc${CSI}2D`);
		input('\x7f');
		snapshots.push(view());
		server(`\bbc ${CSI}3D`);
		input('\x1bOC');
		snapshots.push(view());
		server(CSI + 'C');
		input(CSI + 'C');
		server(CSI + 'C');
		input(CSI + 'C' + 'ignored');
		snapshots.push(view());
		server(`\r${CSI}2C`);
		input('\x7f' + 'ignored');
		snapshots.push(view());
		assert.deepStrictEqual(snapshots, [
			{ text: '$ abc', cursorX: 3, overlay: true },
			{ text: '$ aXbc', cursorX: 4, overlay: true },
			{ text: '$ abc', cursorX: 3, overlay: true },
			{ text: '$ abc', cursorX: 4, overlay: true },
			{ text: '$ abc', cursorX: 5, overlay: false },
			{ text: '$ abc', cursorX: 2, overlay: false }
		]);
	});

	for (const char of ['o', 'X']) {
		test(`overwrites a fish autosuggestion with ${char} without shifting its suffix`, () => {
			const { input, server, view, addon } = fixture;
			server('git ');
			input('c');
			server(`c\r${CSI}7C\b${CSI}36;4mc${CSI}39;24m\r${CSI}7C${CSI}90mool-notes.txt ${CSI}39m\r${CSI}7C`);
			input(char);
			const predicted = { ...view(), cells: addon.row?.cells };
			server(`${char}\r${CSI}8C`);
			assert.deepStrictEqual({ predicted, echoed: view(), unwritten: fixture.unexpectedWrites() }, {
				predicted: { text: `$ git c${char}ol-notes.txt`, cursorX: 8, overlay: true, cells: [{ kind: 'char', char }] },
				echoed: { text: `$ git c${char}ol-notes.txt`, cursorX: 8, overlay: false }, unwritten: 0
			});
		});
	}

	test('backspacing with a fish autosuggestion leaves the suggestion in its original columns', () => {
		const { input, server, view, addon } = fixture;
		server('git ');
		input('c');
		server(`c\r${CSI}7C\b${CSI}36;4mc${CSI}39;24m\r${CSI}7C${CSI}90mool-notes.txt ${CSI}39m\r${CSI}7C`);
		input('\x7f');
		const predicted = { ...view(), cells: addon.row?.cells };
		server(`\b${CSI}K\r${CSI}6C${CSI}90mool-notes.txt ${CSI}39m\r${CSI}6C`);
		assert.deepStrictEqual({ predicted, echoed: view(), unwritten: fixture.unexpectedWrites() }, {
			predicted: { text: '$ git  ool-notes.txt', cursorX: 6, overlay: true, cells: [{ kind: 'blank' }] },
			echoed: { text: '$ git ool-notes.txt', cursorX: 6, overlay: false }, unwritten: 0
		});
	});

	for (const char of ['-', 'X']) {
		test(`overwrites a PSReadLine inline prediction with ${char} without shifting its suffix`, () => {
			const { input, server, view } = fixture;
			input('Get');
			server(psReadLine(`Get${CSI}2m-Command${CSI}22m`, 3, 3));
			input(char);
			const inserted = view();
			server(psReadLine(`Get${char}${CSI}2mCommand${CSI}22m`, 4, 3));
			input('\x7f');
			const backspaced = view();
			server(psReadLine(`Get ${CSI}2mCommand${CSI}22m`, 3, 3));
			assert.deepStrictEqual({ inserted, backspaced, echoed: view(), unwritten: fixture.unexpectedWrites() }, {
				inserted: { text: `$ Get${char}Command`, cursorX: 6, overlay: true },
				backspaced: { text: '$ Get Command', cursorX: 5, overlay: true },
				echoed: { text: '$ Get Command', cursorX: 5, overlay: false }, unwritten: 0
			});
		});
	}

	test('mid-line edits shift real input but leave decorations beyond the input end in place', () => {
		const { input, server, view } = fixture;
		input('abc');
		server(`abc${CSI}2mDEF${CSI}22m\r${CSI}5C`);
		input(`${CSI}D${CSI}D`);
		server(CSI + '2D');
		input('X');
		const inserted = view();
		server(`Xbc${CSI}2D`);
		input('\x7f');
		const backspaced = view();
		server(`\bbc ${CSI}3D`);
		assert.deepStrictEqual({ inserted, backspaced, echoed: view(), unwritten: fixture.unexpectedWrites() }, {
			inserted: { text: '$ aXbcEF', cursorX: 4, overlay: true },
			backspaced: { text: '$ abc EF', cursorX: 3, overlay: true },
			echoed: { text: '$ abc EF', cursorX: 3, overlay: false }, unwritten: 0
		});
	});

	test('history recall extends the known input end before Home and insertion', () => {
		const { input, server, view } = fixture;
		input('a');
		server('a');
		server(`\r${CSI}2Cecho hi${CSI}K`);
		input(CSI + 'H');
		server(`\r${CSI}2C`);
		input('X');
		const inserted = view();
		server(`Xecho hi${CSI}7D`);
		assert.deepStrictEqual({ inserted, echoed: view(), unwritten: fixture.unexpectedWrites() }, {
			inserted: { text: '$ Xecho hi', cursorX: 3, overlay: true },
			echoed: { text: '$ Xecho hi', cursorX: 3, overlay: false }, unwritten: 0
		});
	});

	test('typing and backspace leave a zsh-style right prompt at the same column', () => {
		const { input, server, view } = fixture;
		server(`${CSI}45GRIGHT${CSI}3G`);
		input('a');
		server('a');
		input('bc');
		const inserted = view();
		server('bc');
		input('\x7f');
		const backspaced = view();
		server('\b \b');
		assert.deepStrictEqual({ inserted, backspaced, echoed: view(), unwritten: fixture.unexpectedWrites() }, {
			inserted: { text: '$ abc' + ' '.repeat(39) + 'RIGHT', cursorX: 5, overlay: true },
			backspaced: { text: '$ ab' + ' '.repeat(40) + 'RIGHT', cursorX: 4, overlay: true },
			echoed: { text: '$ ab' + ' '.repeat(40) + 'RIGHT', cursorX: 4, overlay: false }, unwritten: 0
		});
	});

	for (const fragmented of [false, true]) {
		test(`fish autosuggestion erase never removes the pending e, fragmented=${fragmented}`, () => {
			const { input, server, view, addon } = fixture;
			server('git ');
			input('c');
			server(`c\r${CSI}7C\b${CSI}36;4mc${CSI}39;24m\r${CSI}7C${CSI}90mool-notes.txt ${CSI}39m\r${CSI}7C`);
			input('he');
			const before = view().text.slice(0, 9);
			const seen: string[] = [];
			for (const reply of [
				`${CSI}36;4mh${CSI}39;24m${CSI}K\r${CSI}8C${CSI}2D${CSI}36mch${CSI}39m\r${CSI}8C`,
				`${CSI}36me${CSI}39m\r${CSI}9C`
			]) {
				for (const chunk of fragmented ? reply : [reply]) {
					server(chunk);
					seen.push(view().text.slice(0, 9));
				}
			}
			const settled = view();
			input('\x7f');
			const backspace = view();
			server(`\b${CSI}K\r${CSI}8C${CSI}90meers ${CSI}39m\r${CSI}8C`);
			assert.deepStrictEqual({ before, flickered: seen.some(text => text !== '$ git che'), settled, backspace, final: view(), accuracy: addon.stats.accuracy, unwritten: fixture.unexpectedWrites() }, {
				before: '$ git che', flickered: false,
				settled: { text: '$ git che', cursorX: 9, overlay: false },
				backspace: { text: '$ git ch', cursorX: 8, overlay: true },
				final: { text: '$ git cheers', cursorX: 8, overlay: false }, accuracy: 1, unwritten: 0
			});
		});
	}

	test('fish captured colored command and mid-line backspace', () => {
		const { input, server, view, addon } = fixture;
		const replies = [
			`e\r${CSI}3C\b${CSI}31me${CSI}39m\r${CSI}3C${CSI}90mcho ${CSI}39m\r${CSI}3C`,
			`${CSI}31mc${CSI}90mho ${CSI}39m\r${CSI}4C`,
			`${CSI}31mh${CSI}90mo ${CSI}39m\r${CSI}5C`,
			`${CSI}31mo${CSI}90m ${CSI}39m\r${CSI}6C${CSI}4D${CSI}32mecho${CSI}90m ${CSI}39m\r${CSI}6C`,
			`${CSI}32m ${CSI}39m\r${CSI}7C\b \r${CSI}7C`,
			`h\r${CSI}8C\bh\r${CSI}8C`, `i\r${CSI}9C`
		];
		for (const [i, key] of [...'echo hi'].entries()) {
			input(key);
			server(replies[i]);
		}
		input(CSI + 'D');
		server(`\r${CSI}8C`);
		input('\x7f');
		const predicted = view();
		server(`\bi${CSI}K\r${CSI}7C`);
		assert.deepStrictEqual({ predicted, settled: view(), accuracy: addon.stats.accuracy }, {
			predicted: { text: '$ echo i', cursorX: 7, overlay: true },
			settled: { text: '$ echo i', cursorX: 7, overlay: false }, accuracy: 1
		});
	});

	for (const fragmented of [false, true]) {
		test(`PSReadLine burst repaints and CPR replies, fragmented=${fragmented}`, () => {
			const { input, server, view, addon } = fixture;
			server('PS> ');
			input('e');
			server(psReadLine('e', 1, 7));
			input('ch');
			const before = view();
			const prefixes: string[] = [];
			for (const reply of [psReadLine('ec', 2, 7), psReadLine('ech', 3, 7)]) {
				input(CSI + '1;');
				input('8R');
				input(CSI + '?1;2c');
				input('\x1b]10;rgb:ff/ff/ff\x1b\\\x1bP1$r0m\x1b\\');
				for (const chunk of fragmented ? reply : [reply]) {
					server(chunk);
					prefixes.push(view().text.slice(0, 9));
				}
			}
			input('\x7f');
			server(psReadLine('ec ', 2, 7));
			input('\x1bOD');
			server(`${CSI}6n${CSI}1;8H`);
			input('x');
			server(psReadLine('exc', 2, 7));
			assert.deepStrictEqual({ before, flickered: prefixes.some(text => text !== '$ PS> ech'), final: view(), accuracy: addon.stats.accuracy, unwritten: fixture.unexpectedWrites() }, {
				before: { text: '$ PS> ech', cursorX: 9, overlay: true }, flickered: false,
				final: { text: '$ PS> exc', cursorX: 8, overlay: false }, accuracy: 1, unwritten: 0
			});
		});
	}

	test('rejected input disappears without writes, including a settled unmatched repaint', () => {
		const { input, server, view, clock, addon } = fixture;
		input('a');
		server('a');
		input('b');
		server('\x07');
		const bell = view();
		clock.tick(501);
		const rejected = view();
		input('c');
		server(`${CSI}1;1H`);
		const grace = view().text;
		clock.tick(501);
		assert.deepStrictEqual({ bell, rejected, grace, final: view(), accuracy: addon.stats.accuracy, unwritten: fixture.unexpectedWrites() }, {
			bell: { text: '$ ab', cursorX: 4, overlay: true },
			rejected: { text: '$ a', cursorX: 3, overlay: false }, grace: '$ ac',
			final: { text: '$ a', cursorX: 0, overlay: false }, accuracy: 1 / 3, unwritten: 0
		});
	});

	for (const barrier of ['\r', '\t', '\x03', CSI + '3~', CSI + 'H', CSI + '1;5D']) {
		test(`barrier ${JSON.stringify(barrier)} keeps pending edits but blocks new ones`, () => {
			const { input, server, view } = fixture;
			input('a');
			server('a');
			input('b' + barrier + 'c');
			const before = view();
			server('b');
			input('d');
			const after = view();
			server('d');
			assert.deepStrictEqual([before, after, view()], [
				{ text: '$ ab', cursorX: 4, overlay: true },
				{ text: '$ abd', cursorX: 5, overlay: true },
				{ text: '$ abd', cursorX: 5, overlay: false }
			]);
		});
	}

	test('does not release a barrier while the output parser holds a fragmented CSI', () => {
		const { input, server, view } = fixture;
		input('a');
		server('a');
		input('b\r');
		server('b' + CSI);
		const repaint = view();
		input('c');
		const blocked = view();
		server('0m');
		input('d');
		const resumed = view();
		server('d');
		assert.deepStrictEqual([repaint, blocked, resumed, view()], [
			{ text: '$ ab', cursorX: 4, overlay: true },
			{ text: '$ ab', cursorX: 4, overlay: true },
			{ text: '$ abd', cursorX: 5, overlay: true },
			{ text: '$ abd', cursorX: 5, overlay: false }
		]);
	});

	test('alternate buffer, wide cells, margins and excluded titles do not predict', () => {
		const { input, server, view, clock, terminal, configure } = fixture;
		input('a');
		server('a');
		server(CSI + '?1049h');
		input('b');
		const alternate = view();
		server(CSI + '?1049l');
		server('\x1b]0;vim\x07');
		input('b');
		const excluded = view();
		server('\x1b]0;bash\x07');
		server(`界\r${CSI}3C`);
		input('b');
		const wide = view();
		server(`${CSI}K${CSI}1;60H`);
		input('b');
		const margin = view();
		configure(-1);
		server(`\r${CSI}3C`);
		input('b');
		clock.tick(501);
		assert.deepStrictEqual({ alternate, excluded, wide, margin, disabled: view(), unwritten: fixture.unexpectedWrites(), type: terminal.buffer.active.type }, {
			alternate: { text: '', cursorX: 3, overlay: false },
			excluded: { text: '$ a', cursorX: 3, overlay: false },
			wide: { text: '$ a界', cursorX: 3, overlay: false },
			margin: { text: '$ a', cursorX: 59, overlay: false },
			disabled: { text: '$ a', cursorX: 3, overlay: false }, unwritten: 0, type: 'normal'
		});
	});

	test('latency sampling enables hidden predictions after the existing threshold decision', () => {
		const { input, server, view, clock, configure } = fixture;
		configure(-1);
		configure(30);
		input('a');
		const cold = view();
		clock.tick(40);
		server('a');
		for (const char of 'bcdef') {
			input(char);
			clock.tick(40);
			server(char);
		}
		clock.tick(101);
		input('g');
		const enabled = view();
		configure(-1);
		assert.deepStrictEqual([cold, enabled, view()], [
			{ text: '$', cursorX: 2, overlay: false },
			{ text: '$ abcdefg', cursorX: 9, overlay: true },
			{ text: '$ abcdef', cursorX: 8, overlay: false }
		]);
	});

	test('normal-buffer insert and no-wrap modes still support drawing', () => {
		const { input, server, view } = fixture;
		input('a');
		server('a');
		server(`${CSI}4h${CSI}?7l`);
		input('b');
		const predicted = view();
		server('b');
		assert.deepStrictEqual([predicted, view()], [
			{ text: '$ ab', cursorX: 4, overlay: true },
			{ text: '$ ab', cursorX: 4, overlay: false }
		]);
	});

	test('markers survive scrollback trimming and row departure clears pending edits', () => {
		const { input, server, view, addon } = fixture;
		for (let i = 0; i < 30; i++) {
			server('\r\n$ ');
		}
		input('a');
		server('a');
		input('bc\r');
		server('bc\r\n$ ');
		input('password');
		assert.deepStrictEqual({ view: view(), accuracy: addon.stats.accuracy, unwritten: fixture.unexpectedWrites() }, {
			view: { text: '$', cursorX: 2, overlay: false }, accuracy: 1, unwritten: 0
		});
	});

	for (const shell of ['bash', 'fish', 'powershell'] as const) {
		for (const seed of [1, 7, 42, 1337, 65537, 12648430]) {
			test(`deterministic interleaved visible-and-settled oracle ${shell} seed ${seed}`, () => {
				const { input, server, view, terminal, control, clock, addon } = fixture;
				const random = Random.create(seed);
				const failures: string[] = [];
				const trace: string[] = [];
				let extraWrites = 0;
				let visibleCharacters = 0;
				let flickerChecks = 0;
				let positionChecks = 0;
				let ghostChecks = 0;
				let typedUnparsed = 0;
				let typedMidReply = 0;
				let delayedParses = 0;
				let round = 0;
				let step = 0;
				const record = (event: string) => {
					trace.push(`${clock.now}: ${event}`);
					if (trace.length > 12) {
						trace.shift();
					}
				};
				const fail = (message: string) => {
					if (failures.length < 5) {
						failures.push(`round=${round}, step=${step}: ${message}; trace=${trace.join(', ')}`);
					}
				};
				const write = (data: string, callback?: () => void) => {
					extraWrites++;
					terminal.write(data, callback);
				};

				for (round = 0; round < 3; round++) {
					if (round) {
						server(`\r${CSI}K$ `);
						addon.reset();
					}
					input('a');
					server(shell === 'fish' ? `a${CSI}90m-_-_-${CSI}39m\r${CSI}3C` : 'a');
					const characters: { char: string; echoed: boolean; shown: boolean }[] = [{ char: 'a', echoed: true, shown: false }];
					const states = ['$ a'];
					const replies: { data: string; offset: number }[] = [];
					const alphabet = [...'bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
					let cursor = 1;
					let unparsed = false;
					const inspect = () => {
						const displayed = view();
						const buffer = terminal.buffer.active;
						const authoritative = buffer.getLine(buffer.baseY + buffer.cursorY)!.translateToString(true);
						if (displayed.overlay) {
							positionChecks++;
							const prefix = displayed.text.padEnd(displayed.cursorX).slice(0, displayed.cursorX);
							// A barrier can retain an older edit state, but must never skip a typed character.
							if (!states.some(state => state.startsWith(prefix))) {
								fail(`wrong predicted position: ${JSON.stringify(displayed)}, typed=${JSON.stringify(states)}`);
							}
						}
						for (const character of characters) {
							// Characters are unique within a row and cannot collide with the suggestion text.
							character.echoed ||= authoritative.includes(character.char);
							if (character.echoed) {
								continue;
							}
							if (character.shown) {
								flickerChecks++;
								if (!displayed.text.includes(character.char)) {
									fail(`un-echoed ${character.char} disappeared: ${JSON.stringify(displayed)}`);
								}
							}
							if (displayed.overlay && displayed.text.includes(character.char) && !character.shown) {
								character.shown = true;
								visibleCharacters++;
							}
						}
					};
					const advance = (milliseconds = 1) => {
						let completed = 0;
						write('', () => completed++);
						control.write('', () => completed++);
						delayedParses += Number(milliseconds > 1);
						record(`parse +${milliseconds}`);
						clock.tick(milliseconds);
						if (completed !== 2) {
							assert.fail('xterm parser did not drain');
						}
						unparsed = false;
						inspect();
					};
					const deliver = (length?: number) => {
						const reply = replies[0];
						if (!reply) {
							return;
						}
						const remaining = reply.data.length - reply.offset;
						const size = length ?? random.nextIntRange(1, Math.min(24, remaining) + 1);
						const chunk = reply.data.slice(reply.offset, reply.offset + size);
						reply.offset += chunk.length;
						if (reply.offset === reply.data.length) {
							replies.shift();
						}
						record(`queue ${JSON.stringify(chunk)}`);
						// Consume xterm's synchronous first-write shortcut before queuing real output.
						write('');
						write(chunk);
						control.write(chunk);
						unparsed = true;
						inspect();
					};
					const type = (operation = 0) => {
						const before = view();
						const oldCursor = cursor;
						const oldText = characters.map(character => character.char).join('');
						let key: string;
						if (operation === 1 && cursor > 0) {
							key = '\x7f';
							characters.splice(--cursor, 1);
						} else if (operation === 2 && cursor > 0) {
							key = CSI + 'D';
							cursor--;
						} else if (operation === 3 && cursor < characters.length) {
							key = '\x1bOC';
							cursor++;
						} else {
							key = alphabet.splice(random.nextIntRange(0, alphabet.length), 1)[0];
							characters.splice(cursor++, 0, { char: key, echoed: false, shown: false });
						}
						const text = characters.map(character => character.char).join('');
						states.push('$ ' + text);
						typedUnparsed += Number(unparsed);
						typedMidReply += Number(!!replies[0]?.offset);
						record(`input ${JSON.stringify(key)}, unparsed=${unparsed}`);
						terminal.input(key, false);
						inspect();
						if (shell === 'fish' && (step === 0 || round === 2 && step === 1) && view().overlay) {
							ghostChecks++;
							const inputEnd = text.length + 2;
							if (view().text.slice(inputEnd) !== before.text.slice(inputEnd)) {
								fail(`shifted ghost suffix: before=${JSON.stringify(before)}, after=${JSON.stringify(view())}`);
							}
						}
						let reply: string;
						if (shell === 'powershell') {
							reply = psReadLine(text + ' '.repeat(Math.max(0, oldText.length - text.length)), cursor, 3);
						} else if (shell === 'fish') {
							reply = `\r${CSI}2C${CSI}32m${text}${CSI}39m${CSI}K${CSI}90m-_-_-${CSI}39m\r${CSI}${cursor + 2}C`;
						} else if (key === CSI + 'D') {
							reply = '\b';
						} else if (key === '\x1bOC') {
							reply = CSI + 'C';
						} else {
							const start = key === '\x7f' ? oldCursor - 1 : oldCursor;
							const tail = text.slice(start) + ' '.repeat(Math.max(0, oldText.length - text.length));
							reply = `${CSI}0m` + (key === '\x7f' ? '\b' : '') + tail + (tail.length + start > cursor ? `${CSI}${tail.length + start - cursor}D` : '');
						}
						replies.push({ data: reply, offset: 0 });
					};

					// Every seed exercises a predicted key, an unparsed-output key, then a later key.
					step = 0;
					type();
					if (round === 2) {
						step++;
						type();
						deliver(1);
						advance(random.nextIntRange(2, 10));
						step++;
						type();
					}
					deliver(replies[0].data.length);
					step++;
					type();
					advance(random.nextIntRange(2, 10));
					step++;
					type();
					const firstPartialStep = step + 1;
					for (step = firstPartialStep; step < 12; step++) {
						if (step === firstPartialStep) {
							deliver(1);
							advance();
						} else if (random.nextIntRange(0, 3) !== 0) {
							deliver();
							if (random.nextIntRange(0, 2) === 0) {
								advance();
							}
						}
						type(round === 1 ? random.nextIntRange(0, 5) : 0);
						if (random.nextIntRange(0, 3) === 0) {
							advance(random.nextIntRange(1, 10));
						}
						if (random.nextIntRange(0, 2) === 0) {
							deliver();
						}
					}
					while (replies.length) {
						deliver();
						if (random.nextIntRange(0, 4) !== 0) {
							advance(random.nextIntRange(0, 8) === 0 ? random.nextIntRange(2, 10) : 1);
						}
					}
					advance();
					const expectedControl = { text: ('$ ' + characters.map(character => character.char).join('') + (shell === 'fish' ? '-_-_-' : '')).trimEnd(), cursorX: cursor + 2 };
					const authoritative = composite(control);
					if (authoritative.text !== expectedControl.text || authoritative.cursorX !== expectedControl.cursorX) {
						fail(`shell/model mismatch: actual=${JSON.stringify(authoritative)}, expected=${JSON.stringify(expectedControl)}`);
					}
					if (view().overlay || JSON.stringify(snapshot(terminal)) !== JSON.stringify(snapshot(control)) || view().text !== composite(control).text) {
						fail(`unsettled: ${JSON.stringify(view())}`);
					}
				}
				assert.deepStrictEqual({ failures, checkedVisibility: visibleCharacters > 0 && flickerChecks > 0, checkedPositions: positionChecks > 0, ghostPreserved: shell !== 'fish' || ghostChecks >= 4, interleaved: typedUnparsed >= 3 && typedMidReply >= 3, delayed: delayedParses >= 3, sampled: addon.stats.sampleSize > 1, unwritten: fixture.unexpectedWrites() - extraWrites }, {
					failures: [], checkedVisibility: true, checkedPositions: true, ghostPreserved: true, interleaved: true, delayed: true, sampled: true, unwritten: 0
				});
			});
		}
	}
});

class TestOverlayTypeAheadAddon extends OverlayTypeAheadAddon {
	get row(): IPredictedRow | undefined {
		return this._predictedRow;
	}
}

function composite(terminal: Terminal, row?: IPredictedRow) {
	const buffer = terminal.buffer.active;
	const y = buffer.baseY + buffer.cursorY;
	const line = buffer.getLine(y)!;
	const chars = Array.from({ length: terminal.cols }, (_, x) => line.getCell(x)?.getChars() || ' ');
	if (row?.y === y) {
		for (const [i, cell] of row.cells.entries()) {
			chars[row.startX + i] = cell.kind === 'char' ? cell.char : cell.kind === 'copy' ? line.getCell(cell.x)?.getChars() || ' ' : ' ';
		}
	}
	return { text: chars.join('').trimEnd(), cursorX: row?.y === y ? row.cursorX : buffer.cursorX, overlay: !!row };
}

function snapshot(terminal: Terminal) {
	const buffer = terminal.buffer.active;
	return { cursorX: buffer.cursorX, cursorY: buffer.cursorY, baseY: buffer.baseY, lines: Array.from({ length: buffer.length }, (_, y) => buffer.getLine(y)!.translateToString(true)) };
}

function psReadLine(text: string, cursor: number, startingColumn: number): string {
	return `${CSI}6n${CSI}?25l${CSI}1;${startingColumn}H${CSI}0m${CSI}93m${text}${CSI}39;49m${CSI}0m${CSI}1;${startingColumn + cursor}H${CSI}?12l${CSI}?25h`;
}

function createFixture(store: DisposableStore, TerminalCtor: typeof import('@xterm/xterm').Terminal) {
	const terminal = store.add(new TerminalCtor({ allowProposedApi: true, cols: 60, rows: 3, scrollback: 5 }));
	const control = store.add(new TerminalCtor({ allowProposedApi: true, cols: 60, rows: 3, scrollback: 5 }));
	const onBeforeProcessData = store.add(new Emitter<IBeforeProcessDataEvent>());
	const config: ITerminalTypeAheadConfiguration = { localEchoOverlay: true, localEchoEnabled: 'on', localEchoStyle: 'dim', localEchoLatencyThreshold: 0, localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE };
	const configuration = new TestConfigurationService({ terminal: { integrated: config } });
	store.add(configuration.onDidChangeConfigurationEmitter);
	const addon = store.add(new TestOverlayTypeAheadAddon(
		{ onBeforeProcessData: onBeforeProcessData.event } as ITerminalProcessManager,
		configuration,
		{ publicLog: () => { } } as Partial<ITelemetryService> as ITelemetryService
	));
	addon.activate(terminal);
	const clock = useFakeTimers({ now: 0, toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
	store.add(toDisposable(() => clock.restore()));
	const writes = spy(terminal, 'write');
	let expectedWrites = 0;
	let rewritten = false;
	const parse = () => {
		let completed = 0;
		expectedWrites++;
		terminal.write('', () => completed++);
		control.write('', () => completed++);
		clock.tick(1);
		if (completed !== 2) {
			assert.fail('xterm parser did not drain');
		}
	};
	return {
		terminal, control, addon, clock, configuration,
		configure: (threshold: number) => {
			config.localEchoLatencyThreshold = threshold;
			configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set(), source: ConfigurationTarget.USER, change: { keys: [], overrides: [] } });
		},
		input: (data: string) => terminal.input(data, true),
		server: (data: string) => {
			const event = { data };
			onBeforeProcessData.fire(event);
			rewritten ||= event.data !== data;
			expectedWrites++;
			terminal.write(event.data);
			control.write(data);
			parse();
		},
		view: () => composite(terminal, addon.row),
		unexpectedWrites: () => writes.callCount - expectedWrites + Number(rewritten),
		dispose: () => store.dispose()
	};
}
