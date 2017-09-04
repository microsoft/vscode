/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
import { Util } from '../helpers/utilities';

/**
 * Contains methods that are commonly used across test areas.
 */
export class CommonActions {
	private util: Util;

	constructor(private spectron: SpectronApplication) {
		this.util = new Util();
	}

	public async getWindowTitle(): Promise<any> {
		return this.spectron.client.getTitle();
	}

	public enter(): Promise<any> {
		return this.spectron.client.keys(['Enter', 'NULL']);
	}

	public async addSetting(setting: string, value: string): Promise<any> {
		await this.openUserSettings();
		await this.spectron.client.keys(['ArrowDown', 'NULL'], false);
		await this.spectron.client.waitForElement(`.editable-preferences-editor-container .monaco-editor.focused`);
		await this.spectron.client.keys(['ArrowRight', 'NULL'], false);
		await this.spectron.client.keys(`"${setting}": "${value}"`);
		await this.saveOpenedFile();
	}

	public async openUserSettings(): Promise<void> {
		await this.spectron.command('workbench.action.openGlobalSettings');
		await this.spectron.client.waitForElement('.settings-search-input .synthetic-focus');
	}

	public async openKeybindings(): Promise<void> {
		await this.spectron.command('workbench.action.openGlobalKeybindings');
		await this.spectron.client.waitForElement('.settings-search-input .synthetic-focus');
	}

	public async newUntitledFile(): Promise<any> {
		await this.spectron.command('workbench.action.files.newUntitledFile');
		return this.spectron.wait();
	}

	public closeTab(): Promise<any> {
		return this.spectron.client.keys(['Control', 'w', 'NULL']);
	}

	public async getTab(tabName: string, active?: boolean): Promise<any> {
		await this.closeCurrentNotification(); // close any notification messages that could overlap tabs

		let tabSelector = active ? '.tab.active' : 'div';
		let el = await this.spectron.client.waitForElement(`.tabs-container ${tabSelector}[aria-label="${tabName}, tab"]`);
		if (el) {
			return el;
		}

		return undefined;
	}

	public async selectTab(tabName: string): Promise<any> {
		await this.closeCurrentNotification(); // close any notification messages that could overlap tabs
		await this.spectron.client.waitAndClick(`.tabs-container div[aria-selected="false"][aria-label="${tabName}, tab"]`);
		await this.spectron.client.waitForElement(`.tabs-container div[aria-selected="true"][aria-label="${tabName}, tab"]`);
		return this.waitForEditorFocus();
	}

	private async waitForEditorFocus(): Promise<void> {
		this.spectron.client.waitForElement(`.monaco-editor.focused`);
	}

	public async openFirstMatchFile(fileName: string): Promise<any> {
		await this.openQuickOpen();
		await this.type(fileName);
		await this.spectron.wait();
		await this.enter();
		return this.spectron.wait();
	}

	public async saveOpenedFile(): Promise<any> {
		try {
			await this.spectron.client.waitForElement('.tabs-container .tab.active.dirty');
		} catch (e) {
			// ignore if there is no dirty file
			return Promise.resolve();
		}
		await this.spectron.command('workbench.action.files.save');
		return this.spectron.client.waitForElement('.tabs-container .tab.active.dirty', element => !element);
	}

	public type(text: string): Promise<any> {
		let spectron = this.spectron;

		return new Promise(function (res) {
			let textSplit = text.split(' ');

			async function type(i: number) {
				if (!textSplit[i] || textSplit[i].length <= 0) {
					return res();
				}

				const toType = textSplit[i + 1] ? `${textSplit[i]} ` : textSplit[i];
				await spectron.client.keys(toType, false);
				await spectron.client.keys(['NULL']);
				await type(i + 1);
			}

			return type(0);
		});
	}

	public showCommands(): Promise<any> {
		return this.spectron.command('workbench.action.showCommands');
	}

	public openQuickOpen(): Promise<any> {
		return this.spectron.command('workbench.action.quickOpen');
	}

	public closeQuickOpen(): Promise<any> {
		return this.spectron.command('workbench.action.closeQuickOpen');
	}

	public selectNextQuickOpenElement(): Promise<any> {
		return this.spectron.client.keys(['ArrowDown', 'NULL']);
	}

	public async getQuickOpenElements(): Promise<number> {
		const elements = await this.spectron.waitFor(this.spectron.client.waitForElements, 'div[aria-label="Quick Picker"] .monaco-tree-rows.show-twisties .monaco-tree-row');
		return elements.value.length;
	}

	public async openFile(fileName: string, explorer?: boolean): Promise<any> {
		let selector = `div[class="monaco-icon-label file-icon ${fileName}-name-file-icon ${this.getExtensionSelector(fileName)}`;
		if (explorer) {
			selector += ' explorer-item';
		}
		selector += '"]';

		try {
			await this.spectron.client.doubleClickAndWait(selector);
			await this.spectron.client.waitForElement(`.tabs-container div[aria-label="${fileName}, tab"]`);
			await this.spectron.client.waitForElement(`.monaco-editor.focused`);
		} catch (e) {
			return Promise.reject(`Cannot fine ${fileName} in a viewlet.`);
		}
	}

	public getExtensionSelector(fileName: string): string {
		const extension = fileName.split('.')[1];
		if (extension === 'js') {
			return 'js-ext-file-icon javascript-lang-file-icon';
		} else if (extension === 'json') {
			return 'json-ext-file-icon json-lang-file-icon';
		} else if (extension === 'md') {
			return 'md-ext-file-icon markdown-lang-file-icon';
		}

		throw new Error('No class defined for this file extension');
	}

	public async getEditorFirstLinePlainText(): Promise<any> {
		const trials = 3;
		let retry = 0;
		let error;

		while (retry < trials) {
			try {
				const span = await this.spectron.client.getText('.view-lines span span');
				if (Array.isArray(span)) {
					return span[0];
				}

				return span;
			} catch (e) {
				error = e;
				retry++;

				if (retry < trials) {
					await this.spectron.wait();
				} else {
					error = e;
				}
			}
		}

		return Promise.reject('Could not obtain text on the first line of an editor: ' + error);
	}

	public removeFile(filePath: string): void {
		this.util.removeFile(filePath);
	}

	public removeDirectory(directory: string): Promise<any> {
		try {
			return this.util.rimraf(directory);
		} catch (e) {
			throw new Error(`Failed to remove ${directory} with an error: ${e}`);
		}
	}

	private closeCurrentNotification(): Promise<any> {
		return this.spectron.command('workbench.action.closeMessages');
	}
}