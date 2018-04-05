/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '../../client';
import { Commands } from '../workbench/workbench';

export class Editors {

	constructor(private api: API, private commands: Commands) { }

	async saveOpenedFile(): Promise<any> {
		await this.api.waitForElement('.tabs-container div.tab.active.dirty');
		await this.commands.runCommand('File: Save');
	}

	async selectTab(tabName: string, untitled: boolean = false): Promise<void> {
		await this.api.waitAndClick(`.tabs-container div.tab[aria-label="${tabName}, tab"]`);
		await this.waitForEditorFocus(tabName, untitled);
	}

	async waitForActiveEditor(filename: string): Promise<any> {
		const selector = `.editor-container .monaco-editor[data-uri$="${filename}"] textarea`;
		return this.api.waitForActiveElement(selector);
	}

	async waitForEditorFocus(fileName: string, untitled: boolean = false): Promise<void> {
		await this.waitForActiveTab(fileName);
		await this.waitForActiveEditor(fileName);
	}

	async waitForActiveTab(fileName: string, isDirty: boolean = false): Promise<void> {
		await this.api.waitForElement(`.tabs-container div.tab.active${isDirty ? '.dirty' : ''}[aria-selected="true"][aria-label="${fileName}, tab"]`);
	}

	async waitForTab(fileName: string, isDirty: boolean = false): Promise<void> {
		await this.api.waitForElement(`.tabs-container div.tab${isDirty ? '.dirty' : ''}[aria-label="${fileName}, tab"]`);
	}

	async newUntitledFile(): Promise<void> {
		await this.commands.runCommand('workbench.action.files.newUntitledFile');
		await this.waitForEditorFocus('Untitled-1', true);
	}
}