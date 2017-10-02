/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, VSCODE_BUILD } from '../../spectron/application';
import { StatusBarElement } from './statusbar';


describe('Statusbar', () => {
	let app: SpectronApplication = new SpectronApplication();
	before(() => app.start('Statusbar'));
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it('verifies presence of all default status bar elements', async function () {
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.BRANCH_STATUS);
		if (app.build !== VSCODE_BUILD.DEV) {
			await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.FEEDBACK_ICON);
		}
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.SYNC_STATUS);
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.PROBLEMS_STATUS);

		await app.workbench.quickopen.openFile('app.js');
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.ENCODING_STATUS);
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.EOL_STATUS);
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.INDENTATION_STATUS);
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.LANGUAGE_STATUS);
		await app.workbench.statusbar.waitForStatusbarElement(StatusBarElement.SELECTION_STATUS);
	});

	it(`verifies that 'quick open' opens when clicking on status bar elements`, async function () {
		await app.workbench.statusbar.clickOn(StatusBarElement.BRANCH_STATUS);
		await app.workbench.quickopen.waitForQuickOpenOpened();
		await app.workbench.quickopen.closeQuickOpen();

		await app.workbench.quickopen.openFile('app.js');
		await app.workbench.statusbar.clickOn(StatusBarElement.INDENTATION_STATUS);
		await app.workbench.quickopen.waitForQuickOpenOpened();
		await app.workbench.quickopen.closeQuickOpen();
		await app.workbench.statusbar.clickOn(StatusBarElement.ENCODING_STATUS);
		await app.workbench.quickopen.waitForQuickOpenOpened();
		await app.workbench.quickopen.closeQuickOpen();
		await app.workbench.statusbar.clickOn(StatusBarElement.EOL_STATUS);
		await app.workbench.quickopen.waitForQuickOpenOpened();
		await app.workbench.quickopen.closeQuickOpen();
		await app.workbench.statusbar.clickOn(StatusBarElement.LANGUAGE_STATUS);
		await app.workbench.quickopen.waitForQuickOpenOpened();
		await app.workbench.quickopen.closeQuickOpen();
	});

	it(`verifies that 'Problems View' appears when clicking on 'Problems' status element`, async function () {
		await app.workbench.statusbar.clickOn(StatusBarElement.PROBLEMS_STATUS);
		await app.workbench.problems.waitForProblemsView();
	});

	if (app.build !== VSCODE_BUILD.DEV) {
		it(`verifies that 'Tweet us feedback' pop-up appears when clicking on 'Feedback' icon`, async function () {
			await app.workbench.statusbar.clickOn(StatusBarElement.FEEDBACK_ICON);
			assert.ok(!!await app.client.waitForElement('.feedback-form'));
		});
	}

	it(`checks if 'Go to Line' works if called from the status bar`, async function () {
		await app.workbench.quickopen.openFile('app.js');
		await app.workbench.statusbar.clickOn(StatusBarElement.SELECTION_STATUS);

		await app.workbench.quickopen.waitForQuickOpenOpened();

		await app.workbench.quickopen.submit('15');
		await app.workbench.editor.waitForHighlightingLine(15);
	});

	it(`verifies if changing EOL is reflected in the status bar`, async function () {
		await app.workbench.quickopen.openFile('app.js');
		await app.workbench.statusbar.clickOn(StatusBarElement.EOL_STATUS);

		await app.workbench.quickopen.waitForQuickOpenOpened();

		await app.workbench.quickopen.selectQuickOpenElement(1);
		await app.workbench.statusbar.waitForEOL('CRLF');
	});
});