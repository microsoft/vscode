/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import * as debug from 'vs/workbench/parts/debug/common/debug';

export class MockDebugService implements debug.IDebugService {
	public _serviceBrand: any;

	public get state(): debug.State {
		return null;
	}

	public get onDidChangeState(): Event<void> {
		return null;
	}

	public getConfigurationManager(): debug.IConfigurationManager {
		return null;
	}

	public focusStackFrameAndEvaluate(focusedStackFrame: debug.IStackFrame): TPromise<void> {
		return TPromise.as(null);
	}

	public addBreakpoints(uri: uri, rawBreakpoints: debug.IRawBreakpoint[]): TPromise<void> {
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

	public addFunctionBreakpoint(): void { }

	public moveWatchExpression(id: string, position: number): void { }

	public renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeFunctionBreakpoints(id?: string): TPromise<void> {
		return TPromise.as(null);
	}

	public addReplExpression(name: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeReplExpressions(): void { }

	public addWatchExpression(name?: string): TPromise<void> {
		return TPromise.as(null);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return TPromise.as(null);
	}

	public removeWatchExpressions(id?: string): void { }

	public createProcess(configurationOrName: debug.IConfig | string): TPromise<any> {
		return TPromise.as(null);
	}

	public restartProcess(): TPromise<any> {
		return TPromise.as(null);
	}

	public getModel(): debug.IModel {
		return null;
	}

	public getViewModel(): debug.IViewModel {
		return null;
	}

	public deemphasizeSource(uri: uri): void { }
}

export class MockSession implements debug.ISession {
	public readyForBreakpoints = true;
	public emittedStopped = true;

	public getId() {
		return 'mockrawsession';
	}

	public getLengthInSeconds(): number {
		return 100;
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return TPromise.as({
			body: {
				stackFrames: []
			}
		});
	}

	public attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse> {
		return TPromise.as(null);
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

	public get configuration(): { type: string, capabilities: DebugProtocol.Capabilities } {
		return {
			type: 'mock',
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

	public threads(): TPromise<DebugProtocol.ThreadsResponse> {
		return TPromise.as(null);
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return TPromise.as(null);
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return TPromise.as(null);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse> {
		return TPromise.as(null);
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return TPromise.as(null);
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse> {
		return TPromise.as(null);
	}

	public pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse> {
		return TPromise.as(null);
	}

	public setVariable(args: DebugProtocol.SetVariableArguments): TPromise<DebugProtocol.SetVariableResponse> {
		return TPromise.as(null);
	}

	public restartFrame(args: DebugProtocol.RestartFrameArguments): TPromise<DebugProtocol.RestartFrameResponse> {
		return TPromise.as(null);
	}

	public completions(args: DebugProtocol.CompletionsArguments): TPromise<DebugProtocol.CompletionsResponse> {
		return TPromise.as(null);
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return TPromise.as(null);
	}

	public source(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse> {
		return TPromise.as(null);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse> {
		return TPromise.as(null);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): TPromise<DebugProtocol.SetFunctionBreakpointsResponse> {
		return TPromise.as(null);
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): TPromise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return TPromise.as(null);
	}

	public onDidStop: Event<DebugProtocol.StoppedEvent> = null;
}
