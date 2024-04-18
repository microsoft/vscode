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

suite.only('PromptInputModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let promptInputModel: TestPromptInputModel;
	let xterm: Terminal;
	let onCommandStart: Emitter<ITerminalCommand>;
	let onCommandExecuted: Emitter<ITerminalCommand>;

	setup(() => {
		xterm = new Terminal({ allowProposedApi: true });
		onCommandStart = new Emitter();
		onCommandExecuted = new Emitter();
		promptInputModel = store.add(new TestPromptInputModel(xterm, onCommandStart.event, onCommandExecuted.event, new NullLogService));
	});

	suite('recorded sessions', () => {
		async function replayEvents(events: string[]) {
			for (const e of events) {
				await new Promise<void>(r => xterm.write(e, r));
			}
		}

		function assertPromptInput(valueWithCursor: string) {
			if (!valueWithCursor.includes('|')) {
				throw new Error('assertPromptInput must contain | character');
			}
			const actualValueWithCursor = promptInputModel.value.substring(0, promptInputModel.cursorIndex) + '|' + promptInputModel.value.substring(promptInputModel.cursorIndex);
			strictEqual(
				actualValueWithCursor.replaceAll('\n', '\u23CE'),
				valueWithCursor.replaceAll('\n', '\u23CE')
			);

			// This shouldn't be needed but include as a sanity check
			const value = valueWithCursor.replace('|', '');
			const cursorIndex = valueWithCursor.indexOf('|');
			strictEqual(promptInputModel.value, value);
			strictEqual(promptInputModel.cursorIndex, cursorIndex,);
		}

		suite('Windows, pwsh 7.4.2, starship prompt', () => {
			test('input with ignored ghost text', async () => {
				await replayEvents([
					'[?25l[2J[m[H]0;C:\Program Files\WindowsApps\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\pwsh.exe[?25h',
					'[?25l[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K\n\r[K[H[?25h',
					']633;P;IsWindows=True',
					']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
					']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
					'[34m\n\r[38;2;17;17;17m[44m03:13:47 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$⇡ [36m[49m [mvia [32m[1m v18.18.2 \n\r❯[m ',
				]);
				onCommandStart.fire({ marker: xterm.registerMarker() } as ITerminalCommand);
				promptInputModel.forceSync();
				assertPromptInput('|');

				await replayEvents([
					'[?25l[93mf[97m[2m[3makecommand[3;4H[?25h',
					'[m',
					'[93mfo[9X',
					'[m',
					'[?25l[93m[3;3Hfoo[?25h',
					'[m',
				]);
				promptInputModel.forceSync();
				assertPromptInput('foo|');
			});
		});
	});
});
