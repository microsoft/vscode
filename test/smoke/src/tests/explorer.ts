/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';

let app: SpectronApplication;
let common: CommonActions;

export function testExplorer() {
	describe('Explorer', () => {

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('quick open search produces correct result', async function () {
			await common.openQuickOpen();
			await common.type('.js');
			await app.wait();
			const elCount = await common.getQuickOpenElements();
			assert.equal(elCount, 7);
		});

		it('quick open respects fuzzy matching', async function () {
			await common.openQuickOpen();
			await common.type('a.s');
			await app.wait();
			const elCount = await common.getQuickOpenElements();
			assert.equal(elCount, 3);
		});
	});
}