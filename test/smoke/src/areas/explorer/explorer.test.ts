/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

describe('Explorer', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start('Explorer'); });
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it('quick open search produces correct result', async function () {
		await app.workbench.quickopen.openQuickOpen();

		await app.client.type('.js');

		await app.workbench.quickopen.waitForQuickOpenElements(7);
		await app.client.keys(['Escape', 'NULL']);
	});

	it('quick open respects fuzzy matching', async function () {
		await app.workbench.quickopen.openQuickOpen();

		await app.client.type('a.s');

		await app.workbench.quickopen.waitForQuickOpenElements(3);
		await app.client.keys(['Escape', 'NULL']);
	});
});