/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Editors } from './editors';
import { Code } from './code';
import { QuickInput } from './quickinput';
import { basename, isAbsolute } from 'path';

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

	async openFileQuickAccessAndWait(searchValue: string, expectedFirstElementName?: string): Promise<void> {
		let retries = 0;
		let fileFound = false;
		while (++retries < 10) {
			let retry = false;

			try {
				await this.openQuickAccess(searchValue);

				await this.quickInput.waitForQuickInputElements(elementNames => {
					const firstElementName = elementNames[0];

					// We found our result as first element -> return
					if (expectedFirstElementName && firstElementName === expectedFirstElementName) {
						fileFound = true;
						return true; // this leaves the `waitForQuickInputElements` polling loop
					}

					// Quick access does not seem healthy/ready -> retry
					if (firstElementName === 'No matching results') {
						retry = true;
						return true; // this leaves the `waitForQuickInputElements` polling loop
					}

					// We got results and were not asked for a specific
					// first element, so assume we found our files and
					// if we have a first element name
					if (!expectedFirstElementName && firstElementName) {
						fileFound = true;
						return true; // this leaves the `waitForQuickInputElements` polling loop
					}

					// We did not find our result -> keep on polling
					return false;
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
			throw new Error(`Quick open file search was unable to find '${expectedFirstElementName}' after 10 attempts, giving up.`);
		}
	}

	async openFile(path: string): Promise<void> {
		if (!isAbsolute(path)) {
			// we require absolute paths to get a single
			// result back that is unique and avoid hitting
			// the search process to reduce chances of
			// search needing longer.
			throw new Error('QuickAccess.openFile requires an absolute path');
		}

		const fileName = basename(path);

		// quick access shows files with the basename of the path
		await this.openFileQuickAccessAndWait(path, basename(path));

		// file editors appear with the basename of the path
		return this.doOpenAndWait(fileName);
	}

	async openUntitled(untitledFirstLineContents: string, untitledEditorId = 'Untitled-1'): Promise<void> {

		// untitled appear with their first line contents
		await this.openFileQuickAccessAndWait(untitledFirstLineContents, untitledFirstLineContents);

		// untitled editors appear with their id (e.g. Untitled-1)
		return this.doOpenAndWait(untitledEditorId);
	}

	private async doOpenAndWait(editorName: string): Promise<void> {
		await this.code.dispatchKeybinding('enter');
		await this.editors.waitForActiveTab(editorName);
		await this.editors.waitForEditorFocus(editorName);
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
