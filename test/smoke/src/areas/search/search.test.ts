/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';

describe('Search', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start(); });
	after(() => app.stop());

	it('searches for body & checks for correct result number', async function () {
		await app.workbench.search.openSearchViewlet();
		await app.workbench.search.searchFor('body');
		const result = await app.workbench.search.getResultText();
		assert.equal(result, '7 results in 4 files');
	});

	it('searches only for *.js files & checks for correct result number', async function () {
		await app.workbench.search.openSearchViewlet();
		await app.workbench.search.searchFor('body');
		await app.workbench.search.showQueryDetails();
		await app.workbench.search.setFilesToIncludeTextAndSearch('*.js');

		await app.workbench.search.submitSearch();

		const results = await app.workbench.search.getResultText();
		await app.workbench.search.setFilesToIncludeTextAndSearch('');
		await app.workbench.search.hideQueryDetails();

		assert.equal(results, '4 results in 1 file');
	});

	it('dismisses result & checks for correct result number', async function () {
		await app.workbench.search.openSearchViewlet();
		await app.workbench.search.searchFor('body');

		await app.workbench.search.removeFileMatch(1);

		const result = await app.workbench.search.getResultText();
		assert.equal(result, '3 results in 3 files', 'Result number after dismissal does not match to expected.');
	});

	it('replaces first search result with a replace term', async function () {
		await app.workbench.search.openSearchViewlet();
		await app.workbench.search.searchFor('body');

		await app.workbench.search.setReplaceText('ydob');
		await app.workbench.search.replaceFileMatch(1);
		await app.workbench.saveOpenedFile();

		const result = await app.workbench.search.getResultText();
		assert.equal(result, '3 results in 3 files', 'Result number after replacemenet does not match to expected.');
	});
});