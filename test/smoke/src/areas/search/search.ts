/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from '../workbench/viewlet';
import { Code } from '../../vscode/code';

const VIEWLET = 'div[id="workbench.view.search"] .search-view';
const INPUT = `${VIEWLET} .search-widget .search-container .monaco-inputbox input`;
const INCLUDE_INPUT = `${VIEWLET} .query-details .file-types.includes .monaco-inputbox input`;

export class Search extends Viewlet {

	constructor(code: Code) {
		super(code);
	}

	async openSearchViewlet(): Promise<any> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+shift+f');
		} else {
			await this.code.dispatchKeybinding('ctrl+shift+f');
		}

		await this.waitForInputFocus(INPUT);
	}

	async searchFor(text: string): Promise<void> {
		await this.waitForInputFocus(INPUT);
		await this.code.waitForSetValue(INPUT, text);
		await this.submitSearch();
	}

	async submitSearch(): Promise<void> {
		await this.waitForInputFocus(INPUT);

		await this.code.dispatchKeybinding('enter');
		await this.code.waitForElement(`${VIEWLET} .messages[aria-hidden="false"]`);
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

	async removeFileMatch(index: number): Promise<void> {
		await this.code.waitAndMove(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch`);
		const file = await this.code.waitForTextContent(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch a.label-name`);
		await this.code.waitAndClick(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch .action-label.icon.action-remove`);
		await this.code.waitForTextContent(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch a.label-name`, void 0, result => result !== file);
	}

	async expandReplace(): Promise<void> {
		await this.code.waitAndClick(`${VIEWLET} .search-widget .monaco-button.toggle-replace-button.collapse`);
	}

	async setReplaceText(text: string): Promise<void> {
		await this.code.waitAndClick(`${VIEWLET} .search-widget .replace-container .monaco-inputbox input[title="Replace"]`);
		await this.code.waitForElement(`${VIEWLET} .search-widget .replace-container .monaco-inputbox.synthetic-focus input[title="Replace"]`);
		await this.code.waitForSetValue(`${VIEWLET} .search-widget .replace-container .monaco-inputbox.synthetic-focus input[title="Replace"]`, text);
	}

	async replaceFileMatch(index: number): Promise<void> {
		await this.code.waitAndMove(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch`);
		await this.code.waitAndClick(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch .action-label.icon.action-replace-all`);
	}

	async waitForResultText(text: string): Promise<void> {
		await this.code.waitForTextContent(`${VIEWLET} .messages[aria-hidden="false"] .message>p`, text);
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
