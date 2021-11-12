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

		afterEach(async () => {
			await app.workbench.terminal.killTerminal();
		});

		it('should launch the default profile', async function () {
			// Verify the terminal single tab shows up and has a title
			const terminalTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(terminalTab.textContent.trim().length > 0);
		});
		it('should contain profiles in dropdown menu', async function () {
			await app.workbench.terminal.showTerminal();
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
			ok(labels.length > 3);
		});

		it('should create a terminal via the plus button using the default profile and display tabs view', async function () {
			await app.workbench.terminal.showTerminal();
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 2);
			await app.workbench.terminal.killTerminal();
		});

		it('should create a terminal via the plus button and reflect that in the tabs list', async function () {
			await app.workbench.terminal.showTerminal();
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 2);
			await app.workbench.terminal.killTerminal();
		});

		it('should create terminal with profile via command palette', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance');
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 1);
		});

		it('should create contributed terminal with profile via command palette', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance', true);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 1);
		});

		it('should select default profile via the command pallette', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', undefined);
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 1);
		});

		it('should select default profile as contributed via the command pallette', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', true);
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 1);
		});

		it('should create split terminal with profile via command pallette', async function () {
			// await app.workbench.terminal.runProfileCommand('createInstance', undefined, true);
		});

		it('should create split contributed terminal with profile via command pallette', async function () {
			// await app.workbench.terminal.runProfileCommand('createInstance', true, true);
		});
	});
}
