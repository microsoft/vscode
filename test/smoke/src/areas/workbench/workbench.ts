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
import { API } from '../../api';
import { Editors } from '../editor/editors';

export interface Commands {
	runCommand(command: string): Promise<any>;
}

export class Workbench implements Commands {

	readonly quickopen: QuickOpen;
	readonly editors: Editors;
	readonly explorer: Explorer;
	readonly activitybar: ActivityBar;
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

	constructor(private api: API, private keybindings: any[], userDataPath: string) {
		this.editors = new Editors(api, this);
		this.quickopen = new QuickOpen(api, this, this.editors);
		this.explorer = new Explorer(api, this.quickopen, this.editors);
		this.activitybar = new ActivityBar(api);
		this.search = new Search(api, this);
		this.extensions = new Extensions(api, this);
		this.editor = new Editor(api, this);
		this.scm = new SCM(api, this);
		this.debug = new Debug(api, this, this.editors, this.editor);
		this.statusbar = new StatusBar(api);
		this.problems = new Problems(api, this);
		this.settingsEditor = new SettingsEditor(api, userDataPath, this, this.editors, this.editor);
		this.keybindingsEditor = new KeybindingsEditor(api, this);
		this.terminal = new Terminal(api, this);
	}

	/**
	 * Retrieves the command from keybindings file and executes it with WebdriverIO client API
	 * @param command command (e.g. 'workbench.action.files.newUntitledFile')
	 */
	async runCommand(command: string): Promise<any> {
		const binding = this.keybindings.find(x => x['command'] === command);
		if (!binding) {
			await this.quickopen.runCommand(command);
			return;
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

