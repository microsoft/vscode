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
const FIRST_TAB_LABEL_SELECTOR = '#list_id_1_0 > div > div > div.monaco-icon-label-container > span.monaco-icon-name-container > a > span';
const SECOND_TAB_LABEL_SELECTOR = '#list_id_1_1 > div > div > div.monaco-icon-label-container > span.monaco-icon-name-container > a > span';
const CONTRIBUTED_PROFILE_NAME = `JavaScript Debug Terminal`;

export function setup(opts: ParsedArgs) {
	describe.only('Terminal Profiles', () => {
		let app: Application;

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			app = this.app;
		});

		afterEach(async function () {
			await app.workbench.terminal.killTerminal();
		});

		it('should launch the default profile', async function () {
			await app.workbench.terminal.showTerminal();
			const singleTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(!singleTab.textContent.includes(CONTRIBUTED_PROFILE_NAME));
		});

		it('dropdown menu should be populated with profiles', async function () {
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

		it('clicking the plus button should create a terminal and display the tabs view', async function () {
			await app.workbench.terminal.showTerminal();
			await app.code.waitAndClick(PLUS_BUTTON_SELECTOR);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 2);
			await app.workbench.terminal.killTerminal();
		});

		it('createWithProfile command should create a terminal with the default profile', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance');
			const singleTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(!singleTab.textContent.includes(CONTRIBUTED_PROFILE_NAME));
		});

		it('createWithProfile command should create a terminal with a contributed profile', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance', true);
			const singleTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(singleTab.textContent.includes(CONTRIBUTED_PROFILE_NAME));
		});

		it('createWithProfile command should create a split terminal with the default profile', async function () {
			await app.workbench.terminal.showTerminal();
			await app.workbench.terminal.runProfileCommand('createInstance', undefined, true);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 2);
			const firstTab = await app.code.waitForElements(FIRST_TAB_LABEL_SELECTOR, true);
			const secondTab = await app.code.waitForElements(SECOND_TAB_LABEL_SELECTOR, true);
			ok(firstTab[0].textContent.includes('┌'));
			ok(secondTab[0].textContent.includes('└'));
			ok(!firstTab[0].textContent.includes(CONTRIBUTED_PROFILE_NAME));
			ok(!secondTab[0].textContent.includes(CONTRIBUTED_PROFILE_NAME));
			await app.workbench.terminal.killTerminal();
		});

		it('createWithProfile command should create a split terminal with a contributed profile', async function () {
			await app.workbench.terminal.showTerminal();
			await app.workbench.terminal.runProfileCommand('createInstance', true, true);
			const tabs = await app.code.waitForElements(TABS_LIST_SELECTOR, true);
			deepStrictEqual(tabs[0].children.length, 2);
			const firstTab = await app.code.waitForElements(FIRST_TAB_LABEL_SELECTOR, true);
			const secondTab = await app.code.waitForElements(SECOND_TAB_LABEL_SELECTOR, true);
			ok(firstTab[0].textContent.includes('┌'));
			ok(secondTab[0].textContent.includes('└'));
			ok(!firstTab[0].textContent.includes(CONTRIBUTED_PROFILE_NAME));
			ok(secondTab[0].textContent.includes(CONTRIBUTED_PROFILE_NAME));
			await app.workbench.terminal.killTerminal();
		});

		it('should set the default profile', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', undefined);
			await app.workbench.terminal.createNew();
			const singleTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(!singleTab.textContent.includes(CONTRIBUTED_PROFILE_NAME));
			await app.workbench.terminal.killTerminal();
		});

		it('should set the default profile to a contributed one', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', true);
			await app.workbench.terminal.createNew();
			const singleTab = await app.code.waitForElement(SINGLE_TAB_SELECTOR);
			ok(singleTab.textContent.includes(CONTRIBUTED_PROFILE_NAME));
		});
	});
}
