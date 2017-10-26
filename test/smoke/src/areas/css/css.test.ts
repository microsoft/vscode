/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';
import { ProblemSeverity, Problems } from '../problems/problems';

describe('CSS', () => {
	before(function () {
		this.app.suiteName = 'CSS';
	});

	it('verifies quick outline', async function () {
		const app = this.app as SpectronApplication;
		await app.workbench.quickopen.openFile('style.css');

		await app.workbench.editor.openOutline();
		await app.workbench.quickopen.waitForQuickOpenElements(names => names.length === 2);
	});

	it('verifies warnings for the empty rule', async function () {
		const app = this.app as SpectronApplication;
		await app.workbench.quickopen.openFile('style.css');
		await app.workbench.editor.waitForTypeInEditor('style.css', '.foo{}');

		let warning = await app.client.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.WARNING));
		await app.screenCapturer.capture('CSS Warning in editor');
		assert.ok(warning, `Warning squiggle is not shown in 'style.css'.`);

		await app.workbench.problems.showProblemsView();
		warning = await app.client.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.WARNING));
		await app.screenCapturer.capture('CSS Warning in problems view');
		assert.ok(warning, 'Warning does not appear in Problems view.');
		await app.workbench.problems.hideProblemsView();
	});

	it('verifies that warning becomes an error once setting changed', async function () {
		const app = this.app as SpectronApplication;
		await app.workbench.settingsEditor.addUserSetting('css.lint.emptyRules', '"error"');
		await app.workbench.quickopen.openFile('style.css');
		await app.workbench.editor.waitForTypeInEditor('style.css', '.foo{}');

		let error = await app.client.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.ERROR));
		await app.screenCapturer.capture('CSS Error in editor');
		assert.ok(error, `Warning squiggle is not shown in 'style.css'.`);

		const problems = new Problems(app);
		await problems.showProblemsView();
		error = await app.client.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.ERROR));
		await app.screenCapturer.capture('CSS Error in probles view');
		assert.ok(error, 'Warning does not appear in Problems view.');
		await problems.hideProblemsView();
	});
});