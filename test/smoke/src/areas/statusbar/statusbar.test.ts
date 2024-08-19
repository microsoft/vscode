/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { Application, StatusBarElement, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Statusbar', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('verifies presence of all default status bar elements', async function () {
			const app = this.app as Application;
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.BRANCH_STATUS);
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.SYNC_STATUS);
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.PROBLEMS_STATUS);

			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'readme.md'));
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.ENCODING_STATUS);
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.EOL_STATUS);
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.INDENTATION_STATUS);
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.LANGUAGE_STATUS);
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.SELECTION_STATUS);
		});

		it(`verifies that 'quick input' opens when clicking on status bar elements`, async function () {
			const app = this.app as Application;
			await app.workbench.statusbar.clickOn(StatusBarElement.BRANCH_STATUS);
			await app.workbench.quickinput.waitForQuickInputOpened();
			await app.workbench.quickinput.closeQuickInput();

			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'readme.md'));
			await app.workbench.statusbar.clickOn(StatusBarElement.INDENTATION_STATUS);
			await app.workbench.quickinput.waitForQuickInputOpened();
			await app.workbench.quickinput.closeQuickInput();
			await app.workbench.statusbar.clickOn(StatusBarElement.ENCODING_STATUS);
			await app.workbench.quickinput.waitForQuickInputOpened();
			await app.workbench.quickinput.closeQuickInput();
			await app.workbench.statusbar.clickOn(StatusBarElement.EOL_STATUS);
			await app.workbench.quickinput.waitForQuickInputOpened();
			await app.workbench.quickinput.closeQuickInput();
			await app.workbench.statusbar.clickOn(StatusBarElement.LANGUAGE_STATUS);
			await app.workbench.quickinput.waitForQuickInputOpened();
			await app.workbench.quickinput.closeQuickInput();
		});

		it(`verifies that 'Problems View' appears when clicking on 'Problems' status element`, async function () {
			const app = this.app as Application;
			await app.workbench.statusbar.clickOn(StatusBarElement.PROBLEMS_STATUS);
			await app.workbench.problems.waitForProblemsView();
		});

		it(`verifies if changing EOL is reflected in the status bar`, async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'readme.md'));
			await app.workbench.statusbar.clickOn(StatusBarElement.EOL_STATUS);

			await app.workbench.quickinput.selectQuickInputElement(1);

			await app.workbench.statusbar.waitForEOL('CRLF');
		});
	});
}
