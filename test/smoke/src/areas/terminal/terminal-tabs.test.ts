/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Application, Terminal, TerminalCommandId, TerminalCommandIdWithValue, SettingsEditor } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal Tabs', () => {
		// Acquire automation API
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;

		before(async function () {
			const app = this.app as Application;
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

		it('should truncate a long single tab label without overflowing its actions', async function () {
			const app = this.app as Application;
			const name = 'Notification settings progress '.repeat(10).trim();
			const description = 'Current task directory '.repeat(10).trim();
			try {
				await setTerminalTestSettings(app, [
					['terminal.integrated.tabs.description', JSON.stringify(description)],
					['terminal.integrated.enableVisualBell', 'true'],
					['terminal.integrated.bellDuration', '60000']
				]);
				await terminal.createTerminal();
				await app.workbench.quickaccess.runCommand('workbench.action.positionPanelRight');
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
				await terminal.assertSingleTab({ name });
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, '\u0007');

				const page = await terminal.getPage();
				await page.waitForSelector('.single-terminal-tab .codicon-bell');
				const layout = await page.locator('.single-terminal-tab').evaluate((label: HTMLElement) => {
					const action = label.closest<HTMLElement>('.action-item')!;
					const labelBounds = label.getBoundingClientRect();
					const actionBounds = action.getBoundingClientRect();
					const toolbarBounds = action.parentElement!.getBoundingClientRect();
					return {
						text: label.textContent?.replace(/\s+/g, ' ').trim(),
						labelOverflows: label.scrollWidth > label.clientWidth,
						actionOverflows: action.scrollWidth > action.clientWidth,
						actionWithinToolbar: actionBounds.left >= toolbarBounds.left && actionBounds.right <= toolbarBounds.right,
						iconsVisible: [...label.querySelectorAll('.codicon')].every(icon => {
							const bounds = icon.getBoundingClientRect();
							return bounds.width > 0 && bounds.left >= labelBounds.left && bounds.right <= labelBounds.right;
						})
					};
				});
				assert.deepStrictEqual(layout, {
					text: `${name} - ${description}`,
					labelOverflows: false,
					actionOverflows: false,
					actionWithinToolbar: true,
					iconsVisible: true
				});
			} finally {
				await app.workbench.quickaccess.runCommand('workbench.action.positionPanelBottom');
				await settingsEditor.clearUserSettings();
				await setTerminalTestSettings(app);
			}
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
	});
}
