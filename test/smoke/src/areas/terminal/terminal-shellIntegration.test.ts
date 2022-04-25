/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor } from '../../../../automation';

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
			await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.enabled', 'true');
		});

		describe('Shell integration', function () {
			describe('Activation', function () {
				it('should activate shell integration on creation of a terminal', async () => {
					await terminal.createTerminal();
					await terminal.assertShellIntegrationActivated();
				});
			});
			if (!process.platform.startsWith('win')) {
				describe('Decorations', function () {
					describe('Should show default icons', function () {
						it('Placeholder', async () => {
							await terminal.createTerminal();
							await terminal.assertShellIntegrationActivated();
							await terminal.assertCommandDecorations({ placeholder: 1, success: 0, error: 0 });
						});
						it('Success', async () => {
							await terminal.createTerminal();
							await terminal.assertShellIntegrationActivated();
							await terminal.runCommandInTerminal(`ls`);
							await terminal.assertCommandDecorations({ placeholder: 1, success: 1, error: 0 });
						});
						it('Error', async () => {
							await terminal.createTerminal();
							await terminal.assertShellIntegrationActivated();
							await terminal.runCommandInTerminal(`fsdkfsjdlfksjdkf`);
							await terminal.assertCommandDecorations({ placeholder: 1, success: 0, error: 1 });
						});
					});
					describe('Custom configuration', function () {
						it('Should update and show custom icons', async () => {
							await terminal.createTerminal();
							await terminal.assertShellIntegrationActivated();
							await terminal.assertCommandDecorations({ placeholder: 1, success: 0, error: 0 });
							await terminal.runCommandInTerminal(`ls`);
							await terminal.runCommandInTerminal(`fsdkfsjdlfksjdkf`);
							await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.decorationIcon', '"zap"');
							await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.decorationIconSuccess', '"zap"');
							await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.decorationIconError', '"zap"');
							await terminal.assertCommandDecorations(undefined, { updatedIcon: "zap", count: 3 });
						});
					});
				});
			}
		});
	});
}
