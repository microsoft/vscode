/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { IDisposable } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandActionTitle, ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILabelService } from 'vs/platform/label/common/label';
import { IListService } from 'vs/platform/list/browser/listService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IPickOptions, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalProfile, TerminalExitReason, TerminalLocation, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { CLOSE_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { ResourceContextKey } from 'vs/workbench/common/contextkeys';
import { FindInFilesCommand, IFindInFilesArgs } from 'vs/workbench/contrib/search/browser/searchActions';
import { Direction, ICreateTerminalOptions, IInternalXtermTerminal, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalQuickAccessProvider } from 'vs/workbench/contrib/terminal/browser/terminalQuickAccess';
import { IRemoteTerminalAttachTarget, ITerminalConfigHelper, ITerminalProfileService, TerminalCommandId, TERMINAL_ACTION_CATEGORY } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { createProfileSchemaEnums } from 'vs/platform/terminal/common/terminalProfiles';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { isAbsolute } from 'vs/base/common/path';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { ITerminalQuickPickItem } from 'vs/workbench/contrib/terminal/browser/terminalProfileQuickpick';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { getIconId, getColorClass, getUriClasses } from 'vs/workbench/contrib/terminal/browser/terminalIcon';
import { clearShellFileHistory, getCommandHistory } from 'vs/workbench/contrib/terminal/common/history';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

export const switchTerminalActionViewItemSeparator = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
export const switchTerminalShowTabsTitle = localize('showTerminalTabs', "Show Tabs");

export async function getCwdForSplit(configHelper: ITerminalConfigHelper, instance: ITerminalInstance, folders?: IWorkspaceFolder[], commandService?: ICommandService): Promise<string | URI | undefined> {
	switch (configHelper.config.splitCwd) {
		case 'workspaceRoot':
			if (folders !== undefined && commandService !== undefined) {
				if (folders.length === 1) {
					return folders[0].uri;
				} else if (folders.length > 1) {
					// Only choose a path when there's more than 1 folder
					const options: IPickOptions<IQuickPickItem> = {
						placeHolder: localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
					};
					const workspace = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
					if (!workspace) {
						// Don't split the instance if the workspace picker was canceled
						return undefined;
					}
					return Promise.resolve(workspace.uri);
				}
			}
			return '';
		case 'initial':
			return instance.getInitialCwd();
		case 'inherited':
			return instance.getCwd();
	}
}

export const terminalSendSequenceCommand = (accessor: ServicesAccessor, args: { text?: string } | undefined) => {
	accessor.get(ITerminalService).doWithActiveInstance(async t => {
		if (!args?.text) {
			return;
		}
		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const historyService = accessor.get(IHistoryService);
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(t.isRemote ? Schemas.vscodeRemote : Schemas.file);
		const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
		const resolvedText = await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, args.text);
		t.sendText(resolvedText, false);
	});
};

const terminalIndexRe = /^([0-9]+): /;

export class TerminalLaunchHelpAction extends Action {

	constructor(
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		super('workbench.action.terminal.launchHelp', localize('terminalLaunchHelp', "Open Help"));
	}

	override async run(): Promise<void> {
		this._openerService.open('https://aka.ms/vscode-troubleshoot-terminal-launch');
	}
}

export function registerTerminalActions() {
	const category: ILocalizedString = { value: TERMINAL_ACTION_CATEGORY, original: 'Terminal' };

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NewInActiveWorkspace,
				title: { value: localize('workbench.action.terminal.newInActiveWorkspace', "Create New Terminal (In Active Workspace)"), original: 'Create New Terminal (In Active Workspace)' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			if (terminalService.isProcessSupportRegistered) {
				const instance = await terminalService.createTerminal({ location: terminalService.defaultLocation });
				if (!instance) {
					return;
				}
				terminalService.setActiveInstance(instance);
			}
			await terminalGroupService.showPanel(true);
		}
	});

	// Register new with profile command
	refreshTerminalActions([]);

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.CreateTerminalEditor,
				title: { value: localize('workbench.action.terminal.createTerminalEditor', "Create New Terminal in Editor Area"), original: 'Create New Terminal in Editor Area' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor, args?: unknown) {
			const terminalService = accessor.get(ITerminalService);
			const options = (typeof args === 'object' && args && 'location' in args) ? args as ICreateTerminalOptions : { location: TerminalLocation.Editor };
			const instance = await terminalService.createTerminal(options);
			instance.focusWhenReady();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.CreateTerminalEditorSide,
				title: { value: localize('workbench.action.terminal.createTerminalEditorSide', "Create New Terminal in Editor Area to the Side"), original: 'Create New Terminal in Editor Area to the Side' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const instance = await terminalService.createTerminal({
				location: { viewColumn: SIDE_GROUP }
			});
			instance.focusWhenReady();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.MoveToEditor,
				title: terminalStrings.moveToEditor,
				f1: true,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.terminalEditorActive.toNegated(), TerminalContextKeys.viewShowing)
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			terminalService.doWithActiveInstance(instance => terminalService.moveToEditor(instance));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.MoveToEditorInstance,
				title: terminalStrings.moveToEditor,
				f1: false,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen)
			});
		}
		async run(accessor: ServicesAccessor) {
			const selectedInstances = getSelectedInstances(accessor);
			if (!selectedInstances || selectedInstances.length === 0) {
				return;
			}
			const terminalService = accessor.get(ITerminalService);
			for (const instance of selectedInstances) {
				terminalService.moveToEditor(instance);
			}
			selectedInstances[selectedInstances.length - 1].focus();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.MoveToTerminalPanel,
				title: terminalStrings.moveToTerminalPanel,
				f1: true,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.terminalEditorActive),
			});
		}
		async run(accessor: ServicesAccessor, resource: unknown) {
			const castedResource = URI.isUri(resource) ? resource : undefined;
			await accessor.get(ITerminalService).moveToTerminalView(castedResource);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ShowTabs,
				title: { value: localize('workbench.action.terminal.showTabs', "Show Tabs"), original: 'Show Tabs' },
				f1: false,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ITerminalGroupService).showTabs();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FocusPreviousPane,
				title: { value: localize('workbench.action.terminal.focusPreviousPane', "Focus Previous Terminal in Terminal Group"), original: 'Focus Previous Terminal in Terminal Group' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.LeftArrow,
					secondary: [KeyMod.Alt | KeyCode.UpArrow],
					mac: {
						primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.LeftArrow,
						secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.UpArrow]
					},
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			terminalGroupService.activeGroup?.focusPreviousPane();
			await terminalGroupService.showPanel(true);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FocusNextPane,
				title: { value: localize('workbench.action.terminal.focusNextPane', "Focus Next Terminal in Terminal Group"), original: 'Focus Next Terminal in Terminal Group' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.RightArrow,
					secondary: [KeyMod.Alt | KeyCode.DownArrow],
					mac: {
						primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.RightArrow,
						secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.DownArrow]
					},
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			terminalGroupService.activeGroup?.focusNextPane();
			await terminalGroupService.showPanel(true);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.RunRecentCommand,
				title: { value: localize('workbench.action.terminal.runRecentCommand', "Run Recent Command..."), original: 'Run Recent Command...' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const terminalEditorService = accessor.get(ITerminalEditorService);
			const instance = accessor.get(ITerminalService).activeInstance;
			if (instance) {
				await instance.runRecent('command');
				if (instance?.target === TerminalLocation.Editor) {
					terminalEditorService.revealActiveEditor();
				} else {
					terminalGroupService.showPanel(false);
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.CopyLastCommand,
				title: { value: localize('workbench.action.terminal.copyLastCommand', 'Copy Last Command'), original: 'Copy Last Command' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const instance = accessor.get(ITerminalService).activeInstance;
			const commands = instance?.capabilities.get(TerminalCapability.CommandDetection)?.commands;
			if (!commands || commands.length === 0) {
				return;
			}
			const command = commands[commands.length - 1];
			if (!command?.hasOutput()) {
				return;
			}
			const output = command.getOutput();
			if (output) {
				await accessor.get(IClipboardService).writeText(output);
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.GoToRecentDirectory,
				title: { value: localize('workbench.action.terminal.goToRecentDirectory', "Go to Recent Directory..."), original: 'Go to Recent Directory...' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const terminalEditorService = accessor.get(ITerminalEditorService);
			const instance = accessor.get(ITerminalService).activeInstance;
			if (instance) {
				await instance.runRecent('cwd');
				if (instance?.target === TerminalLocation.Editor) {
					terminalEditorService.revealActiveEditor();
				} else {
					terminalGroupService.showPanel(false);
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ResizePaneLeft,
				title: { value: localize('workbench.action.terminal.resizePaneLeft', "Resize Terminal Left"), original: 'Resize Terminal Left' },
				f1: true,
				category,
				keybinding: {
					linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
					mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow },
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ITerminalGroupService).activeGroup?.resizePane(Direction.Left);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ResizePaneRight,
				title: { value: localize('workbench.action.terminal.resizePaneRight', "Resize Terminal Right"), original: 'Resize Terminal Right' },
				f1: true,
				category,
				keybinding: {
					linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
					mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow },
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ITerminalGroupService).activeGroup?.resizePane(Direction.Right);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ResizePaneUp,
				title: { value: localize('workbench.action.terminal.resizePaneUp', "Resize Terminal Up"), original: 'Resize Terminal Up' },
				f1: true,
				category,
				keybinding: {
					mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow },
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ITerminalGroupService).activeGroup?.resizePane(Direction.Up);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ResizePaneDown,
				title: { value: localize('workbench.action.terminal.resizePaneDown', "Resize Terminal Down"), original: 'Resize Terminal Down' },
				f1: true,
				category,
				keybinding: {
					mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow },
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ITerminalGroupService).activeGroup?.resizePane(Direction.Down);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Focus,
				title: terminalStrings.focus,
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const instance = terminalService.activeInstance || await terminalService.createTerminal({ location: TerminalLocation.Panel });
			if (!instance) {
				return;
			}
			terminalService.setActiveInstance(instance);
			return terminalGroupService.showPanel(true);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FocusTabs,
				title: { value: localize('workbench.action.terminal.focus.tabsView', "Focus Terminal Tabs View"), original: 'Focus Terminal Tabs View' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus),
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ITerminalGroupService).focusTabs();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FocusNext,
				title: { value: localize('workbench.action.terminal.focusNext', "Focus Next Terminal Group"), original: 'Focus Next Terminal Group' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.PageDown,
					mac: {
						primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight
					},
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			terminalGroupService.setActiveGroupToNext();
			await terminalGroupService.showPanel(true);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FocusPrevious,
				title: { value: localize('workbench.action.terminal.focusPrevious', "Focus Previous Terminal Group"), original: 'Focus Previous Terminal Group' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.PageUp,
					mac: {
						primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft
					},
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				}
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			terminalGroupService.setActiveGroupToPrevious();
			await terminalGroupService.showPanel(true);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.RunSelectedText,
				title: { value: localize('workbench.action.terminal.runSelectedText', "Run Selected Text In Active Terminal"), original: 'Run Selected Text In Active Terminal' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const terminalEditorService = accessor.get(ITerminalEditorService);

			const instance = await terminalService.getActiveOrCreateInstance();
			const editor = codeEditorService.getActiveCodeEditor();
			if (!editor || !editor.hasModel()) {
				return;
			}
			const selection = editor.getSelection();
			let text: string;
			if (selection.isEmpty()) {
				text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
			} else {
				const endOfLinePreference = isWindows ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
				text = editor.getModel().getValueInRange(selection, endOfLinePreference);
			}
			instance.sendText(text, true);
			if (instance.target === TerminalLocation.Editor) {
				terminalEditorService.revealActiveEditor();
			} else {
				terminalGroupService.showPanel();
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.RunActiveFile,
				title: { value: localize('workbench.action.terminal.runActiveFile', "Run Active File In Active Terminal"), original: 'Run Active File In Active Terminal' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const notificationService = accessor.get(INotificationService);
			const workbenchEnvironmentService = accessor.get(IWorkbenchEnvironmentService);

			const editor = codeEditorService.getActiveCodeEditor();
			if (!editor || !editor.hasModel()) {
				return;
			}

			let instance = terminalService.activeInstance;
			const isRemote = instance ? instance.isRemote : (workbenchEnvironmentService.remoteAuthority ? true : false);
			const uri = editor.getModel().uri;
			if ((!isRemote && uri.scheme !== Schemas.file) || (isRemote && uri.scheme !== Schemas.vscodeRemote)) {
				notificationService.warn(localize('workbench.action.terminal.runActiveFile.noFile', 'Only files on disk can be run in the terminal'));
				return;
			}

			if (!instance) {
				instance = await terminalService.getActiveOrCreateInstance();
			}

			// TODO: Convert this to ctrl+c, ctrl+v for pwsh?
			await instance.sendPath(uri.fsPath, true);
			return terminalGroupService.showPanel();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollDownLine,
				title: { value: localize('workbench.action.terminal.scrollDown', "Scroll Down (Line)"), original: 'Scroll Down (Line)' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
					linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow },
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.altBufferActive.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.scrollDownLine();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollDownPage,
				title: { value: localize('workbench.action.terminal.scrollDownPage', "Scroll Down (Page)"), original: 'Scroll Down (Page)' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Shift | KeyCode.PageDown,
					mac: { primary: KeyCode.PageDown },
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.altBufferActive.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.scrollDownPage();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollToBottom,
				title: { value: localize('workbench.action.terminal.scrollToBottom', "Scroll to Bottom"), original: 'Scroll to Bottom' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.End,
					linux: { primary: KeyMod.Shift | KeyCode.End },
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.altBufferActive.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.scrollToBottom();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollUpLine,
				title: { value: localize('workbench.action.terminal.scrollUp', "Scroll Up (Line)"), original: 'Scroll Up (Line)' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
					linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.altBufferActive.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.scrollUpLine();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollUpPage,
				title: { value: localize('workbench.action.terminal.scrollUpPage', "Scroll Up (Page)"), original: 'Scroll Up (Page)' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Shift | KeyCode.PageUp,
					mac: { primary: KeyCode.PageUp },
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.altBufferActive.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.scrollUpPage();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollToTop,
				title: { value: localize('workbench.action.terminal.scrollToTop', "Scroll to Top"), original: 'Scroll to Top' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.Home,
					linux: { primary: KeyMod.Shift | KeyCode.Home },
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.altBufferActive.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.scrollToTop();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NavigationModeExit,
				title: { value: localize('workbench.action.terminal.navigationModeExit', "Exit Navigation Mode"), original: 'Exit Navigation Mode' },
				f1: true,
				category,
				keybinding: {
					primary: KeyCode.Escape,
					when: ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.navigationMode?.exitNavigationMode();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NavigationModeFocusPrevious,
				title: { value: localize('workbench.action.terminal.navigationModeFocusPrevious', "Focus Previous Line (Navigation Mode)"), original: 'Focus Previous Line (Navigation Mode)' },
				f1: true,
				category,
				keybinding: [{
					primary: KeyCode.UpArrow,
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
						ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
					),
					weight: KeybindingWeight.WorkbenchContrib
				},
				{
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
						ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED)
					),
					weight: KeybindingWeight.WorkbenchContrib
				}],
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.navigationMode?.focusPreviousLine();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NavigationModeFocusPreviousPage,
				title: { value: localize('workbench.action.terminal.navigationModeFocusPreviousPage', "Focus Previous Page (Navigation Mode)"), original: 'Focus Previous Page (Navigation Mode)' },
				f1: true,
				category,
				keybinding: [{
					primary: KeyCode.PageUp,
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
						ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
					),
					weight: KeybindingWeight.WorkbenchContrib
				}],
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.navigationMode?.focusPreviousPage();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NavigationModeFocusNext,
				title: { value: localize('workbench.action.terminal.navigationModeFocusNext', "Focus Next Line (Navigation Mode)"), original: 'Focus Next Line (Navigation Mode)' },
				f1: true,
				category,
				keybinding: [{
					primary: KeyCode.DownArrow,
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
						ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
					),
					weight: KeybindingWeight.WorkbenchContrib
				},
				{
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
						ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED)
					),
					weight: KeybindingWeight.WorkbenchContrib
				}],
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.navigationMode?.focusNextLine();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NavigationModeFocusNextPage,
				title: { value: localize('workbench.action.terminal.navigationModeFocusNextPage', "Focus Next Page (Navigation Mode)"), original: 'Focus Next Page (Navigation Mode)' },
				f1: true,
				category,
				keybinding: [{
					primary: KeyCode.PageDown,
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(TerminalContextKeys.a11yTreeFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
						ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.navigationModeActive),
					),
					weight: KeybindingWeight.WorkbenchContrib
				}],
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.navigationMode?.focusNextPage();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ClearSelection,
				title: { value: localize('workbench.action.terminal.clearSelection', "Clear Selection"), original: 'Clear Selection' },
				f1: true,
				category,
				keybinding: {
					primary: KeyCode.Escape,
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.textSelected, TerminalContextKeys.notFindVisible),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			const terminalInstance = accessor.get(ITerminalService).activeInstance;
			if (terminalInstance && terminalInstance.hasSelection()) {
				terminalInstance.clearSelection();
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ChangeIcon,
				title: terminalStrings.changeIcon,
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor, resource: unknown) {
			getActiveInstance(accessor, resource)?.changeIcon();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ChangeIconPanel,
				title: terminalStrings.changeIcon,
				f1: false,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			return accessor.get(ITerminalGroupService).activeInstance?.changeIcon();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ChangeIconInstance,
				title: terminalStrings.changeIcon,
				f1: false,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection)
			});
		}
		async run(accessor: ServicesAccessor) {
			return getSelectedInstances(accessor)?.[0].changeIcon();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ChangeColor,
				title: terminalStrings.changeColor,
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor, resource: unknown) {
			getActiveInstance(accessor, resource)?.changeColor();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ChangeColorPanel,
				title: terminalStrings.changeColor,
				f1: false,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			return accessor.get(ITerminalGroupService).activeInstance?.changeColor();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ChangeColorInstance,
				title: terminalStrings.changeColor,
				f1: false,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection)
			});
		}
		async run(accessor: ServicesAccessor) {
			return getSelectedInstances(accessor)?.[0].changeColor();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Rename,
				title: terminalStrings.rename,
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor, resource: unknown) {
			renameWithQuickPick(accessor, resource);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.RenamePanel,
				title: terminalStrings.rename,
				f1: false,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			renameWithQuickPick(accessor);
		}
	});

	async function renameWithQuickPick(accessor: ServicesAccessor, resource?: unknown) {
		const instance = getActiveInstance(accessor, resource);
		if (instance) {
			const title = await accessor.get(IQuickInputService).input({
				value: instance.title,
				prompt: localize('workbench.action.terminal.rename.prompt', "Enter terminal name"),
			});
			instance.rename(title);
		}
	}

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.RenameInstance,
				title: terminalStrings.rename,
				f1: false,
				category,
				keybinding: {
					primary: KeyCode.F2,
					mac: {
						primary: KeyCode.Enter
					},
					when: ContextKeyExpr.and(TerminalContextKeys.tabsFocus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection),
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const notificationService = accessor.get(INotificationService);

			const instance = getSelectedInstances(accessor)?.[0];
			if (!instance) {
				return;
			}

			terminalService.setEditable(instance, {
				validationMessage: value => validateTerminalName(value),
				onFinish: async (value, success) => {
					// Cancel editing first as instance.rename will trigger a rerender automatically
					terminalService.setEditable(instance, null);
					if (success) {
						try {
							await instance.rename(value);
						} catch (e) {
							notificationService.error(e);
						}
					}
				}
			});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FindFocus,
				title: { value: localize('workbench.action.terminal.focusFind', "Focus Find"), original: 'Focus Find' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyF,
					when: ContextKeyExpr.or(TerminalContextKeys.findFocus, TerminalContextKeys.focus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.findWidget.reveal();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FindHide,
				title: { value: localize('workbench.action.terminal.hideFind', "Hide Find"), original: 'Hide Find' },
				f1: true,
				category,
				keybinding: {
					primary: KeyCode.Escape,
					secondary: [KeyMod.Shift | KeyCode.Escape],
					when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.findVisible),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.findWidget.hide();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.DetachSession,
				title: { value: localize('workbench.action.terminal.detachSession', "Detach Session"), original: 'Detach Session' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			await terminalService.activeInstance?.detachProcessAndDispose(TerminalExitReason.User);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.AttachToSession,
				title: { value: localize('workbench.action.terminal.attachToSession', "Attach to Session"), original: 'Attach to Session' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			const quickInputService = accessor.get(IQuickInputService);
			const terminalService = accessor.get(ITerminalService);
			const labelService = accessor.get(ILabelService);
			const remoteAgentService = accessor.get(IRemoteAgentService);
			const notificationService = accessor.get(INotificationService);
			const terminalGroupService = accessor.get(ITerminalGroupService);

			const remoteAuthority = remoteAgentService.getConnection()?.remoteAuthority ?? undefined;
			const backend = await accessor.get(ITerminalInstanceService).getBackend(remoteAuthority);

			if (!backend) {
				throw new Error(`No backend registered for remote authority '${remoteAuthority}'`);
			}

			const terms = await backend.listProcesses();

			backend.reduceConnectionGraceTime();

			const unattachedTerms = terms.filter(term => !terminalService.isAttachedToTerminal(term));
			const items = unattachedTerms.map(term => {
				const cwdLabel = labelService.getUriLabel(URI.file(term.cwd));
				return {
					label: term.title,
					detail: term.workspaceName ? `${term.workspaceName} \u2E31 ${cwdLabel}` : cwdLabel,
					description: term.pid ? String(term.pid) : '',
					term
				};
			});
			if (items.length === 0) {
				notificationService.info(localize('noUnattachedTerminals', 'There are no unattached terminals to attach to'));
				return;
			}
			const selected = await quickInputService.pick<IRemoteTerminalPick>(items, { canPickMany: false });
			if (selected) {
				const instance = await terminalService.createTerminal({
					config: { attachPersistentProcess: selected.term }
				});
				terminalService.setActiveInstance(instance);
				if (instance.target === TerminalLocation.Editor) {
					await instance.focusWhenReady(true);
				} else {
					terminalGroupService.showPanel(true);
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.QuickOpenTerm,
				title: { value: localize('quickAccessTerminal', "Switch Active Terminal"), original: 'Switch Active Terminal' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(IQuickInputService).quickAccess.show(TerminalQuickAccessProvider.PREFIX);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollToPreviousCommand,
				title: { value: localize('workbench.action.terminal.scrollToPreviousCommand', "Scroll To Previous Command"), original: 'Scroll To Previous Command' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => {
				t.xterm?.markTracker.scrollToPreviousMark();
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ScrollToNextCommand,
				title: { value: localize('workbench.action.terminal.scrollToNextCommand', "Scroll To Next Command"), original: 'Scroll To Next Command' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => {
				t.xterm?.markTracker.scrollToNextMark();
				t.focus();
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SelectToPreviousCommand,
				title: { value: localize('workbench.action.terminal.selectToPreviousCommand', "Select To Previous Command"), original: 'Select To Previous Command' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => {
				t.xterm?.markTracker.selectToPreviousMark();
				t.focus();
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SelectToNextCommand,
				title: { value: localize('workbench.action.terminal.selectToNextCommand', "Select To Next Command"), original: 'Select To Next Command' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
					when: TerminalContextKeys.focus,
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => {
				t.xterm?.markTracker.selectToNextMark();
				t.focus();
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SelectToPreviousLine,
				title: { value: localize('workbench.action.terminal.selectToPreviousLine', "Select To Previous Line"), original: 'Select To Previous Line' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => {
				t.xterm?.markTracker.selectToPreviousLine();
				t.focus();
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SelectToNextLine,
				title: { value: localize('workbench.action.terminal.selectToNextLine', "Select To Next Line"), original: 'Select To Next Line' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => {
				t.xterm?.markTracker.selectToNextLine();
				t.focus();
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ToggleEscapeSequenceLogging,
				title: { value: localize('workbench.action.terminal.toggleEscapeSequenceLogging', "Toggle Escape Sequence Logging"), original: 'Toggle Escape Sequence Logging' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			await terminalService.toggleEscapeSequenceLogging();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			const title = localize('workbench.action.terminal.sendSequence', "Send Custom Sequence To Terminal");
			super({
				id: TerminalCommandId.SendSequence,
				title: { value: title, original: 'Send Custom Sequence To Terminal' },
				category,
				description: {
					description: title,
					args: [{
						name: 'args',
						schema: {
							type: 'object',
							required: ['text'],
							properties: {
								text: { type: 'string' }
							},
						}
					}]
				},
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor, args?: { text?: string }) {
			terminalSendSequenceCommand(accessor, args);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			const title = localize('workbench.action.terminal.newWithCwd', "Create New Terminal Starting in a Custom Working Directory");
			super({
				id: TerminalCommandId.NewWithCwd,
				title: { value: title, original: 'Create New Terminal Starting in a Custom Working Directory' },
				category,
				description: {
					description: title,
					args: [{
						name: 'args',
						schema: {
							type: 'object',
							required: ['cwd'],
							properties: {
								cwd: {
									description: localize('workbench.action.terminal.newWithCwd.cwd', "The directory to start the terminal at"),
									type: 'string'
								}
							},
						}
					}]
				},
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor, args?: { cwd?: string }) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			if (terminalService.isProcessSupportRegistered) {
				const instance = await terminalService.createTerminal(
					{
						cwd: args?.cwd
					});
				if (!instance) {
					return;
				}
				terminalService.setActiveInstance(instance);
				if (instance.target === TerminalLocation.Editor) {
					await instance.focusWhenReady(true);
				} else {
					return terminalGroupService.showPanel(true);
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			const title = localize('workbench.action.terminal.renameWithArg', "Rename the Currently Active Terminal");
			super({
				id: TerminalCommandId.RenameWithArgs,
				title: { value: title, original: 'Rename the Currently Active Terminal' },
				category,
				description: {
					description: title,
					args: [{
						name: 'args',
						schema: {
							type: 'object',
							required: ['name'],
							properties: {
								name: {
									description: localize('workbench.action.terminal.renameWithArg.name', "The new name for the terminal"),
									type: 'string',
									minLength: 1
								}
							}
						}
					}]
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor, args?: { name?: string }) {
			const notificationService = accessor.get(INotificationService);
			if (!args?.name) {
				notificationService.warn(localize('workbench.action.terminal.renameWithArg.noName', "No name argument provided"));
				return;
			}
			accessor.get(ITerminalService).activeInstance?.rename(args.name);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ToggleFindRegex,
				title: { value: localize('workbench.action.terminal.toggleFindRegex', "Toggle Find Using Regex"), original: 'Toggle Find Using Regex' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.KeyR,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR },
					when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const state = terminalService.activeInstance?.findWidget.findState;
			state?.change({ isRegex: !state.isRegex }, false);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ToggleFindWholeWord,
				title: { value: localize('workbench.action.terminal.toggleFindWholeWord', "Toggle Find Using Whole Word"), original: 'Toggle Find Using Whole Word' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.KeyW,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW },
					when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const state = terminalService.activeInstance?.findWidget.findState;
			state?.change({ wholeWord: !state.wholeWord }, false);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ToggleFindCaseSensitive,
				title: { value: localize('workbench.action.terminal.toggleFindCaseSensitive', "Toggle Find Using Case Sensitive"), original: 'Toggle Find Using Case Sensitive' },
				f1: true,
				category,
				keybinding: {
					primary: KeyMod.Alt | KeyCode.KeyC,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC },
					when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const state = terminalService.activeInstance?.findWidget.findState;
			state?.change({ matchCase: !state.matchCase }, false);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FindNext,
				title: { value: localize('workbench.action.terminal.findNext', "Find Next"), original: 'Find Next' },
				f1: true,
				category,
				keybinding: [
					{
						primary: KeyCode.F3,
						mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
						when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
						weight: KeybindingWeight.WorkbenchContrib
					},
					{
						primary: KeyMod.Shift | KeyCode.Enter,
						when: TerminalContextKeys.findInputFocus,
						weight: KeybindingWeight.WorkbenchContrib
					}
				],
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			terminalService.activeInstance?.findWidget.show();
			terminalService.activeInstance?.findWidget.find(false);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.FindPrevious,
				title: { value: localize('workbench.action.terminal.findPrevious', "Find Previous"), original: 'Find Previous' },
				f1: true,
				category,
				keybinding: [
					{
						primary: KeyMod.Shift | KeyCode.F3,
						mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
						when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
						weight: KeybindingWeight.WorkbenchContrib
					},
					{
						primary: KeyCode.Enter,
						when: TerminalContextKeys.findInputFocus,
						weight: KeybindingWeight.WorkbenchContrib
					}
				],
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			terminalService.activeInstance?.findWidget.show();
			terminalService.activeInstance?.findWidget.find(true);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SearchWorkspace,
				title: { value: localize('workbench.action.terminal.searchWorkspace', "Search Workspace"), original: 'Search Workspace' },
				f1: true,
				category,
				keybinding: [
					{
						primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
						when: ContextKeyExpr.and(TerminalContextKeys.processSupported, TerminalContextKeys.focus, TerminalContextKeys.textSelected),
						weight: KeybindingWeight.WorkbenchContrib + 50
					}
				],
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			const query = accessor.get(ITerminalService).activeInstance?.selection;
			FindInFilesCommand(accessor, { query } as IFindInFilesArgs);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Relaunch,
				title: { value: localize('workbench.action.terminal.relaunch', "Relaunch Active Terminal"), original: 'Relaunch Active Terminal' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.relaunch();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ShowEnvironmentInformation,
				title: { value: localize('workbench.action.terminal.showEnvironmentInformation', "Show Environment Information"), original: 'Show Environment Information' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.showEnvironmentInfoHover();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Split,
				title: terminalStrings.split,
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
					weight: KeybindingWeight.WorkbenchContrib,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backslash,
						secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
					},
					when: TerminalContextKeys.focus
				},
				icon: Codicon.splitHorizontal,
				description: {
					description: 'workbench.action.terminal.split',
					args: [{
						name: 'profile',
						schema: {
							type: 'object'
						}
					}]
				}
			});
		}
		async run(accessor: ServicesAccessor, optionsOrProfile?: ICreateTerminalOptions | ITerminalProfile) {
			const commandService = accessor.get(ICommandService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const terminalService = accessor.get(ITerminalService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const options = convertOptionsOrProfileToOptions(optionsOrProfile);
			const activeInstance = terminalService.getInstanceHost(options?.location).activeInstance;
			if (!activeInstance) {
				return;
			}
			const cwd = await getCwdForSplit(terminalService.configHelper, activeInstance, workspaceContextService.getWorkspace().folders, commandService);
			if (cwd === undefined) {
				return undefined;
			}
			const instance = await terminalService.createTerminal({ location: { parentTerminal: activeInstance }, config: options?.config, cwd });
			if (instance) {
				if (instance.target === TerminalLocation.Editor) {
					instance.focusWhenReady();
				} else {
					return terminalGroupService.showPanel(true);
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SplitInstance,
				title: terminalStrings.split,
				f1: false,
				category,
				precondition: TerminalContextKeys.processSupported,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backslash,
						secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
					},
					weight: KeybindingWeight.WorkbenchContrib,
					when: TerminalContextKeys.tabsFocus
				}
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const instances = getSelectedInstances(accessor);
			if (instances) {
				for (const t of instances) {
					terminalService.setActiveInstance(t);
					terminalService.doWithActiveInstance(async instance => {
						await terminalService.createTerminal({ location: { parentTerminal: instance } });
						await terminalGroupService.showPanel(true);
					});
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Unsplit,
				title: terminalStrings.unsplit,
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			await accessor.get(ITerminalService).doWithActiveInstance(async t => accessor.get(ITerminalGroupService).unsplitInstance(t));
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.UnsplitInstance,
				title: terminalStrings.unsplit,
				f1: false,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const instances = getSelectedInstances(accessor);
			// should not even need this check given the context key
			// but TS complains
			if (instances?.length === 1) {
				const group = terminalGroupService.getGroupForInstance(instances[0]);
				if (group && group?.terminalInstances.length > 1) {
					terminalGroupService.unsplitInstance(instances[0]);
				}
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.JoinInstance,
				title: { value: localize('workbench.action.terminal.joinInstance', "Join Terminals"), original: 'Join Terminals' },
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection.toNegated())
			});
		}
		async run(accessor: ServicesAccessor) {
			const instances = getSelectedInstances(accessor);
			if (instances && instances.length > 1) {
				accessor.get(ITerminalGroupService).joinInstances(instances);
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Join,
				title: { value: localize('workbench.action.terminal.join', "Join Terminals"), original: 'Join Terminals' },
				category,
				f1: true,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated))
			});
		}
		async run(accessor: ServicesAccessor) {
			const themeService = accessor.get(IThemeService);
			const groupService = accessor.get(ITerminalGroupService);
			const notificationService = accessor.get(INotificationService);

			const picks: ITerminalQuickPickItem[] = [];
			if (groupService.instances.length <= 1) {
				notificationService.warn(localize('workbench.action.terminal.join.insufficientTerminals', 'Insufficient terminals for the join action'));
				return;
			}
			const otherInstances = groupService.instances.filter(i => i.instanceId !== groupService.activeInstance?.instanceId);
			for (const terminal of otherInstances) {
				const group = groupService.getGroupForInstance(terminal);
				if (group?.terminalInstances.length === 1) {
					const iconId = getIconId(accessor, terminal);
					const label = `$(${iconId}): ${terminal.title}`;
					const iconClasses: string[] = [];
					const colorClass = getColorClass(terminal);
					if (colorClass) {
						iconClasses.push(colorClass);
					}
					const uriClasses = getUriClasses(terminal, themeService.getColorTheme().type);
					if (uriClasses) {
						iconClasses.push(...uriClasses);
					}
					picks.push({
						terminal,
						label,
						iconClasses
					});
				}
			}
			if (picks.length === 0) {
				notificationService.warn(localize('workbench.action.terminal.join.onlySplits', 'All terminals are joined already'));
				return;
			}
			const result = await accessor.get(IQuickInputService).pick(picks, {});
			if (result) {
				groupService.joinInstances([result.terminal, groupService.activeInstance!]);
			}
		}
	}
	);
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SplitInActiveWorkspace,
				title: { value: localize('workbench.action.terminal.splitInActiveWorkspace', "Split Terminal (In Active Workspace)"), original: 'Split Terminal (In Active Workspace)' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported,
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			await terminalService.doWithActiveInstance(async t => {
				const instance = await terminalService.createTerminal({ location: { parentTerminal: t } });
				if (instance?.target !== TerminalLocation.Editor) {
					await terminalGroupService.showPanel(true);
				}
			});
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SelectAll,
				title: { value: localize('workbench.action.terminal.selectAll', "Select All"), original: 'Select All' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
				keybinding: [{
					// Don't use ctrl+a by default as that would override the common go to start
					// of prompt shell binding
					primary: 0,
					// Technically this doesn't need to be here as it will fall back to this
					// behavior anyway when handed to xterm.js, having this handled by VS Code
					// makes it easier for users to see how it works though.
					mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyA },
					weight: KeybindingWeight.WorkbenchContrib,
					when: TerminalContextKeys.focus
				}]
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).activeInstance?.selectAll();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.New,
				title: { value: localize('workbench.action.terminal.new', "Create New Terminal"), original: 'Create New Terminal' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
				icon: Codicon.plus,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote,
					mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Backquote },
					weight: KeybindingWeight.WorkbenchContrib
				},
				description: {
					description: 'workbench.action.terminal.new',
					args: [{
						name: 'eventOrOptions',
						schema: {
							type: 'object'
						}
					}]
				}
			});
		}
		async run(accessor: ServicesAccessor, eventOrOptions: MouseEvent | ICreateTerminalOptions | undefined) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const commandService = accessor.get(ICommandService);
			const configurationService = accessor.get(IConfigurationService);
			const configurationResolverService = accessor.get(IConfigurationResolverService);
			const folders = workspaceContextService.getWorkspace().folders;
			if (eventOrOptions && eventOrOptions instanceof MouseEvent && (eventOrOptions.altKey || eventOrOptions.ctrlKey)) {
				await terminalService.createTerminal({ location: { splitActiveTerminal: true } });
				return;
			}

			if (terminalService.isProcessSupportRegistered) {
				eventOrOptions = !eventOrOptions || eventOrOptions instanceof MouseEvent ? {} : eventOrOptions;

				let instance: ITerminalInstance | undefined;
				if (folders.length <= 1) {
					// Allow terminal service to handle the path when there is only a
					// single root
					instance = await terminalService.createTerminal(eventOrOptions);
				} else {
					const options: IPickOptions<IQuickPickItem> = {
						placeHolder: localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
					};
					const workspace = await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
					if (!workspace) {
						// Don't create the instance if the workspace picker was canceled
						return;
					}
					eventOrOptions.cwd = workspace.uri;
					const cwdConfig = configurationService.getValue(TerminalSettingId.Cwd, { resource: workspace.uri });
					if (typeof cwdConfig === 'string' && cwdConfig.length > 0) {
						const resolvedCwdConfig = await configurationResolverService.resolveAsync(workspace, cwdConfig);
						if (isAbsolute(resolvedCwdConfig) || resolvedCwdConfig.startsWith(AbstractVariableResolverService.VARIABLE_LHS)) {
							eventOrOptions.cwd = URI.from({
								scheme: workspace.uri.scheme,
								path: resolvedCwdConfig
							});
						} else {
							eventOrOptions.cwd = URI.joinPath(workspace.uri, resolvedCwdConfig);
						}
					}
					instance = await terminalService.createTerminal(eventOrOptions);
				}
				terminalService.setActiveInstance(instance);
				if (instance.target === TerminalLocation.Editor) {
					await instance.focusWhenReady(true);
				} else {
					await terminalGroupService.showPanel(true);
				}
			} else if (TerminalContextKeys.webExtensionContributedProfile) {
				commandService.executeCommand(TerminalCommandId.NewWithProfile);
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Kill,
				title: { value: localize('workbench.action.terminal.kill', "Kill the Active Terminal Instance"), original: 'Kill the Active Terminal Instance' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
				icon: Codicon.trash
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const terminalService = accessor.get(ITerminalService);
			const instance = terminalGroupService.activeInstance;
			if (!instance) {
				return;
			}
			await terminalService.safeDisposeTerminal(instance);
			if (terminalGroupService.instances.length > 0) {
				await terminalGroupService.showPanel(true);
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.KillAll,
				title: { value: localize('workbench.action.terminal.killAll', "Kill All Terminals"), original: 'Kill All Terminals' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
				icon: Codicon.trash
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const disposePromises: Promise<void>[] = [];
			for (const instance of terminalService.instances) {
				disposePromises.push(terminalService.safeDisposeTerminal(instance));
			}
			await Promise.all(disposePromises);
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.KillEditor,
				title: { value: localize('workbench.action.terminal.killEditor', "Kill the Active Terminal in Editor Area"), original: 'Kill the Active Terminal in Editor Area' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyW,
					win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
					weight: KeybindingWeight.WorkbenchContrib,
					when: ContextKeyExpr.and(TerminalContextKeys.focus, ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), TerminalContextKeys.editorFocus)
				}

			});
		}
		async run(accessor: ServicesAccessor) {
			accessor.get(ICommandService).executeCommand(CLOSE_EDITOR_COMMAND_ID);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.KillInstance,
				title: terminalStrings.kill,
				f1: false,
				category,
				precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace,
						secondary: [KeyCode.Delete]
					},
					weight: KeybindingWeight.WorkbenchContrib,
					when: TerminalContextKeys.tabsFocus
				}
			});
		}
		async run(accessor: ServicesAccessor) {
			const selectedInstances = getSelectedInstances(accessor);
			if (!selectedInstances) {
				return;
			}
			const listService = accessor.get(IListService);
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const disposePromises: Promise<void>[] = [];
			for (const instance of selectedInstances) {
				disposePromises.push(terminalService.safeDisposeTerminal(instance));
			}
			await Promise.all(disposePromises);
			if (terminalService.instances.length > 0) {
				terminalGroupService.focusTabs();
				listService.lastFocusedList?.focusNext();
			}
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.Clear,
				title: { value: localize('workbench.action.terminal.clear', "Clear"), original: 'Clear' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
				keybinding: [{
					primary: 0,
					mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
					// Weight is higher than work workbench contributions so the keybinding remains
					// highest priority when chords are registered afterwards
					weight: KeybindingWeight.WorkbenchContrib + 1,
					when: TerminalContextKeys.focus
				}]
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => t.clearBuffer());
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.OpenDetectedLink,
				title: { value: localize('workbench.action.terminal.openDetectedLink', "Open Detected Link..."), original: 'Open Detected Link...' },
				f1: true,
				category,
				precondition: TerminalContextKeys.terminalHasBeenCreated,
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => t.showLinkQuickpick());
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.OpenWebLink,
				title: { value: localize('workbench.action.terminal.openLastUrlLink', "Open Last Url Link"), original: 'Open Last Url Link' },
				f1: true,
				category,
				precondition: TerminalContextKeys.terminalHasBeenCreated,
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => t.openRecentLink('url'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.OpenFileLink,
				title: { value: localize('workbench.action.terminal.openLastLocalFileLink', "Open Last Local File Link"), original: 'Open Last Local File Link' },
				f1: true,
				category,
				precondition: TerminalContextKeys.terminalHasBeenCreated,
			});
		}
		run(accessor: ServicesAccessor) {
			accessor.get(ITerminalService).doWithActiveInstance(t => t.openRecentLink('localFile'));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SelectDefaultProfile,
				title: { value: localize('workbench.action.terminal.selectDefaultShell', "Select Default Profile"), original: 'Select Default Profile' },
				f1: true,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
			await accessor.get(ITerminalService).showProfileQuickPick('setDefault');
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.CreateWithProfileButton,
				title: TerminalCommandId.CreateWithProfileButton,
				f1: false,
				category,
				precondition: TerminalContextKeys.processSupported
			});
		}
		async run(accessor: ServicesAccessor) {
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ConfigureTerminalSettings,
				title: { value: localize('workbench.action.terminal.openSettings', "Configure Terminal Settings"), original: 'Configure Terminal Settings' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor) {
			await accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@feature:terminal' });
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SetDimensions,
				title: { value: localize('workbench.action.terminal.setFixedDimensions', "Set Fixed Dimensions"), original: 'Set Fixed Dimensions' },
				f1: true,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen)
			});
		}
		async run(accessor: ServicesAccessor) {
			await accessor.get(ITerminalService).doWithActiveInstance(t => t.setFixedDimensions());
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SizeToContentWidth,
				title: { value: localize('workbench.action.terminal.sizeToContentWidth', "Toggle Size to Content Width"), original: 'Toggle Size to Content Width' },
				f1: true,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
				keybinding: {
					primary: KeyMod.Alt | KeyCode.KeyZ,
					weight: KeybindingWeight.WorkbenchContrib,
					when: TerminalContextKeys.focus
				}
			});
		}
		async run(accessor: ServicesAccessor) {
			await accessor.get(ITerminalService).doWithActiveInstance(t => t.toggleSizeToContentWidth());
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SizeToContentWidthInstance,
				title: terminalStrings.toggleSizeToContentWidth,
				f1: false,
				category,
				precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus)
			});
		}
		async run(accessor: ServicesAccessor) {
			return getSelectedInstances(accessor)?.[0].toggleSizeToContentWidth();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.ClearCommandHistory,
				title: { value: localize('workbench.action.terminal.clearCommandHistory', "Clear Command History"), original: 'Clear Command History' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		run(accessor: ServicesAccessor) {
			getCommandHistory(accessor).clear();
			clearShellFileHistory();
		}
	});
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.WriteDataToTerminal,
				title: { value: localize('workbench.action.terminal.writeDataToTerminal', "Write Data to Terminal"), original: 'Write Data to Terminal' },
				f1: true,
				category: CATEGORIES.Developer.value
			});
		}
		async run(accessor: ServicesAccessor) {
			const terminalService = accessor.get(ITerminalService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const quickInputService = accessor.get(IQuickInputService);

			const instance = await terminalService.getActiveOrCreateInstance();
			await terminalGroupService.showPanel();
			await instance.processReady;
			if (!instance.xterm) {
				throw new Error('Cannot write data to terminal if xterm isn\'t initialized');
			}
			const data = await quickInputService.input({
				value: '',
				placeHolder: 'Enter data, use \\x to escape',
				prompt: localize('workbench.action.terminal.writeDataToTerminal.prompt', "Enter data to write directly to the terminal, bypassing the pty"),
			});
			if (!data) {
				return;
			}
			let escapedData = data
				.replace(/\\n/g, '\n')
				.replace(/\\r/g, '\r');
			while (true) {
				const match = escapedData.match(/\\x([0-9a-fA-F]{2})/);
				if (match === null || match.index === undefined || match.length < 2) {
					break;
				}
				escapedData = escapedData.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + escapedData.slice(match.index + 4);
			}
			const xterm = instance.xterm as any as IInternalXtermTerminal;
			xterm._writeText(escapedData);
		}
	});

	// Some commands depend on platform features
	if (BrowserFeatures.clipboard.writeText) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TerminalCommandId.CopySelection,
					title: { value: localize('workbench.action.terminal.copySelection', "Copy Selection"), original: 'Copy Selection' },
					f1: true,
					category,
					// TODO: Why is copy still showing up when text isn't selected?
					precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.textSelected),
					keybinding: [{
						primary: KeyMod.CtrlCmd | KeyCode.KeyC,
						win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC] },
						linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC },
						weight: KeybindingWeight.WorkbenchContrib,
						when: ContextKeyExpr.and(TerminalContextKeys.textSelected, TerminalContextKeys.focus)
					}]
				});
			}
			async run(accessor: ServicesAccessor) {
				await accessor.get(ITerminalService).activeInstance?.copySelection();
			}
		});
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TerminalCommandId.CopySelectionAsHtml,
					title: { value: localize('workbench.action.terminal.copySelectionAsHtml', "Copy Selection as HTML"), original: 'Copy Selection as HTML' },
					f1: true,
					category,
					precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.textSelected)
				});
			}
			async run(accessor: ServicesAccessor) {
				await accessor.get(ITerminalService).activeInstance?.copySelection(true);
			}
		});
	}

	if (BrowserFeatures.clipboard.readText) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TerminalCommandId.Paste,
					title: { value: localize('workbench.action.terminal.paste', "Paste into Active Terminal"), original: 'Paste into Active Terminal' },
					f1: true,
					category,
					precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
					keybinding: [{
						primary: KeyMod.CtrlCmd | KeyCode.KeyV,
						win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV] },
						linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV },
						weight: KeybindingWeight.WorkbenchContrib,
						when: TerminalContextKeys.focus
					}],
				});
			}
			async run(accessor: ServicesAccessor) {
				await accessor.get(ITerminalService).activeInstance?.paste();
			}
		});
	}

	if (BrowserFeatures.clipboard.readText && isLinux) {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: TerminalCommandId.PasteSelection,
					title: { value: localize('workbench.action.terminal.pasteSelection', "Paste Selection into Active Terminal"), original: 'Paste Selection into Active Terminal' },
					f1: true,
					category,
					precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
					keybinding: [{
						linux: { primary: KeyMod.Shift | KeyCode.Insert },
						weight: KeybindingWeight.WorkbenchContrib,
						when: TerminalContextKeys.focus
					}],
				});
			}
			async run(accessor: ServicesAccessor) {
				await accessor.get(ITerminalService).activeInstance?.pasteSelection();
			}
		});
	}

	const switchTerminalTitle: ICommandActionTitle = { value: localize('workbench.action.terminal.switchTerminal', "Switch Terminal"), original: 'Switch Terminal' };
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.SwitchTerminal,
				title: switchTerminalTitle,
				f1: false,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
			});
		}
		async run(accessor: ServicesAccessor, item?: string) {
			const terminalService = accessor.get(ITerminalService);
			const terminalProfileService = accessor.get(ITerminalProfileService);
			const terminalGroupService = accessor.get(ITerminalGroupService);
			if (!item || !item.split) {
				return Promise.resolve(null);
			}
			if (item === switchTerminalActionViewItemSeparator) {
				terminalService.refreshActiveGroup();
				return Promise.resolve(null);
			}
			if (item === switchTerminalShowTabsTitle) {
				accessor.get(IConfigurationService).updateValue(TerminalSettingId.TabsEnabled, true);
				return;
			}
			const indexMatches = terminalIndexRe.exec(item);
			if (indexMatches) {
				terminalGroupService.setActiveGroupByIndex(Number(indexMatches[1]) - 1);
				return terminalGroupService.showPanel(true);
			}

			const quickSelectProfiles = terminalProfileService.availableProfiles;

			// Remove 'New ' from the selected item to get the profile name
			const profileSelection = item.substring(4);
			if (quickSelectProfiles) {
				const profile = quickSelectProfiles.find(profile => profile.profileName === profileSelection);
				if (profile) {
					const instance = await terminalService.createTerminal({
						config: profile
					});
					terminalService.setActiveInstance(instance);
				} else {
					console.warn(`No profile with name "${profileSelection}"`);
				}
			} else {
				console.warn(`Unmatched terminal item: "${item}"`);
			}
			return Promise.resolve();
		}
	});
}

interface IRemoteTerminalPick extends IQuickPickItem {
	term: IRemoteTerminalAttachTarget;
}

function getSelectedInstances(accessor: ServicesAccessor): ITerminalInstance[] | undefined {
	const listService = accessor.get(IListService);
	const terminalService = accessor.get(ITerminalService);
	if (!listService.lastFocusedList?.getSelection()) {
		return undefined;
	}
	const selections = listService.lastFocusedList.getSelection();
	const focused = listService.lastFocusedList.getFocus();
	const instances: ITerminalInstance[] = [];

	if (focused.length === 1 && !selections.includes(focused[0])) {
		// focused length is always a max of 1
		// if the focused one is not in the selected list, return that item
		instances.push(terminalService.getInstanceFromIndex(focused[0]) as ITerminalInstance);
		return instances;
	}

	// multi-select
	for (const selection of selections) {
		instances.push(terminalService.getInstanceFromIndex(selection) as ITerminalInstance);
	}
	return instances;
}

export function validateTerminalName(name: string): { content: string; severity: Severity } | null {
	if (!name || name.trim().length === 0) {
		return {
			content: localize('emptyTerminalNameInfo', "Providing no name will reset it to the default value"),
			severity: Severity.Info
		};
	}

	return null;
}

function convertOptionsOrProfileToOptions(optionsOrProfile?: ICreateTerminalOptions | ITerminalProfile): ICreateTerminalOptions | undefined {
	if (typeof optionsOrProfile === 'object' && 'profileName' in optionsOrProfile) {
		return { config: optionsOrProfile as ITerminalProfile, location: (optionsOrProfile as ICreateTerminalOptions).location };
	}
	return optionsOrProfile;
}

let newWithProfileAction: IDisposable;

export function refreshTerminalActions(detectedProfiles: ITerminalProfile[]) {
	const profileEnum = createProfileSchemaEnums(detectedProfiles);
	const category: ILocalizedString = { value: TERMINAL_ACTION_CATEGORY, original: 'Terminal' };
	newWithProfileAction?.dispose();
	newWithProfileAction = registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NewWithProfile,
				title: { value: localize('workbench.action.terminal.newWithProfile', "Create New Terminal (With Profile)"), original: 'Create New Terminal (With Profile)' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
				description: {
					description: 'workbench.action.terminal.newWithProfile',
					args: [{
						name: 'args',
						schema: {
							type: 'object',
							required: ['profileName'],
							properties: {
								profileName: {
									description: localize('workbench.action.terminal.newWithProfile.profileName', "The name of the profile to create"),
									type: 'string',
									enum: profileEnum.values,
									markdownEnumDescriptions: profileEnum.markdownDescriptions
								}
							}
						}
					}]
				},
			});
		}
		async run(accessor: ServicesAccessor, eventOrOptionsOrProfile: MouseEvent | ICreateTerminalOptions | ITerminalProfile | { profileName: string } | undefined, profile?: ITerminalProfile) {
			const terminalService = accessor.get(ITerminalService);
			const terminalProfileService = accessor.get(ITerminalProfileService);

			const terminalGroupService = accessor.get(ITerminalGroupService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const commandService = accessor.get(ICommandService);

			let event: MouseEvent | PointerEvent | KeyboardEvent | undefined;
			let options: ICreateTerminalOptions | undefined;
			let instance: ITerminalInstance | undefined;
			let cwd: string | URI | undefined;

			if (typeof eventOrOptionsOrProfile === 'object' && eventOrOptionsOrProfile && 'profileName' in eventOrOptionsOrProfile) {
				const config = terminalProfileService.availableProfiles.find(profile => profile.profileName === eventOrOptionsOrProfile.profileName);
				if (!config) {
					throw new Error(`Could not find terminal profile "${eventOrOptionsOrProfile.profileName}"`);
				}
				options = { config };
			} else if (eventOrOptionsOrProfile instanceof MouseEvent || eventOrOptionsOrProfile instanceof PointerEvent || eventOrOptionsOrProfile instanceof KeyboardEvent) {
				event = eventOrOptionsOrProfile;
				options = profile ? { config: profile } : undefined;
			} else {
				options = convertOptionsOrProfileToOptions(eventOrOptionsOrProfile);
			}

			// split terminal
			if (event && (event.altKey || event.ctrlKey)) {
				const parentTerminal = terminalService.activeInstance;
				if (parentTerminal) {
					await terminalService.createTerminal({ location: { parentTerminal }, config: options?.config });
					return;
				}
			}

			const folders = workspaceContextService.getWorkspace().folders;
			if (folders.length > 1) {
				// multi-root workspace, create root picker
				const options: IPickOptions<IQuickPickItem> = {
					placeHolder: localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
				};
				const workspace = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
				if (!workspace) {
					// Don't create the instance if the workspace picker was canceled
					return;
				}
				cwd = workspace.uri;
			}

			if (options) {
				options.cwd = cwd;
				instance = await terminalService.createTerminal(options);
			} else {
				instance = await terminalService.showProfileQuickPick('createInstance', cwd);
			}

			if (instance) {
				terminalService.setActiveInstance(instance);
				if (instance.target === TerminalLocation.Editor) {
					await instance.focusWhenReady(true);
				} else {
					await terminalGroupService.showPanel(true);
				}
			}
		}
	});
}

/** doc */
function getActiveInstance(accessor: ServicesAccessor, resource: unknown): ITerminalInstance | undefined {
	const terminalService = accessor.get(ITerminalService);
	const castedResource = URI.isUri(resource) ? resource : undefined;
	const instance = terminalService.getInstanceFromResource(castedResource) || terminalService.activeInstance;
	return instance;
}
