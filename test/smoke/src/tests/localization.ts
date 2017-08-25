/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH, USER_DIR } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { Localization, ViewletType } from '../areas/localization';

let app: SpectronApplication;
let common: CommonActions;

export function testLocalization() {
	describe('Localization', () => {
		afterEach(async function () {
			return await app.stop();
		});

		it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
			app = new SpectronApplication(LATEST_PATH, this.test.fullTitle(), this.test.currentRetry(), [WORKSPACE_PATH, '--locale=DE'], [`--user-data-dir=${USER_DIR}`]);
			common = new CommonActions(app);
			const locale = new Localization(app);
			common.removeDirectory(USER_DIR);

			await app.start();

			let text = await locale.getOpenEditorsText();
			assert.equal(text.toLowerCase(), 'geöffnete editoren');

			await locale.openViewlet(ViewletType.SEARCH);
			text = await locale.getOpenedViewletTitle();
			assert.equal(text.toLowerCase(), 'suchen');

			await locale.openViewlet(ViewletType.SCM);
			await app.wait(); // wait until git extension is loaded
			text = await locale.getOpenedViewletTitle();
			assert.equal(text.toLowerCase(), 'quellcodeverwaltung: git');

			await locale.openViewlet(ViewletType.DEBUG);
			text = await locale.getOpenedViewletTitle();
			assert.equal(text.toLowerCase(), 'debuggen');

			await locale.openViewlet(ViewletType.EXTENSIONS);
			text = await locale.getExtensionsSearchPlaceholder();
			assert.equal(text.toLowerCase(), 'nach erweiterungen im marketplace suchen');
		});
	});
}