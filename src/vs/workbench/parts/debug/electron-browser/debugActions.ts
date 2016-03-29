/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import actions = require('vs/base/common/actions');
import lifecycle = require('vs/base/common/lifecycle');
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import editorCommon = require('vs/editor/common/editorCommon');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { EditorAction } from 'vs/editor/common/editorAction';
import { Behaviour } from 'vs/editor/common/editorActionEnablement';
import { IEventService } from 'vs/platform/event/common/event';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybindingService';
import { EventType, CompositeEvent } from 'vs/workbench/common/events';
import debug = require('vs/workbench/parts/debug/common/debug');
import model = require('vs/workbench/parts/debug/common/debugModel');
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { clipboard } from 'electron';
import IDebugService = debug.IDebugService;

export class AbstractDebugAction extends actions.Action {

	protected debugService: IDebugService;
	private keybindingService: IKeybindingService;
	protected toDispose: lifecycle.IDisposable[];
	private keybinding: string;

	constructor(id: string, label: string, cssClass: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, cssClass, false);
		this.debugService = debugService;
		this.keybindingService = keybindingService;
		this.toDispose = [];
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => this.updateEnablement()));

		const keys = this.keybindingService.lookupKeybindings(id).map(k => this.keybindingService.getLabelFor(k));
		if (keys && keys.length) {
			this.keybinding = keys[0];
		}

		this.updateLabel(label);
		this.updateEnablement();
	}

	public run(e?: any): TPromise<any> {
		throw new Error('implement me');
	}

	protected updateLabel(newLabel: string): void {
		if (this.keybinding) {
			this.label = nls.localize('debugActionLabelAndKeybinding', "{0} ({1})", newLabel, this.keybinding);
		} else {
			this.label = newLabel;
		}
	}

	protected updateEnablement(): void {
		this.enabled = this.isEnabled();
	}

	protected isEnabled(): boolean {
		return this.debugService.getState() !== debug.State.Disabled;
	}

	public dispose(): void {
		this.debugService = null;
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		super.dispose();
	}
}

export class ConfigureAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.configure';
	static LABEL = nls.localize('openLaunchJson', "Open {0}", 'launch.json');

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action configure', debugService, keybindingService);
		this.toDispose.push(debugService.addListener2(debug.ServiceEvents.CONFIGURATION_CHANGED, e  => {
			this.class = this.debugService.getConfigurationName() ? 'debug-action configure' : 'debug-action configure notification';
		}));
	}

	public run(event?: any): TPromise<any> {
		const sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		return this.debugService.openConfigFile(sideBySide);
	}
}

export class SelectConfigAction extends AbstractDebugAction {
	static ID = 'workbench.debug.action.setActiveConfig';
	static LABEL = nls.localize('selectConfig', "Select Configuration");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action select-active-config', debugService, keybindingService);
	}

	public run(configName: string): TPromise<any> {
		return this.debugService.setConfiguration(configName);
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Inactive;
	}
}

export class StartDebugAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.start';
	static LABEL = nls.localize('startDebug', "Start");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action start', debugService, keybindingService);
		this.updateEnablement();
	}

	public run(): TPromise<any> {
		return this.debugService.createSession(false);
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Inactive;
	}
}

export class RestartDebugAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.restart';
	static LABEL = nls.localize('restartDebug', "Restart");
	static RECONNECT_LABEL = nls.localize('reconnectDebug', "Reconnect");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action restart', debugService, keybindingService);
		this.updateEnablement();
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			const session = this.debugService.getActiveSession();
			if (session) {
				this.updateLabel(session.isAttach ? RestartDebugAction.RECONNECT_LABEL : RestartDebugAction.LABEL);
			}
		}));
	}

	public run(): TPromise<any> {
		return this.debugService.restartSession();
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() !== debug.State.Inactive;
	}
}

export class StepOverDebugAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepOver';
	static LABEL = nls.localize('stepOverDebug', "Step Over");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-over', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.getActiveSession().next({ threadId: this.debugService.getViewModel().getFocusedThreadId() });
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Stopped;
	}
}

export class StepIntoDebugAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepInto';
	static LABEL = nls.localize('stepIntoDebug', "Step Into");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-into', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.getActiveSession().stepIn({ threadId: this.debugService.getViewModel().getFocusedThreadId() });
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Stopped;
	}
}

export class StepOutDebugAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stepOut';
	static LABEL = nls.localize('stepOutDebug', "Step Out");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action step-out', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.getActiveSession().stepOut({ threadId: this.debugService.getViewModel().getFocusedThreadId() });
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Stopped;
	}
}

export class StopDebugAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.stop';
	static LABEL = nls.localize('stopDebug', "Stop");
	static DISCONNECT_LABEL = nls.localize('disconnectDebug', "Disconnect");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action stop', debugService, keybindingService);
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			const session = this.debugService.getActiveSession();
			if (session) {
				this.updateLabel(session.isAttach ? StopDebugAction.DISCONNECT_LABEL : StopDebugAction.LABEL);
			}
		}));
	}

	public run(): TPromise<any> {
		var session = this.debugService.getActiveSession();
		return session ? session.disconnect(false, true) : TPromise.as(null);
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() !== debug.State.Inactive;
	}
}

export class ContinueAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.continue';
	static LABEL = nls.localize('continueDebug', "Continue");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action continue', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.getActiveSession().continue({ threadId: this.debugService.getViewModel().getFocusedThreadId() });
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Stopped;
	}
}

export class PauseAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.pause';
	static LABEL = nls.localize('pauseDebug', "Pause");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action pause', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.getActiveSession().pause({ threadId: this.debugService.getViewModel().getFocusedThreadId() });
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Running;
	}
}

export class RemoveBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeBreakpoint';
	static LABEL = nls.localize('removeBreakpoint', "Remove Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove', debugService, keybindingService);
		this.updateEnablement();
	}

	public run(breakpoint: debug.IBreakpoint): TPromise<any> {
		return breakpoint instanceof model.Breakpoint ? this.debugService.toggleBreakpoint({ uri: breakpoint.source.uri, lineNumber: breakpoint.lineNumber })
			: this.debugService.removeFunctionBreakpoints(breakpoint.getId());
	}
}

export class RemoveAllBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeAllBreakpoints';
	static LABEL = nls.localize('removeAllBreakpoints', "Remove All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove-all', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED,() => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return TPromise.join([this.debugService.removeAllBreakpoints(), this.debugService.removeFunctionBreakpoints()]);
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && (this.debugService.getModel().getBreakpoints().length > 0 || this.debugService.getModel().getFunctionBreakpoints().length > 0);
	}
}

export class ToggleEnablementAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.toggleBreakpointEnablement';
	static LABEL = nls.localize('toggleEnablement', "Enable/Disable Breakpoint");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action toggle-enablement', debugService, keybindingService);
	}

	public run(element: debug.IEnablement): TPromise<any> {
		return this.debugService.toggleEnablement(element);
	}
}

export class EnableAllBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.enableAllBreakpoints';
	static LABEL = nls.localize('enableAllBreakpoints', "Enable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action enable-all-breakpoints', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED, () => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.enableOrDisableAllBreakpoints(true);
	}

	protected isEnabled(): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled() && (<debug.IEnablement[]> model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => !bp.enabled);
	}
}

export class DisableAllBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.disableAllBreakpoints';
	static LABEL = nls.localize('disableAllBreakpoints', "Disable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action disable-all-breakpoints', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED, () => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.enableOrDisableAllBreakpoints(false);
	}

	protected isEnabled(): boolean {
		const model = this.debugService.getModel();
		return super.isEnabled() && (<debug.IEnablement[]> model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => bp.enabled);
	}
}

export class ToggleBreakpointsActivatedAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.toggleBreakpointsActivatedAction';
	static ACTIVATE_LABEL = nls.localize('activateBreakpoints', "Activate Breakpoints");
	static DEACTIVATE_LABEL = nls.localize('deactivateBreakpoints', "Deactivate Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action breakpoints-activate', debugService, keybindingService);
		this.updateLabel(this.debugService.getModel().areBreakpointsActivated() ? ToggleBreakpointsActivatedAction.DEACTIVATE_LABEL : ToggleBreakpointsActivatedAction.ACTIVATE_LABEL);

		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED, () => {
			this.updateLabel(this.debugService.getModel().areBreakpointsActivated() ? ToggleBreakpointsActivatedAction.DEACTIVATE_LABEL : ToggleBreakpointsActivatedAction.ACTIVATE_LABEL);
			this.updateEnablement();
		}));
	}

	public run(): TPromise<any> {
		return this.debugService.toggleBreakpointsActivated();
	}

	protected isEnabled(): boolean {
		return (this.debugService.getModel().getFunctionBreakpoints().length + this.debugService.getModel().getBreakpoints().length) > 0;
	}
}

export class ReapplyBreakpointsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.reapplyBreakpointsAction';
	static LABEL = nls.localize('reapplyAllBreakpoints', "Reapply All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED, () => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.sendAllBreakpoints();
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() !== debug.State.Disabled && this.debugService.getState() !== debug.State.Inactive &&
			((this.debugService.getModel().getFunctionBreakpoints().length + this.debugService.getModel().getBreakpoints().length) > 0);
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
	static LABEL = nls.localize('addConditionalBreakpoint', "Add Conditional Breakpoint");

	constructor(id: string, label: string, private editor: editorbrowser.ICodeEditor, private lineNumber: number, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.editBreakpoint(this.editor, this.lineNumber);
	}
}

export class EditConditionalBreakpointAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.editConditionalBreakpointAction';
	static LABEL = nls.localize('editConditionalBreakpoint', "Edit Breakpoint");

	constructor(id: string, label: string, private editor: editorbrowser.ICodeEditor, private lineNumber: number, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(breakpoint: debug.IBreakpoint): TPromise<any> {
		return this.debugService.editBreakpoint(this.editor, this.lineNumber);
	}
}

export class ToggleBreakpointAction extends EditorAction {
	static ID = 'editor.debug.action.toggleBreakpoint';

	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor, @IDebugService private debugService: IDebugService) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		if (this.debugService.getState() !== debug.State.Disabled) {
			const lineNumber = this.editor.getPosition().lineNumber;
			const modelUrl = this.editor.getModel().getAssociatedResource();
			if (this.debugService.canSetBreakpointsIn(this.editor.getModel())) {
				return this.debugService.toggleBreakpoint({ uri: modelUrl, lineNumber: lineNumber });
			}
		}

		return TPromise.as(null);
	}
}

export class EditorConditionalBreakpointAction extends EditorAction {
	static ID = 'editor.debug.action.conditionalBreakpoint';

	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor, @IDebugService private debugService: IDebugService) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		if (this.debugService.getState() !== debug.State.Disabled) {
			const lineNumber = this.editor.getPosition().lineNumber;
			if (this.debugService.canSetBreakpointsIn(this.editor.getModel())) {
				return this.debugService.editBreakpoint(<editorbrowser.ICodeEditor>this.editor, lineNumber);
			}
		}

		return TPromise.as(null);
	}
}

export class CopyValueAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.copyValue';
	static LABEL = nls.localize('copyValue', "Copy Value");

	constructor(id: string, label: string, private value: any, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action copy-value', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		if (this.value instanceof model.Variable) {
			const frameId = this.debugService.getViewModel().getFocusedStackFrame().frameId;
			const session = this.debugService.getActiveSession();
			return session.evaluate({ expression: model.getFullExpressionName(this.value, session.getType()), frameId }).then(result => {
				clipboard.writeText(result.body.result);
			}, err => clipboard.writeText(this.value.value));
		}

		clipboard.writeText(this.value);
		return TPromise.as(null);
	}
}

export class RunToCursorAction extends EditorAction {
	static ID = 'editor.debug.action.runToCursor';

	private debugService: IDebugService;

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor, @IDebugService debugService: IDebugService) {
		super(descriptor, editor, Behaviour.TextFocus);
		this.debugService = debugService;
	}

	public run(): TPromise<boolean> {
		const lineNumber = this.editor.getPosition().lineNumber;
		const uri = this.editor.getModel().getAssociatedResource();

		this.debugService.getActiveSession().addOneTimeListener(debug.SessionEvents.STOPPED, () => {
			this.debugService.toggleBreakpoint({ uri, lineNumber });
		});

		return this.debugService.toggleBreakpoint({ uri, lineNumber }).then(() => {
			return this.debugService.getActiveSession().continue({ threadId: this.debugService.getViewModel().getFocusedThreadId() }).then(response => {
				return response.success;
			});
		});
	}

	public getGroupId(): string {
		return '5_debug/1_run_to_cursor';
	}

	public shouldShowInContextMenu(): boolean {
		if (this.debugService.getState() !== debug.State.Stopped) {
			return false;
		}

		const lineNumber = this.editor.getPosition().lineNumber;
		const uri = this.editor.getModel().getAssociatedResource();
		const bps = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === lineNumber && bp.source.uri.toString() === uri.toString());

		// breakpoint must not be on position (no need for this action).
		return bps.length === 0;
	}
}

export class AddWatchExpressionAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.addWatchExpression';
	static LABEL = nls.localize('addWatchExpression', "Add Expression");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-watch-expression', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, () => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		return this.debugService.addWatchExpression();
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getModel().getWatchExpressions().every(we => !!we.name);
	}
}

export class SelectionToWatchExpressionsAction extends EditorAction {
	static ID = 'editor.debug.action.selectionToWatch';

	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor, @IDebugService private debugService: IDebugService, @IViewletService private viewletService: IViewletService) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		const text = this.editor.getModel().getValueInRange(this.editor.getSelection());
		return this.viewletService.openViewlet(debug.VIEWLET_ID).then(() => this.debugService.addWatchExpression(text));
	}

	public getGroupId(): string {
		return '5_debug/3_selection_to_watch';
	}

	public shouldShowInContextMenu(): boolean {
		const selection = this.editor.getSelection();
		const text = this.editor.getModel().getValueInRange(selection);

		return !!selection && !selection.isEmpty() && this.debugService.getConfigurationName() && text && /\S/.test(text);
	}
}

export class SelectionToReplAction extends EditorAction {
	static ID = 'editor.debug.action.selectionToRepl';

	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor, @IDebugService private debugService: IDebugService) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		const text = this.editor.getModel().getValueInRange(this.editor.getSelection());
		return this.debugService.addReplExpression(text).then(() => this.debugService.revealRepl());
	}

	public getGroupId(): string {
		return '5_debug/2_selection_to_repl';
	}

	public shouldShowInContextMenu(): boolean {
		const selection = this.editor.getSelection();
		return !!selection && !selection.isEmpty() && this.debugService.getState() === debug.State.Stopped;
	}
}

export class ShowDebugHoverAction extends EditorAction {
	static ID = 'editor.debug.action.showDebugHover';

	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		const position = this.editor.getPosition();
		const word = this.editor.getModel().getWordAtPosition(position);
		if (!word) {
			return TPromise.as(null);
		}

		const range = new Range(position.lineNumber, position.column, position.lineNumber, word.endColumn);
		return (<debug.IDebugEditorContribution>this.editor.getContribution(debug.EDITOR_CONTRIBUTION_ID)).showHover(range, word.word, true);
	}
}

export class AddToWatchExpressionsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.addToWatchExpressions';
	static LABEL = nls.localize('addToWatchExpressions', "Add to Watch");

	constructor(id: string, label: string, private expression: debug.IExpression, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action add-to-watch', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.addWatchExpression(model.getFullExpressionName(this.expression, this.debugService.getActiveSession().getType()));
	}
}

export class RenameWatchExpressionAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.renameWatchExpression';
	static LABEL = nls.localize('renameWatchExpression', "Rename Expression");

	constructor(id: string, label: string, private expression: model.Expression, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action rename', debugService, keybindingService);
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

	public run(expression: model.Expression): TPromise<any> {
		this.debugService.clearWatchExpressions(expression.getId());
		return TPromise.as(null);
	}
}

export class RemoveAllWatchExpressionsAction extends AbstractDebugAction {
	static ID = 'workbench.debug.viewlet.action.removeAllWatchExpressions';
	static LABEL = nls.localize('removeAllWatchExpressions', "Remove All Expressions");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action remove-all', debugService, keybindingService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, () => this.updateEnablement()));
	}

	public run(): TPromise<any> {
		this.debugService.clearWatchExpressions();
		return TPromise.as(null);
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getModel().getWatchExpressions().length > 0;
	}
}

export class ClearReplAction extends AbstractDebugAction {
	static ID = 'workbench.debug.panel.action.clearReplAction';
	static LABEL = nls.localize('clearRepl', "Clear Console");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action clear-repl', debugService, keybindingService);
	}

	public run(): TPromise<any> {
		this.debugService.clearReplExpressions();

		// focus back to repl
		return this.debugService.revealRepl();
	}
}

export class ToggleReplAction extends AbstractDebugAction {
	static ID = 'workbench.debug.action.toggleRepl';
	static LABEL = nls.localize('toggleRepl', "Debug Console");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEventService private eventService: IEventService
	) {
		super(id, label, 'debug-action toggle-repl', debugService, keybindingService);
		this.enabled = this.debugService.getState() !== debug.State.Disabled;
		this.registerListeners();
	}

	public run(): TPromise<any> {
		if (this.isReplVisible()) {
			this.partService.setPanelHidden(true);
			return TPromise.as(null);
		}

		return this.debugService.revealRepl();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.REPL_ELEMENTS_UPDATED, () => {
			if (!this.isReplVisible()) {
				this.class = 'debug-action toggle-repl notification';
			}
		}));
		this.toDispose.push(this.eventService.addListener2(EventType.COMPOSITE_OPENED, (e: CompositeEvent) => {
			if (e.compositeId === debug.REPL_ID) {
				this.class = 'debug-action toggle-repl';
			}
		}));
	}

	private isReplVisible(): boolean {
		const panel = this.panelService.getActivePanel();
		return panel && panel.getId() === debug.REPL_ID;
	}
}

export class RunAction extends AbstractDebugAction {
	static ID = 'workbench.action.debug.run';
	static LABEL = nls.localize('run', "Run");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, null, debugService, keybindingService);
	}

	public run(): TPromise<any> {
		return this.debugService.createSession(true);
	}

	protected isEnabled(): boolean {
		return super.isEnabled() && this.debugService.getState() === debug.State.Inactive;
	}
}
