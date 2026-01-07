/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Accessibility', function () {

		// Increase timeout for accessibility scans
		this.timeout(2 * 60 * 1000);

		// Retry tests to minimize flakiness
		this.retries(2);

		// Shared before/after handling
		installAllHandlers(logger);

		let app: Application;

		before(async function () {
			app = this.app as Application;
		});

		describe('Workbench', function () {

			it('workbench has no accessibility violations', async function () {
				// Wait for workbench to be fully loaded
				await app.code.waitForElement('.monaco-workbench');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: '.monaco-workbench',
					// Disable rules that may have known issues being addressed separately
					disableRules: [
						// Color contrast issues are tracked separately
						'color-contrast'
					]
				});
			});

			it('activity bar has no accessibility violations', async function () {
				await app.code.waitForElement('.activitybar');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: '.activitybar'
				});
			});

			it('sidebar has no accessibility violations', async function () {
				await app.code.waitForElement('.sidebar');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: '.sidebar'
				});
			});

			it('status bar has no accessibility violations', async function () {
				await app.code.waitForElement('.statusbar');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: '.statusbar'
				});
			});
		});

		describe('Chat', function () {

			it('chat panel has no accessibility violations', async function () {
				// Open chat panel
				await app.workbench.quickaccess.runCommand('workbench.action.chat.open');

				// Wait for chat view to be visible
				await app.code.waitForElement('div[id="workbench.panel.chat"]');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: 'div[id="workbench.panel.chat"]',
					disableRules: [
						// Color contrast issues are tracked separately
						'color-contrast'
					]
				});
			});
		});
	});
}
