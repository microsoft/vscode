/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Position } from 'vs/editor/common/core/position';
import { ILaunch, IDebugService, State, IDebugSession, IConfigurationManager, IStackFrame, IBreakpointData, IBreakpointUpdateData, IConfig, IDebugModel, IViewModel, IBreakpoint, LoadedSourceEvent, IThread, IRawModelUpdate, IFunctionBreakpoint, IExceptionBreakpoint, IDebugger, IExceptionInfo, AdapterEndEvent, IReplElement, IExpression, IReplElementSource } from 'vs/workbench/parts/debug/common/debug';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { CompletionItem } from 'vs/editor/common/modes';
import Severity from 'vs/base/common/severity';

export class MockDebugService implements IDebugService {

	public _serviceBrand: any;

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
		return Promise.resolve(null);
	}

	public addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): TPromise<IBreakpoint[]> {
		return Promise.resolve(null);
	}

	public updateBreakpoints(uri: uri, data: { [id: string]: IBreakpointUpdateData }, sendOnResourceSaved: boolean): void { }

	public enableOrDisableBreakpoints(enabled: boolean): TPromise<void> {
		return Promise.resolve(null);
	}

	public setBreakpointsActivated(): TPromise<void> {
		return Promise.resolve(null);
	}

	public removeBreakpoints(): TPromise<any> {
		return Promise.resolve(null);
	}

	public addFunctionBreakpoint(): void { }

	public moveWatchExpression(id: string, position: number): void { }

	public renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void> {
		return Promise.resolve(null);
	}

	public removeFunctionBreakpoints(id?: string): TPromise<void> {
		return Promise.resolve(null);
	}

	public addReplExpression(name: string): TPromise<void> {
		return Promise.resolve(null);
	}

	public removeReplExpressions(): void { }

	public addWatchExpression(name?: string): TPromise<void> {
		return Promise.resolve(null);
	}

	public renameWatchExpression(id: string, newName: string): TPromise<void> {
		return Promise.resolve(null);
	}

	public removeWatchExpressions(id?: string): void { }

	public startDebugging(launch: ILaunch, configOrName?: IConfig | string, noDebug?: boolean): TPromise<boolean> {
		return Promise.resolve(true);
	}

	public restartSession(): TPromise<any> {
		return Promise.resolve(null);
	}

	public stopSession(): TPromise<any> {
		return Promise.resolve(null);
	}

	public getModel(): IDebugModel {
		return null;
	}

	public getViewModel(): IViewModel {
		return null;
	}

	public logToRepl(session: IDebugSession, value: string): void { }

	public sourceIsNotAvailable(uri: uri): void { }

	public tryToAutoFocusStackFrame(thread: IThread): TPromise<any> {
		return Promise.resolve(null);
	}
}

export class MockSession implements IDebugSession {
	getReplElements(): ReadonlyArray<IReplElement> {
		return [];
	}

	removeReplExpressions(): void { }
	get onDidChangeReplElements(): Event<void> {
		return null;
	}

	addReplExpression(stackFrame: IStackFrame, name: string): TPromise<void> {
		return TPromise.as(void 0);
	}

	appendToRepl(data: string | IExpression, severity: Severity, source?: IReplElementSource): void { }
	logToRepl(sev: Severity, args: any[], frame?: { uri: uri; line: number; column: number; }) { }

	configuration: IConfig = { type: 'mock', request: 'launch' };
	unresolvedConfiguration: IConfig = { type: 'mock', request: 'launch' };
	state = State.Stopped;
	root: IWorkspaceFolder;
	capabilities: DebugProtocol.Capabilities = {};

	getId(): string {
		return 'mock';
	}

	getLabel(): string {
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

	get onDidChangeState(): Event<void> {
		return null;
	}

	get onDidEndAdapter(): Event<AdapterEndEvent> {
		return null;
	}

	setConfiguration(configuration: { resolved: IConfig, unresolved: IConfig }) { }

	getAllThreads(): ReadonlyArray<IThread> {
		return [];
	}

	getSource(raw: DebugProtocol.Source): Source {
		return undefined;
	}

	getLoadedSources(): TPromise<Source[]> {
		return Promise.resolve([]);
	}

	completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<CompletionItem[]> {
		return Promise.resolve([]);
	}

	clearThreads(removeThreads: boolean, reference?: number): void { }

	rawUpdate(data: IRawModelUpdate): void { }

	initialize(dbgr: IDebugger): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	launchOrAttach(config: IConfig): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	restart(): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	sendBreakpoints(modelUri: uri, bpts: IBreakpoint[], sourceModified: boolean): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	sendFunctionBreakpoints(fbps: IFunctionBreakpoint[]): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	sendExceptionBreakpoints(exbpts: IExceptionBreakpoint[]): TPromise<void> {
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
	restartFrame(frameId: number, threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	next(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	stepIn(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	stepOut(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	stepBack(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	continue(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	reverseContinue(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	pause(threadId: number): TPromise<void> {
		throw new Error('Method not implemented.');
	}
	terminateThreads(threadIds: number[]): TPromise<void> {
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
		return Promise.resolve({
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
		return Promise.resolve(null);
	}

	public launchOrAttach(args: IConfig): TPromise<DebugProtocol.Response> {
		return Promise.resolve(null);
	}

	public scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse> {
		return Promise.resolve(null);
	}

	public variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse> {
		return Promise.resolve(null);
	}

	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse> {
		return Promise.resolve(null);
	}

	public custom(request: string, args: any): TPromise<DebugProtocol.Response> {
		return Promise.resolve(null);
	}

	public terminate(restart = false): TPromise<DebugProtocol.TerminateResponse> {
		return Promise.resolve(null);
	}

	public disconnect(restart?: boolean): TPromise<any> {
		return Promise.resolve(null);
	}

	public threads(): TPromise<DebugProtocol.ThreadsResponse> {
		return Promise.resolve(null);
	}

	public stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse> {
		return Promise.resolve(null);
	}

	public stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse> {
		return Promise.resolve(null);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse> {
		return Promise.resolve(null);
	}

	public continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse> {
		return Promise.resolve(null);
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse> {
		return Promise.resolve(null);
	}

	public pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse> {
		return Promise.resolve(null);
	}

	public terminateThreads(args: DebugProtocol.TerminateThreadsArguments): TPromise<DebugProtocol.TerminateThreadsResponse> {
		return Promise.resolve(null);
	}

	public setVariable(args: DebugProtocol.SetVariableArguments): TPromise<DebugProtocol.SetVariableResponse> {
		return Promise.resolve(null);
	}

	public restartFrame(args: DebugProtocol.RestartFrameArguments): TPromise<DebugProtocol.RestartFrameResponse> {
		return Promise.resolve(null);
	}

	public completions(args: DebugProtocol.CompletionsArguments): TPromise<DebugProtocol.CompletionsResponse> {
		return Promise.resolve(null);
	}

	public next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse> {
		return Promise.resolve(null);
	}

	public source(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse> {
		return Promise.resolve(null);
	}

	public loadedSources(args: DebugProtocol.LoadedSourcesArguments): TPromise<DebugProtocol.LoadedSourcesResponse> {
		return Promise.resolve(null);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse> {
		return Promise.resolve(null);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): TPromise<DebugProtocol.SetFunctionBreakpointsResponse> {
		return Promise.resolve(null);
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): TPromise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return Promise.resolve(null);
	}

	public readonly onDidStop: Event<DebugProtocol.StoppedEvent> = null;
}
