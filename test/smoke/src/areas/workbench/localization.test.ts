/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, Quality } from '../../application';

export function setup() {
	describe('Localization', () => {
		before(async function () {
			const app = this.app as SpectronApplication;

			if (app.quality === Quality.Dev) {
				return;
			}

			await app.restart({ extraArgs: ['--locale=DE'] });
		});

		it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
			const app = this.app as SpectronApplication;

			if (app.quality === Quality.Dev) {
				this.skip();
				return;
			}

			let text = await app.workbench.explorer.getOpenEditorsViewTitle();
			assert(/geöffnete editoren/i.test(text));

			await app.workbench.search.openSearchViewlet();
			text = await app.workbench.search.getTitle();
			assert(/suchen/i.test(text));

			await app.workbench.scm.openSCMViewlet();
			text = await app.workbench.scm.getTitle();
			assert(/quellcodeverwaltung/i.test(text));

			await app.workbench.debug.openDebugViewlet();
			text = await app.workbench.debug.getTitle();
			assert(/debuggen/i.test(text));

			await app.workbench.extensions.openExtensionsViewlet();
			text = await app.workbench.extensions.getTitle();
			assert(/erweiterungen/i.test(text));
		});
	});
}