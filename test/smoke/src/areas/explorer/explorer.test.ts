/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../application';

export function setup() {
	describe('Explorer', () => {
		it('quick open search produces correct result', async function () {
			const app = this.app as SpectronApplication;
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
			await app.api.dispatchKeybinding('escape');
		});

		it('quick open respects fuzzy matching', async function () {
			const app = this.app as SpectronApplication;
			const expectedNames = [
				'tasks.json',
				'app.js',
				'package.json'
			];

			await app.workbench.quickopen.openQuickOpen('a.s');
			await app.workbench.quickopen.waitForQuickOpenElements(names => expectedNames.every(n => names.some(m => n === m)));
			await app.api.dispatchKeybinding('escape');
		});
	});
}