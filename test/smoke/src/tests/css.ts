/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { CSS, CSSProblem } from '../areas/css';

let app: SpectronApplication;
let common: CommonActions;

export function testCSS() {
	describe('CSS', () => {
		let css: CSS;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			css = new CSS(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies quick outline', async function () {
			await common.openFirstMatchFile('style.css');
			await css.openQuickOutline();
			await app.wait();
			const count = await common.getQuickOpenElements();
			assert.equal(count, 2, 'Quick outline symbol count is wrong.');
		});

		it('verifies warnings for the empty rule', async function () {
			await common.openFirstMatchFile('style.css');
			await common.type('.foo{}');
			await app.wait();
			let warning = await css.getEditorProblem(CSSProblem.WARNING);
			assert.ok(warning, `Warning squiggle is not shown in 'style.css'.`);
			await css.toggleProblemsView();
			warning = await css.getProblemsViewsProblem(CSSProblem.WARNING);
			assert.ok(warning, 'Warning does not appear in Problems view.');
		});

		it('verifies that warning becomes an error once setting changed', async function () {
			await common.addSetting('css.lint.emptyRules', 'error');
			await common.openFirstMatchFile('style.css');
			await common.type('.foo{}');
			await app.wait();
			let error = await css.getEditorProblem(CSSProblem.ERROR);
			assert.ok(error, `Error squiggle is not shown in 'style.css'.`);
			await css.toggleProblemsView();
			error = await css.getProblemsViewsProblem(CSSProblem.ERROR);
			assert.ok(error, `Error does not appear in Problems view`);
		});
	});
}