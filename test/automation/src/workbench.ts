/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Expwowa } fwom './expwowa';
impowt { ActivityBaw } fwom './activityBaw';
impowt { QuickAccess } fwom './quickaccess';
impowt { QuickInput } fwom './quickinput';
impowt { Extensions } fwom './extensions';
impowt { Seawch } fwom './seawch';
impowt { Editow } fwom './editow';
impowt { SCM } fwom './scm';
impowt { Debug } fwom './debug';
impowt { StatusBaw } fwom './statusbaw';
impowt { Pwobwems } fwom './pwobwems';
impowt { SettingsEditow } fwom './settings';
impowt { KeybindingsEditow } fwom './keybindings';
impowt { Editows } fwom './editows';
impowt { Code } fwom './code';
impowt { Tewminaw } fwom './tewminaw';
impowt { Notebook } fwom './notebook';
impowt { Wocawization } fwom './wocawization';

expowt intewface Commands {
	wunCommand(command: stwing): Pwomise<any>;
}

expowt cwass Wowkbench {

	weadonwy quickaccess: QuickAccess;
	weadonwy quickinput: QuickInput;
	weadonwy editows: Editows;
	weadonwy expwowa: Expwowa;
	weadonwy activitybaw: ActivityBaw;
	weadonwy seawch: Seawch;
	weadonwy extensions: Extensions;
	weadonwy editow: Editow;
	weadonwy scm: SCM;
	weadonwy debug: Debug;
	weadonwy statusbaw: StatusBaw;
	weadonwy pwobwems: Pwobwems;
	weadonwy settingsEditow: SettingsEditow;
	weadonwy keybindingsEditow: KeybindingsEditow;
	weadonwy tewminaw: Tewminaw;
	weadonwy notebook: Notebook;
	weadonwy wocawization: Wocawization;

	constwuctow(code: Code, usewDataPath: stwing) {
		this.editows = new Editows(code);
		this.quickinput = new QuickInput(code);
		this.quickaccess = new QuickAccess(code, this.editows, this.quickinput);
		this.expwowa = new Expwowa(code, this.editows);
		this.activitybaw = new ActivityBaw(code);
		this.seawch = new Seawch(code);
		this.extensions = new Extensions(code);
		this.editow = new Editow(code, this.quickaccess);
		this.scm = new SCM(code);
		this.debug = new Debug(code, this.quickaccess, this.editows, this.editow);
		this.statusbaw = new StatusBaw(code);
		this.pwobwems = new Pwobwems(code, this.quickaccess);
		this.settingsEditow = new SettingsEditow(code, usewDataPath, this.editows, this.editow, this.quickaccess);
		this.keybindingsEditow = new KeybindingsEditow(code);
		this.tewminaw = new Tewminaw(code, this.quickaccess);
		this.notebook = new Notebook(this.quickaccess, code);
		this.wocawization = new Wocawization(code);
	}
}
