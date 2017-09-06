/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication } from '../../spectron/application';

describe('Editor', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start(); });
	after(() => app.stop());

	it('shows correct quick outline', async function () {
		await app.workbench.quickopen.openFile('www');

		const outline = await app.workbench.editor.openOutline();

		const symbols = await outline.getQuickOpenElements();
		assert.equal(symbols.length, 12, 'Quick outline elements count does not match to expected.');
	});

	it(`finds 'All References' to 'app'`, async function () {
		await app.workbench.quickopen.openFile('www');

		const references = await app.workbench.editor.findReferences('app', 7);

		const countInTitle = await references.getCountFromTitle();
		assert.equal(countInTitle, 3, 'References count in widget title is not as expected.');
		const referencesCount = await references.getCount();
		assert.equal(referencesCount, 3, 'References count in tree is not as expected.');

		await references.close();
	});

	it(`renames local 'app' variable`, async function () {
		await app.workbench.quickopen.openFile('www');

		const selector = await app.workbench.editor.getSelector('app', 7);
		const rename = await app.workbench.editor.rename('app', 7);
		rename.rename('newApp');

		const actual = await app.client.waitForText(selector, 'newApp');
		assert.equal(actual, 'newApp');
	});

	it('folds/unfolds the code correctly', async function () {
		await app.workbench.quickopen.openFile('www');

		// Fold
		await app.workbench.editor.foldAtLine(3);
		await app.workbench.editor.waitUntilShown(3);
		await app.workbench.editor.waitUntilHidden(4);
		await app.workbench.editor.waitUntilHidden(5);

		// Unfold
		await app.workbench.editor.unfoldAtLine(3);
		await app.workbench.editor.waitUntilShown(3);
		await app.workbench.editor.waitUntilShown(4);
		await app.workbench.editor.waitUntilShown(5);
	});

	it(`verifies that 'Go To Definition' works`, async function () {
		await app.workbench.quickopen.openFile('app.js');

		await app.workbench.editor.gotoDefinition('express', 11);

		assert.ok(await app.workbench.waitForActiveOpen('index.d.ts'), 'Tab opened when navigating to definition is not as expected.');
	});

	it(`verifies that 'Peek Definition' works`, async function () {
		await app.workbench.quickopen.openFile('app.js');

		const peek = await app.workbench.editor.peekDefinition('express', 11);

		const definitionFilename = await peek.getFileNameFromTitle();
		assert.equal(definitionFilename, 'index.d.ts', 'Peek result is not as expected.');
	});
});