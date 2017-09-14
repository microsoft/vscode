/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication } from '../../spectron/application';

describe('Editor', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start('Editor'); });
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it('shows correct quick outline', async function () {
		await app.workbench.quickopen.openFile('www');

		const outline = await app.workbench.editor.openOutline();

		await outline.waitForQuickOpenElements(12);
	});

	it(`finds 'All References' to 'app'`, async function () {
		await app.workbench.quickopen.openFile('www');

		const references = await app.workbench.editor.findReferences('app', 7);

		await references.waitForReferencesCountInTitle(3);
		await references.waitForReferencesCount(3);
		await references.close();
	});

	it(`renames local 'app' variable`, async function () {
		await app.workbench.quickopen.openFile('www');

		const selector = await app.workbench.editor.getSelector('app', 7);
		const rename = await app.workbench.editor.rename('app', 7);
		await rename.rename('newApp');

		const actual = await app.client.waitForText(selector, 'newApp');
		await app.screenCapturer.capture('Rename result');
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

		await app.workbench.waitForActiveTab('index.d.ts');
	});

	it(`verifies that 'Peek Definition' works`, async function () {
		await app.workbench.quickopen.openFile('app.js');

		const peek = await app.workbench.editor.peekDefinition('express', 11);

		await peek.waitForFile('index.d.ts');
	});
});