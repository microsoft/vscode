/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

let app: SpectronApplication;

export function testExplorer() {
	describe('Explorer', () => {

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('quick open search produces correct result', async function () {
			await app.workbench.quickopen.openQuickOpen();
			await app.client.type('.js');
			const elements = await app.workbench.quickopen.getQuickOpenElements();
			assert.equal(elements.length, 7);
		});

		it('quick open respects fuzzy matching', async function () {
			await app.workbench.quickopen.openQuickOpen();
			await app.client.type('a.s');

			const elements = await app.workbench.quickopen.getQuickOpenElements();
			assert.equal(elements.length, 3);
		});
	});
}