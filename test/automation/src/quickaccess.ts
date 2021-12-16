/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editors } from './editors';
import { Code } from './code';
import { QuickInput } from './quickinput';

export class QuickAccess {

	constructor(private code: Code, private editors: Editors, private quickInput: QuickInput) { }

	async openQuickAccess(value: string): Promise<void> {
		let retries = 0;

		// other parts of code might steal focus away from quickinput :(
		while (retries < 5) {
			if (process.platform === 'darwin') {
				await this.code.dispatchKeybinding('cmd+p');
			} else {
				await this.code.dispatchKeybinding('ctrl+p');
			}

			try {
				await this.quickInput.waitForQuickInputOpened(10);
				break;
			} catch (err) {
				if (++retries > 5) {
					throw err;
				}

				await this.code.dispatchKeybinding('escape');
			}
		}

		if (value) {
			await this.code.waitForSetValue(QuickInput.QUICK_INPUT_INPUT, value);
		}
	}

	async openQuickAccessAndWait(fileName: string, exactMatch?: boolean): Promise<void> {
		let retries = 0;
		let fileFound = false;
		while (++retries < 10) {
			let retry = false;

			try {
				await this.openQuickAccess(fileName);

				await this.quickInput.waitForQuickInputElements(names => {
					const name = names[0];
					if (exactMatch && name === fileName) {
						fileFound = true;
						return true;
					}

					if (name === 'No matching results') {
						retry = true;
						return true; // search does not seem to be ready yet
					}

					if (!exactMatch) {
						fileFound = true;
						return !!name;
					} else {
						return false;
					}
				});
			} catch (error) {
				retry = true; // `waitForQuickInputElements` throws when elements not found
			}

			if (!retry) {
				break;
			}

			await this.quickInput.closeQuickInput();
		}

		if (!fileFound) {
			throw new Error(`Quick open file search was unable to find '${fileName}' after 10 attempts, giving up.`);
		}
	}

	async openFile(fileName: string, fileSearch = fileName): Promise<void> {
		await this.openQuickAccessAndWait(fileSearch, true);

		await this.code.dispatchKeybinding('enter');
		await this.editors.waitForActiveTab(fileName);
		await this.editors.waitForEditorFocus(fileName);
	}

	async runCommand(commandId: string, keepOpen?: boolean): Promise<void> {
		await this.openQuickAccess(`>${commandId}`);

		// wait for best choice to be focused
		await this.code.waitForTextContent(QuickInput.QUICK_INPUT_FOCUSED_ELEMENT);

		// wait and click on best choice
		await this.quickInput.selectQuickInputElement(0, keepOpen);
	}

	async openQuickOutline(): Promise<void> {
		let retries = 0;

		while (++retries < 10) {
			if (process.platform === 'darwin') {
				await this.code.dispatchKeybinding('cmd+shift+o');
			} else {
				await this.code.dispatchKeybinding('ctrl+shift+o');
			}

			const text = await this.code.waitForTextContent(QuickInput.QUICK_INPUT_ENTRY_LABEL_SPAN);

			if (text !== 'No symbol information for the file') {
				return;
			}

			await this.quickInput.closeQuickInput();
		}
	}
}
