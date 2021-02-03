/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Quality } from '../../../../automation';

export function setup() {
	describe('Extensions', () => {
		it(`install and activate vscode-smoketest-check extension`, async function () {
			const app = this.app as Application;

			if (app.quality === Quality.Dev) {
				this.skip();
				return;
			}

			await app.workbench.settingsEditor.addUserSetting('webview.experimental.useIframes', 'true');

			await app.workbench.extensions.openExtensionsViewlet();

			await app.workbench.extensions.installExtension('michelkaporin.vscode-smoketest-check', true);

			await app.workbench.extensions.waitForExtensionsViewlet();

			await app.workbench.quickaccess.runCommand('Smoke Test Check');
			await app.workbench.statusbar.waitForStatusbarText('smoke test', 'VS Code Smoke Test Check');
		});

		it(`extension installed by server cli`, async function () {
			const app = this.app as Application;

			if (app.quality === Quality.Dev || !app.web) {
				this.skip();
				return;
			}

			await app.workbench.extensions.openExtensionsViewlet();

			await app.workbench.extensions.openExtension('github.vscode-pull-request-github');

			await this.code.waitForElement(`.extension-editor .monaco-action-bar .action-item:not(.disabled) .extension-action.uninstall`);
			await this.code.waitForElement(`.extension-editor .monaco-action-bar .action-item:not(.disabled) .extension-action[title="Disable this extension"]`);
		});

		after(async function () {
			const app = this.app as Application;
			await app.workbench.settingsEditor.clearUserSettings();
		});

	});
}
