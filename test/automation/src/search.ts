/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from './viewlet';
import { Code } from './code';

const VIEWLET = '.search-view';
const INPUT = `${VIEWLET} .search-widget .search-container .monaco-inputbox textarea`;
const INCLUDE_INPUT = `${VIEWLET} .query-details .file-types.includes .monaco-inputbox input`;
const FILE_MATCH = (filename: string) => `${VIEWLET} .results .filematch[data-resource$="${filename}"]`;

async function retry(setup: () => Promise<any>, attempt: () => Promise<any>) {
	let count = 0;
	while (true) {
		await setup();

		try {
			await attempt();
			return;
		} catch (err) {
			if (++count > 5) {
				throw err;
			}
		}
	}
}

export class Search extends Viewlet {

	constructor(code: Code) {
		super(code);
	}

	async clearSearchResults(): Promise<void> {
		await retry(
			() => this.code.waitAndClick(`.sidebar .title-actions .codicon-search-clear-results`),
			() => this.waitForNoResultText(10));
	}

	async openSearchViewlet(): Promise<any> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+shift+f');
		} else {
			await this.code.dispatchKeybinding('ctrl+shift+f');
		}

		await this.waitForInputFocus(INPUT);
	}

	async getSearchTooltip(): Promise<any> {
		const icon = await this.code.waitForElement(`.activitybar .action-label.codicon.codicon-search-view-icon`, (el) => !!el?.attributes?.['title']);
		return icon.attributes['title'];
	}

	async searchFor(text: string): Promise<void> {
		await this.clearSearchResults();
		await this.waitForInputFocus(INPUT);
		await this.code.waitForSetValue(INPUT, text);
		await this.submitSearch();
	}

	async hasActivityBarMoved() {
		await this.code.waitForElement('.activitybar');

		const elementBoundingBox = await this.code.driver.getElementXY('.activitybar');
		return elementBoundingBox !== null && elementBoundingBox.x === 48 && elementBoundingBox.y === 375;
	}

	async waitForPageUp(): Promise<void> {
		await this.code.dispatchKeybinding('PageUp');
	}

	async waitForPageDown(): Promise<void> {
		await this.code.dispatchKeybinding('PageDown');
	}

	async submitSearch(): Promise<void> {
		await this.waitForInputFocus(INPUT);

		await this.code.dispatchKeybinding('enter');
		await this.code.waitForElement(`${VIEWLET} .messages`);
	}

	async setFilesToIncludeText(text: string): Promise<void> {
		await this.waitForInputFocus(INCLUDE_INPUT);
		await this.code.waitForSetValue(INCLUDE_INPUT, text || '');
	}

	async showQueryDetails(): Promise<void> {
		await this.code.waitAndClick(`${VIEWLET} .query-details .more`);
	}

	async hideQueryDetails(): Promise<void> {
		await this.code.waitAndClick(`${VIEWLET} .query-details.more .more`);
	}

	async removeFileMatch(filename: string, expectedText: string): Promise<void> {
		const fileMatch = FILE_MATCH(filename);

		// Retry this because the click can fail if the search tree is rerendered at the same time
		await retry(
			async () => {
				await this.code.waitAndClick(fileMatch);
				await this.code.waitAndClick(`${fileMatch} .action-label.codicon-search-remove`);
			},
			async () => this.waitForResultText(expectedText, 10));
	}

	async expandReplace(): Promise<void> {
		await this.code.waitAndClick(`${VIEWLET} .search-widget .monaco-button.toggle-replace-button.codicon-search-hide-replace`);
	}

	async collapseReplace(): Promise<void> {
		await this.code.waitAndClick(`${VIEWLET} .search-widget .monaco-button.toggle-replace-button.codicon-search-show-replace`);
	}

	async setReplaceText(text: string): Promise<void> {
		await this.code.waitForSetValue(`${VIEWLET} .search-widget .replace-container .monaco-inputbox textarea[aria-label="Replace"]`, text);
	}

	async replaceFileMatch(filename: string, expectedText: string): Promise<void> {
		const fileMatch = FILE_MATCH(filename);

		// Retry this because the click can fail if the search tree is rerendered at the same time
		await retry(
			async () => {
				await this.code.waitAndClick(fileMatch);
				await this.code.waitAndClick(`${fileMatch} .action-label.codicon.codicon-search-replace-all`);
			},
			() => this.waitForResultText(expectedText, 10));
	}

	async waitForResultText(text: string, retryCount?: number): Promise<void> {
		// The label can end with " - " depending on whether the search editor is enabled
		await this.code.waitForTextContent(`${VIEWLET} .messages .message`, undefined, result => result.startsWith(text), retryCount);
	}

	async waitForNoResultText(retryCount?: number): Promise<void> {
		await this.code.waitForTextContent(`${VIEWLET} .messages`, undefined, text => text === '' || text.startsWith('Search was canceled before any results could be found'), retryCount);
	}

	private async waitForInputFocus(selector: string): Promise<void> {
		let retries = 0;

		// other parts of code might steal focus away from input boxes :(
		while (retries < 5) {
			await this.code.waitAndClick(INPUT, 2, 2);

			try {
				await this.code.waitForActiveElement(INPUT, 10);
				break;
			} catch (err) {
				if (++retries > 5) {
					throw err;
				}
			}
		}
	}
}
