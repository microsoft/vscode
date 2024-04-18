/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { NullLogService } from 'vs/platform/log/common/log';
import { PromptInputModel } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';
import { Emitter } from 'vs/base/common/event';
import type { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';

// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { Terminal } from '@xterm/headless';
import { strictEqual } from 'assert';

class TestPromptInputModel extends PromptInputModel {
	forceSync() {
		this._syncNow();
	}
}

suite('PromptInputModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let promptInputModel: TestPromptInputModel;
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

	function assertPromptInput(valueWithCursor: string) {
		if (!valueWithCursor.includes('|')) {
			throw new Error('assertPromptInput must contain | character');
		}

		promptInputModel.forceSync();

		const actualValueWithCursor = promptInputModel.value.substring(0, promptInputModel.cursorIndex) + '|' + promptInputModel.value.substring(promptInputModel.cursorIndex);
		strictEqual(
			actualValueWithCursor.replaceAll('\n', '\u23CE'),
			valueWithCursor.replaceAll('\n', '\u23CE')
		);

		// This is required to ensure the cursor index is correctly resolved for non-ascii characters
		const value = valueWithCursor.replace('|', '');
		const cursorIndex = valueWithCursor.indexOf('|');
		strictEqual(promptInputModel.value, value);
		strictEqual(promptInputModel.cursorIndex, cursorIndex, `value=${promptInputModel.value}`);
	}

	setup(() => {
		xterm = store.add(new Terminal({ allowProposedApi: true }));
		onCommandStart = store.add(new Emitter());
		onCommandExecuted = store.add(new Emitter());
		promptInputModel = store.add(new TestPromptInputModel(xterm, onCommandStart.event, onCommandExecuted.event, new NullLogService));
	});

	test('basic input and execute', async () => {
		await writePromise('$ ');
		fireCommandStart();
		assertPromptInput('|');

		await writePromise('foo bar');
		assertPromptInput('foo bar|');

		await writePromise('\r\n');
		fireCommandExecuted();
		assertPromptInput('foo bar|');

		await writePromise('(command output)\r\n$ ');
		fireCommandStart();
		assertPromptInput('|');
	});

	test('cursor navigation', async () => {
		await writePromise('$ ');
		fireCommandStart();
		assertPromptInput('|');

		await writePromise('foo bar');
		assertPromptInput('foo bar|');

		await writePromise('\x1b[3D');
		assertPromptInput('foo |bar');

		await writePromise('\x1b[4D');
		assertPromptInput('|foo bar');

		await writePromise('\x1b[3C');
		assertPromptInput('foo| bar');

		await writePromise('\x1b[4C');
		assertPromptInput('foo bar|');

		await writePromise('\x1b[D');
		assertPromptInput('foo ba|r');

		await writePromise('\x1b[C');
		assertPromptInput('foo bar|');
	});

	test('wide input (Korean)', async () => {
		await writePromise('$ ');
		fireCommandStart();
		assertPromptInput('|');

		await writePromise('안영');
		assertPromptInput('안영|');

		await writePromise('\r\n컴퓨터');
		assertPromptInput('안영\n컴퓨터|');

		await writePromise('\r\n사람');
		assertPromptInput('안영\n컴퓨터\n사람|');

		await writePromise('\x1b[G');
		assertPromptInput('안영\n컴퓨터\n|사람');

		await writePromise('\x1b[A');
		assertPromptInput('안영\n|컴퓨터\n사람');

		await writePromise('\x1b[4C');
		assertPromptInput('안영\n컴퓨|터\n사람');

		await writePromise('\x1b[1;4H');
		assertPromptInput('안|영\n컴퓨터\n사람');

		await writePromise('\x1b[D');
		assertPromptInput('|안영\n컴퓨터\n사람');
	});

	test('emoji input', async () => {
		await writePromise('$ ');
		fireCommandStart();
		assertPromptInput('|');

		await writePromise('✌️👍');
		assertPromptInput('✌️👍|');

		await writePromise('\r\n😎😕😅');
		assertPromptInput('✌️👍\n😎😕😅|');

		await writePromise('\r\n🤔🤷😩');
		assertPromptInput('✌️👍\n😎😕😅\n🤔🤷😩|');

		await writePromise('\x1b[G');
		assertPromptInput('✌️👍\n😎😕😅\n|🤔🤷😩');

		await writePromise('\x1b[A');
		assertPromptInput('✌️👍\n|😎😕😅\n🤔🤷😩');

		await writePromise('\x1b[2C');
		assertPromptInput('✌️👍\n😎😕|😅\n🤔🤷😩');

		await writePromise('\x1b[1;4H');
		assertPromptInput('✌️|👍\n😎😕😅\n🤔🤷😩');

		await writePromise('\x1b[D');
		assertPromptInput('|✌️👍\n😎😕😅\n🤔🤷😩');
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
				assertPromptInput('|');

				await replayEvents([
					'[?25l[93mf[97m[2m[3makecommand[3;4H[?25h',
					'[m',
					'[93mfo[9X',
					'[m',
					'[?25l[93m[3;3Hfoo[?25h',
					'[m',
				]);
				assertPromptInput('foo|');
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
				assertPromptInput('|');

				await replayEvents([
					'[?25l[93me[97m[2m[3mcho "hello world"[3;4H[?25h',
					'[m',
				]);
				assertPromptInput('e|cho "hello world"');

				await replayEvents([
					'[?25l[93mec[97m[2m[3mho "hello world"[3;5H[?25h',
					'[m',
				]);
				assertPromptInput('ec|ho "hello world"');

				await replayEvents([
					'[?25l[93m[3;3Hech[97m[2m[3mo "hello world"[3;6H[?25h',
					'[m',
				]);
				assertPromptInput('ech|o "hello world"');

				await replayEvents([
					'[?25l[93m[3;3Hecho[97m[2m[3m "hello world"[3;7H[?25h',
					'[m',
				]);
				assertPromptInput('echo| "hello world"');

				await replayEvents([
					'[?25l[93m[3;3Hecho [97m[2m[3m"hello world"[3;8H[?25h',
					'[m',
				]);
				assertPromptInput('echo |"hello world"');

				await replayEvents([
					'[?25l[93m[3;3Hecho [36m"hello world"[?25h',
					'[m',
				]);
				assertPromptInput('echo "hello world"|');

				await replayEvents([
					']633;E;echo "hello world";ff464d39-bc80-4bae-9ead-b1cafc4adf6f]633;C',
				]);
				fireCommandExecuted();
				assertPromptInput('echo "hello world"|');

				await replayEvents([
					'\r\n',
					'hello world\r\n',
				]);
				assertPromptInput('echo "hello world"|');

				await replayEvents([
					']633;D;0]633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
					'[34m\r\n[38;2;17;17;17m[44m03:41:42 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
				]);
				fireCommandStart();
				assertPromptInput('|');
			});
		});
	});
});
