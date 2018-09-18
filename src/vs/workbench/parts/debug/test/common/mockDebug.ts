/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Position } from 'vs/editor/common/core/position';
import { ILaunch, IDebugService, State, IDebugSession, IConfigurationManager, IStackFrame, IBreakpointData, IBreakpointUpdateData, IConfig, IModel, IViewModel, IBreakpoint, LoadedSourceEvent, IThread, IRawModelUpdate, ActualBreakpoints, IFunctionBreakpoint, IExceptionBreakpoint, IDebugger, IExceptionInfo, AdapterEndEvent } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { ISuggestion } from 'vs/editor/common/modes';

export class MockDebugService implements IDebugService {

	public _serviceBrand: any;

	getSession(sessionId: string): IDebugSession {
		return undefined;
	}

	public get state(): State {
		return null;
	}

	public get onWillNewSession(): Event<IDebugSession> {
		return null;
	}

	public get onDidNewSession(): Event<IDebugSession> {
		return null;
	}

	public get onDidEndSession(): Event<IDebugSession> {
		return null;
	}

	public get onDidChangeState(): Event<State> {
		return null;
	}

	public getConfigurationManager(): IConfigurationManager {
		return null;
	}

	public focusStackFrame(focusedStackFrame: IStackFrame): void {
	}

	sendAllBreakpoints(session?: IDebugSession): TPromise<any> {
		return TPromise.as(null);
	}

	public addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): TPromise<IBreakpoint[]> {
		return TPromise.as(null);
	}

	public updateBreakpoints(uri: uri, data: { [id: string]: IBreakpointUpdateData }, sendOnResourceSaved: boolean): void { }

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

	public startDebugging(launch: ILaunch, configOrName?: IConfig | string, noDebug?: boolean): TPromise<any> {
		return TPromise.as(null);
	}

	public restartSession(): TPromise<any> {
		return TPromise.as(null);
	}

	public stopSession(): TPromise<any> {
		return TPromise.as(null);
	}

	public getModel(): IModel {
		return null;
	}

	public getViewModel(): IViewModel {
		return null;
	}

	public logToRepl(value: string): void { }

	public sourceIsNotAvailable(uri: uri): void { }

	public tryToAutoFocusStackFrame(thread: IThread): TPromise<any> {
		return TPromise.as(null);
	}
}

export class MockSession implements IDebugSession {

	configuration: IConfig = { type: 'mock', request: 'launch' };
	unresolvedConfiguration: IConfig = { type: 'mock', request: 'launch' };
	state = State.Stopped;
	root: IWorkspaceFolder;
	capabilities: DebugProtocol.Capabilities = {};

	getId(): string {
		return 'mock';
	}

	getName(includeRoot: boolean): string {
		return 'mockname';
	}

	getSourceForUri(modelUri: uri): Source {
		return null;
	}

	getThread(threadId: number): IThread {
		return null;
	}

	get onDidCustomEvent(): Event<DebugProtocol.Event> {
		return null;
	}

	get onDidLoadedSource(): Event<LoadedSourceEvent> {
		return null;
	}

	get onDidChangeState(): Event<State> {
		return null;
	}

	get onDidEndAdapter(): Event<AdapterEndEvent> {
		return null;
	}

	getAllThreads(): ReadonlyArray<IThread> {
		return [];
	}

	getSource(raw: DebugProtocol.Source): Source {
		return undefined;
	}

	getLoadedSources(): TPromise<Source[]> {
		return TPromise.as([]);
	}

	completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]> {
		return TPromise.as([]);
	}

	clearThreads(removeThreads: boolean, reference?: number): void { }

	rawUpdate(data: IRawModelUpdate): void { }

	initialize(dbgr: IDebugger): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	launchOrAttach(config: IConfig): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	restart(): TPromise<DebugProtocol.RestartResponse> {
		throw new Error('Method not implemented.');
	}
	sendBreakpoints(modelUri: uri, bpts: IBreakpoint[], sourceModified: boolean): TPromise<ActualBreakpoints> {
		throw new Error('Method not implemented.');
	}
	sendFunctionBreakpoints(fbps: IFunctionBreakpoint[]): TPromise<ActualBreakpoints> {
		throw new Error('Method not implemented.');
	}
	sendExceptionBreakpoints(exbpts: IExceptionBreakpoint[]): TPromise<any> {
		throw new Error('Method not implemented.');
	}
	customRequest(request: string, args: any): TPromise<DebugProtocol.Response> {
		throw new Error('Method not implemented.');
	}
	stackTrace(threadId: number, startFrame: number, levels: number): TPromise<DebugProtocol.StackTraceResponse> {
		throw new Error('Method not implemented.');
	}
	exceptionInfo(threadId: number): TPromise<IExceptionInfo> {
		throw new Error('Method not implemented.');
	}
	scopes(frameId: number): TPromise<DebugProtocol.ScopesResponse> {
		throw new Error('Method not implemented.');
	}
	variables(variablesReference: number, filter: 'indexed' | 'named', start: number, count: number): TPromise<DebugProtocol.VariablesResponse> {
		throw new Error('Method not implemented.');
	}
	evaluate(expression: string, frameId: number, context?: string): TPromise<DebugProtocol.EvaluateResponse> {
		throw new Error('Method not implemented.');
	}
	restartFrame(frameId: number, threadId: number): TPromise<DebugProtocol.RestartFrameResponse> {
		throw new Error('Method not implemented.');
	}
	next(threadId: number): TPromise<DebugProtocol.NextResponse> {
		throw new Error('Method not implemented.');
	}
	stepIn(threadId: number): TPromise<DebugProtocol.StepInResponse> {
		throw new Error('Method not implemented.');
	}
	stepOut(threadId: number): TPromise<DebugProtocol.StepOutResponse> {
		throw new Error('Method not implemented.');
	}
	stepBack(threadId: number): TPromise<DebugProtocol.StepBackResponse> {
		throw new Error('Method not implemented.');
	}
	continue(threadId: number): TPromise<DebugProtocol.ContinueResponse> {
		throw new Error('Method not implemented.');
	}
	reverseContinue(threadId: number): TPromise<DebugProtocol.ReverseContinueResponse> {
		throw new Error('Method not implemented.');
	}
	pause(threadId: number): TPromise<DebugProtocol.PauseResponse> {
		throw new Error('Method not implemented.');
	}
	terminateThreads(threadIds: number[]): TPromise<DebugProtocol.TerminateThreadsResponse> {
		throw new Error('Method not implemented.');
	}
	setVariable(variablesReference: number, name: string, value: string): TPromise<DebugProtocol.SetVariableResponse> {
		throw new Error('Method not implemented.');
	}
	loadSource(resource: uri): TPromise<DebugProtocol.SourceResponse> {
		throw new Error('Method not implemented.');
	}

	terminate(restart = false): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	disconnect(restart = false): TPromise<void> {
		throw new Error('Method not implemented.');
	}

	shutdown(): void { }
}

export class MockRawSession {

	capabilities: DebugProtocol.Capabilities;
	disconnected: boolean;
	sessionLengthInSeconds: number;

	public readyForBreakpoints = true;
	public emittedStopped = true;

	public getLengthInSeconds(): number {
		return 100;
	}

	public stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse> {
		return TPromise.as({
			seq: 1,
			type: 'response',
			request_seq: 1,
			success: true,
			command: 'stackTrace',
			body: {
				stackFrames: [{
					id: 1,
					name: 'mock',
					line: 5,
					column: 6
				}]
			}
		});
	}

	public exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): TPromise<DebugProtocol.ExceptionInfoResponse> {
		return TPromise.as(null);
	}

	public launchOrAttach(args: IConfig): TPromise<DebugProtocol.Response> {
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

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return TPromise.as(null);
	}

	public terminate(restart = false): TPromise<DebugProtocol.TerminateResponse> {
		return TPromise.as(null);
	}

	public disconnect(restart?: boolean): TPromise<any> {
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

	public terminateThreads(args: DebugProtocol.TerminateThreadsArguments): TPromise<DebugProtocol.TerminateThreadsResponse> {
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

	public loadedSources(args: DebugProtocol.LoadedSourcesArguments): TPromise<DebugProtocol.LoadedSourcesResponse> {
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

	public readonly onDidStop: Event<DebugProtocol.StoppedEvent> = null;
}
