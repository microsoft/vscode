/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/debug.contribution';
import 'vs/css!../browser/media/debugHover';
import * as nls from 'vs/nls';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingWeight, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionRegistryExtensions } from 'vs/workbench/common/actions';
import { ShowViewletAction, Extensions as ViewletExtensions, ViewletRegistry, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { TogglePanelAction, Extensions as PanelExtensions, PanelRegistry, PanelDescriptor } from 'vs/workbench/browser/panel';
import { StatusbarItemDescriptor, IStatusbarRegistry, Extensions as StatusExtensions } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { VariablesView } from 'vs/workbench/parts/debug/electron-browser/variablesView';
import { BreakpointsView } from 'vs/workbench/parts/debug/browser/breakpointsView';
import { WatchExpressionsView } from 'vs/workbench/parts/debug/electron-browser/watchExpressionsView';
import { CallStackView } from 'vs/workbench/parts/debug/electron-browser/callStackView';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import {
	IDebugService, VIEWLET_ID, REPL_ID, CONTEXT_IN_DEBUG_MODE, INTERNAL_CONSOLE_OPTIONS_SCHEMA,
	CONTEXT_DEBUG_STATE, VARIABLES_VIEW_ID, CALLSTACK_VIEW_ID, WATCH_VIEW_ID, BREAKPOINTS_VIEW_ID, VIEW_CONTAINER, LOADED_SCRIPTS_VIEW_ID, CONTEXT_LOADED_SCRIPTS_SUPPORTED
} from 'vs/workbench/parts/debug/common/debug';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { DebugEditorModelManager } from 'vs/workbench/parts/debug/browser/debugEditorModelManager';
import {
	StepOverAction, FocusReplAction, StepIntoAction, StepOutAction, StartAction, RestartAction, ContinueAction, StopAction, DisconnectAction, PauseAction, AddFunctionBreakpointAction,
	ConfigureAction, DisableAllBreakpointsAction, EnableAllBreakpointsAction, RemoveAllBreakpointsAction, RunAction, ReapplyBreakpointsAction, SelectAndStartAction, TerminateThreadAction
} from 'vs/workbench/parts/debug/browser/debugActions';
import { DebugToolbar } from 'vs/workbench/parts/debug/browser/debugToolbar';
import * as service from 'vs/workbench/parts/debug/electron-browser/debugService';
import { DebugContentProvider } from 'vs/workbench/parts/debug/browser/debugContentProvider';
import 'vs/workbench/parts/debug/electron-browser/debugEditorContribution';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { registerCommands, ADD_CONFIGURATION_ID, TOGGLE_INLINE_BREAKPOINT_ID } from 'vs/workbench/parts/debug/browser/debugCommands';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { StatusBarColorProvider } from 'vs/workbench/parts/debug/browser/statusbarColorProvider';
import { ViewsRegistry } from 'vs/workbench/common/views';
import { isMacintosh } from 'vs/base/common/platform';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { DebugViewlet } from 'vs/workbench/parts/debug/browser/debugViewlet';
import { Repl, ClearReplAction } from 'vs/workbench/parts/debug/electron-browser/repl';
import { DebugQuickOpenHandler } from 'vs/workbench/parts/debug/browser/debugQuickOpen';
import { DebugStatus } from 'vs/workbench/parts/debug/browser/debugStatus';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { launchSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { LoadedScriptsView } from 'vs/workbench/parts/debug/browser/loadedScriptsView';
import { TOGGLE_LOG_POINT_ID, TOGGLE_CONDITIONAL_BREAKPOINT_ID, TOGGLE_BREAKPOINT_ID } from 'vs/workbench/parts/debug/browser/debugEditorActions';

class OpenDebugViewletAction extends ShowViewletAction {
	public static readonly ID = VIEWLET_ID;
	public static readonly LABEL = nls.localize('toggleDebugViewlet', "Show Debug");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPartService partService: IPartService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService, partService);
	}
}

class OpenDebugPanelAction extends TogglePanelAction {
	public static readonly ID = 'workbench.debug.action.toggleRepl';
	public static readonly LABEL = nls.localize('toggleDebugPanel', "Debug Console");

	constructor(
		id: string,
		label: string,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService
	) {
		super(id, label, REPL_ID, panelService, partService);
	}
}

// register viewlet
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	DebugViewlet,
	VIEWLET_ID,
	nls.localize('debug', "Debug"),
	'debug',
	3
));

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_D
};
const openPanelKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Y
};

// register repl panel
Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
	Repl,
	REPL_ID,
	nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, 'Debug Console'),
	'repl',
	30,
	OpenDebugPanelAction.ID
));
Registry.as<PanelRegistry>(PanelExtensions.Panels).setDefaultPanelId(REPL_ID);

// Register default debug views
ViewsRegistry.registerViews([{ id: VARIABLES_VIEW_ID, name: nls.localize('variables', "Variables"), ctor: VariablesView, order: 10, weight: 40, container: VIEW_CONTAINER, canToggleVisibility: true, focusCommand: { id: 'workbench.debug.action.focusVariablesView' } }]);
ViewsRegistry.registerViews([{ id: WATCH_VIEW_ID, name: nls.localize('watch', "Watch"), ctor: WatchExpressionsView, order: 20, weight: 10, container: VIEW_CONTAINER, canToggleVisibility: true, focusCommand: { id: 'workbench.debug.action.focusWatchView' } }]);
ViewsRegistry.registerViews([{ id: CALLSTACK_VIEW_ID, name: nls.localize('callStack', "Call Stack"), ctor: CallStackView, order: 30, weight: 30, container: VIEW_CONTAINER, canToggleVisibility: true, focusCommand: { id: 'workbench.debug.action.focusCallStackView' } }]);
ViewsRegistry.registerViews([{ id: BREAKPOINTS_VIEW_ID, name: nls.localize('breakpoints', "Breakpoints"), ctor: BreakpointsView, order: 40, weight: 20, container: VIEW_CONTAINER, canToggleVisibility: true, focusCommand: { id: 'workbench.debug.action.focusBreakpointsView' } }]);
ViewsRegistry.registerViews([{ id: LOADED_SCRIPTS_VIEW_ID, name: nls.localize('loadedScripts', "Loaded Scripts"), ctor: LoadedScriptsView, order: 35, weight: 5, container: VIEW_CONTAINER, canToggleVisibility: true, collapsed: true, when: CONTEXT_LOADED_SCRIPTS_SUPPORTED }]);

// register action to open viewlet
const registry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionRegistryExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDebugPanelAction, OpenDebugPanelAction.ID, OpenDebugPanelAction.LABEL, openPanelKb), 'View: Debug Console', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDebugViewletAction, OpenDebugViewletAction.ID, OpenDebugViewletAction.LABEL, openViewletKb), 'View: Show Debug', nls.localize('view', "View"));

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugEditorModelManager, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugToolbar, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugContentProvider, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(StatusBarColorProvider, LifecyclePhase.Eventually);

const debugCategory = nls.localize('debugCategory', "Debug");

registry.registerWorkbenchAction(new SyncActionDescriptor(StartAction, StartAction.ID, StartAction.LABEL, { primary: KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE.toNegated()), 'Debug: Start Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepOverAction, StepOverAction.ID, StepOverAction.LABEL, { primary: KeyCode.F10 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Step Over', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepIntoAction, StepIntoAction.ID, StepIntoAction.LABEL, { primary: KeyCode.F11 }, CONTEXT_IN_DEBUG_MODE, KeybindingWeight.WorkbenchContrib + 1), 'Debug: Step Into', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepOutAction, StepOutAction.ID, StepOutAction.LABEL, { primary: KeyMod.Shift | KeyCode.F11 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Step Out', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RestartAction, RestartAction.ID, RestartAction.LABEL, { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Restart', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StopAction, StopAction.ID, StopAction.LABEL, { primary: KeyMod.Shift | KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Stop', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(DisconnectAction, DisconnectAction.ID, DisconnectAction.LABEL), 'Debug: Disconnect', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ContinueAction, ContinueAction.ID, ContinueAction.LABEL, { primary: KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Continue', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(PauseAction, PauseAction.ID, PauseAction.LABEL, { primary: KeyCode.F6 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Pause', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(TerminateThreadAction, TerminateThreadAction.ID, TerminateThreadAction.LABEL, undefined, CONTEXT_IN_DEBUG_MODE), 'Debug: Terminate Thread', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureAction, ConfigureAction.ID, ConfigureAction.LABEL), 'Debug: Open launch.json', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(AddFunctionBreakpointAction, AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL), 'Debug: Add Function Breakpoint', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReapplyBreakpointsAction, ReapplyBreakpointsAction.ID, ReapplyBreakpointsAction.LABEL), 'Debug: Reapply All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RunAction, RunAction.ID, RunAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.F5, mac: { primary: KeyMod.WinCtrl | KeyCode.F5 } }, CONTEXT_IN_DEBUG_MODE.toNegated()), 'Debug: Start Without Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveAllBreakpointsAction, RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL), 'Debug: Remove All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(EnableAllBreakpointsAction, EnableAllBreakpointsAction.ID, EnableAllBreakpointsAction.LABEL), 'Debug: Enable All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(DisableAllBreakpointsAction, DisableAllBreakpointsAction.ID, DisableAllBreakpointsAction.LABEL), 'Debug: Disable All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusReplAction, FocusReplAction.ID, FocusReplAction.LABEL), 'Debug: Focus on Debug Console View', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(SelectAndStartAction, SelectAndStartAction.ID, SelectAndStartAction.LABEL), 'Debug: Select and Start Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearReplAction, ClearReplAction.ID, ClearReplAction.LABEL), 'Debug: Clear Console', debugCategory);

// Register Quick Open
(Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		DebugQuickOpenHandler,
		DebugQuickOpenHandler.ID,
		'debug ',
		'inLaunchConfigurationsPicker',
		nls.localize('debugCommands', "Debug Configuration")
	)
);

// register service
registerSingleton(IDebugService, service.DebugService);

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'debug',
	order: 20,
	title: nls.localize('debugConfigurationTitle', "Debug"),
	type: 'object',
	properties: {
		'debug.allowBreakpointsEverywhere': {
			type: 'boolean',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'allowBreakpointsEverywhere' }, "Allow setting breakpoints in any file."),
			default: false
		},
		'debug.openExplorerOnEnd': {
			type: 'boolean',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'openExplorerOnEnd' }, "Automatically open the explorer view at the end of a debug session."),
			default: false
		},
		'debug.inlineValues': {
			type: 'boolean',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'inlineValues' }, "Show variable values inline in editor while debugging."),
			default: false
		},
		'debug.toolBarLocation': {
			enum: ['floating', 'docked', 'hidden'],
			markdownDescription: nls.localize({ comment: ['This is the description for a setting'], key: 'toolBarLocation' }, "Controls the location of the debug toolbar. Either `floating` in all views, `docked` in the debug view, or `hidden`."),
			default: 'floating'
		},
		'debug.showInStatusBar': {
			enum: ['never', 'always', 'onFirstSessionStart'],
			enumDescriptions: [nls.localize('never', "Never show debug in status bar"), nls.localize('always', "Always show debug in status bar"), nls.localize('onFirstSessionStart', "Show debug in status bar only after debug was started for the first time")],
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'showInStatusBar' }, "Controls when the debug status bar should be visible."),
			default: 'onFirstSessionStart'
		},
		'debug.internalConsoleOptions': INTERNAL_CONSOLE_OPTIONS_SCHEMA,
		'debug.openDebug': {
			enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart', 'openOnDebugBreak'],
			default: 'openOnSessionStart',
			description: nls.localize('openDebug', "Controls when the debug view should open.")
		},
		'debug.enableAllHovers': {
			type: 'boolean',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'enableAllHovers' }, "Controls whether the non-debug hovers should be enabled while debugging. When enabled the hover providers will be called to provide a hover. Regular hovers will not be shown even if this setting is enabled."),
			default: false
		},
		'launch': {
			type: 'object',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'launch' }, "Global debug launch configuration. Should be used as an alternative to 'launch.json' that is shared across workspaces."),
			default: { configurations: [], compounds: [] },
			$ref: launchSchemaId
		}
	}
});

registerCommands();

// Register Debug Status
const statusBar = Registry.as<IStatusbarRegistry>(StatusExtensions.Statusbar);
statusBar.registerStatusbarItem(new StatusbarItemDescriptor(DebugStatus, StatusbarAlignment.LEFT, 30 /* Low Priority */));

// View menu

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '3_views',
	command: {
		id: VIEWLET_ID,
		title: nls.localize({ key: 'miViewDebug', comment: ['&& denotes a mnemonic'] }, "&&Debug")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '4_panels',
	command: {
		id: OpenDebugPanelAction.ID,
		title: nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "De&&bug Console")
	},
	order: 2
});

// Debug menu

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '1_debug',
	command: {
		id: StartAction.ID,
		title: nls.localize({ key: 'miStartDebugging', comment: ['&& denotes a mnemonic'] }, "&&Start Debugging")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '1_debug',
	command: {
		id: RunAction.ID,
		title: nls.localize({ key: 'miStartWithoutDebugging', comment: ['&& denotes a mnemonic'] }, "Start &&Without Debugging")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '1_debug',
	command: {
		id: StopAction.ID,
		title: nls.localize({ key: 'miStopDebugging', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging"),
		precondition: CONTEXT_IN_DEBUG_MODE
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '1_debug',
	command: {
		id: RestartAction.ID,
		title: nls.localize({ key: 'miRestart Debugging', comment: ['&& denotes a mnemonic'] }, "&&Restart Debugging"),
		precondition: CONTEXT_IN_DEBUG_MODE
	},
	order: 4
});

// Configuration
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '2_configuration',
	command: {
		id: ConfigureAction.ID,
		title: nls.localize({ key: 'miOpenConfigurations', comment: ['&& denotes a mnemonic'] }, "Open &&Configurations")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '2_configuration',
	command: {
		id: ADD_CONFIGURATION_ID,
		title: nls.localize({ key: 'miAddConfiguration', comment: ['&& denotes a mnemonic'] }, "A&&dd Configuration...")
	},
	order: 2
});

// Step Commands
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '3_step',
	command: {
		id: StepOverAction.ID,
		title: nls.localize({ key: 'miStepOver', comment: ['&& denotes a mnemonic'] }, "Step &&Over"),
		precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '3_step',
	command: {
		id: StepIntoAction.ID,
		title: nls.localize({ key: 'miStepInto', comment: ['&& denotes a mnemonic'] }, "Step &&Into"),
		precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '3_step',
	command: {
		id: StepOutAction.ID,
		title: nls.localize({ key: 'miStepOut', comment: ['&& denotes a mnemonic'] }, "Step O&&ut"),
		precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '3_step',
	command: {
		id: ContinueAction.ID,
		title: nls.localize({ key: 'miContinue', comment: ['&& denotes a mnemonic'] }, "&&Continue"),
		precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
	},
	order: 4
});

// New Breakpoints
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '4_new_breakpoint',
	command: {
		id: TOGGLE_BREAKPOINT_ID,
		title: nls.localize({ key: 'miToggleBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Breakpoint")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarNewBreakpointMenu, {
	group: '1_breakpoints',
	command: {
		id: TOGGLE_CONDITIONAL_BREAKPOINT_ID,
		title: nls.localize({ key: 'miConditionalBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Conditional Breakpoint...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarNewBreakpointMenu, {
	group: '1_breakpoints',
	command: {
		id: TOGGLE_INLINE_BREAKPOINT_ID,
		title: nls.localize({ key: 'miInlineBreakpoint', comment: ['&& denotes a mnemonic'] }, "Inline Breakp&&oint")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarNewBreakpointMenu, {
	group: '1_breakpoints',
	command: {
		id: AddFunctionBreakpointAction.ID,
		title: nls.localize({ key: 'miFunctionBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Function Breakpoint...")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarNewBreakpointMenu, {
	group: '1_breakpoints',
	command: {
		id: TOGGLE_LOG_POINT_ID,
		title: nls.localize({ key: 'miLogPoint', comment: ['&& denotes a mnemonic'] }, "&&Logpoint...")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '4_new_breakpoint',
	title: nls.localize({ key: 'miNewBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&New Breakpoint"),
	submenu: MenuId.MenubarNewBreakpointMenu,
	order: 2
});

// Modify Breakpoints
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '5_breakpoints',
	command: {
		id: EnableAllBreakpointsAction.ID,
		title: nls.localize({ key: 'miEnableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "&&Enable All Breakpoints")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '5_breakpoints',
	command: {
		id: DisableAllBreakpointsAction.ID,
		title: nls.localize({ key: 'miDisableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Disable A&&ll Breakpoints")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: '5_breakpoints',
	command: {
		id: RemoveAllBreakpointsAction.ID,
		title: nls.localize({ key: 'miRemoveAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Remove &&All Breakpoints")
	},
	order: 3
});

// Install Debuggers
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
	group: 'z_install',
	command: {
		id: 'debug.installAdditionalDebuggers',
		title: nls.localize({ key: 'miInstallAdditionalDebuggers', comment: ['&& denotes a mnemonic'] }, "&&Install Additional Debuggers...")
	},
	order: 1
});

// Touch Bar
if (isMacintosh) {

	const registerTouchBarEntry = (id: string, title: string, order, when: ContextKeyExpr, icon: string) => {
		MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
			command: {
				id, title, iconLocation: { dark: URI.parse(require.toUrl(`vs/workbench/parts/debug/electron-browser/media/${icon}`)) }
			},
			when,
			group: '9_debug',
			order
		});
	};

	registerTouchBarEntry(StartAction.ID, StartAction.LABEL, 0, CONTEXT_IN_DEBUG_MODE.toNegated(), 'continue-tb.png');
	registerTouchBarEntry(ContinueAction.ID, ContinueAction.LABEL, 0, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), 'continue-tb.png');
	registerTouchBarEntry(PauseAction.ID, PauseAction.LABEL, 1, ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.notEquals('debugState', 'stopped')), 'pause-tb.png');
	registerTouchBarEntry(StepOverAction.ID, StepOverAction.LABEL, 2, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), 'stepover-tb.png');
	registerTouchBarEntry(StepIntoAction.ID, StepIntoAction.LABEL, 3, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), 'stepinto-tb.png');
	registerTouchBarEntry(StepOutAction.ID, StepOutAction.LABEL, 4, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), 'stepout-tb.png');
	registerTouchBarEntry(RestartAction.ID, RestartAction.LABEL, 5, CONTEXT_IN_DEBUG_MODE, 'restart-tb.png');
	registerTouchBarEntry(StopAction.ID, StopAction.LABEL, 6, CONTEXT_IN_DEBUG_MODE, 'stop-tb.png');
}
