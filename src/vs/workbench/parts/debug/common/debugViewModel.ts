/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { CONTEXT_EXPRESSION_SELECTED, IViewModel, IStackFrame, IProcess, IThread, IExpression, IFunctionBreakpoint, CONTEXT_BREAKPOINT_SELECTED } from 'vs/workbench/parts/debug/common/debug';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';

export class ViewModel implements IViewModel {

	private _focusedStackFrame: IStackFrame;
	private _focusedProcess: IProcess;
	private _focusedThread: IThread;
	private selectedExpression: IExpression;
	private selectedFunctionBreakpoint: IFunctionBreakpoint;
	private _onDidFocusProcess: Emitter<IProcess | undefined>;
	private _onDidFocusStackFrame: Emitter<{ stackFrame: IStackFrame, explicit: boolean }>;
	private _onDidSelectExpression: Emitter<IExpression>;
	private multiProcessView: boolean;
	private expressionSelectedContextKey: IContextKey<boolean>;
	private breakpointSelectedContextKey: IContextKey<boolean>;

	constructor(contextKeyService: IContextKeyService) {
		this._onDidFocusProcess = new Emitter<IProcess | undefined>();
		this._onDidFocusStackFrame = new Emitter<{ stackFrame: IStackFrame, explicit: boolean }>();
		this._onDidSelectExpression = new Emitter<IExpression>();
		this.multiProcessView = false;
		this.expressionSelectedContextKey = CONTEXT_EXPRESSION_SELECTED.bindTo(contextKeyService);
		this.breakpointSelectedContextKey = CONTEXT_BREAKPOINT_SELECTED.bindTo(contextKeyService);
	}

	public getId(): string {
		return 'root';
	}

	public get focusedProcess(): IProcess {
		return this._focusedProcess;
	}

	public get focusedThread(): IThread {
		return this._focusedStackFrame ? this._focusedStackFrame.thread : (this._focusedProcess ? this._focusedProcess.getAllThreads().pop() : null);
	}

	public get focusedStackFrame(): IStackFrame {
		return this._focusedStackFrame;
	}

	public setFocus(stackFrame: IStackFrame, thread: IThread, process: IProcess, explicit: boolean): void {
		let shouldEmit = this._focusedProcess !== process || this._focusedThread !== thread || this._focusedStackFrame !== stackFrame;

		if (this._focusedProcess !== process) {
			this._focusedProcess = process;
			this._onDidFocusProcess.fire(process);
		}
		this._focusedThread = thread;
		this._focusedStackFrame = stackFrame;

		if (shouldEmit) {
			this._onDidFocusStackFrame.fire({ stackFrame, explicit });
		}
	}

	public get onDidFocusProcess(): Event<IProcess> {
		return this._onDidFocusProcess.event;
	}

	public get onDidFocusStackFrame(): Event<{ stackFrame: IStackFrame, explicit: boolean }> {
		return this._onDidFocusStackFrame.event;
	}

	public getSelectedExpression(): IExpression {
		return this.selectedExpression;
	}

	public setSelectedExpression(expression: IExpression) {
		this.selectedExpression = expression;
		this.expressionSelectedContextKey.set(!!expression);
		this._onDidSelectExpression.fire(expression);
	}

	public get onDidSelectExpression(): Event<IExpression> {
		return this._onDidSelectExpression.event;
	}

	public getSelectedFunctionBreakpoint(): IFunctionBreakpoint {
		return this.selectedFunctionBreakpoint;
	}

	public setSelectedFunctionBreakpoint(functionBreakpoint: IFunctionBreakpoint): void {
		this.selectedFunctionBreakpoint = functionBreakpoint;
		this.breakpointSelectedContextKey.set(!!functionBreakpoint);
	}

	public isMultiProcessView(): boolean {
		return this.multiProcessView;
	}

	public setMultiProcessView(isMultiProcessView: boolean): void {
		this.multiProcessView = isMultiProcessView;
	}
}
