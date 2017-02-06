/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/debug.contribution';
import 'vs/css!../browser/media/debugHover';
import * as nls from 'vs/nls';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IKeybindings } from 'vs/platform/keybinding/common/keybinding';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionRegistryExtensions } from 'vs/workbench/common/actionRegistry';
import { ToggleViewletAction, Extensions as ViewletExtensions, ViewletRegistry, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { TogglePanelAction, Extensions as PanelExtensions, PanelRegistry, PanelDescriptor } from 'vs/workbench/browser/panel';
import { DebugViewRegistry } from 'vs/workbench/parts/debug/browser/debugViewRegistry';
import { VariablesView, WatchExpressionsView, CallStackView, BreakpointsView } from 'vs/workbench/parts/debug/electron-browser/debugViews';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IDebugService, VIEWLET_ID, REPL_ID, CONTEXT_NOT_IN_DEBUG_MODE, CONTEXT_IN_DEBUG_MODE } from 'vs/workbench/parts/debug/common/debug';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { DebugEditorModelManager } from 'vs/workbench/parts/debug/browser/debugEditorModelManager';
import {
	StepOverAction, ClearReplAction, FocusReplAction, StepIntoAction, StepOutAction, StartAction, RestartAction, ContinueAction, StopAction, DisconnectAction, PauseAction, AddFunctionBreakpointAction,
	ConfigureAction, DisableAllBreakpointsAction, EnableAllBreakpointsAction, RemoveAllBreakpointsAction, RunAction, ReapplyBreakpointsAction
} from 'vs/workbench/parts/debug/browser/debugActions';
import { DebugActionsWidget } from 'vs/workbench/parts/debug/browser/debugActionsWidget';
import * as service from 'vs/workbench/parts/debug/electron-browser/debugService';
import { DebugContentProvider } from 'vs/workbench/parts/debug/browser/debugContentProvider';
import 'vs/workbench/parts/debug/electron-browser/debugEditorContribution';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';


class OpenDebugViewletAction extends ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = nls.localize('toggleDebugViewlet', "Show Debug");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

class OpenDebugPanelAction extends TogglePanelAction {
	public static ID = 'workbench.debug.action.toggleRepl';
	public static LABEL = nls.localize('toggleDebugPanel', "Debug Console");

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
	'vs/workbench/parts/debug/browser/debugViewlet',
	'DebugViewlet',
	VIEWLET_ID,
	nls.localize('debug', "Debug"),
	'debug',
	40
));

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_D
};
const openPanelKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Y
};

// register repl panel
Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
	'vs/workbench/parts/debug/electron-browser/repl',
	'Repl',
	REPL_ID,
	nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, 'Debug Console'),
	'repl',
	30,
	OpenDebugPanelAction.ID
));
Registry.as<PanelRegistry>(PanelExtensions.Panels).setDefaultPanelId(REPL_ID);

// Register default debug views
DebugViewRegistry.registerDebugView(VariablesView, 10);
DebugViewRegistry.registerDebugView(WatchExpressionsView, 20);
DebugViewRegistry.registerDebugView(CallStackView, 30);
DebugViewRegistry.registerDebugView(BreakpointsView, 40);

// register action to open viewlet
const registry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionRegistryExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDebugPanelAction, OpenDebugPanelAction.ID, OpenDebugPanelAction.LABEL, openPanelKb), 'View: Debug Console', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDebugViewletAction, OpenDebugViewletAction.ID, OpenDebugViewletAction.LABEL, openViewletKb), 'View: Show Debug', nls.localize('view', "View"));

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugEditorModelManager);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugActionsWidget);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugContentProvider);

const debugCategory = nls.localize('debugCategory', "Debug");
registry.registerWorkbenchAction(new SyncActionDescriptor(
	StartAction, StartAction.ID, StartAction.LABEL, { primary: KeyCode.F5 }, CONTEXT_NOT_IN_DEBUG_MODE), 'Debug: Start Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepOverAction, StepOverAction.ID, StepOverAction.LABEL, { primary: KeyCode.F10 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Step Over', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepIntoAction, StepIntoAction.ID, StepIntoAction.LABEL, { primary: KeyCode.F11 }, CONTEXT_IN_DEBUG_MODE, KeybindingsRegistry.WEIGHT.workbenchContrib(1)), 'Debug: Step Into', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepOutAction, StepOutAction.ID, StepOutAction.LABEL, { primary: KeyMod.Shift | KeyCode.F11 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Step Out', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RestartAction, RestartAction.ID, RestartAction.LABEL, { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Restart', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StopAction, StopAction.ID, StopAction.LABEL, { primary: KeyMod.Shift | KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Stop', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(DisconnectAction, DisconnectAction.ID, DisconnectAction.LABEL), 'Debug: Disconnect', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ContinueAction, ContinueAction.ID, ContinueAction.LABEL, { primary: KeyCode.F5 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Continue', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(PauseAction, PauseAction.ID, PauseAction.LABEL, { primary: KeyCode.F6 }, CONTEXT_IN_DEBUG_MODE), 'Debug: Pause', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureAction, ConfigureAction.ID, ConfigureAction.LABEL), 'Debug: Open launch.json', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(AddFunctionBreakpointAction, AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL), 'Debug: Add Function Breakpoint', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReapplyBreakpointsAction, ReapplyBreakpointsAction.ID, ReapplyBreakpointsAction.LABEL), 'Debug: Reapply All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RunAction, RunAction.ID, RunAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.F5 }, CONTEXT_NOT_IN_DEBUG_MODE), 'Debug: Start Without Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveAllBreakpointsAction, RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL), 'Debug: Remove All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(EnableAllBreakpointsAction, EnableAllBreakpointsAction.ID, EnableAllBreakpointsAction.LABEL), 'Debug: Enable All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(DisableAllBreakpointsAction, DisableAllBreakpointsAction.ID, DisableAllBreakpointsAction.LABEL), 'Debug: Disable All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearReplAction, ClearReplAction.ID, ClearReplAction.LABEL), 'Debug: Clear Debug Console', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusReplAction, FocusReplAction.ID, FocusReplAction.LABEL), 'Debug: Focus Debug Console', debugCategory);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: '_workbench.startDebug',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor, configurationOrName: any) {
		const debugService = accessor.get(IDebugService);
		if (!configurationOrName) {
			configurationOrName = debugService.getViewModel().selectedConfigurationName;
		}

		return debugService.createProcess(configurationOrName);
	},
	when: CONTEXT_NOT_IN_DEBUG_MODE,
	primary: undefined
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.customDebugRequest',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor, request: string, requestArgs: any) {
		const process = accessor.get(IDebugService).getViewModel().focusedProcess;
		if (process) {
			return process.session.custom(request, requestArgs);
		}

		return undefined;
	},
	when: CONTEXT_IN_DEBUG_MODE,
	primary: undefined
});

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
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'allowBreakpointsEverywhere' }, "Allows setting breakpoint in any file"),
			default: false
		},
		'debug.openExplorerOnEnd': {
			type: 'boolean',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'openExplorerOnEnd' }, "Automatically open explorer view on the end of a debug session"),
			default: false
		},
		'debug.inlineValues': {
			type: 'boolean',
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'inlineValues' }, "Show variable values inline in editor while debugging"),
			default: false
		}
	}
});
