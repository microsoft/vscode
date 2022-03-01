/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

export class Editors {

	constructor(private code: Code) { }

	async saveOpenedFile(): Promise<any> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+s');
		} else {
			await this.code.dispatchKeybinding('ctrl+s');
		}
	}

	async selectTab(fileName: string): Promise<void> {

		// Selecting a tab and making an editor have keyboard focus
		// is critical to almost every test. As such, we try our
		// best to retry this task in case some other component steals
		// focus away from the editor while we attempt to get focus

		let error: unknown | undefined = undefined;
		let retries = 0;
		while (retries < 10) {
			await this.code.waitAndClick(`.tabs-container div.tab[data-resource-name$="${fileName}"]`);
			await this.code.dispatchKeybinding(process.platform === 'darwin' ? 'cmd+1' : 'ctrl+1'); // make editor really active if click failed somehow

			try {
				await this.waitForEditorFocus(fileName, 50 /* 50 retries * 100ms delay = 5s */);
				return;
			} catch (e) {
				error = e;
				retries++;
			}
		}

		// We failed after 10 retries
		throw error;
	}

	async waitForEditorFocus(fileName: string, retryCount?: number): Promise<void> {
		await this.waitForActiveTab(fileName, undefined, retryCount);
		await this.waitForActiveEditor(fileName, retryCount);
	}

	async waitForActiveTab(fileName: string, isDirty: boolean = false, retryCount?: number): Promise<void> {
		await this.code.waitForElement(`.tabs-container div.tab.active${isDirty ? '.dirty' : ''}[aria-selected="true"][data-resource-name$="${fileName}"]`, undefined, retryCount);
	}

	async waitForActiveEditor(fileName: string, retryCount?: number): Promise<any> {
		const selector = `.editor-instance .monaco-editor[data-uri$="${fileName}"] textarea`;
		return this.code.waitForActiveElement(selector, retryCount);
	}

	async waitForTab(fileName: string, isDirty: boolean = false): Promise<void> {
		await this.code.waitForElement(`.tabs-container div.tab${isDirty ? '.dirty' : ''}[data-resource-name$="${fileName}"]`);
	}

	async newUntitledFile(): Promise<void> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+n');
		} else {
			await this.code.dispatchKeybinding('ctrl+n');
		}

		await this.waitForEditorFocus('Untitled-1');
	}
}
