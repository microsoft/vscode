/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as os from 'os';
import { Action, IAction } from 'vs/base/common/actions';
import { EndOfLinePreference } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ITerminalService, TERMINAL_PANEL_ID, ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import { SelectActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { ActionBarContributor } from 'vs/workbench/browser/actions';
import { TerminalEntry } from 'vs/workbench/parts/terminal/browser/terminalQuickOpen';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PICK_WORKSPACE_FOLDER_COMMAND } from 'vs/workbench/browser/actions/workspaceActions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export const TERMINAL_PICKER_PREFIX = 'term ';

export class ToggleTerminalAction extends TogglePanelAction {

	public static readonly ID = 'workbench.action.terminal.toggleTerminal';
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleTerminal', "Toggle Integrated Terminal");

	constructor(
		id: string, label: string,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label, TERMINAL_PANEL_ID, panelService, partService);
	}

	public run(event?: any): TPromise<any> {
		if (this.terminalService.terminalInstances.length === 0) {
			// If there is not yet an instance attempt to create it here so that we can suggest a
			// new shell on Windows (and not do so when the panel is restored on reload).
			this.terminalService.createInstance(undefined, true);
		}
		return super.run();
	}
}

export class KillTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.kill';
	public static readonly LABEL = nls.localize('workbench.action.terminal.kill', "Kill the Active Terminal Instance");
	public static readonly PANEL_LABEL = nls.localize('workbench.action.terminal.kill.short', "Kill Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
		this.class = 'terminal-action kill';
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			this.terminalService.getActiveInstance().dispose();
			if (this.terminalService.terminalInstances.length > 0) {
				this.terminalService.showPanel(true);
			}
		}
		return TPromise.as(void 0);
	}
}

export class QuickKillTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.quickKill';
	public static readonly LABEL = nls.localize('workbench.action.terminal.quickKill', "Kill Terminal Instance");

	constructor(
		id: string, label: string,
		private terminalEntry: TerminalEntry,
		@ITerminalService private terminalService: ITerminalService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
		this.class = 'terminal-action kill';
	}

	public run(event?: any): TPromise<any> {
		const terminalIndex = parseInt(this.terminalEntry.getLabel().split(':')[0]) - 1;
		const terminal = this.terminalService.getInstanceFromIndex(terminalIndex);
		if (terminal) {
			terminal.dispose();
		}
		if (this.terminalService.terminalInstances.length > 0 && this.terminalService.activeTerminalInstanceIndex !== terminalIndex) {
			this.terminalService.setActiveInstanceByIndex(Math.min(terminalIndex, this.terminalService.terminalInstances.length - 1));
		}
		return TPromise.timeout(50).then(result => this.quickOpenService.show(TERMINAL_PICKER_PREFIX, null));
	}
}

/**
 * Copies the terminal selection. Note that since the command palette takes focus from the terminal,
 * this cannot be triggered through the command palette.
 */
export class CopyTerminalSelectionAction extends Action {

	public static readonly ID = 'workbench.action.terminal.copySelection';
	public static readonly LABEL = nls.localize('workbench.action.terminal.copySelection', "Copy Selection");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.copySelection();
		}
		return TPromise.as(void 0);
	}
}

export class SelectAllTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.selectAll';
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectAll', "Select All");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.selectAll();
		}
		return TPromise.as(void 0);
	}
}

export class DeleteWordLeftTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.deleteWordLeft';
	public static readonly LABEL = nls.localize('workbench.action.terminal.deleteWordLeft', "Delete Word Left");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			// Send ctrl+W
			terminalInstance.sendText(String.fromCharCode('W'.charCodeAt(0) - 64), false);
		}
		return TPromise.as(void 0);
	}
}

export class DeleteWordRightTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.deleteWordRight';
	public static readonly LABEL = nls.localize('workbench.action.terminal.deleteWordRight', "Delete Word Right");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			// Send alt+D
			terminalInstance.sendText('\x1bD', false);
		}
		return TPromise.as(void 0);
	}
}

export class CreateNewTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.new';
	public static readonly LABEL = nls.localize('workbench.action.terminal.new', "Create New Integrated Terminal");
	public static readonly PANEL_LABEL = nls.localize('workbench.action.terminal.new.short', "New Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService
	) {
		super(id, label);
		this.class = 'terminal-action new';
	}

	public run(event?: any): TPromise<any> {
		const folders = this.workspaceContextService.getWorkspace().folders;

		let instancePromise: TPromise<ITerminalInstance>;
		if (folders.length <= 1) {
			// Allow terminal service to handle the path when there is only a
			// single root
			instancePromise = TPromise.as(this.terminalService.createInstance(undefined, true));
		} else {
			instancePromise = this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND).then(workspace => {
				if (!workspace) {
					// Don't create the instance if the workspace picker was canceled
					return null;
				}
				return this.terminalService.createInstance({ cwd: workspace.uri.fsPath }, true);
			});
		}

		return instancePromise.then(instance => {
			if (!instance) {
				return TPromise.as(void 0);
			}
			this.terminalService.setActiveInstance(instance);
			return this.terminalService.showPanel(true);
		});
	}
}

export class FocusActiveTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.focus';
	public static readonly LABEL = nls.localize('workbench.action.terminal.focus', "Focus Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance(true);
		if (!instance) {
			return TPromise.as(void 0);
		}
		this.terminalService.setActiveInstance(instance);
		return this.terminalService.showPanel(true);
	}
}

export class FocusNextTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.focusNext';
	public static readonly LABEL = nls.localize('workbench.action.terminal.focusNext', "Focus Next Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		this.terminalService.setActiveInstanceToNext();
		return this.terminalService.showPanel(true);
	}
}

export class FocusPreviousTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.focusPrevious';
	public static readonly LABEL = nls.localize('workbench.action.terminal.focusPrevious', "Focus Previous Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		this.terminalService.setActiveInstanceToPrevious();
		return this.terminalService.showPanel(true);
	}
}
export class TerminalPasteAction extends Action {

	public static readonly ID = 'workbench.action.terminal.paste';
	public static readonly LABEL = nls.localize('workbench.action.terminal.paste', "Paste into Active Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance();
		if (instance) {
			instance.paste();
		}
		return TPromise.as(void 0);
	}
}

export class SelectDefaultShellWindowsTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.selectDefaultShell';
	public static readonly LABEL = nls.localize('workbench.action.terminal.DefaultShell', "Select Default Shell");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		return this.terminalService.selectDefaultWindowsShell();
	}
}

export class RunSelectedTextInTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.runSelectedText';
	public static readonly LABEL = nls.localize('workbench.action.terminal.runSelectedText', "Run Selected Text In Active Terminal");

	constructor(
		id: string, label: string,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance();
		if (!instance) {
			return TPromise.as(void 0);
		}
		let editor = this.codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			return TPromise.as(void 0);
		}
		let selection = editor.getSelection();
		let text: string;
		if (selection.isEmpty()) {
			text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
		} else {
			let endOfLinePreference = os.EOL === '\n' ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
			text = editor.getModel().getValueInRange(selection, endOfLinePreference);
		}
		instance.sendText(text, true);
		return this.terminalService.showPanel();
	}
}

export class RunActiveFileInTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.runActiveFile';
	public static readonly LABEL = nls.localize('workbench.action.terminal.runActiveFile', "Run Active File In Active Terminal");

	constructor(
		id: string, label: string,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@ITerminalService private terminalService: ITerminalService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance();
		if (!instance) {
			return TPromise.as(void 0);
		}
		const editor = this.codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			return TPromise.as(void 0);
		}
		const uri = editor.getModel().uri;
		if (uri.scheme !== 'file') {
			this.messageService.show(Severity.Warning, nls.localize('workbench.action.terminal.runActiveFile.noFile', 'Only files on disk can be run in the terminal'));
			return TPromise.as(void 0);
		}
		instance.sendText(uri.fsPath, true);
		return this.terminalService.showPanel();
	}
}

export class SwitchTerminalInstanceAction extends Action {

	public static readonly ID = 'workbench.action.terminal.switchTerminalInstance';
	public static readonly LABEL = nls.localize('workbench.action.terminal.switchTerminalInstance', "Switch Terminal Instance");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(SwitchTerminalInstanceAction.ID, SwitchTerminalInstanceAction.LABEL);
		this.class = 'terminal-action switch-terminal-instance';
	}

	public run(item?: string): TPromise<any> {
		if (!item || !item.split) {
			return TPromise.as(null);
		}
		const selectedTerminalIndex = parseInt(item.split(':')[0], 10) - 1;
		this.terminalService.setActiveInstanceByIndex(selectedTerminalIndex);
		return this.terminalService.showPanel(true);
	}
}

export class SwitchTerminalInstanceActionItem extends SelectActionItem {

	constructor(
		action: IAction,
		@ITerminalService private terminalService: ITerminalService,
		@IThemeService themeService: IThemeService
	) {
		super(null, action, terminalService.getInstanceLabels(), terminalService.activeTerminalInstanceIndex);

		this.toDispose.push(terminalService.onInstancesChanged(this._updateItems, this));
		this.toDispose.push(terminalService.onActiveInstanceChanged(this._updateItems, this));
		this.toDispose.push(terminalService.onInstanceTitleChanged(this._updateItems, this));
		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService));
	}

	private _updateItems(): void {
		this.setOptions(this.terminalService.getInstanceLabels(), this.terminalService.activeTerminalInstanceIndex);
	}
}

export class ScrollDownTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.scrollDown';
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollDown', "Scroll Down (Line)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollDownLine();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollDownPageTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.scrollDownPage';
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollDownPage', "Scroll Down (Page)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollDownPage();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollToBottomTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.scrollToBottom';
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToBottom', "Scroll to Bottom");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollToBottom();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollUpTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.scrollUp';
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollUp', "Scroll Up (Line)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollUpLine();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollUpPageTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.scrollUpPage';
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollUpPage', "Scroll Up (Page)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollUpPage();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollToTopTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.scrollToTop';
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToTop', "Scroll to Top");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollToTop();
		}
		return TPromise.as(void 0);
	}
}

export class ClearTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.clear';
	public static readonly LABEL = nls.localize('workbench.action.terminal.clear', "Clear");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.clear();
		}
		return TPromise.as(void 0);
	}
}

export class AllowWorkspaceShellTerminalCommand extends Action {

	public static readonly ID = 'workbench.action.terminal.allowWorkspaceShell';
	public static readonly LABEL = nls.localize('workbench.action.terminal.allowWorkspaceShell', "Allow Workspace Shell Configuration");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		this.terminalService.setWorkspaceShellAllowed(true);
		return TPromise.as(void 0);
	}
}

export class DisallowWorkspaceShellTerminalCommand extends Action {

	public static readonly ID = 'workbench.action.terminal.disallowWorkspaceShell';
	public static readonly LABEL = nls.localize('workbench.action.terminal.disallowWorkspaceShell', "Disallow Workspace Shell Configuration");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		this.terminalService.setWorkspaceShellAllowed(false);
		return TPromise.as(void 0);
	}
}

export class RenameTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.rename';
	public static readonly LABEL = nls.localize('workbench.action.terminal.rename', "Rename");

	constructor(
		id: string, label: string,
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@ITerminalService protected terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(terminal?: TerminalEntry): TPromise<any> {
		const terminalInstance = terminal ? this.terminalService.getInstanceFromIndex(parseInt(terminal.getLabel().split(':')[0], 10) - 1) : this.terminalService.getActiveInstance();
		if (!terminalInstance) {
			return TPromise.as(void 0);
		}
		return this.quickOpenService.input({
			value: terminalInstance.title,
			prompt: nls.localize('workbench.action.terminal.rename.prompt', "Enter terminal name"),
		}).then(name => {
			if (name) {
				terminalInstance.setTitle(name, false);
			}
		});
	}
}

export class FocusTerminalFindWidgetAction extends Action {

	public static readonly ID = 'workbench.action.terminal.focusFindWidget';
	public static readonly LABEL = nls.localize('workbench.action.terminal.focusFindWidget', "Focus Find Widget");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.terminalService.focusFindWidget();
	}
}

export class HideTerminalFindWidgetAction extends Action {

	public static readonly ID = 'workbench.action.terminal.hideFindWidget';
	public static readonly LABEL = nls.localize('workbench.action.terminal.hideFindWidget', "Hide Find Widget");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return TPromise.as(this.terminalService.hideFindWidget());
	}
}

export class ShowNextFindTermTerminalFindWidgetAction extends Action {

	public static readonly ID = 'workbench.action.terminal.findWidget.history.showNext';
	public static readonly LABEL = nls.localize('nextTerminalFindTerm', "Show Next Find Term");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return TPromise.as(this.terminalService.showNextFindTermFindWidget());
	}
}

export class ShowPreviousFindTermTerminalFindWidgetAction extends Action {

	public static readonly ID = 'workbench.action.terminal.findWidget.history.showPrevious';
	public static readonly LABEL = nls.localize('previousTerminalFindTerm', "Show Previous Find Term");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return TPromise.as(this.terminalService.showPreviousFindTermFindWidget());
	}
}


export class QuickOpenActionTermContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public getActions(context: any): IAction[] {
		let actions: Action[] = [];
		if (context.element instanceof TerminalEntry) {
			actions.push(this.instantiationService.createInstance(RenameTerminalQuickOpenAction, RenameTerminalQuickOpenAction.ID, RenameTerminalQuickOpenAction.LABEL, context.element));
			actions.push(this.instantiationService.createInstance(QuickKillTerminalAction, QuickKillTerminalAction.ID, QuickKillTerminalAction.LABEL, context.element));
		}
		return actions;
	}

	public hasActions(context: any): boolean {
		return true;
	}
}

export class QuickOpenTermAction extends Action {

	public static readonly ID = 'workbench.action.quickOpenTerm';
	public static readonly LABEL = nls.localize('quickOpenTerm', "Switch Active Terminal");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return this.quickOpenService.show(TERMINAL_PICKER_PREFIX, null);
	}
}

export class RenameTerminalQuickOpenAction extends RenameTerminalAction {

	constructor(
		id: string, label: string,
		private terminal: TerminalEntry,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@ITerminalService terminalService: ITerminalService
	) {
		super(id, label, quickOpenService, terminalService);
		this.class = 'quick-open-terminal-configure';
	}

	public run(): TPromise<any> {
		super.run(this.terminal)
			// This timeout is needed to make sure the previous quickOpen has time to close before we show the next one
			.then(() => TPromise.timeout(50))
			.then(result => this.quickOpenService.show(TERMINAL_PICKER_PREFIX, null));
		return TPromise.as(null);
	}
}
