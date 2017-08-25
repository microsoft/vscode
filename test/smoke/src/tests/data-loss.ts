/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, USER_DIR, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { DataLoss } from '../areas/data-loss';

let app: SpectronApplication;
let common: CommonActions;
let dl: DataLoss;

export function testDataLoss() {
	describe('Data Loss', () => {

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH], [`--user-data-dir=${USER_DIR}`]);
			common = new CommonActions(app);
			dl = new DataLoss(app);
			await common.removeDirectory(USER_DIR);

			await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it(`verifies that 'hot exit' works for dirty files`, async function () {
			const textToType = 'Hello, Code', fileName = 'readme.md', untitled = 'Untitled-1';
			await common.newUntitledFile();
			await common.type(textToType);
			await dl.openExplorerViewlet();
			await common.openFile(fileName, true);
			await common.type(textToType);

			await app.stop();
			await app.start();

			// check tab presence
			assert.ok(await common.getTab(untitled), `${untitled} tab is not present after reopening.`);
			assert.ok(await common.getTab(fileName, true), `${fileName} tab is not present or is not active after reopening.`);
			// check if they marked as dirty (icon) and active tab is the last opened
			assert.ok(await dl.verifyTabIsDirty(untitled), `${untitled} tab is not dirty after reopening.`);
			assert.ok(await dl.verifyTabIsDirty(fileName, true), `${fileName} tab is not dirty after reopening.`);
		});

		it(`verifies that contents of the dirty files are restored after 'hot exit'`, async function () {
			// make one dirty file,
			// create one untitled file
			const textToType = 'Hello, Code';

			// create one untitled file
			await common.newUntitledFile();
			await common.type(textToType);

			// make one dirty file,
			await common.openFile('readme.md', true);
			await common.type(textToType);

			await app.stop();
			await app.start();

			// check their contents
			let fileDirt = await common.getEditorFirstLinePlainText();
			assert.equal(fileDirt, textToType, 'Active file contents are different after restore.');
			await common.selectTab('Untitled-1');
			fileDirt = await common.getEditorFirstLinePlainText();
			assert.equal(fileDirt, textToType, 'Untitled file edit are different after restore.');
		});
	});
}