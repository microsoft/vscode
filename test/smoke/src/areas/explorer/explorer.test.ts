/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

describe('Explorer', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start('Explorer'); });
	after(() => app.stop());

	it('quick open search produces correct result', async function () {
		const expectedNames = [
			'.eslintrc.json',
			'tasks.json',
			'app.js',
			'index.js',
			'users.js',
			'package.json',
			'jsconfig.json'
		];

		await app.workbench.quickopen.openQuickOpen('.js');
		await app.workbench.quickopen.waitForQuickOpenElements(names => expectedNames.every(n => names.some(m => n === m)));
		await app.client.keys(['Escape', 'NULL']);
	});

	it('quick open respects fuzzy matching', async function () {
		const expectedNames = [
			'tasks.json',
			'app.js',
			'package.json'
		];

		await app.workbench.quickopen.openQuickOpen('a.s');
		await app.workbench.quickopen.waitForQuickOpenElements(names => expectedNames.every(n => names.some(m => n === m)));
		await app.client.keys(['Escape', 'NULL']);
	});
});