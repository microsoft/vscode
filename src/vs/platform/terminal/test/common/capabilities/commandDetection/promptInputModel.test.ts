/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-import-patterns */

import type { Terminal } from '@xterm/xterm';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../log/common/log.js';
import { PromptInputModel, type IPromptInputModelState } from '../../../../common/capabilities/commandDetection/promptInputModel.js';
import { Emitter } from '../../../../../../base/common/event.js';
import type { ITerminalCommand } from '../../../../common/capabilities/capabilities.js';
import { notDeepStrictEqual, strictEqual } from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';

suite('PromptInputModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let promptInputModel: PromptInputModel;
	let xterm: Terminal;
	let onCommandStart: Emitter<ITerminalCommand>;
	let onCommandExecuted: Emitter<ITerminalCommand>;

	async function writePromise(data: string) {
		await new Promise<void>(r => xterm.write(data, r));
	}

	function fireCommandStart() {
		onCommandStart.fire({ marker: xterm.registerMarker() } as ITerminalCommand);
	}

	function fireCommandExecuted() {
		onCommandExecuted.fire(null!);
	}

	function setContinuationPrompt(prompt: string) {
		promptInputModel.setContinuationPrompt(prompt);
	}

	async function assertPromptInput(valueWithCursor: string) {
		await timeout(0);

		if (promptInputModel.cursorIndex !== -1 && !valueWithCursor.includes('|')) {
			throw new Error('assertPromptInput must contain | character');
		}

		const actualValueWithCursor = promptInputModel.getCombinedString();
		strictEqual(
			actualValueWithCursor,
			valueWithCursor.replaceAll('\n', '\u23CE')
		);

		// This is required to ensure the cursor index is correctly resolved for non-ascii characters
		const value = valueWithCursor.replace(/[\|\[\]]/g, '');
		const cursorIndex = valueWithCursor.indexOf('|');
		strictEqual(promptInputModel.value, value);
		strictEqual(promptInputModel.cursorIndex, cursorIndex, `value=${promptInputModel.value}`);
	}

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true }));
		onCommandStart = store.add(new Emitter());
		onCommandExecuted = store.add(new Emitter());
		promptInputModel = store.add(new PromptInputModel(xterm, onCommandStart.event, onCommandExecuted.event, new NullLogService));
	});

	test('basic input and execute', async () => {
		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('foo bar');
		await assertPromptInput('foo bar|');

		await writePromise('\r\n');
		fireCommandExecuted();
		await assertPromptInput('foo bar');

		await writePromise('(command output)\r\n$ ');
		fireCommandStart();
		await assertPromptInput('|');
	});

	test('should not fire onDidChangeInput events when nothing changes', async () => {
		const events: IPromptInputModelState[] = [];
		store.add(promptInputModel.onDidChangeInput(e => events.push(e)));

		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('foo');
		await assertPromptInput('foo|');

		await writePromise(' bar');
		await assertPromptInput('foo bar|');

		await writePromise('\r\n');
		fireCommandExecuted();
		await assertPromptInput('foo bar');

		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('foo bar');
		await assertPromptInput('foo bar|');

		for (let i = 0; i < events.length - 1; i++) {
			notDeepStrictEqual(events[i], events[i + 1], 'not adjacent events should fire with the same value');
		}
	});

	test('should fire onDidInterrupt followed by onDidFinish when ctrl+c is pressed', async () => {
		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('foo');
		await assertPromptInput('foo|');

		await new Promise<void>(r => {
			store.add(promptInputModel.onDidInterrupt(() => {
				// Fire onDidFinishInput immediately after onDidInterrupt
				store.add(promptInputModel.onDidFinishInput(() => {
					r();
				}));
			}));
			xterm.input('\x03');
			writePromise('^C').then(() => fireCommandExecuted());
		});
	});

	test('cursor navigation', async () => {
		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('foo bar');
		await assertPromptInput('foo bar|');

		await writePromise('\x1b[3D');
		await assertPromptInput('foo |bar');

		await writePromise('\x1b[4D');
		await assertPromptInput('|foo bar');

		await writePromise('\x1b[3C');
		await assertPromptInput('foo| bar');

		await writePromise('\x1b[4C');
		await assertPromptInput('foo bar|');

		await writePromise('\x1b[D');
		await assertPromptInput('foo ba|r');

		await writePromise('\x1b[C');
		await assertPromptInput('foo bar|');
	});

	test('ghost text', async () => {
		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('foo\x1b[2m bar\x1b[0m\x1b[4D');
		await assertPromptInput('foo|[ bar]');

		await writePromise('\x1b[2D');
		await assertPromptInput('f|oo[ bar]');
	});

	test('wide input (Korean)', async () => {
		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('안영');
		await assertPromptInput('안영|');

		await writePromise('\r\n컴퓨터');
		await assertPromptInput('안영\n컴퓨터|');

		await writePromise('\r\n사람');
		await assertPromptInput('안영\n컴퓨터\n사람|');

		await writePromise('\x1b[G');
		await assertPromptInput('안영\n컴퓨터\n|사람');

		await writePromise('\x1b[A');
		await assertPromptInput('안영\n|컴퓨터\n사람');

		await writePromise('\x1b[4C');
		await assertPromptInput('안영\n컴퓨|터\n사람');

		await writePromise('\x1b[1;4H');
		await assertPromptInput('안|영\n컴퓨터\n사람');

		await writePromise('\x1b[D');
		await assertPromptInput('|안영\n컴퓨터\n사람');
	});

	test('emoji input', async () => {
		await writePromise('$ ');
		fireCommandStart();
		await assertPromptInput('|');

		await writePromise('✌️👍');
		await assertPromptInput('✌️👍|');

		await writePromise('\r\n😎😕😅');
		await assertPromptInput('✌️👍\n😎😕😅|');

		await writePromise('\r\n🤔🤷😩');
		await assertPromptInput('✌️👍\n😎😕😅\n🤔🤷😩|');

		await writePromise('\x1b[G');
		await assertPromptInput('✌️👍\n😎😕😅\n|🤔🤷😩');

		await writePromise('\x1b[A');
		await assertPromptInput('✌️👍\n|😎😕😅\n🤔🤷😩');

		await writePromise('\x1b[2C');
		await assertPromptInput('✌️👍\n😎😕|😅\n🤔🤷😩');

		await writePromise('\x1b[1;4H');
		await assertPromptInput('✌️|👍\n😎😕😅\n🤔🤷😩');

		await writePromise('\x1b[D');
		await assertPromptInput('|✌️👍\n😎😕😅\n🤔🤷😩');
	});

	suite('trailing whitespace', () => {
		test('delete whitespace with backspace', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise(' ');
			await assertPromptInput(` |`);

			xterm.input('\x7F', true); // Backspace
			await writePromise('\x1b[D');
			await assertPromptInput('|');

			xterm.input(' '.repeat(4), true);
			await writePromise(' '.repeat(4));
			await assertPromptInput(`    |`);

			xterm.input('\x1b[D'.repeat(2), true); // Left
			await writePromise('\x1b[2D');
			await assertPromptInput(`  |  `);

			xterm.input('\x7F', true); // Backspace
			await writePromise('\x1b[D');
			await assertPromptInput(` |  `);

			xterm.input('\x7F', true); // Backspace
			await writePromise('\x1b[D');
			await assertPromptInput(`|  `);

			xterm.input(' ', true);
			await writePromise(' ');
			await assertPromptInput(` |  `);

			xterm.input(' ', true);
			await writePromise(' ');
			await assertPromptInput(`  |  `);

			xterm.input('\x1b[C', true); // Right
			await writePromise('\x1b[C');
			await assertPromptInput(`   | `);

			xterm.input('a', true);
			await writePromise('a');
			await assertPromptInput(`   a| `);

			xterm.input('\x7F', true); // Backspace
			await writePromise('\x1b[D\x1b[K');
			await assertPromptInput(`   | `);

			xterm.input('\x1b[D'.repeat(2), true); // Left
			await writePromise('\x1b[2D');
			await assertPromptInput(` |   `);

			xterm.input('\x1b[3~', true); // Delete
			await writePromise('');
			await assertPromptInput(` |  `);
		});

		// TODO: This doesn't work correctly but it doesn't matter too much as it only happens when
		// there is a lot of whitespace at the end of a prompt input
		test.skip('track whitespace when ConPTY deletes whitespace unexpectedly', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			xterm.input('ls', true);
			await writePromise('ls');
			await assertPromptInput(`ls|`);

			xterm.input(' '.repeat(4), true);
			await writePromise(' '.repeat(4));
			await assertPromptInput(`ls    |`);

			xterm.input(' ', true);
			await writePromise('\x1b[4D\x1b[5X\x1b[5C'); // Cursor left x(N-1), delete xN, cursor right xN
			await assertPromptInput(`ls     |`);
		});

		test('track whitespace beyond cursor', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise(' '.repeat(8));
			await assertPromptInput(`${' '.repeat(8)}|`);

			await writePromise('\x1b[4D');
			await assertPromptInput(`${' '.repeat(4)}|${' '.repeat(4)}`);
		});
	});

	suite('multi-line', () => {
		test('basic 2 line', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise('echo "a');
			await assertPromptInput(`echo "a|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "a\n|`);

			await writePromise('b');
			await assertPromptInput(`echo "a\nb|`);
		});

		test('basic 3 line', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise('echo "a');
			await assertPromptInput(`echo "a|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "a\n|`);

			await writePromise('b');
			await assertPromptInput(`echo "a\nb|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "a\nb\n|`);

			await writePromise('c');
			await assertPromptInput(`echo "a\nb\nc|`);
		});

		test('navigate left in multi-line', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise('echo "a');
			await assertPromptInput(`echo "a|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "a\n|`);

			await writePromise('b');
			await assertPromptInput(`echo "a\nb|`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "a\n|b`);

			await writePromise('\x1b[@c');
			await assertPromptInput(`echo "a\nc|b`);

			await writePromise('\x1b[K\n\r\∙ ');
			await assertPromptInput(`echo "a\nc\n|`);

			await writePromise('b');
			await assertPromptInput(`echo "a\nc\nb|`);

			await writePromise(' foo');
			await assertPromptInput(`echo "a\nc\nb foo|`);

			await writePromise('\x1b[3D');
			await assertPromptInput(`echo "a\nc\nb |foo`);
		});

		test('navigate up in multi-line', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise('echo "foo');
			await assertPromptInput(`echo "foo|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "foo\n|`);

			await writePromise('bar');
			await assertPromptInput(`echo "foo\nbar|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "foo\nbar\n|`);

			await writePromise('baz');
			await assertPromptInput(`echo "foo\nbar\nbaz|`);

			await writePromise('\x1b[A');
			await assertPromptInput(`echo "foo\nbar|\nbaz`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "foo\nba|r\nbaz`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "foo\nb|ar\nbaz`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "foo\n|bar\nbaz`);

			await writePromise('\x1b[1;9H');
			await assertPromptInput(`echo "|foo\nbar\nbaz`);

			await writePromise('\x1b[C');
			await assertPromptInput(`echo "f|oo\nbar\nbaz`);

			await writePromise('\x1b[C');
			await assertPromptInput(`echo "fo|o\nbar\nbaz`);

			await writePromise('\x1b[C');
			await assertPromptInput(`echo "foo|\nbar\nbaz`);
		});

		test('navigating up when first line contains invalid/stale trailing whitespace', async () => {
			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise('echo "foo      \x1b[6D');
			await assertPromptInput(`echo "foo|`);

			await writePromise('\n\r\∙ ');
			setContinuationPrompt('∙ ');
			await assertPromptInput(`echo "foo\n|`);

			await writePromise('bar');
			await assertPromptInput(`echo "foo\nbar|`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "foo\nba|r`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "foo\nb|ar`);

			await writePromise('\x1b[D');
			await assertPromptInput(`echo "foo\n|bar`);
		});
	});

	suite('wrapped line (non-continuation)', () => {
		test('basic wrapped line', async () => {
			xterm.resize(5, 10);

			await writePromise('$ ');
			fireCommandStart();
			await assertPromptInput('|');

			await writePromise('ech');
			await assertPromptInput(`ech|`);

			await writePromise('o ');
			await assertPromptInput(`echo |`);

			await writePromise('"a"');
			// HACK: Trailing whitespace is due to flaky detection in wrapped lines (but it doesn't matter much)
			await assertPromptInput(`echo "a"| `);
		});
	});

	// To "record a session" for these tests:
	// - Enable debug logging
	// - Open and clear Terminal output channel
	// - Open terminal and perform the test
	// - Extract all "parsing data" lines from the terminal
	suite('recorded sessions', () => {
		async function replayEvents(events: string[]) {
			for (const data of events) {
				await writePromise(data);
			}
		}

		suite('Windows 11 (10.0.22621.3447), pwsh 7.4.2, starship prompt 1.10.2', () => {
			test('input with ignored ghost text', async () => {
				await replayEvents([
					'[?25l[2J[m[H]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe[?25h',
					'[?25l[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K[H[?25h',
					']633;P;IsWindows=True',
					']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
					']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
					'[34m\r\n[38;2;17;17;17m[44m03:13:47 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$⇡ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
				]);
				fireCommandStart();
				await assertPromptInput('|');

				await replayEvents([
					'[?25l[93mf[97m[2m[3makecommand[3;4H[?25h',
					'[m',
					'[93mfo[9X',
					'[m',
					'[?25l[93m[3;3Hfoo[?25h',
					'[m',
				]);
				await assertPromptInput('foo|');
			});
			test('input with accepted and run ghost text', async () => {
				await replayEvents([
					'[?25l[2J[m[H]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe[?25h',
					'[?25l[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K[H[?25h',
					']633;P;IsWindows=True',
					']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
					']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
					'[34m\r\n[38;2;17;17;17m[44m03:41:36 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
				]);
				promptInputModel.setContinuationPrompt('∙ ');
				fireCommandStart();
				await assertPromptInput('|');

				await replayEvents([
					'[?25l[93me[97m[2m[3mcho "hello world"[3;4H[?25h',
					'[m',
				]);
				await assertPromptInput('e|[cho "hello world"]');

				await replayEvents([
					'[?25l[93mec[97m[2m[3mho "hello world"[3;5H[?25h',
					'[m',
				]);
				await assertPromptInput('ec|[ho "hello world"]');

				await replayEvents([
					'[?25l[93m[3;3Hech[97m[2m[3mo "hello world"[3;6H[?25h',
					'[m',
				]);
				await assertPromptInput('ech|[o "hello world"]');

				await replayEvents([
					'[?25l[93m[3;3Hecho[97m[2m[3m "hello world"[3;7H[?25h',
					'[m',
				]);
				await assertPromptInput('echo|[ "hello world"]');

				await replayEvents([
					'[?25l[93m[3;3Hecho [97m[2m[3m"hello world"[3;8H[?25h',
					'[m',
				]);
				await assertPromptInput('echo |["hello world"]');

				await replayEvents([
					'[?25l[93m[3;3Hecho [36m"hello world"[?25h',
					'[m',
				]);
				await assertPromptInput('echo "hello world"|');

				await replayEvents([
					']633;E;echo "hello world";ff464d39-bc80-4bae-9ead-b1cafc4adf6f]633;C',
				]);
				fireCommandExecuted();
				await assertPromptInput('echo "hello world"');

				await replayEvents([
					'\r\n',
					'hello world\r\n',
				]);
				await assertPromptInput('echo "hello world"');

				await replayEvents([
					']633;D;0]633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
					'[34m\r\n[38;2;17;17;17m[44m03:41:42 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
				]);
				fireCommandStart();
				await assertPromptInput('|');
			});

			test('input, go to start (ctrl+home), delete word in front (ctrl+delete)', async () => {
				await replayEvents([
					'[?25l[2J[m[H]0;C:\Program Files\WindowsApps\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\pwsh.exe[?25h',
					'[?25l[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K[H[?25h',
					']633;P;IsWindows=True',
					']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
					']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
					'[34m\r\n[38;2;17;17;17m[44m16:07:06 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/210662 [33m[46m [38;2;17;17;17m$! [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
				]);
				fireCommandStart();
				await assertPromptInput('|');

				await replayEvents([
					'[?25l[93mG[97m[2m[3mit push[3;4H[?25h',
					'[m',
					'[?25l[93mGe[97m[2m[3mt-ChildItem -Path a[3;5H[?25h',
					'[m',
					'[?25l[93m[3;3HGet[97m[2m[3m-ChildItem -Path a[3;6H[?25h',
				]);
				await assertPromptInput('Get|[-ChildItem -Path a]');

				await replayEvents([
					'[m',
					'[?25l[3;3H[?25h',
					'[21X',
				]);

				// Don't force a sync, the prompt input model should update by itself
				await timeout(0);
				const actualValueWithCursor = promptInputModel.getCombinedString();
				strictEqual(
					actualValueWithCursor,
					'|'.replaceAll('\n', '\u23CE')
				);
			});
		});
	});
});
