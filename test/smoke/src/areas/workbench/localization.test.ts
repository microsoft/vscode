/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, VSCODE_BUILD } from '../../spectron/application';

describe('Localization', () => {
	let app: SpectronApplication = new SpectronApplication();
	if (app.build === VSCODE_BUILD.DEV) {
		return;
	}

	after(() => app.stop());
	beforeEach(function () { app.createScreenshotCapturer(this.currentTest); });

	it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
		await app.start('--locale=DE');

		let text = await app.workbench.explorer.getOpenEditorsViewTitle();
		app.screenshot.capture('Open editors title');
		assert.equal(text.toLowerCase(), 'geöffnete editoren');

		await app.workbench.search.openSearchViewlet();
		text = await app.workbench.search.getTitle();
		app.screenshot.capture('Search title');
		assert.equal(text.toLowerCase(), 'suchen');

		await app.workbench.scm.openSCMViewlet();
		text = await app.workbench.scm.getTitle();
		app.screenshot.capture('Scm title');
		assert.equal(text.toLowerCase(), 'quellcodeverwaltung: vscode-smoketest-express (git)');

		await app.workbench.debug.openDebugViewlet();
		text = await app.workbench.debug.getTitle();
		app.screenshot.capture('Debug title');
		assert.equal(text.toLowerCase(), 'debuggen');

		await app.workbench.extensions.openExtensionsViewlet();
		text = await app.workbench.extensions.getTitle();
		app.screenshot.capture('Extensions title');
		assert.equal(text.toLowerCase(), 'erweiterungen: marketplace');
	});
});