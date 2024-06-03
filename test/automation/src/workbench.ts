/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Explorer } from './explorer';
import { ActivityBar } from './activityBar';
import { QuickAccess } from './quickaccess';
import { QuickInput } from './quickinput';
import { Extensions } from './extensions';
import { Search } from './search';
import { Editor } from './editor';
import { SCM } from './scm';
import { Debug } from './debug';
import { StatusBar } from './statusbar';
import { Problems } from './problems';
import { SettingsEditor } from './settings';
import { KeybindingsEditor } from './keybindings';
import { Editors } from './editors';
import { Code } from './code';
import { Terminal } from './terminal';
import { Notebook } from './notebook';
import { Localization } from './localization';
import { Task } from './task';

export interface Commands {
	runCommand(command: string, options?: { exactLabelMatch?: boolean }): Promise<any>;
}

export class Workbench {

	readonly quickaccess: QuickAccess;
	readonly quickinput: QuickInput;
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
	readonly notebook: Notebook;
	readonly localization: Localization;
	readonly task: Task;

	constructor(code: Code) {
		this.editors = new Editors(code);
		this.quickinput = new QuickInput(code);
		this.quickaccess = new QuickAccess(code, this.editors, this.quickinput);
		this.explorer = new Explorer(code);
		this.activitybar = new ActivityBar(code);
		this.search = new Search(code);
		this.extensions = new Extensions(code, this.quickaccess);
		this.editor = new Editor(code, this.quickaccess);
		this.scm = new SCM(code);
		this.debug = new Debug(code, this.quickaccess, this.editors, this.editor);
		this.statusbar = new StatusBar(code);
		this.problems = new Problems(code, this.quickaccess);
		this.settingsEditor = new SettingsEditor(code, this.editors, this.editor, this.quickaccess);
		this.keybindingsEditor = new KeybindingsEditor(code);
		this.terminal = new Terminal(code, this.quickaccess, this.quickinput);
		this.notebook = new Notebook(this.quickaccess, this.quickinput, code);
		this.localization = new Localization(code);
		this.task = new Task(code, this.editor, this.editors, this.quickaccess, this.quickinput, this.terminal);
	}
}
