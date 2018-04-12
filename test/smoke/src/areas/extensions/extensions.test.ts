/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Quality } from '../../application';

export function setup() {
	describe('Extensions', () => {
		it(`install and activate vscode-smoketest-check extension`, async function () {
			const app = this.app as Application;

			if (app.quality === Quality.Dev) {
				this.skip();
				return;
			}

			const extensionName = 'vscode-smoketest-check';
			await app.workbench.extensions.openExtensionsViewlet();

			await app.workbench.extensions.installExtension(extensionName);

			await app.reload();
			await app.workbench.extensions.waitForExtensionsViewlet();
			await app.workbench.runCommand('Smoke Test Check');
			await app.workbench.statusbar.waitForStatusbarText('smoke test', 'VS Code Smoke Test Check');
		});
	});
}