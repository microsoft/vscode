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

// Sanity check that Node.js integration is not enabled in browser view content.
// Spot-checks several well-known globals in both the main frame and a subframe;
// sets document.title to "Secure" when none are defined, "Insecure" otherwise.
const NODE_ACCESS_TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Checking</title></head>
<body>
	<iframe srcdoc="
		<script>
			// Check in the subframe
			var result = {
				require: typeof require,
				process: typeof process,
				ipcRenderer: typeof ipcRenderer,
				exports: typeof exports,
				windowExports: typeof windowExports,
				windowPreload: typeof windowPreload,
				windowRequire: typeof windowRequire
			};
			parent.postMessage(result, '*');
		</script>
	"></iframe>
	<script>
		// Check in the main frame
		var mainResult = {
			require: typeof require,
			process: typeof process,
			ipcRenderer: typeof ipcRenderer,
			exports: typeof exports,
			windowExports: typeof windowExports,
			windowPreload: typeof windowPreload,
			windowRequire: typeof windowRequire
		};

		window.onmessage = function (e) {
			var subResult = e.data;

			// All values must be "undefined" for the page to be considered secure
			var allResults = Object.values(mainResult).concat(Object.values(subResult));
			var secure = allResults.every(function (v) { return v === 'undefined'; });
			document.title = secure ? 'Secure' : 'Insecure';
		};
	</script>
</body>
</html>`;

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

		it('does not have Node.js access', async function () {
			const app = this.app as Application;
			const htmlPath = path.join(app.workspacePathOrFolder, 'test-node-access.html');
			fs.writeFileSync(htmlPath, NODE_ACCESS_TEST_HTML);

			await openBrowserToFile(app, htmlPath);

			await app.code.waitForElement('.tabs-container .tab.active .label-name', e => e?.textContent === 'Secure');
		});
	});
}
