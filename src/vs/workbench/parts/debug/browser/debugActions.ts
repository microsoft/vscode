/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import * as lifecycle from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { Variable, Expression, Thread, Breakpoint } from 'vs/workbench/parts/debug/common/debugModel';
import { BreakpointWidget } from 'vs/workbench/parts/debug/browser/breakpointWidget';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import IDebugService = debug.IDebugService;

export class AbstractDebugAction extends Action {

	protected toDispose: lifecycle.IDisposable[];

	constructor(
		id: string, label: string, cssClass: string,
		@IDebugService protected debugService: IDebugService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		public weight?: number
	) {
		super(id, label, cssClass, false);
		this.toDispose = [];
		this.toDispose.push(this.debugService.onDidChangeState(() => this.updateEnablement()));

		this.updateLabel(label);
		this.updateEnablement();
	}

	public run(e?: any): TPromise<any> {
		throw new Error('implement me');
	}

	protected updateLabel(newLabel: string): void {
		this.label = newLabel;
	}

	protected updateEnablement(): void {
		this.enabled = this.isEnabled(this.debugService.state);
	}

	protected isEnabled(state: debug.State): boolean {
		return state !== debug.State.Disabled;
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		this.debugService = null;

		super.dispose();
	}
}

export class ConfigureAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.configure';
	static LABEL = nls.localize('openLaunchJson', "Open {0}", 'launch.json');

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action configure', debugService, keybindingService);
		this.toDispose.push(debugService.getViewModel().onDidSelectConfigurationName(configurationName => {
			if (configurationName) {
				this.class = 'debug-action configure';
				this.tooltip = ConfigureAction.LABEL;
			} else {
				this.class = 'debug-action configure notification';
				this.tooltip = nls.localize('launchJsonNeedsConfigurtion', "Configure or Fix 'launch.json'");
			}
		}));
	}

	public run(event?: any): TPromise<any> {
		const sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		return this.debugService.getConfigurationManager().openConfigFile(sideBySide);
	}
}

export class SelectConfigAction extends AbstractDebugAction {
	static ID = 'workbench.debug.action.setActiveConfig';
	static LABEL = nls.localize('selectConfig', "Select Configuration");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action select-active-config', debugService, keybindingService);
	}

	public run(configName: string): TPromise<any> {
		this.debugService.getViewModel().setSelectedConfigurationName(configName);
		return TPromise.as(null);
	}
}

export class StartAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.start';
	static LABEL = nls.localize('startDebug', "Start Debugging");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService, @ICommandService private commandService: ICommandService) {
		super(id, label, 'debug-action start', debugService, keybindingService);
		this.debugService.getViewModel().onDidSelectConfigurationName(() => {
			this.updateEnablement();
		});
	}

	public run(): TPromise<any> {
		return this.commandService.executeCommand('_workbench.startDebug', this.debugService.getViewModel().selectedConfigurationName);
	}

	// Disabled if the launch drop down shows the launch config that is already running.
	protected isEnabled(state: debug.State): boolean {
		const process = this.debugService.getModel().getProcesses();
		return super.isEnabled(state) && process.every(p => p.name !== this.debugService.getViewModel().selectedConfigurationName);
	}
}

export class RestartAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.restart';
	static LABEL = nls.localize('restartDebug', "Restart");
	static RECONNECT_LABEL = nls.localize('reconnectDebug', "Reconnect");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action restart', debugService, keybindingService, 70);
		this.setLabel(this.debugService.getViewModel().focusedProcess);
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(() => this.setLabel(this.debugService.getViewModel().focusedProcess)));
	}

	private setLabel(process: debug.IProcess): void {
		this.updateLabel(process && process.session.requestType === debug.SessionRequestType.ATTACH ? RestartAction.RECONNECT_LABEL : RestartAction.LABEL);
	}

	public run(): TPromise<any> {
		const process = this.debugService.getViewModel().focusedProcess;
		return this.debugService.restartProcess(process);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state !== debug.State.Inactive;
	}
}

export class StepOverAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepOver';
	static LABEL = nls.localize('stepOverDebug', "Step Over");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-over', debugService, keybindingService, 20);
	}

	public run(thread: debug.IThread): TPromise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.next() : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state === debug.State.Stopped;
	}
}

export class StepIntoAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepInto';
	static LABEL = nls.localize('stepIntoDebug', "Step Into");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-into', debugService, keybindingService, 30);
	}

	public run(thread: debug.IThread): TPromise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.stepIn() : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state === debug.State.Stopped;
	}
}

export class StepOutAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepOut';
	static LABEL = nls.localize('stepOutDebug', "Step Out");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-out', debugService, keybindingService, 40);
	}

	public run(thread: debug.IThread): TPromise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.stepOut() : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state === debug.State.Stopped;
	}
}

export class StepBackAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepBack';
	static LABEL = nls.localize('stepBackDebug', "Step Back");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-back', debugService, keybindingService, 50);
	}

	public run(thread: debug.IThread): TPromise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread.stepBack();
	}

	protected isEnabled(state: debug.State): boolean {
		const process = this.debugService.getViewModel().focusedProcess;
		return super.isEnabled(state) && state === debug.State.Stopped &&
			process && process.session.configuration.capabilities.supportsStepBack;
	}
}

export class StopAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stop';
	static LABEL = nls.localize('stopDebug', "Stop");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action stop', debugService, keybindingService, 80);
	}

	public run(): TPromise<any> {
		const process = this.debugService.getViewModel().focusedProcess;
		return process ? process.session.disconnect(false, true) : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state !== debug.State.Inactive;
	}
}

export class DisconnectAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.disconnect';
	static LABEL = nls.localize('disconnectDebug', "Disconnect");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action disconnect', debugService, keybindingService, 80);
	}

	public run(): TPromise<any> {
		const process = this.debugService.getViewModel().focusedProcess;
		return process ? process.session.disconnect(false, true) : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state !== debug.State.Inactive;
	}
}

export class ContinueAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.continue';
	static LABEL = nls.localize('continueDebug', "Continue");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action continue', debugService, keybindingService, 10);
	}

	public run(thread: debug.IThread): TPromise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.continue() : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state === debug.State.Stopped;
	}
}

export class PauseAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.pause';
	static LABEL = nls.localize('pauseDebug', "Pause");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action pause', debugService, keybindingService, 10);
	}

	public run(thread: debug.IThread): TPromise<any> {
		if (!(thread instanceof Thread)) {
			thread = this.debugService.getViewModel().focusedThread;
		}

		return thread ? thread.pause() : TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state === debug.State.Running;
	}
}

export class RestartFrameAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.restartFrame';
	static LABEL = nls.localize('restartFrame', "Restart Frame");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action restart-frame', debugService, keybindingService);
	}

	public run(frame: debug.IStackFrame): TPromise<any> {
		if (!frame) {
			frame = this.debugService.getViewModel().focusedStackFrame;
		}

		return frame.restart();
	}
}

export class RemoveBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeBreakpoint';
	static LABEL = nls.localize('removeBreakpoint', "Remove Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove', debugService, keybindingService);
	}

	public run(breakpoint: debug.IBreakpoint): TPromise<any> {
		return breakpoint instanceof Breakpoint ? this.debugService.removeBreakpoints(breakpoint.getId())
			: this.debugService.removeFunctionBreakpoints(breakpoint.getId());
	}
}

export class RemoveAllBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeAllBreakpoints';
	static LABEL = nls.localize('removeAllBreakpoints', "Remove All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove-all', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return TPromise.join([this.debugService.removeBreakpoints(), this.debugService.removeFunctionBreakpoints()]);
	}

	protected isEnabled(state: debug.State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (model.getBreakpoints().length > 0 || model.getFunctionBreakpoints().length > 0);
	}
}

export class ToggleEnablementAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.toggleBreakpointEnablement';
	static LABEL = nls.localize('toggleEnablement', "Enable/Disable Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action toggle-enablement', debugService, keybindingService);
	}

	public run(element: debug.IEnablement): TPromise<any> {
		return this.debugService.enableOrDisableBreakpoints(!element.enabled, element);
	}
}

export class EnableAllBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.enableAllBreakpoints';
	static LABEL = nls.localize('enableAllBreakpoints', "Enable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action enable-all-breakpoints', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.enableOrDisableBreakpoints(true);
	}

	protected isEnabled(state: debug.State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (<debug.IEnablement[]>model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => !bp.enabled);
	}
}

export class DisableAllBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.disableAllBreakpoints';
	static LABEL = nls.localize('disableAllBreakpoints', "Disable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action disable-all-breakpoints', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.enableOrDisableBreakpoints(false);
	}

	protected isEnabled(state: debug.State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && (<debug.IEnablement[]>model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => bp.enabled);
	}
}

export class ToggleBreakpointsActivatedAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.toggleBreakpointsActivatedAction';
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

	public run(): TPromise<any> {
		return this.debugService.setBreakpointsActivated(!this.debugService.getModel().areBreakpointsActivated());
	}

	protected isEnabled(state: debug.State): boolean {
		return (this.debugService.getModel().getFunctionBreakpoints().length + this.debugService.getModel().getBreakpoints().length) > 0;
	}
}

export class ReapplyBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.reapplyBreakpointsAction';
	static LABEL = nls.localize('reapplyAllBreakpoints', "Reapply All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.setBreakpointsActivated(true);
	}

	protected isEnabled(state: debug.State): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled(state) && state !== debug.State.Disabled && state !== debug.State.Inactive &&
			(model.getFunctionBreakpoints().length + model.getBreakpoints().length + model.getExceptionBreakpoints().length > 0);
	}
}

export class AddFunctionBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.addFunctionBreakpointAction';
	static LABEL = nls.localize('addFunctionBreakpoint', "Add Function Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-function-breakpoint', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		this.debugService.addFunctionBreakpoint();
		return TPromise.as(null);
	}
}

export class RenameFunctionBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.renameFunctionBreakpointAction';
	static LABEL = nls.localize('renameFunctionBreakpoint', "Rename Function Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(fbp: debug.IFunctionBreakpoint): TPromise<any> {
		this.debugService.getViewModel().setSelectedFunctionBreakpoint(fbp);
		return TPromise.as(null);
	}
}

export class AddConditionalBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.addConditionalBreakpointAction';
	static LABEL = nls.localize('addConditionalBreakpoint', "Add Conditional Breakpoint...");

	constructor(id: string, label: string,
		private editor: ICodeEditor,
		private lineNumber: number,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(): TPromise<any> {
		BreakpointWidget.createInstance(this.editor, this.lineNumber, this.instantiationService);
		return TPromise.as(null);
	}
}

export class EditConditionalBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.editConditionalBreakpointAction';
	static LABEL = nls.localize('editConditionalBreakpoint', "Edit Breakpoint...");

	constructor(id: string, label: string,
		private editor: ICodeEditor,
		private lineNumber: number,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(breakpoint: debug.IBreakpoint): TPromise<any> {
		BreakpointWidget.createInstance(this.editor, this.lineNumber, this.instantiationService);
		return TPromise.as(null);
	}
}


export class SetValueAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.setValue';
	static LABEL = nls.localize('setValue', "Set Value");

	constructor(id: string, label: string, private variable: Variable, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(): TPromise<any> {
		if (this.variable instanceof Variable) {
			this.debugService.getViewModel().setSelectedExpression(this.variable);
		}

		return TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		const process = this.debugService.getViewModel().focusedProcess;
		return super.isEnabled(state) && state === debug.State.Stopped && process && process.session.configuration.capabilities.supportsSetVariable;
	}
}


export class AddWatchExpressionAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.addWatchExpression';
	static LABEL = nls.localize('addWatchExpression', "Add Expression");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-watch-expression', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.addWatchExpression();
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && this.debugService.getModel().getWatchExpressions().every(we => !!we.name);
	}
}

export class AddToWatchExpressionsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.addToWatchExpressions';
	static LABEL = nls.localize('addToWatchExpressions', "Add to Watch");

	constructor(id: string, label: string, private expression: debug.IExpression, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-to-watch', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		const name = this.expression instanceof Variable ? this.expression.evaluateName : this.expression.name;
		return this.debugService.addWatchExpression(name);
	}
}

export class EditWatchExpressionAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.editWatchExpression';
	static LABEL = nls.localize('editWatchExpression', "Edit Expression");

	constructor(id: string, label: string, private expression: Expression, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action editWatchExpression', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		this.debugService.getViewModel().setSelectedExpression(this.expression);
		return TPromise.as(null);
	}
}

export class RemoveWatchExpressionAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeWatchExpression';
	static LABEL = nls.localize('removeWatchExpression', "Remove Expression");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove', debugService, keybindingService);
	}

	public run(expression: Expression): TPromise<any> {
		this.debugService.removeWatchExpressions(expression.getId());
		return TPromise.as(null);
	}
}

export class RemoveAllWatchExpressionsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeAllWatchExpressions';
	static LABEL = nls.localize('removeAllWatchExpressions', "Remove All Expressions");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove-all', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		this.debugService.removeWatchExpressions();
		return TPromise.as(null);
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && this.debugService.getModel().getWatchExpressions().length > 0;
	}
}

export class ClearReplAction extends AbstractDebugAction {
	static ID = 'workbench.debug.panel.action.clearReplAction';
	static LABEL = nls.localize('clearRepl', "Clear Console");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'debug-action clear-repl', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		this.debugService.removeReplExpressions();

		// focus back to repl
		return this.panelService.openPanel(debug.REPL_ID, true);
	}
}

export class ToggleReplAction extends TogglePanelAction {
	static ID = 'workbench.debug.action.toggleRepl';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugConsoleAction' }, 'Debug Console');
	private toDispose: lifecycle.IDisposable[];

	constructor(id: string, label: string,
		@IDebugService private debugService: IDebugService,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService
	) {
		super(id, label, debug.REPL_ID, panelService, partService, 'debug-action toggle-repl');
		this.toDispose = [];
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getModel().onDidChangeReplElements(() => {
			if (!this.isReplVisible()) {
				this.class = 'debug-action toggle-repl notification';
				this.tooltip = nls.localize('unreadOutput', "New Output in Debug Console");
			}
		}));
		this.toDispose.push(this.panelService.onDidPanelOpen(panel => {
			if (panel.getId() === debug.REPL_ID) {
				this.class = 'debug-action toggle-repl';
				this.tooltip = ToggleReplAction.LABEL;
			}
		}));
	}

	private isReplVisible(): boolean {
		const panel = this.panelService.getActivePanel();
		return panel && panel.getId() === debug.REPL_ID;
	}

	public dispose(): void {
		super.dispose();
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

export class FocusReplAction extends Action {

	static ID = 'workbench.debug.action.focusRepl';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusConsole' }, 'Focus Debug Console');


	constructor(id: string, label: string,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.panelService.openPanel(debug.REPL_ID, true);
	}
}

export class RunAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.run';
	static LABEL = nls.localize('startWithoutDebugging', "Start Without Debugging");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.getConfigurationManager().getConfiguration(this.debugService.getViewModel().selectedConfigurationName).then(configuration => {
			if (configuration) {
				configuration.noDebug = true;
				return this.debugService.createProcess(configuration);
			}
		});
	}

	protected isEnabled(state: debug.State): boolean {
		return super.isEnabled(state) && state === debug.State.Inactive;
	}
}

export class FocusProcessAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.focusProcess';
	static LABEL = nls.localize('focusProcess', "Focus Process");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService, 100);
	}

	public run(processName: string): TPromise<any> {
		const process = this.debugService.getModel().getProcesses().filter(p => p.name === processName).pop();
		return this.debugService.setFocusedStackFrameAndEvaluate(null, process);
	}
}
