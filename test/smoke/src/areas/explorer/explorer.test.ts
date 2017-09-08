/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';

describe('Explorer', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start('Explorer'); });
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it('quick open search produces correct result', async function () {
		await app.workbench.quickopen.openQuickOpen();
		await app.client.type('.js');
		const elements = await app.workbench.quickopen.getQuickOpenElements();
		await app.client.keys(['Escape', 'NULL']);

		await app.screenCapturer.capture('Quick open result');
		assert.equal(elements.length, 7, 'There are 7 elements in quick open');
	});

	it('quick open respects fuzzy matching', async function () {
		await app.workbench.quickopen.openQuickOpen();
		await app.client.type('a.s');

		const elements = await app.workbench.quickopen.getQuickOpenElements();
		await app.client.keys(['Escape', 'NULL']);

		await app.screenCapturer.capture('fuzzy match result');
		assert.equal(elements.length, 3, 'There are 3 elements in quick open');
	});
});