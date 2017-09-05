/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

describe('Extensions', () => {
	let app: SpectronApplication;
	before(() => {
		app = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		return app.start();
	});
	after(() => app.stop());

	it(`install and activate vscode-smoketest-check extension`, async function () {
		if (app.inDevMode) {
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