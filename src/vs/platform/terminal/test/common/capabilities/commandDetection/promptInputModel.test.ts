/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { Terminal } from '@xterm/headless';

import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { NullLogService } from 'vs/platform/log/common/log';
import { PromptInputModel, type IPromptInputModelState } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';
import { Emitter } from 'vs/base/common/event';
import type { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { notDeepStrictEqual, strictEqual } from 'assert';
import { timeout } from 'vs/base/common/async';

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

	setup(() => {
		xterm = store.add(new Terminal({ allowProposedApi: true }));
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
