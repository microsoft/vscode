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

		const focusHover = async () => {
			const page = await terminal.getPage();
			const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
			await page.keyboard.press(`${modifier}+k`);
			await page.keyboard.press(`${modifier}+i`);
			const hover = page.locator('.monaco-hover:visible');
			await hover.waitFor({ state: 'visible' });
			return hover;
		};

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

		[false, true].forEach(sharedContainer => it(`should truncate a long single tab label without overflowing its actions${sharedContainer ? ' in a shared container' : ' with hidden tabs'}`, async function () {
			const app = this.app as Application;
			const previousWindowSize = await app.code.driver.resizeWindow({ width: sharedContainer ? 1440 : 1024, height: 720 });
			const name = 'NotificationSettingsProgress'.repeat(10);
			// Settings automation reads rendered lines; the long title alone is enough to force truncation.
			const description = 'Current task <project> &amp; [name] C:\\workspace\\long_name';
			try {
				await settingsEditor.clearUserSettings();
				await setTerminalTestSettings(app, [
					['terminal.integrated.tabs.description', JSON.stringify(description)],
					['terminal.integrated.tabs.hideCondition', JSON.stringify(sharedContainer ? 'never' : 'singleTerminal')],
					['terminal.integrated.enableVisualBell', 'true'],
					['terminal.integrated.bellDuration', '60000']
				]);
				await terminal.createTerminal();
				const page = await terminal.getPage();
				if (sharedContainer) {
					await app.workbench.quickaccess.runCommand('workbench.action.positionPanelBottom');
					await app.workbench.quickaccess.runCommand('workbench.actions.view.problems');
					await app.workbench.quickaccess.runCommand('workbench.action.terminal.focus');
					await page.locator('.part.panel .composite-bar .action-label[aria-label^="Problems"]').dragTo(page.locator('.pane-body.integrated-terminal'));
					await app.workbench.quickaccess.runCommand('workbench.action.terminal.focus');
					await page.locator('.pane-header .single-terminal-tab').waitFor({ state: 'visible' });
				}
				await app.workbench.quickaccess.runCommand('workbench.action.positionPanelRight');
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
				await terminal.assertSingleTab({ name });

				const bell = page.locator('.single-terminal-tab .codicon-bell');
				// The bell listener is registered after terminal startup.
				const bellDeadline = Date.now() + 10_000;
				do {
					await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, '\u0007');
				} while (!await bell.isVisible() && Date.now() < bellDeadline);
				await bell.waitFor({ state: 'visible', timeout: 1000 });
				const layout = await page.locator('.single-terminal-tab').evaluate((label: HTMLElement) => {
					const action = label.closest<HTMLElement>('.action-item')!;
					const textLabel = label.querySelector<HTMLElement>('.single-terminal-tab-label')!;
					const labelBounds = label.getBoundingClientRect();
					const actionBounds = action.getBoundingClientRect();
					const toolbarBounds = action.parentElement!.getBoundingClientRect();
					const headerBounds = label.closest('.pane-header, .title-actions')!.getBoundingClientRect();
					return {
						text: label.textContent?.replace(/\s+/g, ' ').trim(),
						textTruncated: textLabel.scrollWidth > textLabel.clientWidth,
						labelOverflows: label.scrollWidth > label.clientWidth,
						actionOverflows: action.scrollWidth > action.clientWidth,
						actionWithinToolbar: actionBounds.left >= toolbarBounds.left && actionBounds.right <= toolbarBounds.right,
						actionsWithinHeader: [...action.parentElement!.children].every(item => {
							const bounds = item.getBoundingClientRect();
							return !bounds.width || bounds.left >= headerBounds.left && bounds.right <= headerBounds.right;
						}),
						iconsVisible: [...label.querySelectorAll('.codicon')].every(icon => {
							const bounds = icon.getBoundingClientRect();
							return bounds.width > 0 && bounds.left >= labelBounds.left && bounds.right <= labelBounds.right;
						})
					};
				});
				assert.deepStrictEqual(layout, {
					text: `${name} - ${description}`,
					textTruncated: true,
					labelOverflows: false,
					actionOverflows: false,
					actionWithinToolbar: true,
					actionsWithinHeader: true,
					iconsVisible: true
				});
				await page.locator('.single-terminal-tab').hover();
				const hover = page.locator('.monaco-hover:visible');
				await hover.waitFor({ state: 'visible' });
				const hoverText = (await hover.textContent())?.replace(/\s+/g, ' ');
				await page.mouse.move(0, 0);
				await page.keyboard.press('Escape');
				await hover.waitFor({ state: 'hidden' });
				await app.workbench.quickaccess.runCommand('workbench.action.terminal.focus');
				const keyboardHover = await focusHover();
				const keyboardHoverText = (await keyboardHover.textContent())?.replace(/\s+/g, ' ');
				const keyboardHoverFocused = await keyboardHover.evaluate(element => element.contains(document.activeElement));
				await page.keyboard.press('Escape');
				await keyboardHover.waitFor({ state: 'hidden' });
				assert.deepStrictEqual({
					tabsListVisible: await page.locator('.pane-body.integrated-terminal .tabs-container').isVisible(),
					hoverIncludesTitle: hoverText?.includes(name),
					hoverIncludesDescription: hoverText?.includes(description),
					keyboardIncludesTitle: keyboardHoverText?.includes(name),
					keyboardIncludesDescription: keyboardHoverText?.includes(description),
					keyboardHoverFocused,
					terminalRefocused: await page.locator('.xterm-helper-textarea:focus').count() === 1
				}, {
					tabsListVisible: sharedContainer,
					hoverIncludesTitle: true,
					hoverIncludesDescription: true,
					keyboardIncludesTitle: true,
					keyboardIncludesDescription: true,
					keyboardHoverFocused: true,
					terminalRefocused: true
				});
			} finally {
				if (sharedContainer) {
					await app.workbench.quickaccess.runCommand('workbench.action.resetViewLocations');
				}
				await app.code.driver.resizeWindow(previousWindowSize);
				await app.workbench.quickaccess.runCommand('workbench.action.positionPanelBottom');
				await settingsEditor.clearUserSettings();
				await setTerminalTestSettings(app);
			}
		}));

		it('should keep progress icons visible and independently colored with a long title', async function () {
			const app = this.app as Application;
			const previousWindowSize = await app.code.driver.resizeWindow({ width: 1024, height: 720 });
			try {
				await settingsEditor.clearUserSettings();
				await setTerminalTestSettings(app, [
					['terminal.integrated.tabs.description', '"${progress}"'],
					['terminal.integrated.tabs.hideCondition', '"singleTerminal"'],
					['terminal.integrated.enableVisualBell', 'true'],
					['terminal.integrated.bellDuration', '60000']
				]);
				await terminal.createEmptyTerminal();
				await app.workbench.quickaccess.runCommand('workbench.action.positionPanelRight');
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, 'NotificationSettingsProgress'.repeat(10));

				const page = await terminal.getPage();
				const bell = page.locator('.single-terminal-tab .codicon-bell');
				const bellDeadline = Date.now() + 10_000;
				do {
					await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, '\u0007');
				} while (!await bell.isVisible() && Date.now() < bellDeadline);
				await bell.waitFor({ state: 'visible', timeout: 1000 });
				const states = [
					{ state: 2, icon: 'error' },
					{ state: 3, icon: 'loading' },
					{ state: 4, icon: 'alert' }
				];
				const readColors = async () => {
					const colors: { icon: string; terminal: string; progress: string; pickerProgress: string }[] = [];
					for (const { state, icon } of states) {
						const progressIcon = page.locator(`.single-terminal-tab .codicon-${icon}`);
						// The progress addon may still be loading when the terminal first produces output.
						const progressDeadline = Date.now() + 10_000;
						do {
							await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, `\\x1b]9;4;${state};0\\x07`);
						} while (!await progressIcon.isVisible() && Date.now() < progressDeadline);
						await progressIcon.waitFor({ state: 'visible', timeout: 1000 });
						const layout = await progressIcon.evaluate((progress: HTMLElement) => {
							const label = progress.closest<HTMLElement>('.single-terminal-tab')!;
							const text = label.querySelector<HTMLElement>('.single-terminal-tab-label')!;
							const bounds = label.getBoundingClientRect();
							const icons = [...label.querySelectorAll('.codicon')];
							return {
								textTruncated: text.scrollWidth > text.clientWidth,
								progressOutsideText: !progress.closest('.single-terminal-tab-label'),
								iconCount: icons.length,
								iconsVisible: icons.every(icon => {
									const iconBounds = icon.getBoundingClientRect();
									return iconBounds.width > 0 && iconBounds.left >= bounds.left && iconBounds.right <= bounds.right;
								}),
								labelOverflows: label.scrollWidth > label.clientWidth
							};
						});
						assert.deepStrictEqual(layout, {
							textTruncated: true,
							progressOutsideText: true,
							iconCount: 3,
							iconsVisible: true,
							labelOverflows: false
						});
						const currentColors = await progressIcon.evaluate((progress: HTMLElement) => {
							const label = progress.closest<HTMLElement>('.single-terminal-tab')!;
							const terminalIcon = label.querySelector<HTMLElement>(':scope > .codicon:first-child')!;
							return {
								terminal: getComputedStyle(terminalIcon).color,
								progress: getComputedStyle(progress).color
							};
						});
						await app.workbench.quickaccess.runCommand(TerminalCommandIdWithValue.ChangeColor, { keepOpen: true });
						await page.getByPlaceholder('Select a color for the terminal', { exact: true }).waitFor({ state: 'visible' });
						const pickerProgress = await progressIcon.evaluate((progress: HTMLElement) => getComputedStyle(progress).color);
						await page.keyboard.press('Escape');
						await page.locator('.quick-input-widget').waitFor({ state: 'hidden' });
						colors.push({
							icon,
							...currentColors,
							pickerProgress
						});
					}
					return colors;
				};
				const originalColors = await readColors();
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.ChangeColor, 'Green');
				const customColors = await readColors();
				assert.deepStrictEqual(customColors.map((colors, index) => ({
					icon: colors.icon,
					terminalIconChanged: colors.terminal !== originalColors[index].terminal,
					progress: colors.progress,
					pickerProgress: colors.pickerProgress
				})), originalColors.map(({ icon, progress }) => ({
					icon,
					terminalIconChanged: true,
					progress,
					pickerProgress: progress
				})));
				await page.locator('.single-terminal-tab').hover();
				await page.locator('.monaco-hover:visible p').first().locator('.codicon-alert').waitFor({ state: 'visible' });
				await page.mouse.move(0, 0);
				await page.keyboard.press('Escape');
				await page.locator('.monaco-hover:visible').waitFor({ state: 'hidden' });
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, '\\x1b]9;4;1;42\\x07');
				await page.locator('.single-terminal-tab-label').filter({ hasText: '42%' }).waitFor({ state: 'visible' });
				await app.workbench.quickaccess.runCommand('workbench.action.terminal.focus');
				const keyboardHover = await focusHover();
				await keyboardHover.locator('p').first().filter({ hasText: '42%' }).waitFor({ state: 'visible' });
				await page.keyboard.press('Escape');
				await keyboardHover.waitFor({ state: 'hidden' });
			} finally {
				await app.code.driver.resizeWindow(previousWindowSize);
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
