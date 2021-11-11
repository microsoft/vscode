/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Application, IElement } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

const DROPDOWN_BUTTON_SELECTOR = 'li.action-item.monaco-dropdown-with-primary > div.dropdown-action-container > div > div > a';
const PLUS_BUTTON_SELECTOR = 'li.action-item.monaco-dropdown-with-primary > div.action-container.menu-entry > a';
const ACTION_ITEMS_SELECTOR = 'li.action-item.monaco-dropdown-with-primary > div.dropdown-action-container > div > div.shadow-root-host';
const SINGLE_TAB_SELECTOR = '.single-terminal-tab';
const TABS_LIST_SELECTOR = '#terminal > div > div > div.monaco-scrollable-element > div.split-view-container > div > div > div.pane-body.integrated-terminal.wide > div.monaco-split-view2.horizontal > div.monaco-scrollable-element > div.split-view-container > div:nth-child(2) > div > div > div > div > div > div.monaco-list-rows';

export function setup(opts: ParsedArgs) {
	//TODO: remove .only
	describe.only('Terminal Profiles', () => {
		let app: Application;

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			app = this.app;
		});

		it('should launch the default profile', async function () {
			await app.workbench.terminal.showTerminal();

			// Verify the terminal single tab shows up and has a title
			const terminalTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(terminalTab.textContent.trim().length > 0);
		});
		it('should contain profiles in dropdown menu', async function () {
			await app.code.waitAndClick(DROPDOWN_BUTTON_SELECTOR);
			const actionItems = await app.code.waitForElements(ACTION_ITEMS_SELECTOR, true);
			const labels: string[] = [];
			const actionLabels: IElement[] = [];
			for (const c of actionItems[0].children) {
				for (const actionLabel of c.children) {
					actionLabels.push(actionLabel);
					labels.push(actionLabel.textContent || actionLabel.attributes.ariaLabel);
				}
			}
			// TODO: can we do platform specific?
			// deepStrictEqual(labels[0], 'PowerShell');
			// deepStrictEqual(labels[1], 'Git Bash');
			// deepStrictEqual(labels[2], 'Ubuntu (WSL)');
			// deepStrictEqual(labels[3], 'JavaScript Debug Terminal');
			// deepStrictEqual(labels[4], 'Split Terminal');
			ok(labels.length > 3);
		});

		it('should create a terminal via the profiles menu', async function () {
			const actionItems = await app.code.waitForElements(ACTION_ITEMS_SELECTOR, true);
			const labels: string[] = [];
			const actionLabels: IElement[] = [];
			for (const c of actionItems[0].children) {
				for (const actionLabel of c.children) {
					actionLabels.push(actionLabel);
					labels.push(actionLabel.textContent || actionLabel.attributes.ariaLabel);
				}
			}
			await app.code.waitAndClick(DROPDOWN_BUTTON_SELECTOR);
			// TODO: verify that clicking the profile creates it
			// shadow root must be closed bc this isn't working
			// const result = await app.code.waitAndClick('div.dropdown-action-container > div > div.shadow-root-host .action-item', actionItems[0].left, actionItems[0].top);
			// const terminalTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			// ok(terminalTab.textContent === labels[0]);

			// manually shut it for now since can't select an action-item from the menu, remove once this is possible
			await app.code.waitAndClick(DROPDOWN_BUTTON_SELECTOR);
		});

		it('should not auto-close the profile dropdown after 2 seconds', async function () {
			await app.code.waitAndClick(DROPDOWN_BUTTON_SELECTOR);
			await sleep(2500);
			// guarantees that it's still open - historically has been shut on occasion by updating too frequently
			await app.code.waitForElement(ACTION_ITEMS_SELECTOR);
		});

		it('should create a terminal via the plus button using the default profile and display tabs view', async function () {
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 2);
		});

		it('should create another terminal via the plus button and reflect that in the tabs list', async function () {
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 3);
		});

		// TODO: why is assertion failing? timing issue
		it('should create terminal with profile via command pallette', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance');
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 4);
			// TODO: strict check that active terminal is of correct type
		});

		it('should create contributed terminal with profile via command pallette', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance', true);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 5);
			// TODO: strict check that active terminal is of correct type
		});

		// it('should select default profile via the command pallette', async function () {
		// 	await app.workbench.terminal.runProfileCommand('setDefault', undefined);
		// 	await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
		// 	const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
		// 	deepStrictEqual(tabs[0].children.length, 6);
		// 	// TODO: strict check that active terminal is of correct type
		// });

		// // TODO: why is assertion failing? timing issue
		// it('should select default profile as contributed via the command pallette', async function () {
		// 	await app.workbench.terminal.runProfileCommand('setDefault', true);
		// 	await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
		// 	const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
		// 	deepStrictEqual(tabs[0].children.length, 7);
		// 	// TODO: strict check that active terminal is of correct type
		// });

		// TODO: playwright doesn't recognize alt as a key?
		// it('should create split terminal with profile via command pallette', async function () {
		// 	await app.workbench.terminal.runProfileCommand('createInstance', undefined, true);
		// });

		// it('should create split contributed terminal with profile via command pallette', async function () {
		// 	await app.workbench.terminal.runProfileCommand('createInstance', true, true);
		// });

	});
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}
