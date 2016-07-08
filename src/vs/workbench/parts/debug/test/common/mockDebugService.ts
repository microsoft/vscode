/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event from 'vs/base/common/event';
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import debug = require('vs/workbench/parts/debug/common/debug');
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

export class MockDebugService implements debug.IDebugService {
	private session: MockRawSession;
	public _serviceBrand: any;

	constructor() {
		this.session = new MockRawSession();
	}

	public get state(): debug.State {
		return null;
	}

	public get onDidChangeState(): Event<debug.State> {
		return null;
	}

	public getConfigurationManager(): debug.IConfigurationManager {
		return null;
	}

	public setFocusedStackFrameAndEvaluate(focusedStackFrame: debug.IStackFrame): TPromise<void> {
		return TPromise.as(null);
	}

	public addBreakpoints(rawBreakpoints: debug.IRawBreakpoint[]): TPromise<void[]> {
		return TPromise.as(null);
	}

	public enableOrDisableBreakpoints(enabled: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public setBreakpointsActivated(): TPromise<void> {
		return TPromise.as(null);
	}

	public removeBreakpoints(): TPromise<any> {
		return TPromise.as(null);
	}

	public addFunctionBreakpoint(): void {}

	public renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeFunctionBreakpoints(id?: string): TPromise<void> {
		return TPromise.as(null);
	}

	public addReplExpression(name: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeReplExpressions(): void {}

	public logToRepl(value: string | { [key: string]: any }, severity?: severity): void {}

	public appendReplOutput(value: string, severity?: severity): void {}

	public addWatchExpression(name?: string): TPromise<void> {
		return TPromise.as(null);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeWatchExpressions(id?: string): void {}

	public createSession(noDebug: boolean): TPromise<any> {
		return TPromise.as(null);
	}

	public restartSession(): TPromise<any> {
		return TPromise.as(null);
	}

	public getActiveSession(): debug.IRawDebugSession {
		return this.session;
	}

	public getModel(): debug.IModel {
		return null;
	}

	public getViewModel(): debug.IViewModel {
		return null;
	}

	public openOrRevealSource(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): TPromise<any> {
		return TPromise.as(null);
	}

	public next(threadId: number): TPromise<void> {
		return TPromise.as(null);
	}

	public stepIn(threadId: number): TPromise<void> {
		return TPromise.as(null);
	}

	public stepOut(threadId: number): TPromise<void> {
		return TPromise.as(null);
	}

	public stepBack(threadId: number): TPromise<void> {
		return TPromise.as(null);
	}

	public continue(threadId: number): TPromise<void> {
		return TPromise.as(null);
	}

	public pause(threadId: number): TPromise<any> {
		return TPromise.as(null);
	}

	public setVariable(variable: debug.IExpression, value: string): TPromise<any> {
		return TPromise.as(null);
	}
}


class MockRawSession implements debug.IRawDebugSession {

	public get configuration(): { type: string, isAttach: boolean, capabilities: DebugProtocol.Capabilites } {
		return {
			type: 'mock',
			isAttach: false,
			capabilities: {}
		};
	}

	public get onDidEvent(): Event<DebugProtocol.Event> {
		return null;
	}

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return TPromise.as(null);
	}

	public disconnect(restart?: boolean, force?: boolean): TPromise<DebugProtocol.DisconnectResponse> {
		return TPromise.as(null);
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return TPromise.as({
			body: {
				stackFrames: []
			}
		});
	}

	public scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse> {
		return TPromise.as(null);
	}

	public variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse> {
		return TPromise.as(null);
	}

	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse> {
		return TPromise.as(null);
	}
}
