/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import debug = require('vs/workbench/parts/debug/common/debug');

export class ViewModel implements debug.IViewModel {

	private focusedStackFrame: debug.IStackFrame;
	private focusedThread: debug.IThread;
	private selectedExpression: debug.IExpression;
	private selectedFunctionBreakpoint: debug.IFunctionBreakpoint;
	private _onDidFocusStackFrame: Emitter<debug.IStackFrame>;
	private _onDidSelectExpression: Emitter<debug.IExpression>;
	private _onDidSelectFunctionBreakpoint: Emitter<debug.IFunctionBreakpoint>;
	public changedWorkbenchViewState: boolean;

	constructor() {
		this._onDidFocusStackFrame = new Emitter<debug.IStackFrame>();
		this._onDidSelectExpression = new Emitter<debug.IExpression>();
		this._onDidSelectFunctionBreakpoint = new Emitter<debug.IFunctionBreakpoint>();
		this.changedWorkbenchViewState = false;
	}

	public getId(): string {
		return 'root';
	}

	public getFocusedStackFrame(): debug.IStackFrame {
		return this.focusedStackFrame;
	}

	public setFocusedStackFrame(focusedStackFrame: debug.IStackFrame, focusedThread: debug.IThread): void {
		this.focusedStackFrame = focusedStackFrame;
		this.focusedThread = focusedThread;
		this._onDidFocusStackFrame.fire(focusedStackFrame);
	}

	public get onDidFocusStackFrame(): Event<debug.IStackFrame> {
		return this._onDidFocusStackFrame.event;
	}

	public getFocusedThreadId(): number {
		return this.focusedThread ? this.focusedThread.threadId : 0;
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
		this._onDidSelectFunctionBreakpoint.fire(functionBreakpoint);
	}

	public get onDidSelectFunctionBreakpoint(): Event<debug.IFunctionBreakpoint> {
		return this._onDidSelectFunctionBreakpoint.event;
	}
}
