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
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IQuickInputService, IPickOptions, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ActionBarContributor } from 'vs/workbench/browser/actions';
import { TerminalEntry } from 'vs/workbench/parts/terminal/browser/terminalQuickOpen';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/parts/terminal/common/terminalCommands';
import { Command } from 'vs/editor/browser/editorExtensions';
import { timeout } from 'vs/base/common/async';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';

export const TERMINAL_PICKER_PREFIX = 'term ';

export class ToggleTerminalAction extends TogglePanelAction {

	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE;
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
			const newTerminalInstance = this.terminalService.createTerminal(undefined, true);
			const toDispose = newTerminalInstance.onProcessIdReady(() => {
				newTerminalInstance.focus();
				toDispose.dispose();
			});
		}
		return super.run();
	}
}

export class KillTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.KILL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.kill', "Kill the Active Terminal Instance");
	public static readonly PANEL_LABEL = nls.localize('workbench.action.terminal.kill.short', "Kill Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label, 'terminal-action kill');
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.dispose();
			if (this.terminalService.terminalInstances.length > 0) {
				this.terminalService.showPanel(true);
			}
		}
		return TPromise.as(void 0);
	}
}

export class QuickKillTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.QUICK_KILL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.quickKill', "Kill Terminal Instance");

	constructor(
		id: string, label: string,
		private terminalEntry: TerminalEntry,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, 'terminal-action kill');
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalEntry.instance;
		if (instance) {
			instance.dispose();
		}
		return TPromise.wrap(timeout(50)).then(result => this.quickOpenService.show(TERMINAL_PICKER_PREFIX, null));
	}
}

/**
 * Copies the terminal selection. Note that since the command palette takes focus from the terminal,
 * this cannot be triggered through the command palette.
 */
export class CopyTerminalSelectionAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.COPY_SELECTION;
	public static readonly LABEL = nls.localize('workbench.action.terminal.copySelection', "Copy Selection");
	public static readonly SHORT_LABEL = nls.localize('workbench.action.terminal.copySelection.short', "Copy");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.copySelection();
		}
		return TPromise.as(void 0);
	}
}

export class SelectAllTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_ALL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectAll', "Select All");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
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
		const terminalInstance = this._terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.sendText(this._text, false);
		}
		return TPromise.as(void 0);
	}
}

export class DeleteWordLeftTerminalAction extends BaseSendTextTerminalAction {
	public static readonly ID = TERMINAL_COMMAND_ID.DELETE_WORD_LEFT;
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
	public static readonly ID = TERMINAL_COMMAND_ID.DELETE_WORD_RIGHT;
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
	public static readonly ID = TERMINAL_COMMAND_ID.MOVE_TO_LINE_START;
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
	public static readonly ID = TERMINAL_COMMAND_ID.MOVE_TO_LINE_END;
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

export class SendSequenceTerminalCommand extends Command {
	public static readonly ID = TERMINAL_COMMAND_ID.SEND_SEQUENCE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.sendSequence', "Send Custom Sequence To Terminal");

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const terminalInstance = accessor.get(ITerminalService).getActiveInstance();
		if (!terminalInstance) {
			return;
		}
		terminalInstance.sendText(args.text, false);
	}
}

export class CreateNewTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.NEW;
	public static readonly LABEL = nls.localize('workbench.action.terminal.new', "Create New Integrated Terminal");
	public static readonly SHORT_LABEL = nls.localize('workbench.action.terminal.new.short', "New Terminal");

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
		if (event instanceof MouseEvent && (event.altKey || event.ctrlKey)) {
			const activeInstance = this.terminalService.getActiveInstance();
			if (activeInstance) {
				this.terminalService.splitInstance(activeInstance);
				return TPromise.as(null);
			}
		}

		let instancePromise: TPromise<ITerminalInstance>;
		if (folders.length <= 1) {
			// Allow terminal service to handle the path when there is only a
			// single root
			instancePromise = TPromise.as(this.terminalService.createTerminal(undefined, true));
		} else {
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
			};
			instancePromise = this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]).then(workspace => {
				if (!workspace) {
					// Don't create the instance if the workspace picker was canceled
					return null;
				}
				return this.terminalService.createTerminal({ cwd: workspace.uri.fsPath }, true);
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

	public static readonly ID = TERMINAL_COMMAND_ID.NEW_IN_ACTIVE_WORKSPACE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.newInActiveWorkspace', "Create New Integrated Terminal (In Active Workspace)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const instance = this.terminalService.createTerminal(undefined, true);
		if (!instance) {
			return TPromise.as(void 0);
		}
		this.terminalService.setActiveInstance(instance);
		return this.terminalService.showPanel(true);
	}
}

export class SplitTerminalAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SPLIT;
	public static readonly LABEL = nls.localize('workbench.action.terminal.split', "Split Terminal");
	public static readonly SHORT_LABEL = nls.localize('workbench.action.terminal.split.short', "Split");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService
	) {
		super(id, label, 'terminal-action split');
	}

	public run(event?: any): TPromise<any> {
		const instance = this._terminalService.getActiveInstance();
		if (!instance) {
			return TPromise.as(void 0);
		}

		const folders = this.workspaceContextService.getWorkspace().folders;

		let pathPromise: TPromise<any> = TPromise.as({});
		if (folders.length > 1) {
			// Only choose a path when there's more than 1 folder
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
			};
			pathPromise = this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]).then(workspace => {
				if (!workspace) {
					// Don't split the instance if the workspace picker was canceled
					return null;
				}
				return TPromise.as({ cwd: workspace.uri.fsPath });
			});
		}

		return pathPromise.then(path => {
			if (!path) {
				return TPromise.as(void 0);
			}
			this._terminalService.splitInstance(instance, path);
			return this._terminalService.showPanel(true);
		});
	}
}

export class SplitInActiveWorkspaceTerminalAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SPLIT_IN_ACTIVE_WORKSPACE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.splitInActiveWorkspace', "Split Terminal (In Active Workspace)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label);
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
	public static readonly ID = TERMINAL_COMMAND_ID.FOCUS_PREVIOUS_PANE;
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
	public static readonly ID = TERMINAL_COMMAND_ID.FOCUS_NEXT_PANE;
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
	public static readonly ID = TERMINAL_COMMAND_ID.RESIZE_PANE_LEFT;
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneLeft', "Resize Pane Left");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Left, terminalService);
	}
}

export class ResizePaneRightTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = TERMINAL_COMMAND_ID.RESIZE_PANE_RIGHT;
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneRight', "Resize Pane Right");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Right, terminalService);
	}
}

export class ResizePaneUpTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = TERMINAL_COMMAND_ID.RESIZE_PANE_UP;
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneUp', "Resize Pane Up");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Up, terminalService);
	}
}

export class ResizePaneDownTerminalAction extends BaseFocusDirectionTerminalAction {
	public static readonly ID = TERMINAL_COMMAND_ID.RESIZE_PANE_DOWN;
	public static readonly LABEL = nls.localize('workbench.action.terminal.resizePaneDown', "Resize Pane Down");

	constructor(
		id: string, label: string,
		@ITerminalService readonly terminalService: ITerminalService
	) {
		super(id, label, Direction.Down, terminalService);
	}
}

export class FocusActiveTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.FOCUS;
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

	public static readonly ID = TERMINAL_COMMAND_ID.FOCUS_NEXT;
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

	public static readonly ID = TERMINAL_COMMAND_ID.FOCUS_PREVIOUS;
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

	public static readonly ID = TERMINAL_COMMAND_ID.PASTE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.paste', "Paste into Active Terminal");
	public static readonly SHORT_LABEL = nls.localize('workbench.action.terminal.paste.short', "Paste");

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

	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_DEFAULT_SHELL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectDefaultShell', "Select Default Shell");

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

	public static readonly ID = TERMINAL_COMMAND_ID.RUN_SELECTED_TEXT;
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
			const endOfLinePreference = os.EOL === '\n' ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
			text = editor.getModel().getValueInRange(selection, endOfLinePreference);
		}
		instance.sendText(text, true);
		return this.terminalService.showPanel();
	}
}

export class RunActiveFileInTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.RUN_ACTIVE_FILE;
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
		const editor = this.codeEditorService.getActiveCodeEditor();
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

	public static readonly ID = TERMINAL_COMMAND_ID.SWITCH_TERMINAL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.switchTerminal', "Switch Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label, 'terminal-action switch-terminal');
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
		super(null, action, terminalService.getTabLabels(), terminalService.activeTabIndex, contextViewService, { ariaLabel: nls.localize('terminals', 'Terminals') });

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

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_DOWN_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollDown', "Scroll Down (Line)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollDownLine();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollDownPageTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_DOWN_PAGE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollDownPage', "Scroll Down (Page)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollDownPage();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollToBottomTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_BOTTOM;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToBottom', "Scroll to Bottom");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollToBottom();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollUpTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_UP_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollUp', "Scroll Up (Line)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollUpLine();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollUpPageTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_UP_PAGE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollUpPage', "Scroll Up (Page)");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollUpPage();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollToTopTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_TOP;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToTop', "Scroll to Top");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollToTop();
		}
		return TPromise.as(void 0);
	}
}

export class ClearTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.CLEAR;
	public static readonly LABEL = nls.localize('workbench.action.terminal.clear', "Clear");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.clear();
		}
		return TPromise.as(void 0);
	}
}

export class ClearSelectionTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.CLEAR_SELECTION;
	public static readonly LABEL = nls.localize('workbench.action.terminal.clearSelection', "Clear Selection");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance && terminalInstance.hasSelection()) {
			terminalInstance.clearSelection();
		}
		return TPromise.as(void 0);
	}
}

export class AllowWorkspaceShellTerminalCommand extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.WORKSPACE_SHELL_ALLOW;
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

	public static readonly ID = TERMINAL_COMMAND_ID.WORKSPACE_SHELL_DISALLOW;
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

	public static readonly ID = TERMINAL_COMMAND_ID.RENAME;
	public static readonly LABEL = nls.localize('workbench.action.terminal.rename', "Rename");

	constructor(
		id: string, label: string,
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ITerminalService protected terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(entry?: TerminalEntry): TPromise<any> {
		const terminalInstance = entry ? entry.instance : this.terminalService.getActiveInstance();
		if (!terminalInstance) {
			return TPromise.as(void 0);
		}
		return this.quickInputService.input({
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

	public static readonly ID = TERMINAL_COMMAND_ID.FIND_WIDGET_FOCUS;
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

	public static readonly ID = TERMINAL_COMMAND_ID.FIND_WIDGET_HIDE;
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

export class QuickOpenActionTermContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public getActions(context: any): IAction[] {
		const actions: Action[] = [];
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

	public static readonly ID = TERMINAL_COMMAND_ID.QUICK_OPEN_TERM;
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
		@IQuickInputService quickInputService: IQuickInputService,
		@ITerminalService terminalService: ITerminalService
	) {
		super(id, label, quickOpenService, quickInputService, terminalService);
		this.class = 'quick-open-terminal-configure';
	}

	public run(): TPromise<any> {
		super.run(this.terminal)
			// This timeout is needed to make sure the previous quickOpen has time to close before we show the next one
			.then(() => timeout(50))
			.then(result => this.quickOpenService.show(TERMINAL_PICKER_PREFIX, null));
		return TPromise.as(null);
	}
}

export class ScrollToPreviousCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_PREVIOUS_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToPreviousCommand', "Scroll To Previous Command");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.commandTracker.scrollToPreviousCommand();
			instance.focus();
		}
		return TPromise.as(void 0);
	}
}

export class ScrollToNextCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_NEXT_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToNextCommand', "Scroll To Next Command");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.commandTracker.scrollToNextCommand();
			instance.focus();
		}
		return TPromise.as(void 0);
	}
}

export class SelectToPreviousCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_PREVIOUS_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToPreviousCommand', "Select To Previous Command");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.commandTracker.selectToPreviousCommand();
			instance.focus();
		}
		return TPromise.as(void 0);
	}
}

export class SelectToNextCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_NEXT_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToNextCommand', "Select To Next Command");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.commandTracker.selectToNextCommand();
			instance.focus();
		}
		return TPromise.as(void 0);
	}
}

export class SelectToPreviousLineAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_PREVIOUS_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToPreviousLine', "Select To Previous Line");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.commandTracker.selectToPreviousLine();
			instance.focus();
		}
		return TPromise.as(void 0);
	}
}

export class SelectToNextLineAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_NEXT_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToNextLine', "Select To Next Line");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.commandTracker.selectToNextLine();
			instance.focus();
		}
		return TPromise.as(void 0);
	}
}


export class ToggleEscapeSequenceLoggingAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE_ESCAPE_SEQUENCE_LOGGING;
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleEscapeSequenceLogging', "Toggle Escape Sequence Logging");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.toggleEscapeSequenceLogging();
		}
		return TPromise.as(void 0);
	}
}

abstract class ToggleFindOptionCommand extends Action {
	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	protected abstract runInner(state: FindReplaceState): void;

	public run(): TPromise<any> {
		const state = this.terminalService.getFindState();
		this.runInner(state);
		return TPromise.as(void 0);
	}
}

export class ToggleRegexCommand extends ToggleFindOptionCommand {
	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE_FIND_REGEX;
	public static readonly ID_TERMINAL_FOCUS = TERMINAL_COMMAND_ID.TOGGLE_FIND_REGEX_TERMINAL_FOCUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleFindRegex', "Toggle find using regex");

	protected runInner(state: FindReplaceState): void {
		state.change({ isRegex: !state.isRegex }, false);
	}
}

export class ToggleWholeWordCommand extends ToggleFindOptionCommand {
	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE_FIND_WHOLE_WORD;
	public static readonly ID_TERMINAL_FOCUS = TERMINAL_COMMAND_ID.TOGGLE_FIND_WHOLE_WORD_TERMINAL_FOCUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleFindWholeWord', "Toggle find using whole word");

	protected runInner(state: FindReplaceState): void {
		state.change({ wholeWord: !state.wholeWord }, false);
	}
}

export class ToggleCaseSensitiveCommand extends ToggleFindOptionCommand {
	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE_FIND_CASE_SENSITIVE;
	public static readonly ID_TERMINAL_FOCUS = TERMINAL_COMMAND_ID.TOGGLE_FIND_CASE_SENSITIVE_TERMINAL_FOCUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleFindCaseSensitive', "Toggle find using case sensitive");

	protected runInner(state: FindReplaceState): void {
		state.change({ matchCase: !state.matchCase }, false);
	}
}

export class FindNext extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.FIND_NEXT;
	public static readonly ID_TERMINAL_FOCUS = TERMINAL_COMMAND_ID.FIND_NEXT_TERMINAL_FOCUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.findNext', "Find next");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.terminalService.findNext();
		return TPromise.as(void 0);
	}
}

export class FindPrevious extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.FIND_PREVIOUS;
	public static readonly ID_TERMINAL_FOCUS = TERMINAL_COMMAND_ID.FIND_PREVIOUS_TERMINAL_FOCUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.findPrevious', "Find previous");

	constructor(
		id: string, label: string,
		@ITerminalService private terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.terminalService.findPrevious();
		return TPromise.as(void 0);
	}
}
