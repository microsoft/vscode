/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import * as debug from 'vs/workbench/parts/debug/common/debug';

export class ViewModel implements debug.IViewModel {

	private _focusedStackFrame: debug.IStackFrame;
	private _focusedProcess: debug.IProcess;
	private _focusedThread: debug.IThread;
	private selectedExpression: debug.IExpression;
	private selectedFunctionBreakpoint: debug.IFunctionBreakpoint;
	private _onDidFocusProcess: Emitter<debug.IProcess | undefined>;
	private _onDidFocusStackFrame: Emitter<{ stackFrame: debug.IStackFrame, explicit: boolean }>;
	private _onDidSelectExpression: Emitter<debug.IExpression>;
	private multiProcessView: boolean;

	constructor() {
		this._onDidFocusProcess = new Emitter<debug.IProcess | undefined>();
		this._onDidFocusStackFrame = new Emitter<{ stackFrame: debug.IStackFrame, explicit: boolean }>();
		this._onDidSelectExpression = new Emitter<debug.IExpression>();
		this.multiProcessView = false;
	}

	public getId(): string {
		return 'root';
	}

	public get focusedProcess(): debug.IProcess {
		return this._focusedProcess;
	}

	public get focusedThread(): debug.IThread {
		return this._focusedStackFrame ? this._focusedStackFrame.thread : (this._focusedProcess ? this._focusedProcess.getAllThreads().pop() : null);
	}

	public get focusedStackFrame(): debug.IStackFrame {
		return this._focusedStackFrame;
	}

	public setFocus(stackFrame: debug.IStackFrame, thread: debug.IThread, process: debug.IProcess, explicit: boolean): void {
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

	public get onDidFocusProcess(): Event<debug.IProcess> {
		return this._onDidFocusProcess.event;
	}

	public get onDidFocusStackFrame(): Event<{ stackFrame: debug.IStackFrame, explicit: boolean }> {
		return this._onDidFocusStackFrame.event;
	}

	public getSelectedExpression(): debug.IExpression {
		return this.selectedExpression;
	}

	public setSelectedExpression(expression: debug.IExpression) {
		this.selectedExpression = expression;
		this._onDidSelectExpression.fire(expression);
	}

	public get onDidSelectExpression(): Event<debug.IExpression> {
		return this._onDidSelectExpression.event;
	}

	public getSelectedFunctionBreakpoint(): debug.IFunctionBreakpoint {
		return this.selectedFunctionBreakpoint;
	}

	public setSelectedFunctionBreakpoint(functionBreakpoint: debug.IFunctionBreakpoint): void {
		this.selectedFunctionBreakpoint = functionBreakpoint;
	}

	public isMultiProcessView(): boolean {
		return this.multiProcessView;
	}

	public setMultiProcessView(isMultiProcessView: boolean): void {
		this.multiProcessView = isMultiProcessView;
	}
}
