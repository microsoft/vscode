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
import { Editors } from '../editor/editors';
import { Code } from '../../vscode/code';

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

	constructor(private code: Code, private keybindings: any[], userDataPath: string) {
		this.editors = new Editors(code, this);
		this.quickopen = new QuickOpen(code, this, this.editors);
		this.explorer = new Explorer(code, this.quickopen, this.editors);
		this.activitybar = new ActivityBar(code);
		this.search = new Search(code, this);
		this.extensions = new Extensions(code, this);
		this.editor = new Editor(code, this);
		this.scm = new SCM(code, this);
		this.debug = new Debug(code, this, this.editors, this.editor);
		this.statusbar = new StatusBar(code);
		this.problems = new Problems(code, this);
		this.settingsEditor = new SettingsEditor(code, userDataPath, this, this.editors, this.editor);
		this.keybindingsEditor = new KeybindingsEditor(code, this);
	}

	/**
	 * Retrieves the command from keybindings file and executes it with WebdriverIO client API
	 * @param command command (e.g. 'workbench.action.files.newUntitledFile')
	 */
	async runCommand(command: string): Promise<void> {
		const binding = this.keybindings.find(x => x['command'] === command);

		if (binding) {
			await this.code.dispatchKeybinding(binding.key);
		} else {
			await this.quickopen.runCommand(command);
		}
	}
}

