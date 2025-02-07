/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Quality } from './application';
import { Code } from './code';

export class Editors {

	constructor(private code: Code) { }

	async saveOpenedFile(): Promise<any> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+s', () => true);
		} else {
			await this.code.dispatchKeybinding('ctrl+s', () => true);
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
			const acceptFn = async () => {
				const tabs = await this.code.getElements(`.tabs-container div.tab.active[aria-selected="true"][data-resource-name$="${fileName}"]`, false);
				const editor = await this.code.getElement(`.editor-instance .monaco-editor[data-uri$="${fileName}"] ${this.code.quality === Quality.Stable ? 'textarea' : '.native-edit-context'}`);
				return !!tabs && tabs.length > 0 && !!editor;
			};

			try {
				await this.code.dispatchKeybinding(process.platform === 'darwin' ? 'cmd+1' : 'ctrl+1', acceptFn, 50); // make editor really active if click failed somehow
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

	async isEditorFocus(fileName: string): Promise<boolean> {
		const isActiveTab = await this.isActiveTab(fileName);
		const isActiveElement = await this.isActiveEditor(fileName);
		return isActiveTab && isActiveElement;
	}

	async waitForActiveTab(fileName: string, isDirty: boolean = false, retryCount?: number): Promise<void> {
		await this.code.waitForElement(this._tabSelectorForFileName(fileName), undefined, retryCount);
	}

	async isActiveTab(fileName: string, isDirty: boolean = false): Promise<boolean> {
		const elements = await this.code.getElements(this._tabSelectorForFileName(fileName), false);
		return !!elements && elements.length > 0;
	}

	async waitForActiveEditor(fileName: string, retryCount?: number): Promise<any> {
		return this.code.waitForActiveElement(this._editorSelectorForFileName(fileName), retryCount);
	}

	async isActiveEditor(fileName: string): Promise<boolean> {
		return this.code.isActiveElement(this._editorSelectorForFileName(fileName));
	}

	private _editorSelectorForFileName(fileName: string): string {
		return `.editor-instance .monaco-editor[data-uri$="${fileName}"] ${this.code.quality === Quality.Stable ? 'textarea' : '.native-edit-context'}`;
	}

	private _tabSelectorForFileName(fileName: string, isDirty: boolean = false): string {
		return `.tabs-container div.tab.active${isDirty ? '.dirty' : ''}[aria-selected="true"][data-resource-name$="${fileName}"]`;
	}

	async waitForTab(fileName: string, isDirty: boolean = false): Promise<void> {
		await this.code.waitForElement(`.tabs-container div.tab${isDirty ? '.dirty' : ''}[data-resource-name$="${fileName}"]`);
	}

	async newUntitledFile(): Promise<void> {
		const acceptFn = async () => {
			return await this.isEditorFocus('Untitled-1');
		};
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+n', acceptFn);
		} else {
			await this.code.dispatchKeybinding('ctrl+n', acceptFn);
		}
	}
}
