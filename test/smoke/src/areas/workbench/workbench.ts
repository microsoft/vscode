/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Explorer } from '../explorer/explorer';
import { ActivityBar } from '../activitybar/activityBar';
import { QuickOpen } from '../quickopen/quickopen';
import { Extensions } from '../extensions/extensions';
import { Search } from '../search/search';
import { Editor } from '../editor/editor';
import { SCM } from '../git/scm';
import { Debug } from '../debug/debug';
import { StatusBar } from '../statusbar/statusbar';
import { Problems } from '../problems/problems';
import { SettingsEditor } from '../preferences/settings';
import { KeybindingsEditor } from '../preferences/keybindings';
import { Terminal } from '../terminal/terminal';

const PROGRESS_INACTIVE_BAR = `div[id="workbench.parts.sidebar"] .monaco-progress-container.done.monaco-builder-hidden`;
const PROGRESS_ACTIVE_BAR = `div[id="workbench.parts.sidebar"] .monaco-progress-container.active`;

export class Workbench {

	readonly explorer: Explorer;
	readonly activitybar: ActivityBar;
	readonly quickopen: QuickOpen;
	readonly search: Search;
	readonly extensions: Extensions;
	readonly editor: Editor;
	readonly scm: SCM;
	readonly debug: Debug;
	readonly statusbar: StatusBar;
	readonly problems: Problems;
	readonly settingsEditor: SettingsEditor;
	readonly keybindingsEditor: KeybindingsEditor;
	readonly terminal: Terminal;

	constructor(private spectron: SpectronApplication) {
		this.explorer = new Explorer(spectron);
		this.activitybar = new ActivityBar(spectron);
		this.quickopen = new QuickOpen(spectron);
		this.search = new Search(spectron);
		this.extensions = new Extensions(spectron);
		this.editor = new Editor(spectron);
		this.scm = new SCM(spectron);
		this.debug = new Debug(spectron);
		this.statusbar = new StatusBar(spectron);
		this.problems = new Problems(spectron);
		this.settingsEditor = new SettingsEditor(spectron);
		this.keybindingsEditor = new KeybindingsEditor(spectron);
		this.terminal = new Terminal(spectron);
	}

	public async saveOpenedFile(): Promise<void> {
		await this.spectron.client.waitForExist('.tabs-container div.tab.active.dirty');
		await this.spectron.runCommand('workbench.action.files.save');
		await this.spectron.client.waitForNotExist('.tabs-container div.tab.active.dirty');
	}

	public async selectTab(tabName: string, untitled: boolean = false): Promise<void> {
		await this.spectron.client.waitAndClick(`.tabs-container div.tab[aria-label="${tabName}, tab"]`);
		if (tabName === 'Keyboard Shortcuts' || tabName === 'User Settings') {
			await this.spectron.client.waitForElement('.settings-search-input input');
		} else {
			await this.waitForEditorFocus(tabName, untitled);
		}
	}

	public async closeTab(tabName: string, saveFile?: boolean): Promise<any> {
		if (saveFile) {
			await this.selectTab(tabName);
			await this.saveOpenedFile();
		} else {
			await this.spectron.client.waitAndClick(`.tabs-container div.tab[aria-label="${tabName}, tab"]`);
			await this.spectron.client.waitForElement(`.tabs-container div.tab[aria-label="${tabName}, tab"][aria-selected=true]`);
		}

		await this.spectron.client.waitAndClick(`.tabs-container div.tab[aria-label="${tabName}, tab"][aria-selected=true] a.action-label.icon.close-editor-action`);
		await this.spectron.client.waitForNotExist(`.tabs-container div.tab[aria-label="${tabName}, tab"]`);
	}

	public async waitForInactiveSideProgressBar(): Promise<void> {
		await this.spectron.client.waitForExist(PROGRESS_INACTIVE_BAR);
	}

	public getInactiveSideProgressBarSelector(): string {
		return PROGRESS_INACTIVE_BAR;
	}

	public async waitForActiveSideProgressBar(): Promise<void> {
		await this.spectron.client.waitForExist(PROGRESS_ACTIVE_BAR);
	}

	public getActiveSideProgressBarSelector(): string {
		return PROGRESS_ACTIVE_BAR;
	}

	public async waitForEditorFocus(fileName: string, untitled: boolean = false): Promise<void> {
		await this.waitForActiveTab(fileName);
		await this.editor.waitForActiveEditor(fileName);
	}

	public async waitForActiveTab(fileName: string, isDirty: boolean = false): Promise<any> {
		return this.spectron.client.waitForElement(`.tabs-container div.tab.active${isDirty ? '.dirty' : ''}[aria-selected="true"][aria-label="${fileName}, tab"]`);
	}

	public async waitForTab(fileName: string, isDirty: boolean = false): Promise<boolean> {
		return this.spectron.client.waitForElement(`.tabs-container div.tab${isDirty ? '.dirty' : ''}[aria-label="${fileName}, tab"]`).then(() => true);
	}

	public async newUntitledFile(): Promise<void> {
		await this.spectron.runCommand('workbench.action.files.newUntitledFile');
		await this.waitForEditorFocus('Untitled-1', true);
	}
}
