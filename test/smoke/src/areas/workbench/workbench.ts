/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Explorer } from '../explorer/explorer';
import { ActivityBar } from '../activitybar/activityBar';
import { QuickOpen } from '../quickopen/quickopen';
import { QuickInput } from '../quickinput/quickinput';
import { Extensions } from '../extensions/extensions';
import { Search } from '../search/search';
import { Editor } from '../editor/editor';
import { SCM } from '../git/scm';
import { Debug } from '../debug/debugSmoke';
import { StatusBar } from '../statusbar/statusbar';
import { Problems } from '../problems/problems';
import { SettingsEditor } from '../preferences/settings';
import { KeybindingsEditor } from '../preferences/keybindings';
import { Editors } from '../editor/editors';
import { Code } from '../../vscode/code';
import { Terminal } from '../terminal/terminal';

export interface Commands {
	runCommand(command: string): Promise<any>;
}

export class Workbench {

	readonly quickopen: QuickOpen;
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

	constructor(code: Code, userDataPath: string) {
		this.editors = new Editors(code);
		this.quickopen = new QuickOpen(code, this.editors);
		this.quickinput = new QuickInput(code);
		this.explorer = new Explorer(code, this.editors);
		this.activitybar = new ActivityBar(code);
		this.search = new Search(code);
		this.extensions = new Extensions(code);
		this.editor = new Editor(code, this.quickopen);
		this.scm = new SCM(code);
		this.debug = new Debug(code, this.quickopen, this.editors, this.editor);
		this.statusbar = new StatusBar(code);
		this.problems = new Problems(code);
		this.settingsEditor = new SettingsEditor(code, userDataPath, this.editors, this.editor, this.quickopen);
		this.keybindingsEditor = new KeybindingsEditor(code);
		this.terminal = new Terminal(code, this.quickopen);
	}
}
