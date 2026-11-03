/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Terminal, TerminalCommandId, TerminalCommandIdWithValue, SettingsEditor } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal Tabs', () => {
		// Acquire automation API
		let app: Application;
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;

		before(async function () {
			app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		it('clicking the plus button should create a terminal and display the tabs view showing no split decorations', async () => {
			await terminal.createTerminal();
			await terminal.clickPlusButton();
			await terminal.assertTerminalGroups([[{}], [{}]]);
		});

		it('should rename the single tab', async () => {
			await terminal.createTerminal();
			const name = 'my terminal name';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
			await terminal.assertSingleTab({ name });
		});

		// DEBT: Flaky https://github.com/microsoft/vscode/issues/216564
		it.skip('should reset the tab name to the default value when no name is provided', async () => {
			await terminal.createTerminal();
			const defaultName = await terminal.getSingleTabName();
			const name = 'my terminal name';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
			await terminal.assertSingleTab({ name });
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, undefined);
			await terminal.assertSingleTab({ name: defaultName });
		});

		it('should rename the tab in the tabs list', async () => {
			await terminal.createTerminal();
			await terminal.runCommand(TerminalCommandId.Split);
			const name = 'my terminal name';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
			await terminal.assertTerminalGroups([[{}, { name }]]);
		});

		it('should create a split terminal when single tab is alt clicked', async () => {
			await terminal.createTerminal();
			const page = await terminal.getPage();
			page.keyboard.down('Alt');
			await terminal.clickSingleTab();
			page.keyboard.up('Alt');
			await terminal.assertTerminalGroups([[{}, {}]]);
		});

		it('should do nothing when join tabs is run with only one terminal', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Join);
			await terminal.assertTerminalGroups([[{}]]);
		});

		it('should do nothing when join tabs is run with only split terminals', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			await terminal.runCommand(TerminalCommandId.Join);
			await terminal.assertTerminalGroups([[{}], [{}]]);
		});

		it('should join tabs when more than one non-split terminal', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.createTerminal();
			await terminal.runCommand(TerminalCommandId.Join);
			await terminal.assertTerminalGroups([[{}, {}]]);
		});

		it('should do nothing when unsplit tabs called with no splits', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.createTerminal();
			await terminal.assertTerminalGroups([[{}], [{}]]);
			await terminal.runCommand(TerminalCommandId.Unsplit);
			await terminal.assertTerminalGroups([[{}], [{}]]);
		});

		it('should unsplit tabs', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			await terminal.assertTerminalGroups([[{}, {}]]);
			await terminal.runCommand(TerminalCommandId.Unsplit);
			await terminal.assertTerminalGroups([[{}], [{}]]);
		});

		it('should move the terminal to the editor area', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.assertSingleTab({});
			await terminal.runCommand(TerminalCommandId.MoveToEditor);
			await terminal.assertEditorGroupCount(1);
		});

		describe('during title updates', () => {
			const rowSelector = '.tabs-list .monaco-list-row[data-index="0"]';

			before(async () => {
				await settingsEditor.addUserSettings([
					['terminal.integrated.tabs.title', '"${sequence}"'],
					['terminal.integrated.tabs.showActions', '"always"'],
					['terminal.integrated.confirmOnKill', '"never"']
				]);
			});

			beforeEach(async () => {
				await terminal.createTerminal();
				const script = [
					'let i = 0;',
					'let timer;',
					'const tick = () => process.stdout.write(String.fromCharCode(27) + \']0;working-\' + (++i) + String.fromCharCode(7) + \'tick-\' + i + String.fromCharCode(13, 10));',
					'tick();',
					'process.stdin.setRawMode(true);',
					'process.stdin.on(\'data\', data => {',
					'if (data.toString() === \'r\') { timer = setInterval(tick, 50); }',
					'if (data.toString() === \'s\') { clearInterval(timer); process.stdout.write(\'stopped-\' + i + String.fromCharCode(13, 10)); }',
					'});'
				].join(' ');
				await terminal.runCommandInTerminal(`node -e "${script}"`);
				await terminal.createTerminal();
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, 'neighbor');
				const page = await terminal.getPage();
				await page.waitForFunction((selector: string) =>
					/^working-\d+$/.test(document.querySelector(`${selector} .label-name`)?.textContent?.trim() ?? ''), rowSelector);
			});

			async function startTitleUpdates(): Promise<void> {
				await app.code.driver.writeInTerminal('#terminal .terminal-wrapper', 'r');
			}

			async function waitForTitleUpdates(minimumTick: number = 4): Promise<void> {
				// The first title is emitted before the stream starts; wait for three more.
				await terminal.waitForTerminalText(buffer => buffer.some(line => {
					const match = /^tick-(\d+)$/.exec(line);
					return !!match && Number(match[1]) >= minimumTick;
				}));
			}

			async function stopTitleUpdates(): Promise<string> {
				await app.code.driver.writeInTerminal('#terminal .terminal-wrapper', 's');
				let title = '';
				await terminal.waitForTerminalText(buffer => buffer.some(line => {
					const match = /^stopped-(?<tick>\d+)$/.exec(line);
					if (!match) {
						return false;
					}
					title = `working-${match.groups!.tick}`;
					return true;
				}));
				const page = await terminal.getPage();
				await page.waitForFunction(({ selector, title }) =>
					document.querySelector(selector)?.getAttribute('aria-label')?.match(/working-\d+/)?.[0] === title,
					{ selector: rowSelector, title });
				return title;
			}

			async function pressAction(icon: string): Promise<void> {
				const page = await terminal.getPage();
				await page.locator(rowSelector).hover();
				const bounds = await page.evaluate((selector: string) => {
					const button = document.querySelector(selector);
					if (!button) {
						return undefined;
					}
					const { x, y, width, height } = button.getBoundingClientRect();
					return { x, y, width, height };
				}, `${rowSelector} .action-label.codicon-${icon}`);
				assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
				await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
				await page.mouse.down();
			}

			it('should keep the visible and accessible titles current', async () => {
				await startTitleUpdates();
				await waitForTitleUpdates();
				const page = await terminal.getPage();
				assert.strictEqual(await page.locator(rowSelector).evaluate((row: HTMLElement) => {
					const title = row.querySelector('.label-name')!.textContent!.trim();
					const tick = /^working-(\d+)$/.exec(title);
					return !!tick && Number(tick[1]) >= 4 && row.getAttribute('aria-label')?.includes(title);
				}), true);
			});

			it('should kill the intended terminal when its title changes during a click', async () => {
				const page = await terminal.getPage();
				await pressAction('trashcan');
				try {
					await startTitleUpdates();
					await waitForTitleUpdates();
				} finally {
					await page.mouse.up();
				}
				await page.waitForFunction(() => document.querySelectorAll('.tabs-list .monaco-list-row').length === 1);
				assert.deepStrictEqual((await terminal.getTerminalGroups()).map(group => group.map(tab => tab.name?.trim())), [['neighbor']]);
			});

			it('should split once when its title changes during a click', async () => {
				const page = await terminal.getPage();
				await pressAction('split-horizontal');
				try {
					await startTitleUpdates();
					await waitForTitleUpdates();
				} finally {
					await page.mouse.up();
				}
				await page.waitForFunction(() => document.querySelectorAll('.tabs-list .monaco-list-row').length === 3);
				assert.deepStrictEqual((await terminal.getTerminalGroups()).map(group => group.length), [2, 1]);
			});

			it('should cancel a click dragged away during title updates', async () => {
				const page = await terminal.getPage();
				await pressAction('trashcan');
				try {
					await startTitleUpdates();
					await waitForTitleUpdates();
					await page.mouse.move(0, 0);
				} finally {
					await page.mouse.up();
				}
				await waitForTitleUpdates(7);
				assert.deepStrictEqual((await terminal.getTerminalGroups()).map(group => group.length), [1, 1]);
			});

			for (const finish of ['Enter', 'Escape', 'blur']) {
				it(`should update the label on rename ${finish} after title updates stop`, async () => {
					const page = await terminal.getPage();
					await page.locator(rowSelector).click({ button: 'right' });
					// Menu mouse-up handlers activate after 100ms to prevent accidental clicks.
					await page.getByRole('menuitem', { name: /^Rename/ }).click({ delay: 150 });
					const input = page.locator(`${rowSelector} .monaco-inputbox input`);
					await input.fill('renamed');
					await startTitleUpdates();
					await waitForTitleUpdates();
					const lastTitle = await stopTitleUpdates();
					assert.deepStrictEqual(await page.evaluate((selector: string) => {
						const element = document.querySelector<HTMLInputElement>(selector);
						return element ? { value: element.value, focused: document.activeElement === element } : undefined;
					}, `${rowSelector} .monaco-inputbox input`), { value: 'renamed', focused: true });
					if (finish === 'blur') {
						await input.evaluate(element => element.blur());
					} else {
						await page.keyboard.press(finish);
					}
					await page.waitForFunction(({ selector, title }) => {
						const row = document.querySelector(selector);
						return !row?.querySelector('.monaco-inputbox input') &&
							row?.querySelector('.label-name')?.textContent?.trim() === title &&
							row?.getAttribute('aria-label')?.includes(title);
					}, { selector: rowSelector, title: finish === 'Escape' ? lastTitle : 'renamed' });
					assert.strictEqual((await terminal.getTerminalGroups())[1][0].name?.trim(), 'neighbor');
				});
			}
		});
	});
}
