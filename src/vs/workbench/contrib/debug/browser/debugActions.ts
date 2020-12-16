/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IDebugService, State, IEnablement, IBreakpoint } from 'vs/workbench/contrib/debug/common/debug';
import { Variable, Breakpoint, FunctionBreakpoint, Expression } from 'vs/workbench/contrib/debug/common/debugModel';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

export abstract class AbstractDebugAction extends Action {

	constructor(
		id: string, label: string, cssClass: string,
		@IDebugService protected debugService: IDebugService,
		@IKeybindingService protected keybindingService: IKeybindingService,
	) {
		super(id, label, cssClass, false);
		this._register(this.debugService.onDidChangeState(state => this.updateEnablement(state)));

		this.updateLabel(label);
		this.updateEnablement();
	}

	run(_: any): Promise<any> {
		throw new Error('implement me');
	}

	get tooltip(): string {
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

	protected isEnabled(_: State): boolean {
		return true;
	}
}

export class RemoveBreakpointAction extends Action {
	static readonly ID = 'workbench.debug.viewlet.action.removeBreakpoint';
	static readonly LABEL = nls.localize('removeBreakpoint', "Remove Breakpoint");

	constructor(id: string, label: string, @IDebugService private readonly debugService: IDebugService) {
		super(id, label, 'debug-action remove');
	}

	run(breakpoint: IBreakpoint): Promise<any> {
		return breakpoint instanceof Breakpoint ? this.debugService.removeBreakpoints(breakpoint.getId())
			: breakpoint instanceof FunctionBreakpoint ? this.debugService.removeFunctionBreakpoints(breakpoint.getId()) : this.debugService.removeDataBreakpoints(breakpoint.getId());
	}
}

export class EnableAllBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.enableAllBreakpoints';
	static readonly LABEL = nls.localize('enableAllBreakpoints', "Enable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action enable-all-breakpoints', debugService, keybindingService);
		this._register(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	run(): Promise<any> {
		return this.debugService.enableOrDisableBreakpoints(true);
	}

	protected isEnabled(_: State): boolean {
		const model = this.debugService.getModel();
		return (<ReadonlyArray<IEnablement>>model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => !bp.enabled);
	}
}

export class DisableAllBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.disableAllBreakpoints';
	static readonly LABEL = nls.localize('disableAllBreakpoints', "Disable All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, 'debug-action disable-all-breakpoints', debugService, keybindingService);
		this._register(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	run(): Promise<any> {
		return this.debugService.enableOrDisableBreakpoints(false);
	}

	protected isEnabled(_: State): boolean {
		const model = this.debugService.getModel();
		return (<ReadonlyArray<IEnablement>>model.getBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getExceptionBreakpoints()).some(bp => bp.enabled);
	}
}

export class ReapplyBreakpointsAction extends AbstractDebugAction {
	static readonly ID = 'workbench.debug.viewlet.action.reapplyBreakpointsAction';
	static readonly LABEL = nls.localize('reapplyAllBreakpoints', "Reapply All Breakpoints");

	constructor(id: string, label: string, @IDebugService debugService: IDebugService, @IKeybindingService keybindingService: IKeybindingService) {
		super(id, label, '', debugService, keybindingService);
		this._register(this.debugService.getModel().onDidChangeBreakpoints(() => this.updateEnablement()));
	}

	run(): Promise<any> {
		return this.debugService.setBreakpointsActivated(true);
	}

	protected isEnabled(state: State): boolean {
		const model = this.debugService.getModel();
		return (state === State.Running || state === State.Stopped) &&
			((model.getFunctionBreakpoints().length + model.getBreakpoints().length + model.getExceptionBreakpoints().length + model.getDataBreakpoints().length) > 0);
	}
}

export class CopyValueAction extends Action {
	static readonly ID = 'workbench.debug.viewlet.action.copyValue';
	static readonly LABEL = nls.localize('copyValue', "Copy Value");

	constructor(
		id: string, label: string, private value: Variable | Expression, private context: string,
		@IDebugService private readonly debugService: IDebugService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(id, label);
		this._enabled = (this.value instanceof Expression) || (this.value instanceof Variable && !!this.value.evaluateName);
	}

	async run(): Promise<any> {
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		const session = this.debugService.getViewModel().focusedSession;
		if (!stackFrame || !session) {
			return;
		}

		const context = session.capabilities.supportsClipboardContext ? 'clipboard' : this.context;
		const toEvaluate = this.value instanceof Variable ? (this.value.evaluateName || this.value.value) : this.value.name;

		try {
			const evaluation = await session.evaluate(toEvaluate, stackFrame.frameId, context);
			if (evaluation) {
				this.clipboardService.writeText(evaluation.body.result);
			}
		} catch (e) {
			this.clipboardService.writeText(typeof this.value === 'string' ? this.value : this.value.value);
		}
	}
}
