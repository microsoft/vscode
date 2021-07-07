/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Application, Quality } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {
	describe('Localization', () => {
		beforeSuite(opts);

		before(async function () {
			const app = this.app as Application;

			// Don't run the localization tests in dev or remote.
			if (app.quality === Quality.Dev || app.remote) {
				return;
			}

			await app.workbench.extensions.openExtensionsViewlet();
			await app.workbench.extensions.installExtension('ms-ceintl.vscode-language-pack-de', false);

			await app.restart({ extraArgs: ['--locale=DE'] });
		});

		afterSuite();

		it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
			const app = this.app as Application;

			const result = await app.workbench.localization.getLocalizedStrings();
			if (app.quality === Quality.Dev || app.remote) {
				if (result.open !== 'open' || result.close !== 'close' || result.find !== 'find') {
					throw new Error(`Received wrong localized strings: ${JSON.stringify(result, undefined, 0)}`);
				}
				return;
			} else {
				const localeInfo = await app.workbench.localization.getLocaleInfo();
				if (localeInfo.locale === undefined || localeInfo.locale.toLowerCase() !== 'de') {
					throw new Error(`The requested locale for VS Code was not German. The received value is: ${localeInfo.locale === undefined ? 'not set' : localeInfo.locale}`);
				}

				if (localeInfo.language.toLowerCase() !== 'de') {
					throw new Error(`The UI language is not German. It is ${localeInfo.language}`);
				}

				if (result.open.toLowerCase() !== 'öffnen' || result.close.toLowerCase() !== 'schließen' || result.find.toLowerCase() !== 'finden') {
					throw new Error(`Received wrong German localized strings: ${JSON.stringify(result, undefined, 0)}`);
				}
			}
		});
	});
}
