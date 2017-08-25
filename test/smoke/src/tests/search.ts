/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { Search } from '../areas/search';

let app: SpectronApplication;
let common: CommonActions;

export function testSearch() {
	describe('Search', () => {
		let search: Search;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			search = new Search(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('searches for body & checks for correct result number', async function () {
			const s = search;
			await s.openSearchViewlet();
			await s.searchFor('body');
			const result = await s.getResultText();
			assert.equal(result, '7 results in 4 files');
		});

		it('searches only for *.js files & checks for correct result number', async function () {
			const s = search;
			await s.openSearchViewlet();
			await s.searchFor('body');
			await s.toggleSearchDetails();
			await s.searchFor('*.js');
			const results = await s.getResultText();
			assert.equal(results, '4 results in 1 file');
		});

		it('dismisses result & checks for correct result number', async function () {
			const s = search;
			await s.openSearchViewlet();
			await s.searchFor('body');
			await s.hoverOverResultCount();
			await s.dismissResult();
			await app.wait();
			const result = await s.getResultText();
			assert.equal(result, '3 results in 3 files', 'Result number after dismissal does not match to expected.');
		});

		it('replaces first search result with a replace term', async function () {
			const s = search;
			await s.openSearchViewlet();
			await s.searchFor('body');
			await s.toggleReplace();
			await s.setReplaceText('ydob');
			await s.hoverOverResultCount();
			await s.replaceFirstMatch();
			await app.wait();
			await common.saveOpenedFile();
			const result = await s.getResultText();
			assert.equal(result, '3 results in 3 files', 'Result number after replacemenet does not match to expected.');
		});
	});
}