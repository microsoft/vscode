/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger, Quality } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger, opts: { web?: boolean }, quality: Quality) {
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

			(opts.web ? it.skip : it)('workbench has no accessibility violations', async function () {
				// Wait for workbench to be fully loaded
				await app.code.waitForElement('.monaco-workbench');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: '.monaco-workbench',
					excludeRules: {
						// Links in chat welcome view show underline on hover/focus which axe-core static analysis cannot detect
						'link-in-text-block': ['command:workbench.action.chat.generateInstructions'],
						// Monaco lists use aria-multiselectable on role="list" and aria-setsize/aria-posinset/aria-selected on role="dialog" rows
						// These violations appear intermittently when notification lists or other dynamic lists are visible
						// Note: patterns match against HTML string, not CSS selectors, so no leading dots
						'aria-allowed-attr': ['monaco-list', 'monaco-list-row'],
						// Monaco lists may temporarily contain dialog children during extension activation errors
						'aria-required-children': ['monaco-list']
					}
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

		// Chat is not available in web mode
		if (quality !== Quality.Dev && quality !== Quality.OSS && !opts.web) {
			describe('Chat', function () {

				it('chat panel has no accessibility violations', async function () {
					// Open chat panel
					await app.workbench.quickaccess.runCommand('workbench.action.chat.open');

					// Wait for chat view to be visible
					await app.code.waitForElement('div[id="workbench.panel.chat"]');

					await app.code.driver.assertNoAccessibilityViolations({
						selector: 'div[id="workbench.panel.chat"]',
						excludeRules: {
							// Links in chat welcome view show underline on hover/focus which axe-core static analysis cannot detect
							'link-in-text-block': ['command:workbench.action.chat.generateInstructions']
						}
					});
				});

				// Chat response test requires gallery service which is only available in non-Dev/OSS builds
				it('chat response has no accessibility violations', async function () {
					// Disable retries for this test - it modifies settings and retries cause issues
					this.retries(0);
					// Extend timeout for this test since AI responses can take a while
					this.timeout(3 * 60 * 1000);

					// Enable anonymous chat access
					await app.workbench.settingsEditor.addUserSetting('chat.allowAnonymousAccess', 'true');

					// Open chat panel
					await app.workbench.quickaccess.runCommand('workbench.action.chat.open');

					// Wait for chat view to be visible
					await app.workbench.chat.waitForChatView();

					// Send a simple message
					await app.workbench.chat.sendMessage('Create a simple hello.txt file with the text "Hello World"');

					// Wait for the response to complete (1500 retries ~= 150 seconds at 100ms per retry)
					await app.workbench.chat.waitForResponse(1500);

					// Run accessibility check on the chat panel with the response
					await app.code.driver.assertNoAccessibilityViolations({
						selector: 'div[id="workbench.panel.chat"]',
						excludeRules: {
							// Links in chat welcome view show underline on hover/focus which axe-core static analysis cannot detect
							'link-in-text-block': ['command:workbench.action.chat.generateInstructions'],
							// Monaco lists use aria-multiselectable on role="list" and aria-selected on role="listitem"
							// These are used intentionally for selection semantics even though technically not spec-compliant
							'aria-allowed-attr': ['monaco-list', 'monaco-list-row'],
							// Some icon buttons have empty aria-label during rendering
							'aria-command-name': ['codicon-plus'],
							// Todo list widget has clear button nested inside expander button for layout purposes
							'nested-interactive': ['todo-list-container']
						}
					});
				});

				it('chat terminal tool response has no accessibility violations', async function () {
					// Disable retries for this test
					this.retries(0);
					// Extend timeout for this test since AI responses can take a while
					this.timeout(3 * 60 * 1000);

					// Enable auto-approve for tools so terminal commands run automatically
					await app.workbench.settingsEditor.addUserSetting('chat.tools.global.autoApprove', 'true');

					// Open chat panel
					await app.workbench.quickaccess.runCommand('workbench.action.chat.open');

					// Wait for chat view to be visible
					await app.workbench.chat.waitForChatView();

					// Send a terminal command request
					await app.workbench.chat.sendMessage('Run ls in the terminal');

					// Wait for the response to complete (1500 retries ~= 150 seconds at 100ms per retry)
					await app.workbench.chat.waitForResponse(1500);

					// Run accessibility check on the chat panel with the response
					await app.code.driver.assertNoAccessibilityViolations({
						selector: 'div[id="workbench.panel.chat"]',
						excludeRules: {
							// Links in chat welcome view show underline on hover/focus which axe-core static analysis cannot detect
							'link-in-text-block': ['command:workbench.action.chat.generateInstructions'],
							// Monaco lists use aria-multiselectable on role="list" and aria-selected on role="listitem"
							// These are used intentionally for selection semantics even though technically not spec-compliant
							'aria-allowed-attr': ['monaco-list', 'monaco-list-row'],
							// Some icon buttons have empty aria-label during rendering
							'aria-command-name': ['codicon-plus'],
							// Todo list widget has clear button nested inside expander button for layout purposes
							'nested-interactive': ['todo-list-container']
						}
					});
				});
			});
		}
	});
}
