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

	it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
		await app.start('Localization', ['--locale=DE']);
		app.screenCapturer.testName = 'DE locale test';

		let text = await app.workbench.explorer.getOpenEditorsViewTitle();
		await app.screenCapturer.capture('Open editors title');
		assert(/geöffnete editoren/i.test(text));

		await app.workbench.search.openSearchViewlet();
		text = await app.workbench.search.getTitle();
		await app.screenCapturer.capture('Search title');
		assert(/suchen/i.test(text));

		await app.workbench.scm.openSCMViewlet();
		text = await app.workbench.scm.getTitle();
		await app.screenCapturer.capture('Scm title');
		assert(/quellcodeverwaltung/i.test(text));

		await app.workbench.debug.openDebugViewlet();
		text = await app.workbench.debug.getTitle();
		await app.screenCapturer.capture('Debug title');
		assert(/debuggen/i.test(text));

		await app.workbench.extensions.openExtensionsViewlet();
		text = await app.workbench.extensions.getTitle();
		await app.screenCapturer.capture('Extensions title');
		assert(/erweiterungen/i.test(text));
	});
});