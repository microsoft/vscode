/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action, IAction } from 'vs/base/common/actions';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ITerminalService, TERMINAL_PANEL_ID, ITerminalInstance, Direction, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { SelectActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IQuickInputService, IPickOptions, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ActionBarContributor } from 'vs/workbench/browser/actions';
import { TerminalEntry } from 'vs/workbench/contrib/terminal/browser/terminalQuickOpen';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminalCommands';
import { Command } from 'vs/editor/browser/editorExtensions';
import { timeout } from 'vs/base/common/async';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { ISelectOptionItem } from 'vs/base/browser/ui/selectBox/selectBox';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';
import { withNullAsUndefined } from 'vs/base/common/types';

export const TERMINAL_PICKER_PREFIX = 'term ';

function getCwdForSplit(configHelper: ITerminalConfigHelper, instance: ITerminalInstance, folders?: IWorkspaceFolder[], commandService?: ICommandService): Promise<string | URI> {
	switch (configHelper.config.splitCwd) {
		case 'workspaceRoot':
			let pathPromise: Promise<string | URI> = Promise.resolve('');
			if (folders !== undefined && commandService !== undefined) {
				if (folders.length === 1) {
					pathPromise = Promise.resolve(folders[0].uri);
				} else if (folders.length > 1) {
					// Only choose a path when there's more than 1 folder
					const options: IPickOptions<IQuickPickItem> = {
						placeHolder: nls.localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
					};
					pathPromise = commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]).then(workspace => {
						if (!workspace) {
							// Don't split the instance if the workspace picker was canceled
							return undefined;
						}
						return Promise.resolve(workspace.uri);
					});
				}
			}
			return pathPromise;
		case 'initial':
			return instance.getInitialCwd();
		case 'inherited':
			return instance.getCwd();
	}
}

export class ToggleTerminalAction extends TogglePanelAction {

	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleTerminal', "Toggle Integrated Terminal");

	constructor(
		id: string, label: string,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label, TERMINAL_PANEL_ID, panelService, layoutService);
	}

	public run(event?: any): Promise<any> {
		if (this.terminalService.terminalInstances.length === 0) {
			// If there is not yet an instance attempt to create it here so that we can suggest a
			// new shell on Windows (and not do so when the panel is restored on reload).
			const newTerminalInstance = this.terminalService.createTerminal(undefined);
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label, 'terminal-action kill');
	}

	public run(event?: any): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.dispose(true);
			if (this.terminalService.terminalInstances.length > 0) {
				this.terminalService.showPanel(true);
			}
		}
		return Promise.resolve(undefined);
	}
}

export class QuickKillTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.QUICK_KILL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.quickKill', "Kill Terminal Instance");

	constructor(
		id: string, label: string,
		private terminalEntry: TerminalEntry,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService
	) {
		super(id, label, 'terminal-action kill');
	}

	public run(event?: any): Promise<any> {
		const instance = this.terminalEntry.instance;
		if (instance) {
			instance.dispose(true);
		}
		return Promise.resolve(timeout(50)).then(result => this.quickOpenService.show(TERMINAL_PICKER_PREFIX, undefined));
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public async run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			await terminalInstance.copySelection();
		}
		return Promise.resolve(undefined);
	}
}

export class SelectAllTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_ALL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectAll', "Select All");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.selectAll();
		}
		return Promise.resolve(undefined);
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

	public run(event?: any): Promise<any> {
		const terminalInstance = this._terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.sendText(this._text, false);
		}
		return Promise.resolve(undefined);
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

export class DeleteToLineStartTerminalAction extends BaseSendTextTerminalAction {
	public static readonly ID = TERMINAL_COMMAND_ID.DELETE_TO_LINE_START;
	public static readonly LABEL = nls.localize('workbench.action.terminal.deleteToLineStart', "Delete To Line Start");

	constructor(
		id: string,
		label: string,
		@ITerminalService terminalService: ITerminalService
	) {
		// Send ctrl+u
		super(id, label, '\u0015', terminalService);
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

		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const historyService = accessor.get(IHistoryService);
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.file);
		const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
		const resolvedText = configurationResolverService.resolve(lastActiveWorkspaceRoot, args.text);
		terminalInstance.sendText(resolvedText, false);
	}
}

export class CreateNewTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.NEW;
	public static readonly LABEL = nls.localize('workbench.action.terminal.new', "Create New Integrated Terminal");
	public static readonly SHORT_LABEL = nls.localize('workbench.action.terminal.new.short', "New Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super(id, label, 'terminal-action new');
	}

	public run(event?: any): Promise<any> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (event instanceof MouseEvent && (event.altKey || event.ctrlKey)) {
			const activeInstance = this.terminalService.getActiveInstance();
			if (activeInstance) {
				return getCwdForSplit(this.terminalService.configHelper, activeInstance).then(cwd => {
					this.terminalService.splitInstance(activeInstance, { cwd });
					return Promise.resolve(null);
				});
			}
		}

		let instancePromise: Promise<ITerminalInstance | null>;
		if (folders.length <= 1) {
			// Allow terminal service to handle the path when there is only a
			// single root
			instancePromise = Promise.resolve(this.terminalService.createTerminal(undefined));
		} else {
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
			};
			instancePromise = this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]).then(workspace => {
				if (!workspace) {
					// Don't create the instance if the workspace picker was canceled
					return null;
				}
				return this.terminalService.createTerminal({ cwd: workspace.uri });
			});
		}

		return instancePromise.then(instance => {
			if (!instance) {
				return Promise.resolve(undefined);
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const instance = this.terminalService.createTerminal(undefined);
		if (!instance) {
			return Promise.resolve(undefined);
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
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super(id, label, 'terminal-action split');
	}

	public run(event?: any): Promise<any> {
		const instance = this._terminalService.getActiveInstance();
		if (!instance) {
			return Promise.resolve(undefined);
		}
		return getCwdForSplit(this._terminalService.configHelper, instance, this.workspaceContextService.getWorkspace().folders, this.commandService).then(cwd => {
			if (cwd || (cwd === '')) {
				this._terminalService.splitInstance(instance, { cwd });
				return this._terminalService.showPanel(true);
			} else {
				return undefined;
			}
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

	public run(event?: any): Promise<any> {
		const instance = this._terminalService.getActiveInstance();
		if (!instance) {
			return Promise.resolve(undefined);
		}
		return getCwdForSplit(this._terminalService.configHelper, instance).then(cwd => {
			this._terminalService.splitInstance(instance, { cwd });
			return this._terminalService.showPanel(true);
		});
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

	public run(event?: any): Promise<any> {
		const tab = this._terminalService.getActiveTab();
		if (!tab) {
			return Promise.resolve(undefined);
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

	public run(event?: any): Promise<any> {
		const tab = this._terminalService.getActiveTab();
		if (!tab) {
			return Promise.resolve(undefined);
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

	public run(event?: any): Promise<any> {
		const tab = this._terminalService.getActiveTab();
		if (tab) {
			tab.resizePane(this._direction);
		}
		return Promise.resolve(undefined);
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance(true);
		if (!instance) {
			return Promise.resolve(undefined);
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		this.terminalService.setActiveTabToNext();
		return this.terminalService.showPanel(true);
	}
}

export class FocusPreviousTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.FOCUS_PREVIOUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.focusPrevious', "Focus Previous Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public async run(event?: any): Promise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance();
		if (instance) {
			await instance.paste();
		}
	}
}

export class SelectDefaultShellWindowsTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_DEFAULT_SHELL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectDefaultShell', "Select Default Shell");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		return this._terminalService.selectDefaultWindowsShell();
	}
}

export class RunSelectedTextInTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.RUN_SELECTED_TEXT;
	public static readonly LABEL = nls.localize('workbench.action.terminal.runSelectedText', "Run Selected Text In Active Terminal");

	constructor(
		id: string, label: string,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance();
		if (!instance) {
			return Promise.resolve(undefined);
		}
		let editor = this.codeEditorService.getFocusedCodeEditor();
		if (!editor || !editor.hasModel()) {
			return Promise.resolve(undefined);
		}
		let selection = editor.getSelection();
		let text: string;
		if (selection.isEmpty()) {
			text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
		} else {
			const endOfLinePreference = isWindows ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
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
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const instance = this.terminalService.getActiveOrCreateInstance();
		if (!instance) {
			return Promise.resolve(undefined);
		}
		const editor = this.codeEditorService.getActiveCodeEditor();
		if (!editor || !editor.hasModel()) {
			return Promise.resolve(undefined);
		}
		const uri = editor.getModel().uri;
		if (uri.scheme !== 'file') {
			this.notificationService.warn(nls.localize('workbench.action.terminal.runActiveFile.noFile', 'Only files on disk can be run in the terminal'));
			return Promise.resolve(undefined);
		}

		return this.terminalService.preparePathForTerminalAsync(uri.fsPath, instance.shellLaunchConfig.executable, instance.title).then(path => {
			instance.sendText(path, true);
			return this.terminalService.showPanel();
		});
	}
}

export class SwitchTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SWITCH_TERMINAL;
	public static readonly LABEL = nls.localize('workbench.action.terminal.switchTerminal', "Switch Terminal");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label, 'terminal-action switch-terminal');
	}

	public run(item?: string): Promise<any> {
		if (!item || !item.split) {
			return Promise.resolve(null);
		}
		if (item === SwitchTerminalActionViewItem.SEPARATOR) {
			this.terminalService.refreshActiveTab();
			return Promise.resolve(null);
		}
		if (item === SelectDefaultShellWindowsTerminalAction.LABEL) {
			this.terminalService.refreshActiveTab();
			return this.terminalService.selectDefaultWindowsShell();
		}
		const selectedTabIndex = parseInt(item.split(':')[0], 10) - 1;
		this.terminalService.setActiveTabByIndex(selectedTabIndex);
		return this.terminalService.showPanel(true);
	}
}

export class SwitchTerminalActionViewItem extends SelectActionViewItem {

	public static readonly SEPARATOR = '─────────';

	constructor(
		action: IAction,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super(null, action, terminalService.getTabLabels().map(label => <ISelectOptionItem>{ text: label }), terminalService.activeTabIndex, contextViewService, { ariaLabel: nls.localize('terminals', 'Open Terminals.') });

		this._register(terminalService.onInstancesChanged(this._updateItems, this));
		this._register(terminalService.onActiveTabChanged(this._updateItems, this));
		this._register(terminalService.onInstanceTitleChanged(this._updateItems, this));
		this._register(terminalService.onTabDisposed(this._updateItems, this));
		this._register(attachSelectBoxStyler(this.selectBox, themeService));
	}

	private _updateItems(): void {
		const items = this.terminalService.getTabLabels().map(label => <ISelectOptionItem>{ text: label });
		items.push({ text: SwitchTerminalActionViewItem.SEPARATOR, isDisabled: true });
		items.push({ text: SelectDefaultShellWindowsTerminalAction.LABEL });
		this.setOptions(items, this.terminalService.activeTabIndex);
	}
}

export class ScrollDownTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_DOWN_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollDown', "Scroll Down (Line)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollDownLine();
		}
		return Promise.resolve(undefined);
	}
}

export class ScrollDownPageTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_DOWN_PAGE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollDownPage', "Scroll Down (Page)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollDownPage();
		}
		return Promise.resolve(undefined);
	}
}

export class ScrollToBottomTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_BOTTOM;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToBottom', "Scroll to Bottom");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollToBottom();
		}
		return Promise.resolve(undefined);
	}
}

export class ScrollUpTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_UP_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollUp', "Scroll Up (Line)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollUpLine();
		}
		return Promise.resolve(undefined);
	}
}

export class ScrollUpPageTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_UP_PAGE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollUpPage', "Scroll Up (Page)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollUpPage();
		}
		return Promise.resolve(undefined);
	}
}

export class ScrollToTopTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_TOP;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToTop', "Scroll to Top");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.scrollToTop();
		}
		return Promise.resolve(undefined);
	}
}

export class NavigationModeExitTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.NAVIGATION_MODE_EXIT;
	public static readonly LABEL = nls.localize('workbench.action.terminal.navigationModeExit', "Exit Navigation Mode");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance && terminalInstance.navigationMode) {
			terminalInstance.navigationMode.exitNavigationMode();
		}
		return Promise.resolve(undefined);
	}
}



export class NavigationModeFocusPreviousTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.NAVIGATION_MODE_FOCUS_PREVIOUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.navigationModeFocusPrevious', "Focus Previous Line (Navigation Mode)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance && terminalInstance.navigationMode) {
			terminalInstance.navigationMode.focusPreviousLine();
		}
		return Promise.resolve(undefined);
	}
}

export class NavigationModeFocusNextTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.NAVIGATION_MODE_FOCUS_NEXT;
	public static readonly LABEL = nls.localize('workbench.action.terminal.navigationModeFocusNext', "Focus Next Line (Navigation Mode)");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance && terminalInstance.navigationMode) {
			terminalInstance.navigationMode.focusNextLine();
		}
		return Promise.resolve(undefined);
	}
}

export class ClearTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.CLEAR;
	public static readonly LABEL = nls.localize('workbench.action.terminal.clear', "Clear");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance) {
			terminalInstance.clear();
		}
		return Promise.resolve(undefined);
	}
}

export class ClearSelectionTerminalAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.CLEAR_SELECTION;
	public static readonly LABEL = nls.localize('workbench.action.terminal.clearSelection', "Clear Selection");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		const terminalInstance = this.terminalService.getActiveInstance();
		if (terminalInstance && terminalInstance.hasSelection()) {
			terminalInstance.clearSelection();
		}
		return Promise.resolve(undefined);
	}
}

export class ManageWorkspaceShellPermissionsTerminalCommand extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.MANAGE_WORKSPACE_SHELL_PERMISSIONS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.manageWorkspaceShellPermissions', "Manage Workspace Shell Permissions");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public async run(event?: any): Promise<any> {
		await this.terminalService.manageWorkspaceShellPermissions();
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

	public run(entry?: TerminalEntry): Promise<any> {
		const terminalInstance = entry ? entry.instance : this.terminalService.getActiveInstance();
		if (!terminalInstance) {
			return Promise.resolve(undefined);
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		return this.terminalService.focusFindWidget();
	}
}

export class HideTerminalFindWidgetAction extends Action {

	public static readonly ID = TERMINAL_COMMAND_ID.FIND_WIDGET_HIDE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.hideFindWidget', "Hide Find Widget");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		return Promise.resolve(this.terminalService.hideFindWidget());
	}
}

export class QuickOpenActionTermContributor extends ActionBarContributor {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	public getActions(context: any): ReadonlyArray<IAction> {
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
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): Promise<void> {
		return this.quickOpenService.show(TERMINAL_PICKER_PREFIX, undefined);
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

	public run(): Promise<any> {
		super.run(this.terminal)
			// This timeout is needed to make sure the previous quickOpen has time to close before we show the next one
			.then(() => timeout(50))
			.then(result => this.quickOpenService.show(TERMINAL_PICKER_PREFIX, undefined));
		return Promise.resolve(null);
	}
}

export class ScrollToPreviousCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_PREVIOUS_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToPreviousCommand', "Scroll To Previous Command");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance && instance.commandTracker) {
			instance.commandTracker.scrollToPreviousCommand();
			instance.focus();
		}
		return Promise.resolve(undefined);
	}
}

export class ScrollToNextCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SCROLL_TO_NEXT_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.scrollToNextCommand', "Scroll To Next Command");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance && instance.commandTracker) {
			instance.commandTracker.scrollToNextCommand();
			instance.focus();
		}
		return Promise.resolve(undefined);
	}
}

export class SelectToPreviousCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_PREVIOUS_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToPreviousCommand', "Select To Previous Command");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance && instance.commandTracker) {
			instance.commandTracker.selectToPreviousCommand();
			instance.focus();
		}
		return Promise.resolve(undefined);
	}
}

export class SelectToNextCommandAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_NEXT_COMMAND;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToNextCommand', "Select To Next Command");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance && instance.commandTracker) {
			instance.commandTracker.selectToNextCommand();
			instance.focus();
		}
		return Promise.resolve(undefined);
	}
}

export class SelectToPreviousLineAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_PREVIOUS_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToPreviousLine', "Select To Previous Line");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance && instance.commandTracker) {
			instance.commandTracker.selectToPreviousLine();
			instance.focus();
		}
		return Promise.resolve(undefined);
	}
}

export class SelectToNextLineAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.SELECT_TO_NEXT_LINE;
	public static readonly LABEL = nls.localize('workbench.action.terminal.selectToNextLine', "Select To Next Line");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance && instance.commandTracker) {
			instance.commandTracker.selectToNextLine();
			instance.focus();
		}
		return Promise.resolve(undefined);
	}
}


export class ToggleEscapeSequenceLoggingAction extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.TOGGLE_ESCAPE_SEQUENCE_LOGGING;
	public static readonly LABEL = nls.localize('workbench.action.terminal.toggleEscapeSequenceLogging', "Toggle Escape Sequence Logging");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		const instance = this.terminalService.getActiveInstance();
		if (instance) {
			instance.toggleEscapeSequenceLogging();
		}
		return Promise.resolve(undefined);
	}
}

abstract class ToggleFindOptionCommand extends Action {
	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	protected abstract runInner(state: FindReplaceState): void;

	public run(): Promise<any> {
		const state = this.terminalService.getFindState();
		this.runInner(state);
		return Promise.resolve(undefined);
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
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		this.terminalService.findNext();
		return Promise.resolve(undefined);
	}
}

export class FindPrevious extends Action {
	public static readonly ID = TERMINAL_COMMAND_ID.FIND_PREVIOUS;
	public static readonly ID_TERMINAL_FOCUS = TERMINAL_COMMAND_ID.FIND_PREVIOUS_TERMINAL_FOCUS;
	public static readonly LABEL = nls.localize('workbench.action.terminal.findPrevious', "Find previous");

	constructor(
		id: string, label: string,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		this.terminalService.findPrevious();
		return Promise.resolve(undefined);
	}
}
