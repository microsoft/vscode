/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isKeyboardEvent, isMouseEvent, isPointerEvent, getActiveWindow } from '../../../../base/browser/dom.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { dirname } from '../../../../base/common/resources.js';
import { hasKey, isObject, isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalProfile, TerminalExitReason, TerminalIcon, TerminalLocation, TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { createProfileSchemaEnums } from '../../../../platform/terminal/common/terminalProfiles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from '../../../browser/actions/workspaceCommands.js';
import { CLOSE_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { editorGroupToColumn } from '../../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { AUX_WINDOW_GROUP, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown, accessibleViewOnLastLine } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IRemoteTerminalAttachTarget, ITerminalProfileResolverService, ITerminalProfileService, TERMINAL_VIEW_ID, TerminalCommandId } from '../common/terminal.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { Direction, ICreateTerminalOptions, IDetachedTerminalInstance, ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService, IXtermTerminal } from './terminal.js';
import { isAuxiliaryWindow } from '../../../../base/browser/window.js';
import { InstanceContext } from './terminalContextMenu.js';
import { getColorClass, getIconId, getUriClasses } from './terminalIcon.js';
import { killTerminalIcon, newTerminalIcon } from './terminalIcons.js';
import { ITerminalQuickPickItem } from './terminalProfileQuickpick.js';
import { TerminalTabList } from './terminalTabsList.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { SeparatorSelectOption } from '../../../../base/browser/ui/selectBox/selectBox.js';

export const switchTerminalShowTabsTitle = localize('showTerminalTabs', "Show Tabs");

const category = terminalStrings.actionCategory;

// Some terminal context keys get complicated. Since normalizing and/or context keys can be
// expensive this is done once per context key and shared.
export const sharedWhenClause = (() => {
	const terminalAvailable = ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated);
	return {
		terminalAvailable,
		terminalAvailable_and_opened: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.isOpen),
		terminalAvailable_and_editorActive: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.terminalEditorActive),
		terminalAvailable_and_singularSelection: ContextKeyExpr.and(terminalAvailable, TerminalContextKeys.tabsSingularSelection),
		focusInAny_and_normalBuffer: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.altBufferActive.negate())
	};
})();

export interface WorkspaceFolderCwdPair {
	folder: IWorkspaceFolder;
	cwd: URI;
	isAbsolute: boolean;
	isOverridden: boolean;
}

export async function getCwdForSplit(
	instance: ITerminalInstance,
	folders: IWorkspaceFolder[] | undefined,
	commandService: ICommandService,
	configService: ITerminalConfigurationService
): Promise<string | URI | undefined> {
	switch (configService.config.splitCwd) {
		case 'workspaceRoot':
			if (folders !== undefined && commandService !== undefined) {
				if (folders.length === 1) {
					return folders[0].uri;
				} else if (folders.length > 1) {
					// Only choose a path when there's more than 1 folder
					const options: IPickOptions<IQuickPickItem> = {
						placeHolder: localize('workbench.action.terminal.newWorkspacePlaceholder', "Select current working directory for new terminal")
					};
					const workspace = await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
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
			return instance.getSpeculativeCwd();
	}
}

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
	options: IAction2Options & { run: (c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown, args2?: unknown) => void | Promise<unknown> }
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
		run(accessor: ServicesAccessor, args?: unknown, args2?: unknown) {
			return runFunc(getTerminalServices(accessor), accessor, args, args2);
		}
	});
}

function parseActionArgs(args?: unknown): InstanceContext[] | undefined {
	if (Array.isArray(args)) {
		if (args.every(e => e instanceof InstanceContext)) {
			return args as InstanceContext[];
		}
	} else if (args instanceof InstanceContext) {
		return [args];
	}
	return undefined;
}
/**
 * A wrapper around {@link registerTerminalAction} that runs a callback for all currently selected
 * instances provided in the action context. This falls back to the active instance if there are no
 * contextual instances provided.
 */
export function registerContextualInstanceAction(
	options: IAction2Options & {
		/**
		 * When specified, only this type of active instance will be used when there are no
		 * contextual instances.
		 */
		activeInstanceType?: 'view' | 'editor';
		run: (instance: ITerminalInstance, c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown) => void | Promise<unknown>;
		/**
		 * A callback to run after the `run` callbacks have completed.
		 * @param instances The selected instance(s) that the command was run on.
		 */
		runAfter?: (instances: ITerminalInstance[], c: ITerminalServicesCollection, accessor: ServicesAccessor, args?: unknown) => void | Promise<unknown>;
	}
): IDisposable {
	const originalRun = options.run;
	return registerTerminalAction({
		...options,
		run: async (c, accessor, focusedInstanceArgs, allInstanceArgs) => {
			let instances = getSelectedViewInstances2(accessor, allInstanceArgs);
			if (!instances) {
				const activeInstance = (
					options.activeInstanceType === 'view'
						? c.groupService
						: options.activeInstanceType === 'editor' ?
							c.editorService
							: c.service
				).activeInstance;
				if (!activeInstance) {
					return;
				}
				instances = [activeInstance];
			}
			const results: (Promise<unknown> | void)[] = [];
			for (const instance of instances) {
				results.push(originalRun(instance, c, accessor, focusedInstanceArgs));
			}
			await Promise.all(results);
			if (options.runAfter) {
				options.runAfter(instances, c, accessor, focusedInstanceArgs);
			}
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
	options: IAction2Options & { run: (activeTerminal: IXtermTerminal, accessor: ServicesAccessor, instance: ITerminalInstance | IDetachedTerminalInstance, args?: unknown) => void | Promise<unknown> }
): IDisposable {
	const originalRun = options.run;
	return registerTerminalAction({
		...options,
		run: (c, accessor, args) => {
			const activeDetached = Iterable.find(c.service.detachedInstances, d => d.xterm.isFocused);
			if (activeDetached) {
				return originalRun(activeDetached.xterm, accessor, activeDetached, args);
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
	configService: ITerminalConfigurationService;
	groupService: ITerminalGroupService;
	instanceService: ITerminalInstanceService;
	editorService: ITerminalEditorService;
	editingService: ITerminalEditingService;
	profileService: ITerminalProfileService;
	profileResolverService: ITerminalProfileResolverService;
}

function getTerminalServices(accessor: ServicesAccessor): ITerminalServicesCollection {
	return {
		service: accessor.get(ITerminalService),
		configService: accessor.get(ITerminalConfigurationService),
		groupService: accessor.get(ITerminalGroupService),
		instanceService: accessor.get(ITerminalInstanceService),
		editorService: accessor.get(ITerminalEditorService),
		editingService: accessor.get(ITerminalEditingService),
		profileService: accessor.get(ITerminalProfileService),
		profileResolverService: accessor.get(ITerminalProfileResolverService)
	};
}

export function registerTerminalActions() {
	registerTerminalAction({
		id: TerminalCommandId.NewInActiveWorkspace,
		title: localize2('workbench.action.terminal.newInActiveWorkspace', 'Create New Terminal (In Active Workspace)'),
		run: async (c) => {
			if (c.service.isProcessSupportRegistered) {
				const instance = await c.service.createTerminal({ location: c.configService.defaultLocation });
				if (!instance) {
					return;
				}
				c.service.setActiveInstance(instance);
				await focusActiveTerminal(instance, c);
			}
		}
	});

	// Register new with profile command
	refreshTerminalActions([]);

	registerTerminalAction({
		id: TerminalCommandId.CreateTerminalEditor,
		title: localize2('workbench.action.terminal.createTerminalEditor', 'Create New Terminal in Editor Area'),
		run: async (c, _, args) => {
			function isCreateTerminalOptions(obj: unknown): obj is ICreateTerminalOptions {
				return isObject(obj) && 'location' in obj;
			}
			const options = isCreateTerminalOptions(args) ? args : { location: TerminalLocation.Editor };
			const instance = await c.service.createTerminal(options);
			await instance.focusWhenReady();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.CreateTerminalEditorSameGroup,
		title: localize2('workbench.action.terminal.createTerminalEditor', 'Create New Terminal in Editor Area'),
		f1: false,
		run: async (c, accessor, args) => {
			// Force the editor into the same editor group if it's locked. This command is only ever
			// called when a terminal is the active editor
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const instance = await c.service.createTerminal({
				location: {
					viewColumn: editorGroupToColumn(editorGroupsService, editorGroupsService.activeGroup),
				}
			});
			await instance.focusWhenReady();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.CreateTerminalEditorSide,
		title: localize2('workbench.action.terminal.createTerminalEditorSide', 'Create New Terminal in Editor Area to the Side'),
		run: async (c) => {
			const instance = await c.service.createTerminal({
				location: { viewColumn: SIDE_GROUP }
			});
			await instance.focusWhenReady();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.NewInNewWindow,
		title: terminalStrings.newInNewWindow,
		precondition: sharedWhenClause.terminalAvailable,
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Backquote,
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyMod.Alt | KeyCode.Backquote },
			weight: KeybindingWeight.WorkbenchContrib
		},
		run: async (c) => {
			const instance = await c.service.createTerminal({
				location: {
					viewColumn: AUX_WINDOW_GROUP,
					auxiliary: { compact: true },
				},
			});
			await instance.focusWhenReady();
		}
	});

	registerContextualInstanceAction({
		id: TerminalCommandId.MoveToEditor,
		title: terminalStrings.moveToEditor,
		precondition: sharedWhenClause.terminalAvailable_and_opened,
		activeInstanceType: 'view',
		run: (instance, c) => c.service.moveToEditor(instance),
		runAfter: (instances) => instances.at(-1)?.focus()
	});

	registerContextualInstanceAction({
		id: TerminalCommandId.MoveIntoNewWindow,
		title: terminalStrings.moveIntoNewWindow,
		precondition: sharedWhenClause.terminalAvailable_and_opened,
		run: (instance, c) => c.service.moveIntoNewEditor(instance),
		runAfter: (instances) => instances.at(-1)?.focus()
	});

	registerTerminalAction({
		id: TerminalCommandId.MoveToTerminalPanel,
		title: terminalStrings.moveToTerminalPanel,
		precondition: sharedWhenClause.terminalAvailable_and_editorActive,
		run: (c, _, args) => {
			const source = toOptionalUri(args) ?? c.editorService.activeInstance;
			if (source) {
				c.service.moveToTerminalView(source);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusPreviousPane,
		title: localize2('workbench.action.terminal.focusPreviousPane', 'Focus Previous Terminal in Terminal Group'),
		keybinding: {
			primary: KeyMod.Alt | KeyCode.LeftArrow,
			secondary: [KeyMod.Alt | KeyCode.UpArrow],
			mac: {
				primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.LeftArrow,
				secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.UpArrow]
			},
			when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.splitTerminalActive),
			// Should win over send sequence commands https://github.com/microsoft/vscode/issues/259326
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: async (c) => {
			c.groupService.activeGroup?.focusPreviousPane();
			await c.groupService.showPanel(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusNextPane,
		title: localize2('workbench.action.terminal.focusNextPane', 'Focus Next Terminal in Terminal Group'),
		keybinding: {
			primary: KeyMod.Alt | KeyCode.RightArrow,
			secondary: [KeyMod.Alt | KeyCode.DownArrow],
			mac: {
				primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.RightArrow,
				secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.DownArrow]
			},
			when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.splitTerminalActive),
			// Should win over send sequence commands https://github.com/microsoft/vscode/issues/259326
			weight: KeybindingWeight.WorkbenchContrib + 1
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: async (c) => {
			c.groupService.activeGroup?.focusNextPane();
			await c.groupService.showPanel(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneLeft,
		title: localize2('workbench.action.terminal.resizePaneLeft', 'Resize Terminal Left'),
		keybinding: {
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Left)
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneRight,
		title: localize2('workbench.action.terminal.resizePaneRight', 'Resize Terminal Right'),
		keybinding: {
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Right)
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneUp,
		title: localize2('workbench.action.terminal.resizePaneUp', 'Resize Terminal Up'),
		keybinding: {
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Up)
	});

	registerTerminalAction({
		id: TerminalCommandId.ResizePaneDown,
		title: localize2('workbench.action.terminal.resizePaneDown', 'Resize Terminal Down'),
		keybinding: {
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow },
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (c) => c.groupService.activeGroup?.resizePane(Direction.Down)
	});

	registerTerminalAction({
		id: TerminalCommandId.Focus,
		title: terminalStrings.focus,
		keybinding: {
			when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, accessibleViewOnLastLine, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal)),
			primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: async (c) => {
			const instance = c.service.activeInstance || await c.service.createTerminal({ location: TerminalLocation.Panel });
			if (!instance) {
				return;
			}
			c.service.setActiveInstance(instance);
			focusActiveTerminal(instance, c);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusTabs,
		title: localize2('workbench.action.terminal.focus.tabsView', 'Focus Terminal Tabs View'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus),
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (c) => c.groupService.focusTabs()
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusNext,
		title: localize2('workbench.action.terminal.focusNext', 'Focus Next Terminal Group'),
		precondition: sharedWhenClause.terminalAvailable,
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
		title: localize2('workbench.action.terminal.focusPrevious', 'Focus Previous Terminal Group'),
		precondition: sharedWhenClause.terminalAvailable,
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
		title: localize2('workbench.action.terminal.runSelectedText', 'Run Selected Text In Active Terminal'),
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
			await c.service.revealActiveTerminal(true);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.RunActiveFile,
		title: localize2('workbench.action.terminal.runActiveFile', 'Run Active File In Active Terminal'),
		precondition: sharedWhenClause.terminalAvailable,
		run: async (c, accessor) => {
			const codeEditorService = accessor.get(ICodeEditorService);
			const notificationService = accessor.get(INotificationService);
			const workbenchEnvironmentService = accessor.get(IWorkbenchEnvironmentService);

			const editor = codeEditorService.getActiveCodeEditor();
			if (!editor || !editor.hasModel()) {
				return;
			}

			const instance = await c.service.getActiveOrCreateInstance({ acceptsInput: true });
			const isRemote = instance ? instance.hasRemoteAuthority : (workbenchEnvironmentService.remoteAuthority ? true : false);
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
		title: localize2('workbench.action.terminal.scrollDown', 'Scroll Down (Line)'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow },
			when: sharedWhenClause.focusInAny_and_normalBuffer,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => xterm.scrollDownLine()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollDownPage,
		title: localize2('workbench.action.terminal.scrollDownPage', 'Scroll Down (Page)'),
		keybinding: {
			primary: KeyMod.Shift | KeyCode.PageDown,
			mac: { primary: KeyCode.PageDown },
			when: sharedWhenClause.focusInAny_and_normalBuffer,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => xterm.scrollDownPage()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollToBottom,
		title: localize2('workbench.action.terminal.scrollToBottom', 'Scroll to Bottom'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.End,
			linux: { primary: KeyMod.Shift | KeyCode.End },
			when: sharedWhenClause.focusInAny_and_normalBuffer,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => xterm.scrollToBottom()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollUpLine,
		title: localize2('workbench.action.terminal.scrollUp', 'Scroll Up (Line)'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
			when: sharedWhenClause.focusInAny_and_normalBuffer,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => xterm.scrollUpLine()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollUpPage,
		title: localize2('workbench.action.terminal.scrollUpPage', 'Scroll Up (Page)'),
		f1: true,
		keybinding: {
			primary: KeyMod.Shift | KeyCode.PageUp,
			mac: { primary: KeyCode.PageUp },
			when: sharedWhenClause.focusInAny_and_normalBuffer,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => xterm.scrollUpPage()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ScrollToTop,
		title: localize2('workbench.action.terminal.scrollToTop', 'Scroll to Top'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.Home,
			linux: { primary: KeyMod.Shift | KeyCode.Home },
			when: sharedWhenClause.focusInAny_and_normalBuffer,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => xterm.scrollToTop()
	});

	registerActiveXtermAction({
		id: TerminalCommandId.ClearSelection,
		title: localize2('workbench.action.terminal.clearSelection', 'Clear Selection'),
		keybinding: {
			primary: KeyCode.Escape,
			when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.textSelected, TerminalContextKeys.notFindVisible),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (xterm) => {
			if (xterm.hasSelection()) {
				xterm.clearSelection();
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeIcon,
		title: terminalStrings.changeIcon,
		precondition: sharedWhenClause.terminalAvailable,
		run: (c, _, args: unknown) => getResourceOrActiveInstance(c, args)?.changeIcon()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeIconActiveTab,
		title: terminalStrings.changeIcon,
		f1: false,
		precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
		run: async (c, accessor, args) => {
			let icon: TerminalIcon | undefined;
			if (c.groupService.lastAccessedMenu === 'inline-tab') {
				getResourceOrActiveInstance(c, args)?.changeIcon();
				return;
			}
			for (const terminal of getSelectedViewInstances(accessor) ?? []) {
				icon = await terminal.changeIcon(icon);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeColor,
		title: terminalStrings.changeColor,
		precondition: sharedWhenClause.terminalAvailable,
		run: (c, _, args) => getResourceOrActiveInstance(c, args)?.changeColor()
	});

	registerTerminalAction({
		id: TerminalCommandId.ChangeColorActiveTab,
		title: terminalStrings.changeColor,
		f1: false,
		precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
		run: async (c, accessor, args) => {
			let color: string | undefined;
			let i = 0;
			if (c.groupService.lastAccessedMenu === 'inline-tab') {
				getResourceOrActiveInstance(c, args)?.changeColor();
				return;
			}
			for (const terminal of getSelectedViewInstances(accessor) ?? []) {
				const skipQuickPick = i !== 0;
				// Always show the quickpick on the first iteration
				color = await terminal.changeColor(color, skipQuickPick);
				i++;
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.Rename,
		title: terminalStrings.rename,
		precondition: sharedWhenClause.terminalAvailable,
		run: (c, accessor, args) => renameWithQuickPick(c, accessor, args)
	});

	registerTerminalAction({
		id: TerminalCommandId.RenameActiveTab,
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
		precondition: sharedWhenClause.terminalAvailable_and_singularSelection,
		run: async (c, accessor) => {
			const terminalGroupService = accessor.get(ITerminalGroupService);
			const notificationService = accessor.get(INotificationService);
			const instances = getSelectedViewInstances(accessor);
			const firstInstance = instances?.[0];
			if (!firstInstance) {
				return;
			}

			if (terminalGroupService.lastAccessedMenu === 'inline-tab') {
				return renameWithQuickPick(c, accessor, firstInstance);
			}

			c.editingService.setEditingTerminal(firstInstance);
			c.editingService.setEditable(firstInstance, {
				validationMessage: value => validateTerminalName(value),
				onFinish: async (value, success) => {
					// Cancel editing first as instance.rename will trigger a rerender automatically
					c.editingService.setEditable(firstInstance, null);
					c.editingService.setEditingTerminal(undefined);
					if (success) {
						const promises: Promise<void>[] = [];
						for (const instance of instances) {
							promises.push((async () => {
								await instance.rename(value);
							})());
						}
						try {
							await Promise.all(promises);
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
		title: localize2('workbench.action.terminal.detachSession', 'Detach Session'),
		run: (activeInstance) => activeInstance.detachProcessAndDispose(TerminalExitReason.User)
	});

	registerTerminalAction({
		id: TerminalCommandId.AttachToSession,
		title: localize2('workbench.action.terminal.attachToSession', 'Attach to Session'),
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

	registerActiveInstanceAction({
		id: TerminalCommandId.ScrollToPreviousCommand,
		title: terminalStrings.scrollToPreviousCommand,
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		icon: Codicon.arrowUp,
		menu: [
			{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
				isHiddenByDefault: true
			},
			...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
				id,
				group: '1_shellIntegration',
				order: 4,
				when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
				isHiddenByDefault: true
			})),
		],
		run: (activeInstance) => activeInstance.xterm?.markTracker.scrollToPreviousMark(undefined, undefined, activeInstance.capabilities.has(TerminalCapability.CommandDetection))
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.ScrollToNextCommand,
		title: terminalStrings.scrollToNextCommand,
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		icon: Codicon.arrowDown,
		menu: [
			{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 5,
				when: ContextKeyExpr.equals('view', TERMINAL_VIEW_ID),
				isHiddenByDefault: true
			},
			...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
				id,
				group: '1_shellIntegration',
				order: 5,
				when: ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeTerminal),
				isHiddenByDefault: true
			})),
		],
		run: (activeInstance) => {
			activeInstance.xterm?.markTracker.scrollToNextMark();
			activeInstance.focus();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectToPreviousCommand,
		title: localize2('workbench.action.terminal.selectToPreviousCommand', 'Select to Previous Command'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (activeInstance) => {
			activeInstance.xterm?.markTracker.selectToPreviousMark();
			activeInstance.focus();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SelectToNextCommand,
		title: localize2('workbench.action.terminal.selectToNextCommand', 'Select to Next Command'),
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
			when: TerminalContextKeys.focus,
			weight: KeybindingWeight.WorkbenchContrib
		},
		precondition: sharedWhenClause.terminalAvailable,
		run: (activeInstance) => {
			activeInstance.xterm?.markTracker.selectToNextMark();
			activeInstance.focus();
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.SelectToPreviousLine,
		title: localize2('workbench.action.terminal.selectToPreviousLine', 'Select to Previous Line'),
		precondition: sharedWhenClause.terminalAvailable,
		run: async (xterm, _, instance) => {
			xterm.markTracker.selectToPreviousLine();
			// prefer to call focus on the TerminalInstance for additional accessibility triggers
			(instance || xterm).focus();
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.SelectToNextLine,
		title: localize2('workbench.action.terminal.selectToNextLine', 'Select to Next Line'),
		precondition: sharedWhenClause.terminalAvailable,
		run: async (xterm, _, instance) => {
			xterm.markTracker.selectToNextLine();
			// prefer to call focus on the TerminalInstance for additional accessibility triggers
			(instance || xterm).focus();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.NewWithCwd,
		title: terminalStrings.newWithCwd,
		metadata: {
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
			const cwd = args ? toOptionalString((<{ cwd?: string }>args).cwd) : undefined;
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
		metadata: {
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
		precondition: sharedWhenClause.terminalAvailable,
		f1: false,
		run: async (activeInstance, c, accessor, args) => {
			const notificationService = accessor.get(INotificationService);
			const name = args ? toOptionalString((<{ name?: string }>args).name) : undefined;
			if (!name) {
				notificationService.warn(localize('workbench.action.terminal.renameWithArg.noName', "No name argument provided"));
				return;
			}
			activeInstance.rename(name);
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.Relaunch,
		title: localize2('workbench.action.terminal.relaunch', 'Relaunch Active Terminal'),
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
			const activeInstance = (await c.service.getInstanceHost(options?.location)).activeInstance;
			if (!activeInstance) {
				return;
			}
			const cwd = await getCwdForSplit(activeInstance, workspaceContextService.getWorkspace().folders, commandService, c.configService);
			if (cwd === undefined) {
				return;
			}
			const instance = await c.service.createTerminal({ location: { parentTerminal: activeInstance }, config: options?.config, cwd });
			await focusActiveTerminal(instance, c);
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.SplitActiveTab,
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
			const instances = getSelectedViewInstances(accessor);
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

	registerContextualInstanceAction({
		id: TerminalCommandId.Unsplit,
		title: terminalStrings.unsplit,
		precondition: sharedWhenClause.terminalAvailable,
		run: async (instance, c) => {
			const group = c.groupService.getGroupForInstance(instance);
			if (group && group?.terminalInstances.length > 1) {
				c.groupService.unsplitInstance(instance);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.JoinActiveTab,
		title: localize2('workbench.action.terminal.joinInstance', 'Join Terminals'),
		precondition: ContextKeyExpr.and(sharedWhenClause.terminalAvailable, TerminalContextKeys.tabsSingularSelection.toNegated()),
		run: async (c, accessor) => {
			const instances = getSelectedViewInstances(accessor);
			if (instances && instances.length > 1) {
				c.groupService.joinInstances(instances);
			}
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.Join,
		title: localize2('workbench.action.terminal.join', 'Join Terminals...'),
		precondition: sharedWhenClause.terminalAvailable,
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
		title: localize2('workbench.action.terminal.splitInActiveWorkspace', 'Split Terminal (In Active Workspace)'),
		run: async (instance, c) => {
			const newInstance = await c.service.createTerminal({ location: { parentTerminal: instance } });
			if (newInstance?.target !== TerminalLocation.Editor) {
				await c.groupService.showPanel(true);
			}
		}
	});

	registerActiveXtermAction({
		id: TerminalCommandId.SelectAll,
		title: localize2('workbench.action.terminal.selectAll', 'Select All'),
		precondition: sharedWhenClause.terminalAvailable,
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
		title: localize2('workbench.action.terminal.new', 'Create New Terminal'),
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
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const folders = workspaceContextService.getWorkspace().folders;
			if (eventOrOptions && isMouseEvent(eventOrOptions) && (eventOrOptions.altKey || eventOrOptions.ctrlKey)) {
				await c.service.createTerminal({ location: { splitActiveTerminal: true } });
				return;
			}

			if (c.service.isProcessSupportRegistered) {
				eventOrOptions = !eventOrOptions || isMouseEvent(eventOrOptions) ? {} : eventOrOptions;

				if (isAuxiliaryWindow(getActiveWindow()) && !eventOrOptions.location) {
					eventOrOptions.location = { viewColumn: editorGroupToColumn(editorGroupsService, editorGroupsService.activeGroup) };
				}

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

	async function killInstance(c: ITerminalServicesCollection, instance: ITerminalInstance | undefined): Promise<void> {
		if (!instance) {
			return;
		}
		await c.service.safeDisposeTerminal(instance);
		if (c.groupService.instances.length > 0) {
			await c.groupService.showPanel(true);
		}
	}
	registerTerminalAction({
		id: TerminalCommandId.Kill,
		title: localize2('workbench.action.terminal.kill', 'Kill the Active Terminal Instance'),
		precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
		icon: killTerminalIcon,
		run: async (c) => killInstance(c, c.groupService.activeInstance)
	});
	registerTerminalAction({
		id: TerminalCommandId.KillViewOrEditor,
		title: terminalStrings.kill,
		f1: false, // This is an internal command used for context menus
		precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
		run: async (c) => killInstance(c, c.service.activeInstance)
	});

	registerTerminalAction({
		id: TerminalCommandId.KillAll,
		title: localize2('workbench.action.terminal.killAll', 'Kill All Terminals'),
		precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
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
		title: localize2('workbench.action.terminal.killEditor', 'Kill the Active Terminal in Editor Area'),
		precondition: sharedWhenClause.terminalAvailable,
		keybinding: {
			primary: KeyMod.CtrlCmd | KeyCode.KeyW,
			win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.editorFocus)
		},
		run: (c, accessor) => accessor.get(ICommandService).executeCommand(CLOSE_EDITOR_COMMAND_ID)
	});

	registerTerminalAction({
		id: TerminalCommandId.KillActiveTab,
		title: terminalStrings.kill,
		f1: false,
		precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
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
			const disposePromises: Promise<void>[] = [];
			for (const terminal of getSelectedViewInstances(accessor, true) ?? []) {
				disposePromises.push(c.service.safeDisposeTerminal(terminal));
			}
			await Promise.all(disposePromises);
			c.groupService.focusTabs();
		}
	});

	registerTerminalAction({
		id: TerminalCommandId.FocusHover,
		title: terminalStrings.focusHover,
		precondition: ContextKeyExpr.or(sharedWhenClause.terminalAvailable, TerminalContextKeys.isOpen),
		keybinding: {
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.or(TerminalContextKeys.tabsFocus, TerminalContextKeys.focus)
		},
		run: (c) => c.groupService.focusHover()
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.Clear,
		title: localize2('workbench.action.terminal.clear', 'Clear'),
		precondition: sharedWhenClause.terminalAvailable,
		keybinding: [{
			primary: 0,
			mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
			// Weight is higher than work workbench contributions so the keybinding remains
			// highest priority when chords are registered afterwards
			weight: KeybindingWeight.WorkbenchContrib + 1,
			// Disable the keybinding when accessibility mode is enabled as chords include
			// important screen reader keybindings such as cmd+k, cmd+i to show the hover
			when: ContextKeyExpr.or(ContextKeyExpr.and(TerminalContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()), ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, accessibleViewIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal))),
		}],
		run: (activeInstance) => activeInstance.clearBuffer()
	});

	registerTerminalAction({
		id: TerminalCommandId.SelectDefaultProfile,
		title: localize2('workbench.action.terminal.selectDefaultShell', 'Select Default Profile'),
		run: (c) => c.service.showProfileQuickPick('setDefault')
	});

	registerTerminalAction({
		id: TerminalCommandId.ConfigureTerminalSettings,
		title: localize2('workbench.action.terminal.openSettings', 'Configure Terminal Settings'),
		precondition: sharedWhenClause.terminalAvailable,
		run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@feature:terminal' })
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.SetDimensions,
		title: localize2('workbench.action.terminal.setFixedDimensions', 'Set Fixed Dimensions'),
		precondition: sharedWhenClause.terminalAvailable_and_opened,
		run: (activeInstance) => activeInstance.setFixedDimensions()
	});

	registerContextualInstanceAction({
		id: TerminalCommandId.SizeToContentWidth,
		title: terminalStrings.toggleSizeToContentWidth,
		precondition: sharedWhenClause.terminalAvailable_and_opened,
		keybinding: {
			primary: KeyMod.Alt | KeyCode.KeyZ,
			weight: KeybindingWeight.WorkbenchContrib,
			when: TerminalContextKeys.focus
		},
		run: (instance) => instance.toggleSizeToContentWidth()
	});

	registerTerminalAction({
		id: TerminalCommandId.SwitchTerminal,
		title: localize2('workbench.action.terminal.switchTerminal', 'Switch Terminal'),
		precondition: sharedWhenClause.terminalAvailable,
		run: async (c, accessor, args) => {
			const item = toOptionalString(args);
			if (!item) {
				return;
			}
			if (item === SeparatorSelectOption.text) {
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

function getSelectedViewInstances2(accessor: ServicesAccessor, args?: unknown): ITerminalInstance[] | undefined {
	const terminalService = accessor.get(ITerminalService);
	const result: ITerminalInstance[] = [];
	const context = parseActionArgs(args);
	if (context && context.length > 0) {
		for (const instanceContext of context) {
			const instance = terminalService.getInstanceFromId(instanceContext.instanceId);
			if (instance) {
				result.push(instance);
			}
		}
		if (result.length > 0) {
			return result;
		}
	}
	return undefined;
}

function getSelectedViewInstances(accessor: ServicesAccessor, args?: unknown, args2?: unknown): ITerminalInstance[] | undefined {
	const listService = accessor.get(IListService);
	const terminalGroupService = accessor.get(ITerminalGroupService);
	const result: ITerminalInstance[] = [];

	// Assign list only if it's an instance of TerminalTabList (#234791)
	const list = listService.lastFocusedList instanceof TerminalTabList ? listService.lastFocusedList : undefined;
	// Get selected tab list instance(s)
	const selections = list?.getSelection();
	// Get inline tab instance if there are not tab list selections #196578
	if (terminalGroupService.lastAccessedMenu === 'inline-tab' && !selections?.length) {
		const instance = terminalGroupService.activeInstance;
		return instance ? [terminalGroupService.activeInstance] : undefined;
	}

	if (!list || !selections) {
		return undefined;
	}
	const focused = list.getFocus();

	const viewInstances = terminalGroupService.instances;
	if (focused.length === 1 && !selections.includes(focused[0])) {
		// focused length is always a max of 1
		// if the focused one is not in the selected list, return that item
		result.push(viewInstances[focused[0]]);
		return result;
	}

	// multi-select
	for (const selection of selections) {
		result.push(viewInstances[selection]);
	}
	return result.filter(r => !!r);
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

function isTerminalProfile(obj: unknown): obj is ITerminalProfile {
	return isObject(obj) && 'profileName' in obj;
}

function convertOptionsOrProfileToOptions(optionsOrProfile?: ICreateTerminalOptions | ITerminalProfile): ICreateTerminalOptions | undefined {
	if (isTerminalProfile(optionsOrProfile)) {
		return { config: optionsOrProfile, location: (optionsOrProfile as ICreateTerminalOptions).location };
	}
	return optionsOrProfile;
}

let newWithProfileAction: IDisposable;

export function refreshTerminalActions(detectedProfiles: ITerminalProfile[]): IDisposable {
	const profileEnum = createProfileSchemaEnums(detectedProfiles);
	newWithProfileAction?.dispose();
	// TODO: Use new register function
	newWithProfileAction = registerAction2(class extends Action2 {
		constructor() {
			super({
				id: TerminalCommandId.NewWithProfile,
				title: localize2('workbench.action.terminal.newWithProfile', 'Create New Terminal (With Profile)'),
				f1: true,
				precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.webExtensionContributedProfile),
				metadata: {
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
								},
								location: {
									description: localize('newWithProfile.location', "Where to create the terminal"),
									type: 'string',
									enum: ['view', 'editor'],
									enumDescriptions: [
										localize('newWithProfile.location.view', 'Create the terminal in the terminal view'),
										localize('newWithProfile.location.editor', 'Create the terminal in the editor'),
									]
								}
							}
						}
					}]
				},
			});
		}
		async run(
			accessor: ServicesAccessor,
			eventOrOptionsOrProfile: MouseEvent | ICreateTerminalOptions | ITerminalProfile | { profileName: string; location?: 'view' | 'editor' | unknown } | undefined,
			profile?: ITerminalProfile
		) {
			const c = getTerminalServices(accessor);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const commandService = accessor.get(ICommandService);

			let event: MouseEvent | PointerEvent | KeyboardEvent | undefined;
			let options: ICreateTerminalOptions | undefined;
			let instance: ITerminalInstance | undefined;
			let cwd: string | URI | undefined;

			if (isObject(eventOrOptionsOrProfile) && eventOrOptionsOrProfile && hasKey(eventOrOptionsOrProfile, { profileName: true })) {
				const config = c.profileService.availableProfiles.find(profile => profile.profileName === eventOrOptionsOrProfile.profileName);
				if (!config) {
					throw new Error(`Could not find terminal profile "${eventOrOptionsOrProfile.profileName}"`);
				}
				options = { config };
				function isSimpleArgs(obj: unknown): obj is { profileName: string; location?: 'view' | 'editor' | unknown } {
					return isObject(obj) && 'location' in obj;
				}
				if (isSimpleArgs(eventOrOptionsOrProfile)) {
					switch (eventOrOptionsOrProfile.location) {
						case 'editor': options.location = TerminalLocation.Editor; break;
						case 'view': options.location = TerminalLocation.Panel; break;
					}
				}
			} else if (isMouseEvent(eventOrOptionsOrProfile) || isPointerEvent(eventOrOptionsOrProfile) || isKeyboardEvent(eventOrOptionsOrProfile)) {
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
				const workspace = await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID, [options]);
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
	return newWithProfileAction;
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

	const folderCwdPairs = await Promise.all(folders.map(e => resolveWorkspaceFolderCwd(e, configurationService, configurationResolverService)));
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
	return isAbsolute(resolvedCwdConfig) || resolvedCwdConfig.startsWith(ConfigurationResolverExpression.VARIABLE_LHS)
		? { folder, isAbsolute: true, isOverridden: true, cwd: URI.from({ ...folder.uri, path: resolvedCwdConfig }) }
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

async function focusActiveTerminal(instance: ITerminalInstance | undefined, c: ITerminalServicesCollection): Promise<void> {
	// TODO@meganrogge: Is this the right logic for when instance is undefined?
	if (instance?.target === TerminalLocation.Editor) {
		await c.editorService.revealActiveEditor();
		await instance.focusWhenReady(true);
	} else {
		await c.groupService.showPanel(true);
	}
}

async function renameWithQuickPick(c: ITerminalServicesCollection, accessor: ServicesAccessor, resource?: unknown) {
	let instance: ITerminalInstance | undefined = resource as ITerminalInstance;
	// Check if the 'instance' does not exist or if 'instance.rename' is not defined
	if (!instance || !instance?.rename) {
		// If not, obtain the resource instance using 'getResourceOrActiveInstance'
		instance = getResourceOrActiveInstance(c, resource);
	}

	if (instance) {
		const title = await accessor.get(IQuickInputService).input({
			value: instance.title,
			prompt: localize('workbench.action.terminal.rename.prompt', "Enter terminal name"),
		});
		if (title) {
			instance.rename(title);
		}
	}
}

function toOptionalUri(obj: unknown): URI | undefined {
	return URI.isUri(obj) ? obj : undefined;
}

function toOptionalString(obj: unknown): string | undefined {
	return isString(obj) ? obj : undefined;
}
