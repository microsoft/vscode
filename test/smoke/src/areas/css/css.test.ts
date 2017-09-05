/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';
import { ProblemSeverity, Problems } from '../problems/problems';
import { QuickOutline } from '../editor/quickoutline';
import { SettingsEditor } from '../preferences/settings';

describe('CSS', () => {
	let app: SpectronApplication;
	before(() => {
		app = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		return app.start();
	});
	after(() => app.stop());

	it('verifies quick outline', async function () {
		await app.workbench.quickopen.openFile('style.css');
		const outline = new QuickOutline(app);
		await outline.openSymbols();
		const elements = await app.client.waitForElements(QuickOutline.QUICK_OPEN_ENTRY_SELECTOR, elements => elements.length === 2);
		assert.ok(elements, `Did not find two outline elements`);
	});

	it('verifies warnings for the empty rule', async function () {
		await app.workbench.quickopen.openFile('style.css');
		await app.client.waitForElement(`.monaco-editor.focused`);
		await app.type('.foo{}');

		let warning = await app.client.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.WARNING));
		assert.ok(warning, `Warning squiggle is not shown in 'style.css'.`);

		const problems = new Problems(app);
		await problems.showProblemsView();
		warning = await app.client.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.WARNING));
		assert.ok(warning, 'Warning does not appear in Problems view.');
		await problems.hideProblemsView();
	});

	it('verifies that warning becomes an error once setting changed', async function () {
		await new SettingsEditor(app).addUserSetting('css.lint.emptyRules', '"error"');
		await app.workbench.quickopen.openFile('style.css');
		await app.type('.foo{}');

		let error = await app.client.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.ERROR));
		assert.ok(error, `Warning squiggle is not shown in 'style.css'.`);

		const problems = new Problems(app);
		await problems.showProblemsView();
		error = await app.client.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.ERROR));
		assert.ok(error, 'Warning does not appear in Problems view.');
		await problems.hideProblemsView();
	});
});