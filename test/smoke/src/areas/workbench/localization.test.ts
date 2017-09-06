/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, VSCODE_BUILD } from '../../spectron/application';

describe('Localization', () => {

	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); });
	after(() => app.stop());

	it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
		if (app.build === VSCODE_BUILD.DEV) {
			return;
		}
		await app.start();

		let text = await app.workbench.explorer.getOpenEditorsViewTitle();
		assert.equal(text.toLowerCase(), 'geöffnete editoren');

		await app.workbench.search.openSearchViewlet();
		text = await app.workbench.search.getTitle();
		assert.equal(text.toLowerCase(), 'suchen');

		await app.workbench.scm.openSCMViewlet();
		text = await app.workbench.scm.getTitle();
		assert.equal(text.toLowerCase(), 'quellcodeverwaltung: git');

		await app.workbench.debug.openDebugViewlet();
		text = await app.workbench.debug.getTitle();
		assert.equal(text.toLowerCase(), 'quellcodeverwaltung: git');

		await app.workbench.extensions.openExtensionsViewlet();
		text = await app.workbench.extensions.getTitle();
		assert.equal(text.toLowerCase(), 'nach erweiterungen im marketplace suchen');
	});
});