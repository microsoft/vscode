/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { JavaScriptDebug } from '../areas/javascript-debug';

let app: SpectronApplication;
let common: CommonActions;

export function testJavaScriptDebug() {
	describe('Debugging JavaScript', () => {
		let jsDebug: JavaScriptDebug;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			jsDebug = new JavaScriptDebug(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('autodetects program attribute for launch.json', async function () {
			await jsDebug.openDebugViewlet();
			await jsDebug.pressConfigureLaunchJson();
			const value = await jsDebug.getProgramConfigValue();
			process.platform === 'win32' ? assert.equal(value, '${workspaceRoot}\\bin\\www') : assert.equal(value, '${workspaceRoot}/bin/www');
		});

		it(`can set a breakpoint and verify if it's set`, async function () {
			await common.openFirstMatchFile('index.js');
			await jsDebug.setBreakpointOnLine(6);
			const breakpoint = await jsDebug.verifyBreakpointOnLine(6);
			assert.ok(breakpoint, 'Breakpoint was not found on line 6.');
		});
	});
}