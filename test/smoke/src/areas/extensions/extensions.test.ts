/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, VSCODE_BUILD } from '../../spectron/application';

describe('Extensions', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start(); });
	after(() => app.stop());

	it(`install and activate vscode-smoketest-check extension`, async function () {
		if (app.build === VSCODE_BUILD.DEV) {
			return;
		}
		const extensionName = 'vscode-smoketest-check';
		await app.workbench.extensions.openExtensionsViewlet();

		const installed = await app.workbench.extensions.installExtension(extensionName);

		assert.ok(installed);

		await app.reload();
		await app.workbench.extensions.waitForExtensionsViewlet();
		await app.workbench.commandPallette.runCommand('Smoke Test Check');


		const statusbarText = await app.workbench.statusbar.getStatusbarTextByTitle('smoke test');
		assert.equal(statusbarText, 'VS Code Smoke Test Check');
	});
});