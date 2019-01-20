/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import * as lifecycle from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { IDebugService, State, IDebugSession, IThread, IEnablement, IBreakpoint, IStackFrame, REPL_ID }
	from 'vs/workbench/parts/debug/common/debug';
import { Variable, Expression, Thread, Breakpoint } from 'vs/workbench/parts/debug/common/debugModel';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CollapseAction2 } from 'vs/workbench/browser/viewlet';
import { first } from 'vs/base/common/arrays';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { memoize } from 'vs/base/common/decorators';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';

export abstract class AbstractDebugAction extends Action {

	protected toDispose: lifecycle.IDisposable[];

	constructor(
		id: string, label: string, cssClass: string,
		@IDebugService protected debugService: IDebugService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		public weight?: number
	) {
		super(id, label, cssClass, false);
		this.toDispose = [];
		this.toDispose.push(this.debugService.onDidChangeState(state => this.updateEnablement(state)));

		this.updateLabel(label);
		this.updateEnablement();
	}

	public run(e?: any): Promise<any> {
		throw new Error('implement me');
	}

	public get tooltip(): string {
		const keybinding = this.keybindingService.lookupKeybinding(this.id);
		const keybindingLabel = keybinding && keybinding.getLabel();

		return keybindingLabel ? `${this.label} (${keybindingLabel})` : this.label;
	}

	protected updateLabel(newLabel: string): void {
		this.label = newLabel;
	}

	protected updateEnablement(state = this.debugService.state): void {
		this.enabled = this.isEnabled(state);
	}

	protected isEnabled(state: State): boolean {
		return true;
	}

	public dispose(): void {
		super.dispose();
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

export class ConfigureAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.configure';
	static LABEL = nls.localize('openLaunchJson', "Open {0}", 'launch.json');

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
		super(id, label, 'debug-action configure', debugService, keybindingService);
		this.toDispose.push(debugService.getConfigurationManager().onDidSelectConfiguration(() => this.updateClass()));
		this.updateClass();
	}

	public get tooltip(): string {
		if (this.debugService.getConfigurationManager().selectedConfiguration.name) {
			return ConfigureAction.LABEL;
		}

		return nls.localize('launchJsonNeedsConfigurtion', "Configure or Fix 'launch.json'");
	}

	private updateClass(): void {
		this.class = this.debugService.getConfigurationManager().selectedConfiguration.name ? 'debug-action configure' : 'debug-action configure notification';
	}

	public run(event?: any): Promise<any> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('noFolderDebugConfig', "Please first open a folder in order to do advanced debug configuration."));
			return Promise.resolve(null);
		}

		const sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		const configurationManager = this.debugService.getConfigurationManager();
		if (!configurationManager.selectedConfiguration.launch) {
			configurationManager.selectConfiguration(configurationManager.getLaunches()[0]);
		}

		return configurationManager.selectedConfiguration.launch.openConfigFile(sideBySide, false);
	}
}

export class StartAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.start';
	static LABEL = nls.localize('startDebug', "Start Debugging");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label, 'debug-action start', debugService, keybindingService);

		this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(() => this.updateEnablement()));
		this.toDispose.push(this.debugService.onDidNewSession(() => this.updateEnablement()));
		this.toDispose.push(this.debugService.onDidEndSession(() => this.updateEnablement()));
		this.toDispose.push(this.contextService.onDidChangeWorkbenchState(() => this.updateEnablement()));
	}

	// Note: When this action is executed from the process explorer, a config is passed. For all
	// other cases it is run with no arguments.
	public run(): Promise<any> {
		const configurationManager = this.debugService.getConfigurationManager();
		let launch = configurationManager.selectedConfiguration.launch;
		if (!launch || launch.getConfigurationNames().length === 0) {
			const rootUri = this.historyService.getLastActiveWorkspaceRoot();
			launch = configurationManager.getLaunch(rootUri);
			if (!launch || launch.getConfigurationNames().length === 0) {
				const launches = configurationManager.getLaunches();
				launch = first(launches, l => !!l.getConfigurationNames().length, launch);
			}

			configurationManager.selectConfiguration(launch);
		}

		return this.debugService.startDebugging(launch, undefined, this.isNoDebug());
	}

	protected isNoDebug(): boolean {
		return false;
	}

	public static isEnabled(debugService: IDebugService) {
		const sessions = debugService.getModel().getSessions();

		if (debugService.state === State.Initializing) {
			return false;
		}
		if ((sessions.length > 0) && debugService.getConfigurationManager().getLaunches().every(l => l.getConfigurationNames().length === 0)) {
			// There is already a debug session running and we do not have any launch configuration selected
			return false;
		}

		return true;
	}

	// Disabled if the launch drop down shows the launch config that is already running.
	protected isEnabled(): boolean {
		return StartAction.isEnabled(this.debugService);
	}
}

export class RunAction extends StartAction {
	static readonly ID = 'workbench.action.debug.run';
	static LABEL = nls.localize('startWithoutDebugging', "Start Without Debugging");

	protected isNoDebug(): boolean {
		return true;
	}
}

export class SelectAndStartAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.selectandstart';
	static LABEL = nls.localize('selectAndStartDebugging', "Select and Start Debugging");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IFileService fileService: IFileService,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService
	) {
		super(id, label, undefined, debugService, keybindingService);
	}

	public run(): Promise<any> {
		return this.quickOpenService.show('debug ');
	}
}

export class RestartAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.restart';
	static LABEL = nls.localize('restartDebug', "Restart");
	static RECONNECT_LABEL = nls.localize('reconnectDebug', "Reconnect");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label, 'debug-action restart', debugService, keybindingService, 70);
		this.setLabel(this.debugService.getViewModel().focusedSession);
		this.toDispose.push(this.debugService.getViewModel().onDidFocusSession(() => this.setLabel(this.debugService.getViewModel().focusedSession)));
	}

	@memoize
	private get startAction(): StartAction {
		return new StartAction(StartAction.ID, StartAction.LABEL, this.debugService, this.keybindingService, this.contextService, this.historyService);
	}

	private setLabel(session: IDebugSession): void {
		this.updateLabel(session && session.configuration.request === 'attach' ? RestartAction.RECONNECT_LABEL : RestartAction.LABEL);
	}

	public run(session: IDebugSession): Promise<any> {
		if (!session || !session.getId) {
			session = this.debugService.getViewModel().focusedSession;
		}

		if (!session) {
			return this.startAction.run();
		}

		session.removeReplExpressions();
		return this.debugService.restartSession(session);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && (
			state === State.Running ||
			state === State.Stopped ||
			StartAction.isEnabled(this.debugService)
		);
	}
}

export class StepOverAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.stepOver';
	static LABEL = nls.localize('stepOverDebug', "Step Over");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-over', debugService, keybindingService, 20);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.next() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && state === State.Stopped;
	}
}

export class StepIntoAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.stepInto';
	static LABEL = nls.localize('stepIntoDebug', "Step Into");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-into', debugService, keybindingService, 30);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.stepIn() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && state === State.Stopped;
	}
}

export class StepOutAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.stepOut';
	static LABEL = nls.localize('stepOutDebug', "Step Out");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-out', debugService, keybindingService, 40);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.stepOut() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && state === State.Stopped;
	}
}

export class StopAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.stop';
	static LABEL = nls.localize('stopDebug', "Stop");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action stop', debugService, keybindingService, 80);
	}

	public run(session: IDebugSession): Promise<any> {
		if (!session || !session.getId) {
			session = this.debugService.getViewModel().focusedSession;
		}

		return this.debugService.stopSession(session);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && (state !== State.Inactive);
	}
}

export class DisconnectAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.disconnect';
	static LABEL = nls.localize('disconnectDebug', "Disconnect");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action disconnect', debugService, keybindingService, 80);
	}

	public run(): Promise<any> {
		const session = this.debugService.getViewModel().focusedSession;
		return this.debugService.stopSession(session);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && (state === State.Running || state === State.Stopped);
	}
}

export class ContinueAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.continue';
	static LABEL = nls.localize('continueDebug', "Continue");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action continue', debugService, keybindingService, 10);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.continue() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && state === State.Stopped;
	}
}

export class PauseAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.pause';
	static LABEL = nls.localize('pauseDebug', "Pause");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action pause', debugService, keybindingService, 10);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
			if (!thread) {
				const session = this.debugService.getViewModel().focusedSession;
				const threads = session && session.getAllThreads();
				thread = threads && threads.length ? threads[0] : undefined;
			}
		}

		return thread ? thread.pause() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && state === State.Running;
	}
}

export class TerminateThreadAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.terminateThread';
	static LABEL = nls.localize('terminateThread', "Terminate Thread");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, undefined, debugService, keybindingService);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.terminate() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && (state === State.Running || state === State.Stopped);
	}
}

export class RestartFrameAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.restartFrame';
	static LABEL = nls.localize('restartFrame', "Restart Frame");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, undefined, debugService, keybindingService);
	}

	public run(frame: IStackFrame): Promise<any> {
		if (!frame) {
			frame = this.debugService.getViewModel().focusedStackFrame;
		}

		return frame.restart();
	}
}

export class RemoveBreakpointAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.removeBreakpoint';
	static LABEL = nls.localize('removeBreakpoint', "Remove Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove', debugService, keybindingService);
	}

	public run(breakpoint: IBreakpoint): Promise<any> {
		return breakpoint instanceof Breakpoint ? this.debugService.removeBreakpoints(breakpoint.getId())
			: this.debugService.removeFunctionBreakpoints(breakpoint.getId());
	}
}

export class RemoveAllBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.removeAllBreakpoints';
	static LABEL = nls.localize('removeAllBreakpoints', "Remove All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove-all', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		return Promise.all([this.debugService.removeBreakpoints(), this.debugService.removeFunctionBreakpoints()]);
	}

	protected isEnabled(state: State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (model.getBreakpoints().length > 0 || model.getFunctionBreakpoints().length > 0);
	}
}

export class EnableAllBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.enableAllBreakpoints';
	static LABEL = nls.localize('enableAllBreakpoints', "Enable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action enable-all-breakpoints', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		return this.debugService.enableOrDisableBreakpoints(true);
	}

	protected isEnabled(state: State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (<ReadonlyArray<IEnablement>>model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => !bp.enabled);
	}
}

export class DisableAllBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.disableAllBreakpoints';
	static LABEL = nls.localize('disableAllBreakpoints', "Disable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action disable-all-breakpoints', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		return this.debugService.enableOrDisableBreakpoints(false);
	}

	protected isEnabled(state: State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (<ReadonlyArray<IEnablement>>model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => bp.enabled);
	}
}

export class ToggleBreakpointsActivatedAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.toggleBreakpointsActivatedAction';
	static ACTIVATE_LABEL = nls.localize('activateBreakpoints', "Activate Breakpoints");
	static DEACTIVATE_LABEL = nls.localize('deactivateBreakpoints', "Deactivate Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action breakpoints-activate', debugService, keybindingService);
		this.updateLabel(this.debugService.getModel().areBreakpointsActivated() ? ToggleBreakpointsActivatedAction.DEACTIVATE_LABEL : ToggleBreakpointsActivatedAction.ACTIVATE_LABEL);

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => {
			this.updateLabel(this.debugService.getModel().areBreakpointsActivated() ? ToggleBreakpointsActivatedAction.DEACTIVATE_LABEL : ToggleBreakpointsActivatedAction.ACTIVATE_LABEL);
			this.updateEnablement();
		}));
	}

	public run(): Promise<any> {
		return this.debugService.setBreakpointsActivated(!this.debugService.getModel().areBreakpointsActivated());
	}

	protected isEnabled(state: State): boolean {
		return (this.debugService.getModel().getFunctionBreakpoints().length + this.debugService.getModel().getBreakpoints().length) > 0;
	}
}

export class ReapplyBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.reapplyBreakpointsAction';
	static LABEL = nls.localize('reapplyAllBreakpoints', "Reapply All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		return this.debugService.setBreakpointsActivated(true);
	}

	protected isEnabled(state: State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (state === State.Running || state === State.Stopped) &&
			(model.getFunctionBreakpoints().length + model.getBreakpoints().length + model.getExceptionBreakpoints().length > 0);
	}
}

export class AddFunctionBreakpointAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.addFunctionBreakpointAction';
	static LABEL = nls.localize('addFunctionBreakpoint', "Add Function Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-function-breakpoint', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		this.debugService.addFunctionBreakpoint();
		return Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return !this.debugService.getViewModel().getSelectedFunctionBreakpoint()
			&& this.debugService.getModel().getFunctionBreakpoints().every(fbp => !!fbp.name);
	}
}

export class SetValueAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.setValue';
	static LABEL = nls.localize('setValue', "Set Value");

	constructor(id: string, label: string, private variable: Variable, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(): Promise<any> {
		if (this.variable instanceof Variable) {
			this.debugService.getViewModel().setSelectedExpression(this.variable);
		}

		return Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		const session = this.debugService.getViewModel().focusedSession;
		return super.isEnabled(state) && state === State.Stopped && session && session.capabilities.supportsSetVariable;
	}
}


export class AddWatchExpressionAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.addWatchExpression';
	static LABEL = nls.localize('addWatchExpression', "Add Expression");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-watch-expression', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		this.debugService.addWatchExpression();
		return Promise.resolve(undefined);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && this.debugService.getModel().getWatchExpressions().every(we => !!we.name);
	}
}

export class EditWatchExpressionAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.editWatchExpression';
	static LABEL = nls.localize('editWatchExpression', "Edit Expression");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, undefined, debugService, keybindingService);
	}

	public run(expression: Expression): Promise<any> {
		this.debugService.getViewModel().setSelectedExpression(expression);
		return Promise.resolve(null);
	}
}

export class AddToWatchExpressionsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.addToWatchExpressions';
	static LABEL = nls.localize('addToWatchExpressions', "Add to Watch");

	constructor(id: string, label: string, private variable: Variable, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-to-watch', debugService, keybindingService);
		this.updateEnablement();
	}

	public run(): Promise<any> {
		this.debugService.addWatchExpression(this.variable.evaluateName);
		return Promise.resolve(undefined);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && this.variable && !!this.variable.evaluateName;
	}
}

export class RemoveWatchExpressionAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.removeWatchExpression';
	static LABEL = nls.localize('removeWatchExpression', "Remove Expression");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, undefined, debugService, keybindingService);
	}

	public run(expression: Expression): Promise<any> {
		this.debugService.removeWatchExpressions(expression.getId());
		return Promise.resolve(null);
	}
}

export class RemoveAllWatchExpressionsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.removeAllWatchExpressions';
	static LABEL = nls.localize('removeAllWatchExpressions', "Remove All Expressions");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove-all', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(() => this.updateEnablement()));
	}

	public run(): Promise<any> {
		this.debugService.removeWatchExpressions();
		return Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		return super.isEnabled(state) && this.debugService.getModel().getWatchExpressions().length > 0;
	}
}

export class ToggleReplAction extends TogglePanelAction {
	static readonly ID = 'workbench.debug.action.toggleRepl';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugConsoleAction' }, 'Debug Console');
	private toDispose: lifecycle.IDisposable[];

	constructor(id: string, label: string,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService
	) {
		super(id, label, REPL_ID, panelService, partService, 'debug-action toggle-repl');
		this.toDispose = [];
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.panelService.onDidPanelOpen(({ panel }) => {
			if (panel.getId() === REPL_ID) {
				this.class = 'debug-action toggle-repl';
				this.tooltip = ToggleReplAction.LABEL;
			}
		}));
	}

	public dispose(): void {
		super.dispose();
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

export class FocusReplAction extends Action {

	static readonly ID = 'workbench.debug.action.focusRepl';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusConsole' }, 'Focus on Debug Console View');


	constructor(id: string, label: string,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		this.panelService.openPanel(REPL_ID, true);
		return Promise.resolve(null);
	}
}

export class FocusSessionAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.focusProcess';
	static LABEL = nls.localize('focusSession', "Focus Session");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label, null, debugService, keybindingService, 100);
	}

	public run(sessionName: string): Promise<any> {
		const session = this.debugService.getModel().getSessions().filter(p => p.getLabel() === sessionName).pop();
		this.debugService.focusStackFrame(undefined, undefined, session, true);
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		if (stackFrame) {
			return stackFrame.openInEditor(this.editorService, true);
		}

		return Promise.resolve(undefined);
	}
}

// Actions used by the chakra debugger
export class StepBackAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.stepBack';
	static LABEL = nls.localize('stepBackDebug', "Step Back");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-back', debugService, keybindingService, 50);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.stepBack() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		const session = this.debugService.getViewModel().focusedSession;
		return super.isEnabled(state) && state === State.Stopped &&
			session && session.capabilities.supportsStepBack;
	}
}

export class ReverseContinueAction extends AbstractDebugAction {
	static readonly ID = 'workbench.action.debug.reverseContinue';
	static LABEL = nls.localize('reverseContinue', "Reverse");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action reverse-continue', debugService, keybindingService, 60);
	}

	public run(thread: IThread): Promise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.reverseContinue() : Promise.resolve(null);
	}

	protected isEnabled(state: State): boolean {
		const session = this.debugService.getViewModel().focusedSession;
		return super.isEnabled(state) && state === State.Stopped &&
			session && session.capabilities.supportsStepBack;
	}
}

export class ReplCollapseAllAction extends CollapseAction2 {
	constructor(tree: AsyncDataTree<any, any>, private toFocus: { focus(): void; }) {
		super(tree, true, undefined);
	}

	public run(event?: any): Promise<any> {
		return super.run(event).then(() => {
			this.toFocus.focus();
		});
	}
}
