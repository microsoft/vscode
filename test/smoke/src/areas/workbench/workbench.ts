/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { API } from '../../spectron/client';

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
	private keybindings: any[];

	constructor(private api: API) {
		this.explorer = new Explorer(api);
		this.activitybar = new ActivityBar(api);
		this.quickopen = new QuickOpen(api);
		this.search = new Search(api);
		this.extensions = new Extensions(api);
		this.editor = new Editor(api);
		this.scm = new SCM(api);
		this.debug = new Debug(api);
		this.statusbar = new StatusBar(api);
		this.problems = new Problems(api);
		this.settingsEditor = new SettingsEditor(api);
		this.keybindingsEditor = new KeybindingsEditor(api);
		this.terminal = new Terminal(api);
	}

	public async saveOpenedFile(): Promise<any> {
		await this.api.waitForElement('.tabs-container div.tab.active.dirty');
		await this.quickopen.runCommand('File: Save');
	}

	public async selectTab(tabName: string, untitled: boolean = false): Promise<void> {
		await this.api.waitAndClick(`.tabs-container div.tab[aria-label="${tabName}, tab"]`);
		await this.waitForEditorFocus(tabName, untitled);
	}

	public async waitForEditorFocus(fileName: string, untitled: boolean = false): Promise<void> {
		await this.waitForActiveTab(fileName);
		await this.editor.waitForActiveEditor(fileName);
	}

	public async waitForActiveTab(fileName: string, isDirty: boolean = false): Promise<void> {
		await this.api.waitForElement(`.tabs-container div.tab.active${isDirty ? '.dirty' : ''}[aria-selected="true"][aria-label="${fileName}, tab"]`);
	}

	public async waitForTab(fileName: string, isDirty: boolean = false): Promise<void> {
		await this.api.waitForElement(`.tabs-container div.tab${isDirty ? '.dirty' : ''}[aria-label="${fileName}, tab"]`);
	}

	public async newUntitledFile(): Promise<void> {
		await this.runCommand('workbench.action.files.newUntitledFile');
		await this.waitForEditorFocus('Untitled-1', true);
	}

	/**
	 * Retrieves the command from keybindings file and executes it with WebdriverIO client API
	 * @param command command (e.g. 'workbench.action.files.newUntitledFile')
	 */
	runCommand(command: string): Promise<any> {
		const binding = this.keybindings.find(x => x['command'] === command);
		if (!binding) {
			return this.quickopen.runCommand(command);
		}

		const keys: string = binding.key;
		let keysToPress: string[] = [];

		const chords = keys.split(' ');
		chords.forEach((chord) => {
			const keys = chord.split('+');
			keys.forEach((key) => keysToPress.push(this.transliterate(key)));
			keysToPress.push('NULL');
		});

		return this.api.keys(keysToPress);
	}

	/**
	 * Transliterates key names from keybindings file to WebdriverIO keyboard actions defined in:
	 * https://w3c.github.io/webdriver/webdriver-spec.html#keyboard-actions
	 */
	private transliterate(key: string): string {
		switch (key) {
			case 'ctrl':
				return 'Control';
			case 'cmd':
				return 'Meta';
			default:
				return key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1);
		}
	}
}
