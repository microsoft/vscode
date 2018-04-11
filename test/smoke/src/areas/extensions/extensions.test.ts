/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
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

			const installed = await app.workbench.extensions.installExtension(extensionName);
			assert.ok(installed);

			await app.reload();
			await app.workbench.extensions.waitForExtensionsViewlet();
			await app.workbench.runCommand('Smoke Test Check');

			const statusbarText = await app.workbench.statusbar.getStatusbarTextByTitle('smoke test');
			assert.equal(statusbarText, 'VS Code Smoke Test Check');
		});
	});
}