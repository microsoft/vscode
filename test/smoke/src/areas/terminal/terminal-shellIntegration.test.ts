/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor, TerminalCommandIdWithValue, TerminalCommandId } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup() {
	describe('Terminal Shell Integration', () => {
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;
		let app: Application;
		// Acquire automation API
		before(async function () {
			app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app, [['terminal.integrated.shellIntegration.enabled', 'true']]);
		});

		afterEach(async function () {
			await app.workbench.terminal.runCommand(TerminalCommandId.KillAll);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		async function createShellIntegrationProfile() {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, process.platform === 'win32' ? 'PowerShell' : 'bash');
		}

		// TODO: Some agents may not have pwsh installed?
		(process.platform === 'win32' ? describe.skip : describe)(`Shell integration`, function () {
			describe('Decorations', function () {
				describe('Should show default icons', function () {

					it('Placeholder', async () => {
						await createShellIntegrationProfile();
						await terminal.assertCommandDecorations({ placeholder: 1, success: 0, error: 0 });
					});
					it('Success', async () => {
						await createShellIntegrationProfile();
						await terminal.runCommandInTerminal(`echo "success"`);
						await terminal.assertCommandDecorations({ placeholder: 1, success: 1, error: 0 });
					});
					it('Error', async () => {
						await createShellIntegrationProfile();
						await terminal.runCommandInTerminal(`false`);
						await terminal.assertCommandDecorations({ placeholder: 1, success: 0, error: 1 });
					});
				});
				describe('Custom configuration', function () {
					it('Should update and show custom icons', async () => {
						await createShellIntegrationProfile();
						await terminal.assertCommandDecorations({ placeholder: 1, success: 0, error: 0 });
						await terminal.runCommandInTerminal(`echo "foo"`);
						await terminal.runCommandInTerminal(`bar`);
						await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.decorationIcon', '"zap"');
						await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.decorationIconSuccess', '"zap"');
						await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.decorationIconError', '"zap"');
						await terminal.assertCommandDecorations(undefined, { updatedIcon: "zap", count: 3 });
						await app.workbench.terminal.runCommand(TerminalCommandId.KillAll);
					});
				});
			});
		});
	});
}
