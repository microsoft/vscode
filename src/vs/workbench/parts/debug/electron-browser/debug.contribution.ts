/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/debug.contribution';
import 'vs/css!../browser/media/debugHover';
import nls = require('vs/nls');
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import platform = require('vs/platform/platform');
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KbExpr, IKeybindings} from 'vs/platform/keybinding/common/keybinding';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import wbaregistry = require('vs/workbench/common/actionRegistry');
import viewlet = require('vs/workbench/browser/viewlet');
import panel = require('vs/workbench/browser/panel');
import {DebugViewRegistry} from 'vs/workbench/parts/debug/browser/debugViewRegistry';
import {VariablesView, WatchExpressionsView, CallStackView, BreakpointsView} from 'vs/workbench/parts/debug/electron-browser/debugViews';
import wbext = require('vs/workbench/common/contributions');
import * as debug from 'vs/workbench/parts/debug/common/debug';
import {DebugEditorModelManager} from 'vs/workbench/parts/debug/browser/debugEditorModelManager';
import {ToggleBreakpointAction, EditorConditionalBreakpointAction, ShowDebugHoverAction, SelectionToReplAction, RunToCursorAction, StepOverDebugAction,
	StepIntoDebugAction, StepOutDebugAction, StartDebugAction, StepBackDebugAction, RestartDebugAction, ContinueAction, StopDebugAction, PauseAction, AddFunctionBreakpointAction,
	ConfigureAction, ToggleReplAction, DisableAllBreakpointsAction, EnableAllBreakpointsAction, RemoveAllBreakpointsAction, RunAction, ReapplyBreakpointsAction} from 'vs/workbench/parts/debug/browser/debugActions';
import debugwidget = require('vs/workbench/parts/debug/browser/debugActionsWidget');
import service = require('vs/workbench/parts/debug/electron-browser/debugService');
import {DebugEditorContribution} from 'vs/workbench/parts/debug/electron-browser/debugEditorContribution';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

import IDebugService = debug.IDebugService;

class OpenDebugViewletAction extends viewlet.ToggleViewletAction {
	public static ID = debug.VIEWLET_ID;
	public static LABEL = nls.localize('toggleDebugViewlet', "Show Debug");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, debug.VIEWLET_ID, viewletService, editorService);
	}
}

EditorBrowserRegistry.registerEditorContribution(DebugEditorContribution);
CommonEditorRegistry.registerEditorAction(new ToggleBreakpointAction());
CommonEditorRegistry.registerEditorAction(new ShowDebugHoverAction());
CommonEditorRegistry.registerEditorAction(new EditorConditionalBreakpointAction());
CommonEditorRegistry.registerEditorAction(new SelectionToReplAction());
CommonEditorRegistry.registerEditorAction(new RunToCursorAction());

// register viewlet
(<viewlet.ViewletRegistry>platform.Registry.as(viewlet.Extensions.Viewlets)).registerViewlet(new viewlet.ViewletDescriptor(
	'vs/workbench/parts/debug/browser/debugViewlet',
	'DebugViewlet',
	debug.VIEWLET_ID,
	nls.localize('debug', "Debug"),
	'debug',
	40
));

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_D
};

// register repl panel
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/debug/electron-browser/repl',
	'Repl',
	debug.REPL_ID,
	nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, 'Debug Console'),
	'repl'
));
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).setDefaultPanelId(debug.REPL_ID);

// Register default debug views
DebugViewRegistry.registerDebugView(VariablesView, 10);
DebugViewRegistry.registerDebugView(WatchExpressionsView, 20);
DebugViewRegistry.registerDebugView(CallStackView, 30);
DebugViewRegistry.registerDebugView(BreakpointsView, 40);

// register action to open viewlet
const registry = (<wbaregistry.IWorkbenchActionRegistry>platform.Registry.as(wbaregistry.Extensions.WorkbenchActions));
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDebugViewletAction, OpenDebugViewletAction.ID, OpenDebugViewletAction.LABEL, openViewletKb), 'View: Show Debug', nls.localize('view', "View"));

(<wbext.IWorkbenchContributionsRegistry>platform.Registry.as(wbext.Extensions.Workbench)).registerWorkbenchContribution(DebugEditorModelManager);
(<wbext.IWorkbenchContributionsRegistry>platform.Registry.as(wbext.Extensions.Workbench)).registerWorkbenchContribution(debugwidget.DebugActionsWidget);

const debugCategory = nls.localize('debugCategory', "Debug");
registry.registerWorkbenchAction(new SyncActionDescriptor(
	StartDebugAction, StartDebugAction.ID, StartDebugAction.LABEL, { primary: KeyCode.F5 }, KbExpr.not(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Start Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepOverDebugAction, StepOverDebugAction.ID, StepOverDebugAction.LABEL, { primary: KeyCode.F10 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Step Over', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepIntoDebugAction, StepIntoDebugAction.ID, StepIntoDebugAction.LABEL, { primary: KeyCode.F11 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE), KeybindingsRegistry.WEIGHT.workbenchContrib(1)), 'Debug: Step Into', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepOutDebugAction, StepOutDebugAction.ID, StepOutDebugAction.LABEL, { primary: KeyMod.Shift | KeyCode.F11 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Step Out', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StepBackDebugAction, StepBackDebugAction.ID, StepBackDebugAction.LABEL, { primary: KeyMod.Shift | KeyCode.F10 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Step Back', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RestartDebugAction, RestartDebugAction.ID, RestartDebugAction.LABEL, { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.F5 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Restart', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(StopDebugAction, StopDebugAction.ID, StopDebugAction.LABEL, { primary: KeyMod.Shift | KeyCode.F5 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Stop', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ContinueAction, ContinueAction.ID, ContinueAction.LABEL, { primary: KeyCode.F5 }, KbExpr.has(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Continue', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(PauseAction, PauseAction.ID, PauseAction.LABEL), 'Debug: Pause', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureAction, ConfigureAction.ID, ConfigureAction.LABEL), 'Debug: Open launch.json', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleReplAction, ToggleReplAction.ID, ToggleReplAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Y, }), 'Debug: Debug Console', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(AddFunctionBreakpointAction, AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL), 'Debug: Add Function Breakpoint', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReapplyBreakpointsAction, ReapplyBreakpointsAction.ID, ReapplyBreakpointsAction.LABEL), 'Debug: Reapply All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RunAction, RunAction.ID, RunAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.F5 }, KbExpr.not(debug.CONTEXT_IN_DEBUG_MODE)), 'Debug: Start Without Debugging', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveAllBreakpointsAction, RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL), 'Debug: Remove All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(EnableAllBreakpointsAction, EnableAllBreakpointsAction.ID, EnableAllBreakpointsAction.LABEL), 'Debug: Enable All Breakpoints', debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(DisableAllBreakpointsAction, DisableAllBreakpointsAction.ID, DisableAllBreakpointsAction.LABEL), 'Debug: Disable All Breakpoints', debugCategory);

KeybindingsRegistry.registerCommandDesc({
	id: '_workbench.startDebug',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor, configuration: any) {
		const debugService = accessor.get(debug.IDebugService);
		if (typeof configuration === 'string') {
			const configurationManager = debugService.getConfigurationManager();
			return configurationManager.setConfiguration(configuration)
				.then(() => {
					return configurationManager.configurationName ? debugService.createSession(false)
						: TPromise.wrapError(new Error(nls.localize('launchConfigDoesNotExist', "Launch configuration '{0}' does not exist.", configuration)));
				});
		}

		const noDebug = configuration && !!configuration.noDebug;
		return debugService.createSession(noDebug, configuration);
	},
	when: KbExpr.not(debug.CONTEXT_IN_DEBUG_MODE),
	primary: undefined
});

// register service
registerSingleton(IDebugService, service.DebugService);
