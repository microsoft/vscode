/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { Application, ProblemSeverity, Problems, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Language Features', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('verifies quick outline (js)', async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'bin', 'www'));

			await app.workbench.quickaccess.openQuickOutline();
			await app.workbench.quickinput.waitForQuickInputElements(names => names.length >= 6);
			await app.workbench.quickinput.closeQuickInput();
		});

		it('verifies quick outline (css)', async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'public', 'stylesheets', 'style.css'));

			await app.workbench.quickaccess.openQuickOutline();
			await app.workbench.quickinput.waitForQuickInputElements(names => names.length === 2);
			await app.workbench.quickinput.closeQuickInput();
		});

		it('verifies problems view (css)', async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'public', 'stylesheets', 'style.css'));
			await app.workbench.editor.waitForTypeInEditor('style.css', '.foo{}');

			await app.code.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.WARNING));

			await app.workbench.problems.showProblemsView();
			await app.code.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.WARNING));
			await app.workbench.problems.hideProblemsView();
		});

		it('verifies settings (css)', async function () {
			const app = this.app as Application;
			await app.workbench.settingsEditor.addUserSetting('css.lint.emptyRules', '"error"');
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'public', 'stylesheets', 'style.css'));

			await app.code.waitForElement(Problems.getSelectorInEditor(ProblemSeverity.ERROR));

			await app.workbench.problems.showProblemsView();
			await app.code.waitForElement(Problems.getSelectorInProblemsView(ProblemSeverity.ERROR));
			await app.workbench.problems.hideProblemsView();
		});
	});
}
