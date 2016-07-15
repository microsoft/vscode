/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import {Action, IAction} from 'vs/base/common/actions';
import {ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {SelectActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {TPromise} from 'vs/base/common/winjs.base';

export class ToggleTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.toggleTerminal';
	public static LABEL = nls.localize('workbench.action.terminal.toggleTerminal', "Toggle Integrated Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.toggle();
	}
}

export class KillTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.kill';
	public static LABEL = nls.localize('workbench.action.terminal.kill', "Terminal: Kill the Active Terminal Instance");
	public static PANEL_LABEL = nls.localize('workbench.action.terminal.kill.short', "Kill Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
		this.class = 'terminal-action kill';
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.close();
	}
}

/**
 * Copies the terminal selection. Note that since the command palette takes focus from the terminal,
 * this can only be triggered via a keybinding.
 */
export class CopyTerminalSelectionAction extends Action {

	public static ID = 'workbench.action.terminal.copySelection';
	public static LABEL = nls.localize('workbench.action.terminal.copySelection', "Terminal: Copy Selection");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.copySelection();
	}
}

export class CreateNewTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.new';
	public static LABEL = nls.localize('workbench.action.terminal.new', "Terminal: Create New Integrated Terminal");
	public static PANEL_LABEL = nls.localize('workbench.action.terminal.new.short', "New Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
		this.class = 'terminal-action new';
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.createNew();
	}
}

export class FocusTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.focus';
	public static LABEL = nls.localize('workbench.action.terminal.focus', "Terminal: Focus Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.focus();
	}
}

export class FocusNextTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.focusNext';
	public static LABEL = nls.localize('workbench.action.terminal.focusNext', "Terminal: Focus Next Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.focusNext();
	}
}

export class FocusPreviousTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.focusPrevious';
	public static LABEL = nls.localize('workbench.action.terminal.focusPrevious', "Terminal: Focus Previous Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.focusPrevious();
	}
}
export class TerminalPasteAction extends Action {

	public static ID = 'workbench.action.terminal.paste';
	public static LABEL = nls.localize('workbench.action.terminal.paste', "Terminal: Paste into Active Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.paste();
	}
}

export class RunSelectedTextInTerminalAction extends Action {

	public static ID = 'workbench.action.terminal.runSelectedText';
	public static LABEL = nls.localize('workbench.action.terminal.runSelectedText', "Terminal: Run Selected Text In Active Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.runSelectedText();
	}
}

export class SwitchTerminalInstanceAction extends Action {

	public static ID = 'workbench.action.terminal.switchTerminalInstance';
	public static LABEL = nls.localize('workbench.action.terminal.switchTerminalInstance', "Terminal: Switch Terminal Instance");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(SwitchTerminalInstanceAction.ID, SwitchTerminalInstanceAction.LABEL);
		this.class = 'terminal-action switch-terminal-instance';
	}

	public run(item?: string): TPromise<any> {
		let selectedTerminalIndex = parseInt(item.split(':')[0], 10) - 1;
		return this.terminalService.setActiveTerminal(selectedTerminalIndex);
	}
}

export class SwitchTerminalInstanceActionItem extends SelectActionItem {

	constructor(
		action: IAction,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(null, action, terminalService.getTerminalInstanceTitles(), terminalService.getActiveTerminalIndex());
		this.toDispose.push(this.terminalService.onInstancesChanged(this.updateItems, this));
		this.toDispose.push(this.terminalService.onActiveInstanceChanged(this.updateItems, this));
		this.toDispose.push(this.terminalService.onInstanceTitleChanged(this.updateItems, this));
	}

	private updateItems(): void {
		this.setOptions(this.terminalService.getTerminalInstanceTitles(), this.terminalService.getActiveTerminalIndex());
	}
}