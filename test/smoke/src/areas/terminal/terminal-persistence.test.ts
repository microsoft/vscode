/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { Application, Terminal, TerminalCommandId, TerminalCommandIdWithValue, SettingsEditor } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal Persistence', () => {
		// Acquire automation API
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;

		before(async function () {
			const app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app, [
				// Use ${process} for terminal title to ensure stable names for detach/attach
				['terminal.integrated.tabs.title', '"${process}"']
			]);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		describe('streaming output replay', () => {
			for (const reconnect of ['window reload', 'detach/attach'] as const) {
				it(`restores streaming output exactly once and in order after ${reconnect}`, async function () {
					this.timeout(60000);
					const app = this.app as Application;
					if (app.remote || app.web) {
						this.skip();
					}

					const count = 100;
					const readSequence = (buffer: string[]) => buffer.flatMap(line => {
						const match = /^PTY_REPLAY_SEQ:(?<sequence>\d+)$/.exec(line.trim());
						return match?.groups ? [Number(match.groups.sequence)] : [];
					});
					await terminal.runCommand(TerminalCommandId.KillAll);
					try {
						await terminal.createTerminal();
						await terminal.runCommandInTerminal(`node -e "let n=0;const t=setInterval(()=>{console.log('PTY_REPLAY_SEQ:'+n++);if(n===${count})clearInterval(t)},100)"`);
						let before: number[] = [];
						await terminal.waitForTerminalText(buffer => {
							before = readSequence(buffer);
							// Exercise an established terminal, after the debounced initial layout save.
							return before.length >= 10;
						});
						const lastBefore = before.at(-1);
						ok(lastBefore !== undefined && lastBefore < count - 1, 'The producer must still be running before disconnect');

						if (reconnect === 'window reload') {
							await app.code.reloadWindow(() => app.workbench.quickaccess.runCommand('workbench.action.reloadWindow'));
						} else {
							const name = (await terminal.getTerminalGroups())[0][0].name;
							ok(name);
							await terminal.runCommand(TerminalCommandId.DetachSession);
							await terminal.assertTerminalViewHidden();
							// Let the rate-limited producer write while no renderer is attached.
							await app.code.wait(250);
							await terminal.runCommandWithValue(TerminalCommandIdWithValue.AttachToSession, name);
						}

						let received: number[] = [];
						await terminal.waitForTerminalText(buffer => {
							received = readSequence(buffer);
							return received.includes(count - 1);
						});
						deepStrictEqual(received, Array.from({ length: count }, (_, i) => i));
					} finally {
						await terminal.runCommand(TerminalCommandId.KillAll);
					}
				});
			}
		});

		describe('detach/attach', () => {
			// https://github.com/microsoft/vscode/issues/137799
			it('should support basic reconnection', async () => {
				await terminal.createTerminal();
				// TODO: Handle passing in an actual regex, not string
				await terminal.assertTerminalGroups([
					[{ name: '.*' }]
				]);

				// Get the terminal name
				await terminal.assertTerminalGroups([
					[{ name: '.*' }]
				]);
				const name = (await terminal.getTerminalGroups())[0][0].name!;

				// Detach
				await terminal.runCommand(TerminalCommandId.DetachSession);
				await terminal.assertTerminalViewHidden();

				// Attach
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.AttachToSession, name);
				await terminal.assertTerminalGroups([
					[{ name }]
				]);
			});

			it.skip('should persist buffer content', async () => {
				await terminal.createTerminal();
				// TODO: Handle passing in an actual regex, not string
				await terminal.assertTerminalGroups([
					[{ name: '.*' }]
				]);

				// Get the terminal name
				await terminal.assertTerminalGroups([
					[{ name: '.*' }]
				]);
				const name = (await terminal.getTerminalGroups())[0][0].name!;

				// Write in terminal
				await terminal.runCommandInTerminal('echo terminal_test_content');
				await terminal.waitForTerminalText(buffer => buffer.some(e => e.includes('terminal_test_content')));

				// Detach
				await terminal.runCommand(TerminalCommandId.DetachSession);
				await terminal.assertTerminalViewHidden();

				// Attach
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.AttachToSession, name);
				await terminal.assertTerminalGroups([
					[{ name }]
				]);
				// There can be line wrapping, so remove newlines and carriage returns #216464
				await terminal.waitForTerminalText(buffer => buffer.some(e => e.replaceAll(/[\r\n]/g, '').includes('terminal_test_content')));
			});
		});
	});
}
