/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SpectronApplication } from '../../spectron/application';

export function setup() {
	describe('GitList', () => {
		before(async function () {
			const app = this.app as SpectronApplication;
			app.suiteName = 'GitList';
		});

		after(async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.closeTab('error.jade (Working Tree)');
			await app.execPromise('git reset --hard origin/master');
		});

		it('stages using keybindings, focuses on subsequent resource after being staged', async function () {
			const app = this.app as SpectronApplication;
			await app.workbench.scm.openSCMViewlet();

			await app.workbench.keybindingsEditor.openKeybinding();
			await app.workbench.keybindingsEditor.sortByPrecedence();
			await app.workbench.keybindingsEditor.clearKeybindingSearchInput();
			await app.workbench.keybindingsEditor.updateKeybinding('git.stage', ['Control', 'l'], 'Control+L');
			await app.workbench.closeTab('Keyboard Shortcuts');

			await app.workbench.scm.waitForFileToBeModifiedAndSaved('index.js', '/* smoke test */');
			await app.workbench.scm.waitForFileToBeModifiedAndSaved('users.js', '/* smoke test */');
			await app.workbench.scm.waitForFileToBeModifiedAndSaved('error.jade', '// smoke test');
			await app.workbench.scm.waitForFileToBeModifiedAndSaved('index.jade', '// smoke test');
			await app.workbench.scm.waitForFileToBeModifiedAndSaved('layout.jade', '// smoke test');

			const keybindingTriggerFn: () => void = async () => {
				['Control', 'l', 'NULL', 'NULL'].forEach(async (key) => {
					await app.client.keys(key);
				});
			};

			await app.workbench.scm.waitForListResourceToBeSelected('index.jade');

			await app.workbench.scm.waitForChange('index.jade', 'Index Modified', keybindingTriggerFn);
			await app.workbench.scm.waitForChange('layout.jade', 'Index Modified', keybindingTriggerFn);
			await app.workbench.scm.waitForChange('index.js', 'Index Modified', keybindingTriggerFn);
			await app.workbench.scm.waitForChange('users.js', 'Index Modified', keybindingTriggerFn);
			await app.workbench.scm.waitForChange('error.jade', 'Index Modified', keybindingTriggerFn);
		});
	});
}