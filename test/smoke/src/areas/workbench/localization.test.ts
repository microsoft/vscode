/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Quality } from '../../application';

export function setup() {
	describe('Localization', () => {
		before(async function () {
			const app = this.app as Application;

			if (app.quality === Quality.Dev) {
				return;
			}

			await app.workbench.extensions.openExtensionsViewlet();
			await app.workbench.extensions.installExtension('ms-ceintl.vscode-language-pack-de', 'German Language Pack for Visual Studio Code');

			await app.restart({ extraArgs: ['--locale=DE'] });
		});

		it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
			const app = this.app as Application;

			if (app.quality === Quality.Dev) {
				this.skip();
				return;
			}

			await app.workbench.explorer.waitForOpenEditorsViewTitle(title => /geöffnete editoren/i.test(title));

			await app.workbench.search.openSearchViewlet();
			await app.workbench.search.waitForTitle(title => /suchen/i.test(title));

			await app.workbench.scm.openSCMViewlet();
			await app.workbench.scm.waitForTitle(title => /quellcodeverwaltung/i.test(title));

			await app.workbench.debug.openDebugViewlet();
			await app.workbench.debug.waitForTitle(title => /debug/i.test(title));

			// await app.workbench.extensions.openExtensionsViewlet();
			// await app.workbench.extensions.waitForTitle(title => /erweiterungen/i.test(title));
		});
	});
}
