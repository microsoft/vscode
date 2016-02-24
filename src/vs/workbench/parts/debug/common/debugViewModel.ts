/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import ee = require('vs/base/common/eventEmitter');
import debug = require('vs/workbench/parts/debug/common/debug');

export class ViewModel extends ee.EventEmitter implements debug.IViewModel, debug.ITreeElement {

	private focusedStackFrame: debug.IStackFrame;
	private selectedExpression: debug.IExpression;
	private selectedFunctionBreakpoint: debug.IFunctionBreakpoint;

	public getId(): string {
		return 'root';
	}

	public getFocusedStackFrame(): debug.IStackFrame {
		return this.focusedStackFrame;
	}

	public setFocusedStackFrame(focusedStackFrame: debug.IStackFrame): void {
		this.focusedStackFrame = focusedStackFrame;
		this.emit(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED);
	}

	public getFocusedThreadId(): number {
		return this.focusedStackFrame ? this.focusedStackFrame.threadId : 0;
	}

	public getSelectedExpression(): debug.IExpression {
		return this.selectedExpression;
	}

	public setSelectedExpression(expression: debug.IExpression) {
		this.selectedExpression = expression;
		this.emit(debug.ViewModelEvents.SELECTED_EXPRESSION_UPDATED, expression);
	}

	public getSelectedFunctionBreakpoint(): debug.IFunctionBreakpoint {
		return this.selectedFunctionBreakpoint;
	}

	public setSelectedFunctionBreakpoint(functionBreakpoint: debug.IFunctionBreakpoint): void {
		this.selectedFunctionBreakpoint = functionBreakpoint;
		this.emit(debug.ViewModelEvents.SELECTED_FUNCTION_BREAKPOINT_UPDATED, functionBreakpoint);
	}
}
