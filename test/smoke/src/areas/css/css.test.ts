/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { ProblemSeverity, Problems } from '../problems/problems';

export function setup() {
	describe('CSS', () => {
		before(function () {
			this.app.suiteName = 'CSS';
		});

		it('verifies quick outline', async function () {
			const app = this.app as SpectronApplication;
			await app.workbench.quickopen.openFile('style.css');

			await app.workbench.quickopen.openQuickOutline();
			await app.workbench.quickopen.waitForQuickOpenElements(names => names.length === 2);
		});

		it('verifies warnings for the empty rule', async function () {
			const app = this.app as SpectronApplication;
			await app.workbench.quickopen.openFile('style.css');
			await app.workbench.editor.waitForTypeInEditor('style.css', '.foo{}');

			await app.client.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.WARNING));
			await app.screenCapturer.capture('CSS Warning in editor');

			await app.workbench.problems.showProblemsView();
			await app.client.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.WARNING));
			await app.screenCapturer.capture('CSS Warning in problems view');
			await app.workbench.problems.hideProblemsView();
		});

		it('verifies that warning becomes an error once setting changed', async function () {
			const app = this.app as SpectronApplication;
			await app.workbench.settingsEditor.addUserSetting('css.lint.emptyRules', '"error"');
			await app.workbench.quickopen.openFile('style.css');
			await app.workbench.editor.waitForTypeInEditor('style.css', '.foo{}');

			await app.client.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.ERROR));
			await app.screenCapturer.capture('CSS Error in editor');

			const problems = new Problems(app.client, app.workbench);
			await problems.showProblemsView();
			await app.client.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.ERROR));
			await app.screenCapturer.capture('CSS Error in probles view');
			await problems.hideProblemsView();
		});
	});
}