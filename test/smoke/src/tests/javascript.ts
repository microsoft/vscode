/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { JavaScript } from '../areas/javascript';

let app: SpectronApplication;
let common: CommonActions;

export function testJavaScript() {
	describe('JavaScript', () => {
		let js: JavaScript;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			js = new JavaScript(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('shows correct quick outline', async function () {
			await common.openFirstMatchFile('bin/www');
			await js.openQuickOutline();
			await app.wait();
			const symbols = await common.getQuickOpenElements();
			assert.equal(symbols, 12, 'Quick outline elements count does not match to expected.');
		});

		it(`finds 'All References' to 'app'`, async function () {
			await common.openFirstMatchFile('bin/www');
			await js.findAppReferences();
			await app.wait();
			const titleCount = await js.getTitleReferencesCount();
			assert.equal(titleCount, 3, 'References count in widget title is not as expected.');
			const treeCount = await js.getTreeReferencesCount();
			assert.equal(treeCount, 3, 'References count in tree is not as expected.');
		});

		it(`renames local 'app' variable`, async function () {
			await common.openFirstMatchFile('bin/www');

			const newVarName = 'newApp';
			await js.renameApp(newVarName);
			await common.enter();
			const newName = await js.getNewAppName();
			assert.equal(newName, newVarName);
		});

		it('folds/unfolds the code correctly', async function () {
			await common.openFirstMatchFile('bin/www');
			// Fold
			await js.toggleFirstCommentFold();
			const foldedIcon = await js.getFirstCommentFoldedIcon();
			assert.ok(foldedIcon, 'Folded icon was not found in the margin.');
			let nextLineNumber = await js.getNextLineNumberAfterFold();
			assert.equal(nextLineNumber, 7, 'Line number after folded code is wrong.');
			// Unfold
			await js.toggleFirstCommentFold();
			nextLineNumber = await js.getNextLineNumberAfterFold();
			assert.equal(nextLineNumber, 4, 'Line number with unfolded code is wrong.');
		});

		it(`verifies that 'Go To Definition' works`, async function () {
			await common.openFirstMatchFile('app.js');
			await js.goToExpressDefinition();
			await app.wait();
			assert.ok(await common.getTab('index.d.ts'), 'Tab opened when navigating to definition is not as expected.');
		});

		it(`verifies that 'Peek Definition' works`, async function () {
			await common.openFirstMatchFile('app.js');
			await js.peekExpressDefinition();
			await app.wait();
			const definitionFilename = await js.getPeekExpressResultName();
			assert.equal(definitionFilename, 'index.d.ts', 'Peek result is not as expected.');
		});
	});
}