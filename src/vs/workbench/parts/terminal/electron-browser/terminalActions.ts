/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as os from 'os';
import { Action, IAction } from 'vs/base/common/actions';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ITerminalService, TERMINAL_PANEL_ID, ITerminalInstance, Direction } from 'vs/workbench/parts/terminal/common/terminal';
import { SelectActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IQuickOpenService, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { ActionBarContributor } from 'vs/workbench/browser/actions';
import { TerminalEntry } from 'vs/workbench/parts/terminal/browser/terminalQuickOpen';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { INotificationService } from 'vs/platform/notification/common/notification';

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
		super(id, label, 'terminal-action kill');
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
		super(id, label, 'terminal-action kill');
	}

	public run(event?: any): TPromise<any> {
		const terminalIndex = parseInt(this.terminalEntry.getLabel().split(':')[0]) - 1;
		const terminal = this.terminalService.getInstanceFromIndex(terminalIndex);
		if (terminal) {
			terminal.dispose();
		}
		// if (this.terminalService.terminalInstances.length > 0 && this.terminalService.activeTerminalInstanceIndex !== terminalIndex) {
		// 	this.terminalService.setActiveInstanceByIndex(Math.min(terminalIndex, this.terminalService.terminalInstances.length - 1));
		// }
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

export abstract class BaseSendTextTerminalAction extends Action {
	constructor(
		id: string,
		label: string,
		private _text: string,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		let terminalInstance = this._terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.sendText(this._text, false);
		}
		return TPromise.as(void 0);
	}
}

export class DeleteWordLeftTerminalAction extends BaseSendTextTerminalAction {
	public static readonly ID = 'workbench.action.terminal.deleteWordLeft';
	public static readonly LABEL = nls.localize('workbench.action.terminal.deleteWordLeft', "Delete Word Left");

	constructor(
		id: string,
		label: string,
		@ITerminalService terminalService: ITerminalService
	) {
		// Send ctrl+W
		super(id, label, String.fromCharCode('W'.charCodeAt(0) - 64), terminalService);
	}
}

export class DeleteWordRightTerminalAction extends BaseSendTextTerminalAction {
	public static readonly ID = 'workbench.action.terminal.deleteWordRight';
	public static readonly LABEL = nls.localize('workbench.action.terminal.deleteWordRight', "Delete Word Right");

	constructor(
		id: string,
		label: string,
		@ITerminalService terminalService: ITerminalService
	) {
		// Send alt+D
		super(id, label, '\x1bD', terminalService);
	}
}

export class MoveToLineStartTerminalAction extends BaseSendTextTerminalAction {
	public static readonly ID = 'workbench.action.terminal.moveToLineStart';
	public static readonly LABEL = nls.localize('workbench.action.terminal.moveToLineStart', "Move To Line Start");

	constructor(
		id: string,
		label: string,
		@ITerminalService terminalService: ITerminalService
	) {
		// Send ctrl+A
		super(id, label, String.fromCharCode('A'.charCodeAt(0) - 64), terminalService);
	}
}

export class MoveToLineEndTerminalAction extends BaseSendTextTerminalAction {
	public static readonly ID = 'workbench.action.terminal.moveToLineEnd';
	public static readonly LABEL = nls.localize('workbench.action.terminal.moveToLineEnd', "Move To Line End");

	constructor(
		id: string,
		label: string,
		@ITerminalService terminalService: ITerminalService
	) {
		// Send ctrl+E
		super(id, label, String.fromCharCode('E'.charCodeAt(0) - 64), terminalService);
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
		super(id, label, 'terminal-action new');
	}

	public run(event?: any): TPromise<any> {
		const folders = this.workspaceContextService.getWorkspace().folders;

		let instancePromise: TPromise<ITerminalInstance>;
		if (folders.length <= 1) {
			// Allow terminal service to handle the path when there is only a
			// single root
			instancePromise = TPromise.as(this.terminalService.createInstance(undefined, true));
		} else {
			const options: IPickOptions = {
				placeHolder: nls.localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
			};
			instancePromise = this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]).then(workspace => {
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

export class CreateNewInActiveWorkspaceTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.newInActiveWorkspace';
	public static readonly LABEL = nls.localize('workbench.action.terminal.newInActiveWorkspace', "Create New Integrated Terminal (In Active Workspace)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.createInstance(undefined, true);
		if (!instance) {
			return TPromise.as(void 0);
		}
		this.terminalService.setActiveInstance(instance);
		return this.terminalService.showPanel(true);
	}
}

export class SplitTerminalAction extends Action {
	public static readonly ID = 'workbench.action.terminal.split';
	public static readonly LABEL = nls.localize('workbench.action.terminal.split', "Split Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label, 'terminal-action split');
	}

	public run(event?: any): TPromise<any> {
		const instance = this._terminalService.getActiveInstance();
		if (!instance) {
			return TPromise.as(void 0);
		}
		this._terminalService.splitInstance(instance);
		return this._terminalService.showPanel(true);
	}
}

export class FocusPreviousPaneTerminalAction extends Action {
	public static readonly ID = 'workbench.action.terminal.focusPreviousPane';
	public static readonly LABEL = nls.localize('workbench.action.terminal.focusPreviousPane', "Focus Previous Pane");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const tab = this._terminalService.getActiveTab();
		if (!tab) {
			return TPromise.as(void 0);
		}
		tab.focusPreviousPane();
		return this._terminalService.showPanel(true);
	}
}

export class FocusNextPaneTerminalAction extends Action {
	public static readonly ID = 'workbench.action.terminal.focusNextPane';
	public static readonly LABEL = nls.localize('workbench.action.terminal.focusNextPane', "Focus Next Pane");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const tab = this._terminalService.getActiveTab();
		if (!tab) {
			return TPromise.as(void 0);
		}
		tab.focusNextPane();
		return this._terminalService.showPanel(true);
	}
}

export abstract class BaseFocusDirectionTerminalAction extends Action {
	constructor(
		id: string, label: string,
		private _direction: Direction,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const tab = this._terminalService.getActiveTab();
		if (tab) {
			tab.resizePane(this._direction);
		}
		return TPromise.as(void 0);
	}
}

export class ResizePaneLeftTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = 'workbench.action.terminal.resizePaneLeft';
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneLeft', "Resize Pane Left");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Left, terminalService);
	}
}

export class ResizePaneRightTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = 'workbench.action.terminal.resizePaneRight';
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneRight', "Resize Pane Right");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Right, terminalService);
	}
}

export class ResizePaneUpTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = 'workbench.action.terminal.resizePaneUp';
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneUp', "Resize Pane Up");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Up, terminalService);
	}
}

export class ResizePaneDownTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = 'workbench.action.terminal.resizePaneDown';
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneDown', "Resize Pane Down");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Down, terminalService);
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
		this.terminalService.setActiveTabToNext();
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
		this.terminalService.setActiveTabToPrevious();
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
		@INotificationService private notificationService: INotificationService
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
			this.notificationService.warn(nls.localize('workbench.action.terminal.runActiveFile.noFile', 'Only files on disk can be run in the terminal'));
			return TPromise.as(void 0);
		}
		instance.sendText(uri.fsPath, true);
		return this.terminalService.showPanel();
	}
}

export class SwitchTerminalAction extends Action {

	public static readonly ID = 'workbench.action.terminal.switchTerminal';
	public static readonly LABEL = nls.localize('workbench.action.terminal.switchTerminal', "Switch Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(SwitchTerminalAction.ID, SwitchTerminalAction.LABEL, 'terminal-action switch-terminal');
	}

	public run(item?: string): TPromise<any> {
		if (!item || !item.split) {
			return TPromise.as(null);
		}
		const selectedTabIndex = parseInt(item.split(':')[0], 10) - 1;
		this.terminalService.setActiveTabByIndex(selectedTabIndex);
		return this.terminalService.showPanel(true);
	}
}

export class SwitchTerminalActionItem extends SelectActionItem {

	constructor(
		action: IAction,
		@ITerminalService private terminalService: ITerminalService,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super(null, action, terminalService.getTabLabels(), terminalService.activeTabIndex, contextViewService);

		this.toDispose.push(terminalService.onInstancesChanged(this._updateItems, this));
		this.toDispose.push(terminalService.onActiveTabChanged(this._updateItems, this));
		this.toDispose.push(terminalService.onInstanceTitleChanged(this._updateItems, this));
		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService));
	}

	private _updateItems(): void {
		this.setOptions(this.terminalService.getTabLabels(), this.terminalService.activeTabIndex);
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
