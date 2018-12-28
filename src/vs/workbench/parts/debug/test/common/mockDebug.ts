/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
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

	sendAllBreakpoints(session?: IDebugSession): Promise<any> {
		return Promise.resolve(null);
	}

	public addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): Promise<IBreakpoint[]> {
		return Promise.resolve(null);
	}

	public updateBreakpoints(uri: uri, data: { [id: string]: IBreakpointUpdateData }, sendOnResourceSaved: boolean): void { }

	public enableOrDisableBreakpoints(enabled: boolean): Promise<void> {
		return Promise.resolve(null);
	}

	public setBreakpointsActivated(): Promise<void> {
		return Promise.resolve(null);
	}

	public removeBreakpoints(): Promise<any> {
		return Promise.resolve(null);
	}

	public addFunctionBreakpoint(): void { }

	public moveWatchExpression(id: string, position: number): void { }

	public renameFunctionBreakpoint(id: string, newFunctionName: string): Promise<void> {
		return Promise.resolve(null);
	}

	public removeFunctionBreakpoints(id?: string): Promise<void> {
		return Promise.resolve(null);
	}

	public addReplExpression(name: string): Promise<void> {
		return Promise.resolve(null);
	}

	public removeReplExpressions(): void { }

	public addWatchExpression(name?: string): Promise<void> {
		return Promise.resolve(null);
	}

	public renameWatchExpression(id: string, newName: string): Promise<void> {
		return Promise.resolve(null);
	}

	public removeWatchExpressions(id?: string): void { }

	public startDebugging(launch: ILaunch, configOrName?: IConfig | string, noDebug?: boolean): Promise<boolean> {
		return Promise.resolve(true);
	}

	public restartSession(): Promise<any> {
		return Promise.resolve(null);
	}

	public stopSession(): Promise<any> {
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

	public tryToAutoFocusStackFrame(thread: IThread): Promise<any> {
		return Promise.resolve(null);
	}
}

export class MockSession implements IDebugSession {
	getReplElements(): IReplElement[] {
		return [];
	}

	removeReplExpressions(): void { }
	get onDidChangeReplElements(): Event<void> {
		return null;
	}

	addReplExpression(stackFrame: IStackFrame, name: string): Promise<void> {
		return Promise.resolve(undefined);
	}

	appendToRepl(data: string | IExpression, severity: Severity, source?: IReplElementSource): void { }
	logToRepl(sev: Severity, args: any[], frame?: { uri: uri; line: number; column: number; }) { }

	configuration: IConfig = { type: 'mock', name: 'mock', request: 'launch' };
	unresolvedConfiguration: IConfig = { type: 'mock', name: 'mock', request: 'launch' };
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

	getAllThreads(): IThread[] {
		return [];
	}

	getSource(raw: DebugProtocol.Source): Source {
		return undefined;
	}

	getLoadedSources(): Promise<Source[]> {
		return Promise.resolve([]);
	}

	completions(frameId: number, text: string, position: Position, overwriteBefore: number): Promise<CompletionItem[]> {
		return Promise.resolve([]);
	}

	clearThreads(removeThreads: boolean, reference?: number): void { }

	rawUpdate(data: IRawModelUpdate): void { }

	initialize(dbgr: IDebugger): Promise<void> {
		throw new Error('Method not implemented.');
	}
	launchOrAttach(config: IConfig): Promise<void> {
		throw new Error('Method not implemented.');
	}
	restart(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	sendBreakpoints(modelUri: uri, bpts: IBreakpoint[], sourceModified: boolean): Promise<void> {
		throw new Error('Method not implemented.');
	}
	sendFunctionBreakpoints(fbps: IFunctionBreakpoint[]): Promise<void> {
		throw new Error('Method not implemented.');
	}
	sendExceptionBreakpoints(exbpts: IExceptionBreakpoint[]): Promise<void> {
		throw new Error('Method not implemented.');
	}
	customRequest(request: string, args: any): Promise<DebugProtocol.Response> {
		throw new Error('Method not implemented.');
	}
	stackTrace(threadId: number, startFrame: number, levels: number): Promise<DebugProtocol.StackTraceResponse> {
		throw new Error('Method not implemented.');
	}
	exceptionInfo(threadId: number): Promise<IExceptionInfo> {
		throw new Error('Method not implemented.');
	}
	scopes(frameId: number): Promise<DebugProtocol.ScopesResponse> {
		throw new Error('Method not implemented.');
	}
	variables(variablesReference: number, filter: 'indexed' | 'named', start: number, count: number): Promise<DebugProtocol.VariablesResponse> {
		throw new Error('Method not implemented.');
	}
	evaluate(expression: string, frameId: number, context?: string): Promise<DebugProtocol.EvaluateResponse> {
		throw new Error('Method not implemented.');
	}
	restartFrame(frameId: number, threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	next(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	stepIn(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	stepOut(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	stepBack(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	continue(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	reverseContinue(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	pause(threadId: number): Promise<void> {
		throw new Error('Method not implemented.');
	}
	terminateThreads(threadIds: number[]): Promise<void> {
		throw new Error('Method not implemented.');
	}
	setVariable(variablesReference: number, name: string, value: string): Promise<DebugProtocol.SetVariableResponse> {
		throw new Error('Method not implemented.');
	}
	loadSource(resource: uri): Promise<DebugProtocol.SourceResponse> {
		throw new Error('Method not implemented.');
	}

	terminate(restart = false): Promise<void> {
		throw new Error('Method not implemented.');
	}
	disconnect(restart = false): Promise<void> {
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

	public stackTrace(args: DebugProtocol.StackTraceArguments): Promise<DebugProtocol.StackTraceResponse> {
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

	public exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): Promise<DebugProtocol.ExceptionInfoResponse> {
		return Promise.resolve(null);
	}

	public launchOrAttach(args: IConfig): Promise<DebugProtocol.Response> {
		return Promise.resolve(null);
	}

	public scopes(args: DebugProtocol.ScopesArguments): Promise<DebugProtocol.ScopesResponse> {
		return Promise.resolve(null);
	}

	public variables(args: DebugProtocol.VariablesArguments): Promise<DebugProtocol.VariablesResponse> {
		return Promise.resolve(null);
	}

	evaluate(args: DebugProtocol.EvaluateArguments): Promise<DebugProtocol.EvaluateResponse> {
		return Promise.resolve(null);
	}

	public custom(request: string, args: any): Promise<DebugProtocol.Response> {
		return Promise.resolve(null);
	}

	public terminate(restart = false): Promise<DebugProtocol.TerminateResponse> {
		return Promise.resolve(null);
	}

	public disconnect(restart?: boolean): Promise<any> {
		return Promise.resolve(null);
	}

	public threads(): Promise<DebugProtocol.ThreadsResponse> {
		return Promise.resolve(null);
	}

	public stepIn(args: DebugProtocol.StepInArguments): Promise<DebugProtocol.StepInResponse> {
		return Promise.resolve(null);
	}

	public stepOut(args: DebugProtocol.StepOutArguments): Promise<DebugProtocol.StepOutResponse> {
		return Promise.resolve(null);
	}

	public stepBack(args: DebugProtocol.StepBackArguments): Promise<DebugProtocol.StepBackResponse> {
		return Promise.resolve(null);
	}

	public continue(args: DebugProtocol.ContinueArguments): Promise<DebugProtocol.ContinueResponse> {
		return Promise.resolve(null);
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): Promise<DebugProtocol.ReverseContinueResponse> {
		return Promise.resolve(null);
	}

	public pause(args: DebugProtocol.PauseArguments): Promise<DebugProtocol.PauseResponse> {
		return Promise.resolve(null);
	}

	public terminateThreads(args: DebugProtocol.TerminateThreadsArguments): Promise<DebugProtocol.TerminateThreadsResponse> {
		return Promise.resolve(null);
	}

	public setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse> {
		return Promise.resolve(null);
	}

	public restartFrame(args: DebugProtocol.RestartFrameArguments): Promise<DebugProtocol.RestartFrameResponse> {
		return Promise.resolve(null);
	}

	public completions(args: DebugProtocol.CompletionsArguments): Promise<DebugProtocol.CompletionsResponse> {
		return Promise.resolve(null);
	}

	public next(args: DebugProtocol.NextArguments): Promise<DebugProtocol.NextResponse> {
		return Promise.resolve(null);
	}

	public source(args: DebugProtocol.SourceArguments): Promise<DebugProtocol.SourceResponse> {
		return Promise.resolve(null);
	}

	public loadedSources(args: DebugProtocol.LoadedSourcesArguments): Promise<DebugProtocol.LoadedSourcesResponse> {
		return Promise.resolve(null);
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): Promise<DebugProtocol.SetBreakpointsResponse> {
		return Promise.resolve(null);
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): Promise<DebugProtocol.SetFunctionBreakpointsResponse> {
		return Promise.resolve(null);
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): Promise<DebugProtocol.SetExceptionBreakpointsResponse> {
		return Promise.resolve(null);
	}

	public readonly onDidStop: Event<DebugProtocol.StoppedEvent> = null;
}
