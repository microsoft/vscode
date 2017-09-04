/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH, EXTENSIONS_DIR } from '../../spectron/application';
import { Util } from '../../helpers/utilities';

var dns = require('dns');

let app: SpectronApplication;

export function testExtensions() {

	describe('Extensions', () => {
		const extensionName = 'vscode-smoketest-check';

		beforeEach(async function () {
			const network = await networkAttached();
			if (!network) {
				return Promise.reject('There is no network connection for testing extensions.');
			}

			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH, `--extensions-dir=${EXTENSIONS_DIR}`]);
			await Util.rimraf(EXTENSIONS_DIR);
			return await app.start();
		});
		afterEach(async function () {
			await app.stop();
			await Util.rimraf(EXTENSIONS_DIR);
		});

		it(`install and activate vscode-smoketest-check extension`, async function () {
			await app.workbench.extensions.openExtensionsViewlet();

			const installed = await app.workbench.extensions.installExtension(extensionName);

			assert.ok(installed);

			await app.reload();
			await app.workbench.extensions.waitForExtensionsViewlet();
			await app.workbench.commandPallette.runCommand('Smoke Test Check');

			const statusbarText = await app.client.waitForText('.statusbar-item.statusbar-entry span[title="smoke test"]');
			assert.equal(statusbarText, 'VS Code Smoke Test Check');
		});

	});
}

function networkAttached(): Promise<boolean> {
	return new Promise((res, rej) => {
		dns.resolve('marketplace.visualstudio.com', (err) => {
			err ? res(false) : res(true);
		});
	});
}