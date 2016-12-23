/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import * as debug from 'vs/workbench/parts/debug/common/debug';

export class ViewModel implements debug.IViewModel {

	private _focusedStackFrame: debug.IStackFrame;
	private _focusedProcess: debug.IProcess;
	private selectedExpression: debug.IExpression;
	private selectedFunctionBreakpoint: debug.IFunctionBreakpoint;
	private _onDidFocusStackFrame: Emitter<debug.IStackFrame>;
	private _onDidSelectExpression: Emitter<debug.IExpression>;
	private _onDidSelectFunctionBreakpoint: Emitter<debug.IFunctionBreakpoint>;
	private _onDidSelectConfigurationName: Emitter<string>;
	private multiProcessView: boolean;
	public changedWorkbenchViewState: boolean;

	constructor(private _selectedConfigurationName: string) {
		this._onDidFocusStackFrame = new Emitter<debug.IStackFrame>();
		this._onDidSelectExpression = new Emitter<debug.IExpression>();
		this._onDidSelectFunctionBreakpoint = new Emitter<debug.IFunctionBreakpoint>();
		this._onDidSelectConfigurationName = new Emitter<string>();
		this.changedWorkbenchViewState = false;
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

	public setFocusedStackFrame(stackFrame: debug.IStackFrame, process: debug.IProcess): void {
		this._focusedStackFrame = stackFrame;
		this._focusedProcess = process;
		this._onDidFocusStackFrame.fire(stackFrame);
	}

	public get onDidFocusStackFrame(): Event<debug.IStackFrame> {
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
		this._onDidSelectFunctionBreakpoint.fire(functionBreakpoint);
	}

	public get onDidSelectFunctionBreakpoint(): Event<debug.IFunctionBreakpoint> {
		return this._onDidSelectFunctionBreakpoint.event;
	}

	public get selectedConfigurationName(): string {
		return this._selectedConfigurationName;
	}

	public setSelectedConfigurationName(configurationName: string): void {
		this._selectedConfigurationName = configurationName;
		this._onDidSelectConfigurationName.fire(configurationName);
	}

	public isMultiProcessView(): boolean {
		return this.multiProcessView;
	}

	public setMultiProcessView(isMultiProcessView: boolean): void {
		this.multiProcessView = isMultiProcessView;
	}

	public get onDidSelectConfiguration(): Event<string> {
		return this._onDidSelectConfigurationName.event;
	}
}
