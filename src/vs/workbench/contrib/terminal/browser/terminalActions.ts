/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Schemas } from 'vs/base/common/network';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { IDisposable } from 'vs/base/common/lifecycle';
import { withNullAsUndefined, isObject, isString } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { Action2, registerAction2, IAction2Options } from 'vs/platform/actions/common/actions';
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
import { Direction, ICreateTerminalOptions, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalQuickAccessProvider } from 'vs/workbench/contrib/terminal/browser/terminalQuickAccess';
import { IRemoteTerminalAttachTarget, ITerminalConfigHelper, ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
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
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { CancellationToken } from 'vs/base/common/cancellation';
import { dirname } from 'vs/base/common/resources';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { FileKind } from 'vs/platform/files/common/files';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { killTerminalIcon, newTerminalIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Iterable } from 'vs/base/common/iterator';

export const switchTerminalActionViewItemSeparator = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
export const switchTerminalShowTabsTitle = localize('showTerminalTabs', "Show Tabs");

const category = terminalStrings.actionCategory;

export interface WorkspaceFolderCwdPair {
	folder: IWorkspaceFolder;
	cwd: URI;
	isAbsolute: boolean;
	isOverridden: boolean;
}

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

export const terminalSendSequenceCommand = async (accessor: ServicesAccessor, args: unknown) => {
	const instance = accessor.get(ITerminalService).activeInstance;
	if (instance) {
		const text = isObject(args) && 'text' in args ? toOptionalString(args.text) : undefined;
		if (!text) {
			return;
		}
		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const historyService = accessor.get(IHistoryService);
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(instance.isRemote ? Schemas.vscodeRemote : Schemas.file);
		const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
		const resolvedText = await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, text);
		instance.sendText(resolvedText, false);
	}
};

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

/**
 * A wrapper function around registerAction2 to help make registering terminal actions more concise.
 * The following default options are used if undefined:
 *
 * - `f1`: true
 * - `category`: Terminal
 * - `precondition`: TerminalContextKeys.processSupported
 */
export function registerTerminalAction(
	options: IAction2Options & { run: (c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown) => void | Promise<unknown> }
): IDisposable {
	// Set defaults
	options.f1 = options.f1 ?? true;
	options.category = options.category ?? category;
	options.precondition = options.precondition ?? TerminalContextKeys.processSupported;
	// Remove run function from options so it's not passed through to registerAction2
	const runFunc = options.run;
	const strictOptions: IAction2Options & { run?: (c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown) => void | Promise<unknown> } = options;
	delete (strictOptions as IAction2Options & { run?: (c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown) => void | Promise<unknown> })['run'];
	// Register
	return registerAction2(class extends Action2 {
		constructor() {
			super(strictOptions as IAction2Options);
		}
		run(accessor: ServicesAccessor, args?: unknown) {
			return runFunc(getTerminalServices(accessor), accessor, args);
		}
	});
}

/**
 * A wrapper around {@link registerTerminalAction} that ensures an active instance exists and
 * provides it to the run function.
 */
export function registerActiveInstanceAction(
	options: IAction2Options & { run: (activeInstance: ITerminalInstance, c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown) => void | Promise<unknown> }
): IDisposable {
	const originalRun = options.run;
	return registerTerminalAction({
		...options,
		run: (c, accessor, args) => {
			const activeInstance = c.service.activeInstance;
			if (activeInstance) {
				return originalRun(activeInstance, c, accessor, args);
			}
		}
	});
}

/**
 * A wrapper around {@link registerTerminalAction} that ensures an active terminal
 * exists and provides it to the run function.
 *
 * This includes detached xterm terminals that are not managed by an {@link ITerminalInstance}.
 */
export function registerActiveXtermAction(
	options: IAction2Options & { run: (activeTerminal: IXtermTerminal, accessor: ServicesAccessor, instance?: ITerminalInstance, args?: unknown) => void | Promise<unknown> }
): IDisposable {
	const originalRun = options.run;
	return registerTerminalAction({
		...options,
		run: (c, accessor, args) => {
			const activeDetached = Iterable.find(c.service.detachedXterms, d => d.isFocused);
			if (activeDetached) {
				return originalRun(activeDetached, accessor, undefined, args);
			}

			const activeInstance = c.service.activeInstance;
			if (activeInstance?.xterm) {
				return originalRun(activeInstance.xterm, accessor, activeInstance, args);
			}
		}
	});
}

export interface ITerminalServicesCollection {
	service: ITerminalService;
	groupService: ITerminalGroupService;
	instanceService: ITerminalInstanceService;
	editorService: ITerminalEditorService;
	profileService: ITerminalProfileService;
	profileResolverService: ITerminalProfileResolverService;
}

function getTerminalServices(accessor: ServicesAccessor): ITerminalServicesCollection {
	return {
		service: accessor.get(ITerminalService),
		groupService: accessor.get(ITerminalGroupService),
		instanceService: accessor.get(ITerminalInstanceService),
		editorService: accessor.get(ITerminalEditorService),
		profileService: accessor.get(ITerminalProfileService),
		profileResolverService: accessor.get(ITerminalProfileResolverService)
	};
}

export function registerTerminalActions() {
	registerTerminalAction({
		id: TerminalCommandId.NewInActiveWorkspace,
		title: { value: localize('workbench.action.terminal.newInActiveWorkspace', "Create New Terminal (In Active Workspace)"), original: 'Create New Terminal (In Active Workspace)' },
		run: async (c) => {
			if (c.service.isProcessSupportRegistered) {
				const instance = await c.service.createTerminal({ location: c.service.defaultLocation });
				if (!instance) {
					return;
				}
				c.service.setActiveInstance(instance);
			}
			await c.groupService.showPanel(true);
		}
	});

	// Register new with profile command
	refreshTerminalActions([]);

	registerTerminalAction({
		id: TerminalCommandId.CreateTerminalEditor,
		title: { value: localize('workbench.action.terminal.createTerminalEditor', "Create New Terminal in Editor Area"), original: 'Create New Terminal in Editor Area' },
		run: async (c, _, args) => {
			const options = (isObject(args) && 'location' in args) ? args as ICreateTerminalOptions : { location: TerminalLocation.Editor };
			const instance = await c.service.createTerminal(options);
			instance.focusWhenReady();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.CreateTerminalEditorSameGroup,
		title: { value: localize('workbench.action.terminal.createTerminalEditor', "Create New Terminal in Editor Area"), original: 'Create New Terminal in Editor Area' },
		f1: false,
		run: async (c, accessor, args) => {
			// Force the editor into the same editor group if it's locked. This command is only ever
			// called when a terminal is the active editor
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const instance = await c.service.createTerminal({
				location: { viewColumn: editorGroupsService.activeGroup.index }
			});
			instance.focusWhenReady();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.CreateTerminalEditorSide,
		title: { value: localize('workbench.action.terminal.createTerminalEditorSide', "Create New Terminal in Editor Area to the Side"), original: 'Create New Terminal in Editor Area to the Side' },
		run: async (c) => {
			const instance = await c.service.createTerminal({
				location: { viewColumn: SIDE_GROUP }
			});
			instance.focusWhenReady();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.MoveToEditor,
		title: terminalStrings.moveToEditor,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.terminalEditorActive.toNegated(), TerminalContextKeys.viewShowing),
		run: (activeInstance, c) => c.service.moveToEditor(activeInstance)
	});

	registerTerminalAction({
		id: TerminalCommandId.MoveToEditorInstance,
		title: terminalStrings.moveToEditor,
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		run: async (c, accessor) => {
			const selectedInstances = getSelectedInstances(accessor);
			if (!selectedInstances || selectedInstances.length === 0) {
				return;
			}
			for (const instance of selectedInstances) {
				c.service.moveToEditor(instance);
			}
			selectedInstances[selectedInstances.length - 1].focus();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.MoveToTerminalPanel,
		title: terminalStrings.moveToTerminalPanel,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.terminalEditorActive),
		run: (c, _, args) => {
			const source = toOptionalUri(args) ?? c.editorService.activeInstance;
			if (source) {
				c.service.moveToTerminalView(source);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.ShowTabs,
		title: { value: localize('workbench.action.terminal.showTabs', "Show Tabs"), original: 'Show Tabs' },
		f1: false,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.showTabs()
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusPreviousPane,
		title: { value: localize('workbench.action.terminal.focusPreviousPane', "Focus Previous Terminal in Terminal Group"), original: 'Focus Previous Terminal in Terminal Group' },
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
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c) => {
			c.groupService.activeGroup?.focusPreviousPane();
			await c.groupService.showPanel(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusNextPane,
		title: { value: localize('workbench.action.terminal.focusNextPane', "Focus Next Terminal in Terminal Group"), original: 'Focus Next Terminal in Terminal Group' },
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
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c) => {
			c.groupService.activeGroup?.focusNextPane();
			await c.groupService.showPanel(true);
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.RunRecentCommand,
		title: { value: localize('workbench.action.terminal.runRecentCommand', "Run Recent Command..."), original: 'Run Recent Command...' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		keybinding: [
			{
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR },
				when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
				weight: KeybindingWeight.WorkbenchContrib
			},
			{
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
				when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
				weight: KeybindingWeight.WorkbenchContrib
			}
		],
		run: async (activeInstance, c) => {
			await activeInstance.runRecent('command');
			if (activeInstance?.target === TerminalLocation.Editor) {
				await c.editorService.revealActiveEditor();
			} else {
				await c.groupService.showPanel(false);
			}
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.CopyLastCommandOutput,
		title: { value: localize('workbench.action.terminal.copyLastCommand', 'Copy Last Command Output'), original: 'Copy Last Command Output' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (instance, c, accessor) => {
			const clipboardService = accessor.get(IClipboardService);
			const commands = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
			if (!commands || commands.length === 0) {
				return;
			}
			const command = commands[commands.length - 1];
			if (!command?.hasOutput()) {
				return;
			}
			const output = command.getOutput();
			if (isString(output)) {
				await clipboardService.writeText(output);
			}
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.GoToRecentDirectory,
		title: { value: localize('workbench.action.terminal.goToRecentDirectory', "Go to Recent Directory..."), original: 'Go to Recent Directory...' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.KeyG,
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		run: async (activeInstance, c) => {
			await activeInstance.runRecent('cwd');
			if (activeInstance?.target === TerminalLocation.Editor) {
				await c.editorService.revealActiveEditor();
			} else {
				await c.groupService.showPanel(false);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneLeft,
		title: { value: localize('workbench.action.terminal.resizePaneLeft', "Resize Terminal Left"), original: 'Resize Terminal Left' },
		keybinding: {
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Left)
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneRight,
		title: { value: localize('workbench.action.terminal.resizePaneRight', "Resize Terminal Right"), original: 'Resize Terminal Right' },
		keybinding: {
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Right)
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneUp,
		title: { value: localize('workbench.action.terminal.resizePaneUp', "Resize Terminal Up"), original: 'Resize Terminal Up' },
		keybinding: {
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Up)
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneDown,
		title: { value: localize('workbench.action.terminal.resizePaneDown', "Resize Terminal Down"), original: 'Resize Terminal Down' },
		keybinding: {
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Down)
	});

	registerTerminalAction({
		id: TerminalCommandId.Focus,
		title: terminalStrings.focus,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c) => {
			const instance = c.service.activeInstance || await c.service.createTerminal({ location: TerminalLocation.Panel });
			if (!instance) {
				return;
			}
			c.service.setActiveInstance(instance);
			return c.groupService.showPanel(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusTabs,
		title: { value: localize('workbench.action.terminal.focus.tabsView', "Focus Terminal Tabs View"), original: 'Focus Terminal Tabs View' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus),
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.focusTabs()
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusNext,
		title: { value: localize('workbench.action.terminal.focusNext', "Focus Next Terminal Group"), original: 'Focus Next Terminal Group' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.PageDown,
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight
			},
			when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		run: async (c) => {
			c.groupService.setActiveGroupToNext();
			await c.groupService.showPanel(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusPrevious,
		title: { value: localize('workbench.action.terminal.focusPrevious', "Focus Previous Terminal Group"), original: 'Focus Previous Terminal Group' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.PageUp,
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft
			},
			when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		run: async (c) => {
			c.groupService.setActiveGroupToPrevious();
			await c.groupService.showPanel(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.RunSelectedText,
		title: { value: localize('workbench.action.terminal.runSelectedText', "Run Selected Text In Active Terminal"), original: 'Run Selected Text In Active Terminal' },
		run: async (c, accessor) => {
			const codeEditorService = accessor.get(ICodeEditorService);
			const editor = codeEditorService.getActiveCodeEditor();
			if (!editor || !editor.hasModel()) {
				return;
			}
			const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
			const selection = editor.getSelection();
			let text: string;
			if (selection.isEmpty()) {
				text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
			} else {
				const endOfLinePreference = isWindows ? EndOfLinePreference.LF : EndOfLinePreference.CRLF;
				text = editor.getModel().getValueInRange(selection, endOfLinePreference);
			}
			instance.sendText(text, true, true);
			await c.service.revealActiveTerminal();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.RunActiveFile,
		title: { value: localize('workbench.action.terminal.runActiveFile', "Run Active File In Active Terminal"), original: 'Run Active File In Active Terminal' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c, accessor) => {
			const codeEditorService = accessor.get(ICodeEditorService);
			const notificationService = accessor.get(INotificationService);
			const workbenchEnvironmentService = accessor.get(IWorkbenchEnvironmentService);

			const editor = codeEditorService.getActiveCodeEditor();
			if (!editor || !editor.hasModel()) {
				return;
			}

			const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
			const isRemote = instance ? instance.isRemote : (workbenchEnvironmentService.remoteAuthority ? true : false);
			const uri = editor.getModel().uri;
			if ((!isRemote && uri.scheme !== Schemas.file && uri.scheme !== Schemas.vscodeUserData) || (isRemote && uri.scheme !== Schemas.vscodeRemote)) {
				notificationService.warn(localize('workbench.action.terminal.runActiveFile.noFile', 'Only files on disk can be run in the terminal'));
				return;
			}

			// TODO: Convert this to ctrl+c, ctrl+v for pwsh?
			await instance.sendPath(uri, true);
			return c.groupService.showPanel();
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollDownLine,
		title: { value: localize('workbench.action.terminal.scrollDown', "Scroll Down (Line)"), original: 'Scroll Down (Line)' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow },
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => xterm.scrollDownLine()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollDownPage,
		title: { value: localize('workbench.action.terminal.scrollDownPage', "Scroll Down (Page)"), original: 'Scroll Down (Page)' },
		keybinding: {
			primary: KeyMod.Shift | KeyCode.PageDown,
			mac: { primary: KeyCode.PageDown },
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => xterm.scrollDownPage()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollToBottom,
		title: { value: localize('workbench.action.terminal.scrollToBottom', "Scroll to Bottom"), original: 'Scroll to Bottom' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.End,
			linux: { primary: KeyMod.Shift | KeyCode.End },
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => xterm.scrollToBottom()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollUpLine,
		title: { value: localize('workbench.action.terminal.scrollUp', "Scroll Up (Line)"), original: 'Scroll Up (Line)' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => xterm.scrollUpLine()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollUpPage,
		title: { value: localize('workbench.action.terminal.scrollUpPage', "Scroll Up (Page)"), original: 'Scroll Up (Page)' },
		f1: true,
		category,
		keybinding: {
			primary: KeyMod.Shift | KeyCode.PageUp,
			mac: { primary: KeyCode.PageUp },
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => xterm.scrollUpPage()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollToTop,
		title: { value: localize('workbench.action.terminal.scrollToTop', "Scroll to Top"), original: 'Scroll to Top' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.Home,
			linux: { primary: KeyMod.Shift | KeyCode.Home },
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => xterm.scrollToTop()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ClearSelection,
		title: { value: localize('workbench.action.terminal.clearSelection', "Clear Selection"), original: 'Clear Selection' },
		keybinding: {
			primary: KeyCode.Escape,
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.textSelected, TerminalContextKeys.notFindVisible),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (xterm) => {
			if (xterm.hasSelection()) {
				xterm.clearSelection();
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeIcon,
		title: terminalStrings.changeIcon,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c, _, args: unknown) => getResourceOrActiveInstance(c, args)?.changeIcon()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeIconPanel,
		title: terminalStrings.changeIcon,
		f1: false,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.activeInstance?.changeIcon()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeIconInstance,
		title: terminalStrings.changeIcon,
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection),
		run: (c, accessor) => getSelectedInstances(accessor)?.[0].changeIcon()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeColor,
		title: terminalStrings.changeColor,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c, _, args) => getResourceOrActiveInstance(c, args)?.changeColor()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeColorPanel,
		title: terminalStrings.changeColor,
		f1: false,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c) => c.groupService.activeInstance?.changeColor()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeColorInstance,
		title: terminalStrings.changeColor,
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection),
		run: (c, accessor) => getSelectedInstances(accessor)?.[0].changeColor()
	});

	registerTerminalAction({
		id: TerminalCommandId.Rename,
		title: terminalStrings.rename,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c, accessor, args) => renameWithQuickPick(c, accessor, args)
	});

	registerTerminalAction({
		id: TerminalCommandId.RenamePanel,
		title: terminalStrings.rename,
		f1: false,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c, accessor) => renameWithQuickPick(c, accessor)
	});

	registerTerminalAction({
		id: TerminalCommandId.RenameInstance,
		title: terminalStrings.rename,
		f1: false,
		keybinding: {
			primary: KeyCode.F2,
			mac: {
				primary: KeyCode.Enter
			},
			when: ContextKeyExpr.and(TerminalContextKeys.tabsFocus),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection),
		run: async (c, accessor) => {
			const notificationService = accessor.get(INotificationService);
			const instance = getSelectedInstances(accessor)?.[0];
			if (!instance) {
				return;
			}
			c.service.setEditingTerminal(instance);
			c.service.setEditable(instance, {
				validationMessage: value => validateTerminalName(value),
				onFinish: async (value, success) => {
					// Cancel editing first as instance.rename will trigger a rerender automatically
					c.service.setEditable(instance, null);
					c.service.setEditingTerminal(undefined);
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

	registerActiveInstanceAction({
		id: TerminalCommandId.DetachSession,
		title: { value: localize('workbench.action.terminal.detachSession', "Detach Session"), original: 'Detach Session' },
		run: (activeInstance) => activeInstance.detachProcessAndDispose(TerminalExitReason.User)
	});

	registerTerminalAction({
		id: TerminalCommandId.AttachToSession,
		title: { value: localize('workbench.action.terminal.attachToSession', "Attach to Session"), original: 'Attach to Session' },
		run: async (c, accessor) => {
			const quickInputService = accessor.get(IQuickInputService);
			const labelService = accessor.get(ILabelService);
			const remoteAgentService = accessor.get(IRemoteAgentService);
			const notificationService = accessor.get(INotificationService);

			const remoteAuthority = remoteAgentService.getConnection()?.remoteAuthority ?? undefined;
			const backend = await accessor.get(ITerminalInstanceService).getBackend(remoteAuthority);

			if (!backend) {
				throw new Error(`No backend registered for remote authority '${remoteAuthority}'`);
			}

			const terms = await backend.listProcesses();

			backend.reduceConnectionGraceTime();

			const unattachedTerms = terms.filter(term => !c.service.isAttachedToTerminal(term));
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
				const instance = await c.service.createTerminal({
					config: { attachPersistentProcess: selected.term }
				});
				c.service.setActiveInstance(instance);
				await focusActiveTerminal(instance, c);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.QuickOpenTerm,
		title: { value: localize('quickAccessTerminal', "Switch Active Terminal"), original: 'Switch Active Terminal' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c, accessor) => accessor.get(IQuickInputService).quickAccess.show(TerminalQuickAccessProvider.PREFIX)
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.ScrollToPreviousCommand,
		title: { value: localize('workbench.action.terminal.scrollToPreviousCommand', "Scroll To Previous Command"), original: 'Scroll To Previous Command' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (activeInstance) => activeInstance.xterm?.markTracker.scrollToPreviousMark(undefined, undefined, activeInstance.capabilities.has(TerminalCapability.CommandDetection))
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.ScrollToNextCommand,
		title: { value: localize('workbench.action.terminal.scrollToNextCommand', "Scroll To Next Command"), original: 'Scroll To Next Command' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (activeInstance) => {
			activeInstance.xterm?.markTracker.scrollToNextMark();
			activeInstance.focus();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectToPreviousCommand,
		title: { value: localize('workbench.action.terminal.selectToPreviousCommand', "Select To Previous Command"), original: 'Select To Previous Command' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (activeInstance) => {
			activeInstance.xterm?.markTracker.selectToPreviousMark();
			activeInstance.focus();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectToNextCommand,
		title: { value: localize('workbench.action.terminal.selectToNextCommand', "Select To Next Command"), original: 'Select To Next Command' },
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (activeInstance) => {
			activeInstance.xterm?.markTracker.selectToNextMark();
			activeInstance.focus();
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.SelectToPreviousLine,
		title: { value: localize('workbench.action.terminal.selectToPreviousLine', "Select To Previous Line"), original: 'Select To Previous Line' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (xterm, _, instance) => {
			xterm.markTracker.selectToPreviousLine();
			// prefer to call focus on the TerminalInstance for additional accessibility triggers
			(instance || xterm).focus();
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.SelectToNextLine,
		title: { value: localize('workbench.action.terminal.selectToNextLine', "Select To Next Line"), original: 'Select To Next Line' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (xterm, _, instance) => {
			xterm.markTracker.selectToNextLine();
			// prefer to call focus on the TerminalInstance for additional accessibility triggers
			(instance || xterm).focus();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.SendSequence,
		title: terminalStrings.sendSequence,
		f1: false,
		description: {
			description: terminalStrings.sendSequence.value,
			args: [{
				name: 'args',
				schema: {
					type: 'object',
					required: ['text'],
					properties: {
						text: {
							description: localize('sendSequence', "The sequence of text to send to the terminal"),
							type: 'string'
						}
					},
				}
			}]
		},
		run: (c, accessor, args) => terminalSendSequenceCommand(accessor, args)
	});

	registerTerminalAction({
		id: TerminalCommandId.NewWithCwd,
		title: terminalStrings.newWithCwd,
		description: {
			description: terminalStrings.newWithCwd.value,
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
		run: async (c, _, args) => {
			const cwd = isObject(args) && 'cwd' in args ? toOptionalString(args.cwd) : undefined;
			const instance = await c.service.createTerminal({ cwd });
			if (!instance) {
				return;
			}
			c.service.setActiveInstance(instance);
			await focusActiveTerminal(instance, c);
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.RenameWithArgs,
		title: terminalStrings.renameWithArgs,
		description: {
			description: terminalStrings.renameWithArgs.value,
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
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (activeInstance, c, accessor, args) => {
			const notificationService = accessor.get(INotificationService);
			const name = isObject(args) && 'name' in args ? toOptionalString(args.name) : undefined;
			if (!name) {
				notificationService.warn(localize('workbench.action.terminal.renameWithArg.noName', "No name argument provided"));
				return;
			}
			activeInstance.rename(name);
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.Relaunch,
		title: { value: localize('workbench.action.terminal.relaunch', "Relaunch Active Terminal"), original: 'Relaunch Active Terminal' },
		run: (activeInstance) => activeInstance.relaunch()
	});

	registerTerminalAction({
		id: TerminalCommandId.Split,
		title: terminalStrings.split,
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
		run: async (c, accessor, args) => {
			const optionsOrProfile = isObject(args) ? args as ICreateTerminalOptions | ITerminalProfile : undefined;
			const commandService = accessor.get(ICommandService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const options = convertOptionsOrProfileToOptions(optionsOrProfile);
			const activeInstance = c.service.getInstanceHost(options?.location).activeInstance;
			if (!activeInstance) {
				return;
			}
			const cwd = await getCwdForSplit(c.service.configHelper, activeInstance, workspaceContextService.getWorkspace().folders, commandService);
			if (cwd === undefined) {
				return;
			}
			const instance = await c.service.createTerminal({ location: { parentTerminal: activeInstance }, config: options?.config, cwd });
			await focusActiveTerminal(instance, c);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.SplitInstance,
		title: terminalStrings.split,
		f1: false,
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit5,
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.Backslash,
				secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Digit5]
			},
			weight: KeybindingWeight.WorkbenchContrib,
			when: TerminalContextKeys.tabsFocus
		},
		run: async (c, accessor) => {
			const instances = getSelectedInstances(accessor);
			if (instances) {
				const promises: Promise<void>[] = [];
				for (const t of instances) {
					promises.push((async () => {
						await c.service.createTerminal({ location: { parentTerminal: t } });
						await c.groupService.showPanel(true);
					})());
				}
				await Promise.all(promises);
			}
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.Unsplit,
		title: terminalStrings.unsplit,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (activeInstance, c) => c.groupService.unsplitInstance(activeInstance)
	});

	registerTerminalAction({
		id: TerminalCommandId.UnsplitInstance,
		title: terminalStrings.unsplit,
		f1: false,
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c, accessor) => {
			const instances = getSelectedInstances(accessor);
			// should not even need this check given the context key
			// but TS complains
			if (instances?.length === 1) {
				const group = c.groupService.getGroupForInstance(instances[0]);
				if (group && group?.terminalInstances.length > 1) {
					c.groupService.unsplitInstance(instances[0]);
				}
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.JoinInstance,
		title: { value: localize('workbench.action.terminal.joinInstance', "Join Terminals"), original: 'Join Terminals' },
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.tabsSingularSelection.toNegated()),
		run: async (c, accessor) => {
			const instances = getSelectedInstances(accessor);
			if (instances && instances.length > 1) {
				c.groupService.joinInstances(instances);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.Join,
		title: { value: localize('workbench.action.terminal.join', "Join Terminals"), original: 'Join Terminals' },
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)),
		run: async (c, accessor) => {
			const themeService = accessor.get(IThemeService);
			const notificationService = accessor.get(INotificationService);
			const quickInputService = accessor.get(IQuickInputService);

			const picks: ITerminalQuickPickItem[] = [];
			if (c.groupService.instances.length <= 1) {
				notificationService.warn(localize('workbench.action.terminal.join.insufficientTerminals', 'Insufficient terminals for the join action'));
				return;
			}
			const otherInstances = c.groupService.instances.filter(i => i.instanceId !== c.groupService.activeInstance?.instanceId);
			for (const terminal of otherInstances) {
				const group = c.groupService.getGroupForInstance(terminal);
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
			const result = await quickInputService.pick(picks, {});
			if (result) {
				c.groupService.joinInstances([result.terminal, c.groupService.activeInstance!]);
			}
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SplitInActiveWorkspace,
		title: { value: localize('workbench.action.terminal.splitInActiveWorkspace', "Split Terminal (In Active Workspace)"), original: 'Split Terminal (In Active Workspace)' },
		run: async (instance, c) => {
			const newInstance = await c.service.createTerminal({ location: { parentTerminal: instance } });
			if (newInstance?.target !== TerminalLocation.Editor) {
				await c.groupService.showPanel(true);
			}
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.SelectAll,
		title: { value: localize('workbench.action.terminal.selectAll', "Select All"), original: 'Select All' },
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
			when: TerminalContextKeys.focusInAny
		}],
		run: (xterm) => xterm.selectAll()
	});

	registerTerminalAction({
		id: TerminalCommandId.New,
		title: { value: localize('workbench.action.terminal.new', "Create New Terminal"), original: 'Create New Terminal' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
		icon: newTerminalIcon,
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backquote,
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Backquote },
			weight: KeybindingWeight.WorkbenchContrib
		},
		run: async (c, accessor, args) => {
			let eventOrOptions = isObject(args) ? args as MouseEvent | ICreateTerminalOptions : undefined;
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const commandService = accessor.get(ICommandService);
			const folders = workspaceContextService.getWorkspace().folders;
			if (eventOrOptions && eventOrOptions instanceof MouseEvent && (eventOrOptions.altKey || eventOrOptions.ctrlKey)) {
				await c.service.createTerminal({ location: { splitActiveTerminal: true } });
				return;
			}

			if (c.service.isProcessSupportRegistered) {
				eventOrOptions = !eventOrOptions || eventOrOptions instanceof MouseEvent ? {} : eventOrOptions;

				let instance: ITerminalInstance | undefined;
				if (folders.length <= 1) {
					// Allow terminal service to handle the path when there is only a
					// single root
					instance = await c.service.createTerminal(eventOrOptions);
				} else {
					const cwd = (await pickTerminalCwd(accessor))?.cwd;
					if (!cwd) {
						// Don't create the instance if the workspace picker was canceled
						return;
					}
					eventOrOptions.cwd = cwd;
					instance = await c.service.createTerminal(eventOrOptions);
				}
				c.service.setActiveInstance(instance);
				await focusActiveTerminal(instance, c);
			} else {
				if (c.profileService.contributedProfiles.length > 0) {
					commandService.executeCommand(TerminalCommandId.NewWithProfile);
				} else {
					commandService.executeCommand(TerminalCommandId.Toggle);
				}
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.Kill,
		title: { value: localize('workbench.action.terminal.kill', "Kill the Active Terminal Instance"), original: 'Kill the Active Terminal Instance' },
		precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		icon: killTerminalIcon,
		run: async (c) => {
			const instance = c.groupService.activeInstance;
			if (!instance) {
				return;
			}
			await c.service.safeDisposeTerminal(instance);
			if (c.groupService.instances.length > 0) {
				await c.groupService.showPanel(true);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.KillAll,
		title: { value: localize('workbench.action.terminal.killAll', "Kill All Terminals"), original: 'Kill All Terminals' },
		precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		icon: Codicon.trash,
		run: async (c) => {
			const disposePromises: Promise<void>[] = [];
			for (const instance of c.service.instances) {
				disposePromises.push(c.service.safeDisposeTerminal(instance));
			}
			await Promise.all(disposePromises);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.KillEditor,
		title: { value: localize('workbench.action.terminal.killEditor', "Kill the Active Terminal in Editor Area"), original: 'Kill the Active Terminal in Editor Area' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.KeyW,
			win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(TerminalContextKeys.focus, ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal), TerminalContextKeys.editorFocus)
		},
		run: (c, accessor) => accessor.get(ICommandService).executeCommand(CLOSE_EDITOR_COMMAND_ID)
	});

	registerTerminalAction({
		id: TerminalCommandId.KillInstance,
		title: terminalStrings.kill,
		f1: false,
		precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		keybinding: {
			primary: KeyCode.Delete,
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				secondary: [KeyCode.Delete]
			},
			weight: KeybindingWeight.WorkbenchContrib,
			when: TerminalContextKeys.tabsFocus
		},
		run: async (c, accessor) => {
			const selectedInstances = getSelectedInstances(accessor);
			if (!selectedInstances) {
				return;
			}
			const listService = accessor.get(IListService);
			const disposePromises: Promise<void>[] = [];
			for (const instance of selectedInstances) {
				disposePromises.push(c.service.safeDisposeTerminal(instance));
			}
			await Promise.all(disposePromises);
			if (c.service.instances.length > 0) {
				c.groupService.focusTabs();
				listService.lastFocusedList?.focusNext();
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusHover,
		title: terminalStrings.focusHover,
		precondition: ContextKeyExpr.or(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		keybinding: {
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus)
		},
		run: (c) => c.groupService.focusHover()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.Clear,
		title: { value: localize('workbench.action.terminal.clear', "Clear"), original: 'Clear' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		keybinding: [{
			primary: 0,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
			// Weight is higher than work workbench contributions so the keybinding remains
			// highest priority when chords are registered afterwards
			weight: KeybindingWeight.WorkbenchContrib + 1,
			// Disable the keybinding when accessibility mode is enabled as chords include
			// important screen reader keybindings such as cmd+k, cmd+i to show the hover
			when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
		}],
		run: (activeInstance) => activeInstance.clearBuffer()
	});

	registerTerminalAction({
		id: TerminalCommandId.SelectDefaultProfile,
		title: { value: localize('workbench.action.terminal.selectDefaultShell', "Select Default Profile"), original: 'Select Default Profile' },
		run: (c) => c.service.showProfileQuickPick('setDefault')
	});

	registerTerminalAction({
		id: TerminalCommandId.ConfigureTerminalSettings,
		title: { value: localize('workbench.action.terminal.openSettings', "Configure Terminal Settings"), original: 'Configure Terminal Settings' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@feature:terminal' })
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SetDimensions,
		title: { value: localize('workbench.action.terminal.setFixedDimensions', "Set Fixed Dimensions"), original: 'Set Fixed Dimensions' },
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		run: (activeInstance) => activeInstance.setFixedDimensions()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SizeToContentWidth,
		title: { value: localize('workbench.action.terminal.sizeToContentWidth', "Toggle Size to Content Width"), original: 'Toggle Size to Content Width' },
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen),
		keybinding: {
			primary: KeyMod.Alt | KeyCode.KeyZ,
			weight: KeybindingWeight.WorkbenchContrib,
			when: TerminalContextKeys.focus
		},
		run: (instancactiveInstance) => instancactiveInstance.toggleSizeToContentWidth()
	});

	registerTerminalAction({
		id: TerminalCommandId.SizeToContentWidthInstance,
		title: terminalStrings.toggleSizeToContentWidth,
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus),
		run: (c, accessor) => getSelectedInstances(accessor)?.[0].toggleSizeToContentWidth()
	});

	registerTerminalAction({
		id: TerminalCommandId.ClearPreviousSessionHistory,
		title: { value: localize('workbench.action.terminal.clearPreviousSessionHistory', "Clear Previous Session History"), original: 'Clear Previous Session History' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c, accessor) => {
			getCommandHistory(accessor).clear();
			clearShellFileHistory();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectPrevSuggestion,
		title: { value: localize('workbench.action.terminal.selectPrevSuggestion', "Select the Previous Suggestion"), original: 'Select the Previous Suggestion' },
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
		keybinding: {
			// Up is bound to other workbench keybindings that this needs to beat
			primary: KeyCode.UpArrow,
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		run: (activeInstance) => activeInstance.selectPreviousSuggestion()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectPrevPageSuggestion,
		title: { value: localize('workbench.action.terminal.selectPrevPageSuggestion', "Select the Previous Page Suggestion"), original: 'Select the Previous Page Suggestion' },
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
		keybinding: {
			// Up is bound to other workbench keybindings that this needs to beat
			primary: KeyCode.PageUp,
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		run: (activeInstance) => activeInstance.selectPreviousPageSuggestion()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectNextSuggestion,
		title: { value: localize('workbench.action.terminal.selectNextSuggestion', "Select the Next Suggestion"), original: 'Select the Next Suggestion' },
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
		keybinding: {
			// Down is bound to other workbench keybindings that this needs to beat
			primary: KeyCode.DownArrow,
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		run: (insactiveInstanceance) => insactiveInstanceance.selectNextSuggestion()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectNextPageSuggestion,
		title: { value: localize('workbench.action.terminal.selectNextPageSuggestion', "Select the Next Page Suggestion"), original: 'Select the Next Page Suggestion' },
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
		keybinding: {
			// Down is bound to other workbench keybindings that this needs to beat
			primary: KeyCode.PageDown,
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		run: (activeInstance) => activeInstance.selectNextPageSuggestion()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.AcceptSelectedSuggestion,
		title: { value: localize('workbench.action.terminal.acceptSelectedSuggestion', "Accept Selected Suggestion"), original: 'Accept Selected Suggestion' },
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
		keybinding: {
			primary: KeyCode.Enter,
			secondary: [KeyCode.Tab],
			// Enter is bound to other workbench keybindings that this needs to beat
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		run: (activeInstance) => activeInstance.acceptSelectedSuggestion()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.HideSuggestWidget,
		title: { value: localize('workbench.action.terminal.hideSuggestWidget', "Hide Suggest Widget"), original: 'Hide Suggest Widget' },
		f1: false,
		precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
		keybinding: {
			primary: KeyCode.Escape,
			// Escape is bound to other workbench keybindings that this needs to beat
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		run: (activeInstance) => activeInstance.hideSuggestWidget()
	});

	// Some commands depend on platform features
	if (BrowserFeatures.clipboard.writeText) {
		registerActiveXtermAction({
			id: TerminalCommandId.CopySelection,
			title: { value: localize('workbench.action.terminal.copySelection', "Copy Selection"), original: 'Copy Selection' },
			// TODO: Why is copy still showing up when text isn't selected?
			precondition: ContextKeyExpr.or(TerminalContextKeys.textSelectedInFocused, ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.textSelected)),
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyC },
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(TerminalContextKeys.textSelected, TerminalContextKeys.focus),
					TerminalContextKeys.textSelectedInFocused,
				)
			}],
			run: (activeInstance) => activeInstance.copySelection()
		});

		registerActiveXtermAction({
			id: TerminalCommandId.CopyAndClearSelection,
			title: { value: localize('workbench.action.terminal.copyAndClearSelection', "Copy and Clear Selection"), original: 'Copy and Clear Selection' },
			precondition: ContextKeyExpr.or(TerminalContextKeys.textSelectedInFocused, ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.textSelected)),
			keybinding: [{
				win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC },
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(TerminalContextKeys.textSelected, TerminalContextKeys.focus),
					TerminalContextKeys.textSelectedInFocused,
				)
			}],
			run: async (xterm) => {
				await xterm.copySelection();
				xterm.clearSelection();
			}
		});

		registerActiveXtermAction({
			id: TerminalCommandId.CopySelectionAsHtml,
			title: { value: localize('workbench.action.terminal.copySelectionAsHtml', "Copy Selection as HTML"), original: 'Copy Selection as HTML' },
			f1: true,
			category,
			precondition: ContextKeyExpr.or(TerminalContextKeys.textSelectedInFocused, ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.textSelected)),
			run: (xterm) => xterm.copySelection(true)
		});
	}

	if (BrowserFeatures.clipboard.readText) {
		registerActiveInstanceAction({
			id: TerminalCommandId.Paste,
			title: { value: localize('workbench.action.terminal.paste', "Paste into Active Terminal"), original: 'Paste into Active Terminal' },
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyCode.KeyV,
				win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV] },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV },
				weight: KeybindingWeight.WorkbenchContrib,
				when: TerminalContextKeys.focus
			}],
			run: (activeInstance) => activeInstance.paste()
		});
	}

	if (BrowserFeatures.clipboard.readText && isLinux) {
		registerActiveInstanceAction({
			id: TerminalCommandId.PasteSelection,
			title: { value: localize('workbench.action.terminal.pasteSelection', "Paste Selection into Active Terminal"), original: 'Paste Selection into Active Terminal' },
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
			keybinding: [{
				linux: { primary: KeyMod.Shift | KeyCode.Insert },
				weight: KeybindingWeight.WorkbenchContrib,
				when: TerminalContextKeys.focus
			}],
			run: (activeInstance) => activeInstance.pasteSelection()
		});
	}

	registerTerminalAction({
		id: TerminalCommandId.SwitchTerminal,
		title: { value: localize('workbench.action.terminal.switchTerminal', "Switch Terminal"), original: 'Switch Terminal' },
		precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		run: async (c, accessor, args) => {
			const item = toOptionalString(args);
			if (!item) {
				return;
			}
			if (item === switchTerminalActionViewItemSeparator) {
				c.service.refreshActiveGroup();
				return;
			}
			if (item === switchTerminalShowTabsTitle) {
				accessor.get(IConfigurationService).updateValue(TerminalSettingId.TabsEnabled, true);
				return;
			}

			const terminalIndexRe = /^([0-9]+): /;
			const indexMatches = terminalIndexRe.exec(item);
			if (indexMatches) {
				c.groupService.setActiveGroupByIndex(Number(indexMatches[1]) - 1);
				return c.groupService.showPanel(true);
			}

			const quickSelectProfiles = c.profileService.availableProfiles;

			// Remove 'New ' from the selected item to get the profile name
			const profileSelection = item.substring(4);
			if (quickSelectProfiles) {
				const profile = quickSelectProfiles.find(profile => profile.profileName === profileSelection);
				if (profile) {
					const instance = await c.service.createTerminal({
						config: profile
					});
					c.service.setActiveInstance(instance);
				} else {
					console.warn(`No profile with name "${profileSelection}"`);
				}
			} else {
				console.warn(`Unmatched terminal item: "${item}"`);
			}
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
	if (isObject(optionsOrProfile) && 'profileName' in optionsOrProfile) {
		return { config: optionsOrProfile as ITerminalProfile, location: (optionsOrProfile as ICreateTerminalOptions).location };
	}
	return optionsOrProfile;
}

let newWithProfileAction: IDisposable;

export function refreshTerminalActions(detectedProfiles: ITerminalProfile[]) {
	const profileEnum = createProfileSchemaEnums(detectedProfiles);
	newWithProfileAction?.dispose();
	// TODO: Use new register function
	newWithProfileAction = registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NewWithProfile,
				title: { value: localize('workbench.action.terminal.newWithProfile', "Create New Terminal (With Profile)"), original: 'Create New Terminal (With Profile)' },
				f1: true,
				category,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
				description: {
					description: TerminalCommandId.NewWithProfile,
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
			const c = getTerminalServices(accessor);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const commandService = accessor.get(ICommandService);

			let event: MouseEvent | PointerEvent | KeyboardEvent | undefined;
			let options: ICreateTerminalOptions | undefined;
			let instance: ITerminalInstance | undefined;
			let cwd: string | URI | undefined;

			if (isObject(eventOrOptionsOrProfile) && eventOrOptionsOrProfile && 'profileName' in eventOrOptionsOrProfile) {
				const config = c.profileService.availableProfiles.find(profile => profile.profileName === eventOrOptionsOrProfile.profileName);
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
				const parentTerminal = c.service.activeInstance;
				if (parentTerminal) {
					await c.service.createTerminal({ location: { parentTerminal }, config: options?.config });
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
				instance = await c.service.createTerminal(options);
			} else {
				instance = await c.service.showProfileQuickPick('createInstance', cwd);
			}

			if (instance) {
				c.service.setActiveInstance(instance);
				await focusActiveTerminal(instance, c);
			}
		}
	});
}

function getResourceOrActiveInstance(c: ITerminalServicesCollection, resource: unknown): ITerminalInstance | undefined {
	return c.service.getInstanceFromResource(toOptionalUri(resource)) || c.service.activeInstance;
}

async function pickTerminalCwd(accessor: ServicesAccessor, cancel?: CancellationToken): Promise<WorkspaceFolderCwdPair | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const labelService = accessor.get(ILabelService);
	const contextService = accessor.get(IWorkspaceContextService);
	const modelService = accessor.get(IModelService);
	const languageService = accessor.get(ILanguageService);
	const configurationService = accessor.get(IConfigurationService);
	const configurationResolverService = accessor.get(IConfigurationResolverService);

	const folders = contextService.getWorkspace().folders;
	if (!folders.length) {
		return;
	}

	const folderCwdPairs = await Promise.all(folders.map(x => resolveWorkspaceFolderCwd(x, configurationService, configurationResolverService)));
	const shrinkedPairs = shrinkWorkspaceFolderCwdPairs(folderCwdPairs);

	if (shrinkedPairs.length === 1) {
		return shrinkedPairs[0];
	}

	type Item = IQuickPickItem & { pair: WorkspaceFolderCwdPair };
	const folderPicks: Item[] = shrinkedPairs.map(pair => {
		const label = pair.folder.name;
		const description = pair.isOverridden
			? localize('workbench.action.terminal.overriddenCwdDescription', "(Overriden) {0}", labelService.getUriLabel(pair.cwd, { relative: !pair.isAbsolute }))
			: labelService.getUriLabel(dirname(pair.cwd), { relative: true });

		return {
			label,
			description: description !== label ? description : undefined,
			pair: pair,
			iconClasses: getIconClasses(modelService, languageService, pair.cwd, FileKind.ROOT_FOLDER)
		};
	});
	const options: IPickOptions<Item> = {
		placeHolder: localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal"),
		matchOnDescription: true,
		canPickMany: false,
	};

	const token: CancellationToken = cancel || CancellationToken.None;
	const pick = await quickInputService.pick<Item>(folderPicks, options, token);
	return pick?.pair;
}

async function resolveWorkspaceFolderCwd(folder: IWorkspaceFolder, configurationService: IConfigurationService, configurationResolverService: IConfigurationResolverService): Promise<WorkspaceFolderCwdPair> {
	const cwdConfig = configurationService.getValue(TerminalSettingId.Cwd, { resource: folder.uri });
	if (!isString(cwdConfig) || cwdConfig.length === 0) {
		return { folder, cwd: folder.uri, isAbsolute: false, isOverridden: false };
	}

	const resolvedCwdConfig = await configurationResolverService.resolveAsync(folder, cwdConfig);
	return isAbsolute(resolvedCwdConfig) || resolvedCwdConfig.startsWith(AbstractVariableResolverService.VARIABLE_LHS)
		? { folder, isAbsolute: true, isOverridden: true, cwd: URI.from({ scheme: folder.uri.scheme, path: resolvedCwdConfig }) }
		: { folder, isAbsolute: false, isOverridden: true, cwd: URI.joinPath(folder.uri, resolvedCwdConfig) };
}

/**
 * Drops repeated CWDs, if any, by keeping the one which best matches the workspace folder. It also preserves the original order.
 */
export function shrinkWorkspaceFolderCwdPairs(pairs: WorkspaceFolderCwdPair[]): WorkspaceFolderCwdPair[] {
	const map = new Map<string, WorkspaceFolderCwdPair>();
	for (const pair of pairs) {
		const key = pair.cwd.toString();
		const value = map.get(key);
		if (!value || key === pair.folder.uri.toString()) {
			map.set(key, pair);
		}
	}
	const selectedPairs = new Set(map.values());
	const selectedPairsInOrder = pairs.filter(x => selectedPairs.has(x));
	return selectedPairsInOrder;
}

async function focusActiveTerminal(instance: ITerminalInstance, c: ITerminalServicesCollection): Promise<void> {
	if (instance.target === TerminalLocation.Editor) {
		await c.editorService.revealActiveEditor();
		await instance.focusWhenReady(true);
	} else {
		await c.groupService.showPanel(true);
	}
}

async function renameWithQuickPick(c: ITerminalServicesCollection, accessor: ServicesAccessor, resource?: unknown) {
	const instance = getResourceOrActiveInstance(c, resource);
	if (instance) {
		const title = await accessor.get(IQuickInputService).input({
			value: instance.title,
			prompt: localize('workbench.action.terminal.rename.prompt', "Enter terminal name"),
		});
		instance.rename(title);
	}
}

function toOptionalUri(obj: unknown): URI | undefined {
	return URI.isUri(obj) ? obj : undefined;
}

function toOptionalString(obj: unknown): string | undefined {
	return isString(obj) ? obj : undefined;
}
