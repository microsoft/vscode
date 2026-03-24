/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

const TITLE_TEST_HTML = '<!DOCTYPE html><html><head><title>Test Page</title></head><body>Hello</body></html>';

export function setup(logger: Logger) {
	describe('Integrated Browser', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		async function openBrowserToFile(app: Application, htmlPath: string): Promise<void> {
			await app.workbench.quickaccess.runCommand('workbench.action.browser.open');
			await app.code.waitForActiveElement('.browser-url-input');
			await app.code.driver.setValue('.browser-url-input', pathToFileURL(htmlPath).toString());
			await app.code.driver.pressKey('Enter');
		}

		it('opens and loads a page with the correct title', async function () {
			const app = this.app as Application;
			const htmlPath = path.join(app.workspacePathOrFolder, 'test-page.html');
			fs.writeFileSync(htmlPath, TITLE_TEST_HTML);

			await openBrowserToFile(app, htmlPath);

			await app.code.waitForElement('.tabs-container .tab.active .label-name', e => e?.textContent === 'Test Page');
		});
	});
}
