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

	async openFileQuickAccessAndWait(searchValue: string, expectedFirstElementNameOrExpectedResultCount: string | number): Promise<void> {

		// make sure the file quick access is not "polluted"
		// with entries from the editor history when opening
		await this.runCommand('workbench.action.clearEditorHistory');

		const PollingStrategy = {
			Stop: true,
			Continue: false
		};

		let retries = 0;
		let success = false;

		while (++retries < 10) {
			let retry = false;

			try {
				await this.openFileQuickAccess(searchValue);
				await this.quickInput.waitForQuickInputElements(elementNames => {
					this.code.logger.log('QuickAccess: resulting elements: ', elementNames);

					// Quick access seems to be still running -> retry
					if (elementNames.length === 0) {
						this.code.logger.log('QuickAccess: file search returned 0 elements, will continue polling...');

						return PollingStrategy.Continue;
					}

					// Quick access does not seem healthy/ready -> retry
					const firstElementName = elementNames[0];
					if (firstElementName === 'No matching results') {
						this.code.logger.log(`QuickAccess: file search returned "No matching results", will retry...`);

						retry = true;

						return PollingStrategy.Stop;
					}

					// Expected: number of results
					if (typeof expectedFirstElementNameOrExpectedResultCount === 'number') {
						if (elementNames.length === expectedFirstElementNameOrExpectedResultCount) {
							success = true;

							return PollingStrategy.Stop;
						}

						this.code.logger.log(`QuickAccess: file search returned ${elementNames.length} results but was expecting ${expectedFirstElementNameOrExpectedResultCount}, will retry...`);

						retry = true;

						return PollingStrategy.Stop;
					}

					// Expected: string
					else {
						if (firstElementName === expectedFirstElementNameOrExpectedResultCount) {
							success = true;

							return PollingStrategy.Stop;
						}

						this.code.logger.log(`QuickAccess: file search returned ${firstElementName} as first result but was expecting ${expectedFirstElementNameOrExpectedResultCount}, will retry...`);

						retry = true;

						return PollingStrategy.Stop;
					}
				});
			} catch (error) {
				this.code.logger.log(`QuickAccess: file search waitForQuickInputElements threw an error ${error}, will retry...`);

				retry = true;
			}

			if (!retry) {
				break;
			}

			await this.quickInput.closeQuickInput();
		}

		if (!success) {
			if (typeof expectedFirstElementNameOrExpectedResultCount === 'string') {
				throw new Error(`Quick open file search was unable to find '${expectedFirstElementNameOrExpectedResultCount}' after 10 attempts, giving up.`);
			} else {
				throw new Error(`Quick open file search was unable to find ${expectedFirstElementNameOrExpectedResultCount} result items after 10 attempts, giving up.`);
			}
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

		// open first element
		await this.quickInput.selectQuickInputElement(0);

		// wait for editor being focused
		await this.editors.waitForActiveTab(fileName);
		await this.editors.selectTab(fileName);
	}

	private async openFileQuickAccess(value: string): Promise<void> {
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

		await this.quickInput.type(value);
	}

	async runCommand(commandId: string, keepOpen?: boolean): Promise<void> {

		// open commands picker
		await this.openCommands(`>${commandId}`);

		// wait for best choice to be focused
		await this.quickInput.waitForQuickInputElementFocused();

		// wait and click on best choice
		await this.quickInput.selectQuickInputElement(0, keepOpen);
	}

	private async openCommands(value: string): Promise<void> {

		// open commands via keybinding
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+shift+p');
		} else {
			await this.code.dispatchKeybinding('ctrl+shift+p');
		}

		// wait for commands
		await this.quickInput.waitForQuickInputElementFocused();

		// narrow down to provided value
		await this.quickInput.type(value);
	}

	async openQuickOutline(): Promise<void> {
		let retries = 0;

		while (++retries < 10) {

			// open quick outline via keybinding
			if (process.platform === 'darwin') {
				await this.code.dispatchKeybinding('cmd+shift+o');
			} else {
				await this.code.dispatchKeybinding('ctrl+shift+o');
			}

			const text = await this.quickInput.waitForQuickInputElementText();

			// Retry for as long as no symbols are found
			if (text === 'No symbol information for the file') {
				this.code.logger.log(`QuickAccess: openQuickOutline indicated 'No symbol information for the file', will retry...`);

				// close and retry
				await this.quickInput.closeQuickInput();

				continue;
			}
		}
	}
}
