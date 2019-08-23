/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Position } from 'vs/editor/common/core/position';
import { ILaunch, IDebugService, State, IDebugSession, IConfigurationManager, IStackFrame, IBreakpointData, IBreakpointUpdateData, IConfig, IDebugModel, IViewModel, IBreakpoint, LoadedSourceEvent, IThread, IRawModelUpdate, IFunctionBreakpoint, IExceptionBreakpoint, IDebugger, IExceptionInfo, AdapterEndEvent, IReplElement, IExpression, IReplElementSource, IDataBreakpoint } from 'vs/workbench/contrib/debug/common/debug';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { CompletionItem } from 'vs/editor/common/modes';
import Severity from 'vs/base/common/severity';

export class MockDebugService implements IDebugService {

	public _serviceBrand: any;

	public get state(): State {
		throw new Error('not implemented');
	}

	public get onWillNewSession(): Event<IDebugSession> {
		throw new Error('not implemented');
	}

	public get onDidNewSession(): Event<IDebugSession> {
		throw new Error('not implemented');
	}

	public get onDidEndSession(): Event<IDebugSession> {
		throw new Error('not implemented');
	}

	public get onDidChangeState(): Event<State> {
		throw new Error('not implemented');
	}

	public getConfigurationManager(): IConfigurationManager {
		throw new Error('not implemented');
	}

	public focusStackFrame(focusedStackFrame: IStackFrame): void {
	}

	sendAllBreakpoints(session?: IDebugSession): Promise<any> {
		throw new Error('not implemented');
	}

	public addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): Promise<IBreakpoint[]> {
		throw new Error('not implemented');
	}

	public updateBreakpoints(uri: uri, data: Map<string, IBreakpointUpdateData>, sendOnResourceSaved: boolean): Promise<void> {
		throw new Error('not implemented');
	}

	public enableOrDisableBreakpoints(enabled: boolean): Promise<void> {
		throw new Error('not implemented');
	}

	public setBreakpointsActivated(): Promise<void> {
		throw new Error('not implemented');
	}

	public removeBreakpoints(): Promise<any> {
		throw new Error('not implemented');
	}

	public addFunctionBreakpoint(): void { }

	public moveWatchExpression(id: string, position: number): void { }

	public renameFunctionBreakpoint(id: string, newFunctionName: string): Promise<void> {
		throw new Error('not implemented');
	}

	public removeFunctionBreakpoints(id?: string): Promise<void> {
		throw new Error('not implemented');
	}

	addDataBreakpoint(label: string, dataId: string, canPersist: boolean): Promise<void> {
		throw new Error('Method not implemented.');
	}
	removeDataBreakpoints(id?: string | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}

	public addReplExpression(name: string): Promise<void> {
		throw new Error('not implemented');
	}

	public removeReplExpressions(): void { }

	public addWatchExpression(name?: string): Promise<void> {
		throw new Error('not implemented');
	}

	public renameWatchExpression(id: string, newName: string): Promise<void> {
		throw new Error('not implemented');
	}

	public removeWatchExpressions(id?: string): void { }

	public startDebugging(launch: ILaunch, configOrName?: IConfig | string, noDebug?: boolean): Promise<boolean> {
		return Promise.resolve(true);
	}

	public restartSession(): Promise<any> {
		throw new Error('not implemented');
	}

	public stopSession(): Promise<any> {
		throw new Error('not implemented');
	}

	public getModel(): IDebugModel {
		throw new Error('not implemented');
	}

	public getViewModel(): IViewModel {
		throw new Error('not implemented');
	}

	public logToRepl(session: IDebugSession, value: string): void { }

	public sourceIsNotAvailable(uri: uri): void { }

	public tryToAutoFocusStackFrame(thread: IThread): Promise<any> {
		throw new Error('not implemented');
	}
}

export class MockSession implements IDebugSession {
	dataBreakpointInfo(name: string, variablesReference?: number | undefined): Promise<{ dataId: string | null; description: string; canPersist?: boolean | undefined; }> {
		throw new Error('Method not implemented.');
	}

	sendDataBreakpoints(dbps: IDataBreakpoint[]): Promise<void> {
		throw new Error('Method not implemented.');
	}

	subId: string | undefined;

	setSubId(subId: string | undefined): void {
		throw new Error('Method not implemented.');
	}

	get parentSession(): IDebugSession | undefined {
		return undefined;
	}

	getReplElements(): IReplElement[] {
		return [];
	}

	removeReplExpressions(): void { }
	get onDidChangeReplElements(): Event<void> {
		throw new Error('not implemented');
	}

	addReplExpression(stackFrame: IStackFrame, name: string): Promise<void> {
		return Promise.resolve(undefined);
	}

	appendToRepl(data: string | IExpression, severity: Severity, source?: IReplElementSource): void { }
	logToRepl(sev: Severity, args: any[], frame?: { uri: uri; line: number; column: number; }) { }

	configuration: IConfig = { type: 'mock', name: 'mock', request: 'launch' };
	unresolvedConfiguration: IConfig = { type: 'mock', name: 'mock', request: 'launch' };
	state = State.Stopped;
	root!: IWorkspaceFolder;
	capabilities: DebugProtocol.Capabilities = {};

	getId(): string {
		return 'mock';
	}

	getLabel(): string {
		return 'mockname';
	}

	getSourceForUri(modelUri: uri): Source {
		throw new Error('not implemented');
	}

	getThread(threadId: number): IThread {
		throw new Error('not implemented');
	}

	get onDidCustomEvent(): Event<DebugProtocol.Event> {
		throw new Error('not implemented');
	}

	get onDidLoadedSource(): Event<LoadedSourceEvent> {
		throw new Error('not implemented');
	}

	get onDidChangeState(): Event<void> {
		throw new Error('not implemented');
	}

	get onDidEndAdapter(): Event<AdapterEndEvent> {
		throw new Error('not implemented');
	}

	setConfiguration(configuration: { resolved: IConfig, unresolved: IConfig }) { }

	getAllThreads(): IThread[] {
		return [];
	}

	getSource(raw: DebugProtocol.Source): Source {
		throw new Error('not implemented');
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

	gotoTargets(source: DebugProtocol.Source, line: number, column?: number | undefined): Promise<DebugProtocol.GotoTargetsResponse> {
		throw new Error('Method not implemented.');
	}
	goto(threadId: number, targetId: number): Promise<DebugProtocol.GotoResponse> {
		throw new Error('Method not implemented.');
	}

	shutdown(): void { }
}

export class MockRawSession {

	capabilities: DebugProtocol.Capabilities = {};
	disconnected = false;
	sessionLengthInSeconds: number = 0;

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
		throw new Error('not implemented');
	}

	public launchOrAttach(args: IConfig): Promise<DebugProtocol.Response> {
		throw new Error('not implemented');
	}

	public scopes(args: DebugProtocol.ScopesArguments): Promise<DebugProtocol.ScopesResponse> {
		throw new Error('not implemented');
	}

	public variables(args: DebugProtocol.VariablesArguments): Promise<DebugProtocol.VariablesResponse> {
		throw new Error('not implemented');
	}

	evaluate(args: DebugProtocol.EvaluateArguments): Promise<DebugProtocol.EvaluateResponse> {
		return Promise.resolve(null!);
	}

	public custom(request: string, args: any): Promise<DebugProtocol.Response> {
		throw new Error('not implemented');
	}

	public terminate(restart = false): Promise<DebugProtocol.TerminateResponse> {
		throw new Error('not implemented');
	}

	public disconnect(restart?: boolean): Promise<any> {
		throw new Error('not implemented');
	}

	public threads(): Promise<DebugProtocol.ThreadsResponse> {
		throw new Error('not implemented');
	}

	public stepIn(args: DebugProtocol.StepInArguments): Promise<DebugProtocol.StepInResponse> {
		throw new Error('not implemented');
	}

	public stepOut(args: DebugProtocol.StepOutArguments): Promise<DebugProtocol.StepOutResponse> {
		throw new Error('not implemented');
	}

	public stepBack(args: DebugProtocol.StepBackArguments): Promise<DebugProtocol.StepBackResponse> {
		throw new Error('not implemented');
	}

	public continue(args: DebugProtocol.ContinueArguments): Promise<DebugProtocol.ContinueResponse> {
		throw new Error('not implemented');
	}

	public reverseContinue(args: DebugProtocol.ReverseContinueArguments): Promise<DebugProtocol.ReverseContinueResponse> {
		throw new Error('not implemented');
	}

	public pause(args: DebugProtocol.PauseArguments): Promise<DebugProtocol.PauseResponse> {
		throw new Error('not implemented');
	}

	public terminateThreads(args: DebugProtocol.TerminateThreadsArguments): Promise<DebugProtocol.TerminateThreadsResponse> {
		throw new Error('not implemented');
	}

	public setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse> {
		throw new Error('not implemented');
	}

	public restartFrame(args: DebugProtocol.RestartFrameArguments): Promise<DebugProtocol.RestartFrameResponse> {
		throw new Error('not implemented');
	}

	public completions(args: DebugProtocol.CompletionsArguments): Promise<DebugProtocol.CompletionsResponse> {
		throw new Error('not implemented');
	}

	public next(args: DebugProtocol.NextArguments): Promise<DebugProtocol.NextResponse> {
		throw new Error('not implemented');
	}

	public source(args: DebugProtocol.SourceArguments): Promise<DebugProtocol.SourceResponse> {
		throw new Error('not implemented');
	}

	public loadedSources(args: DebugProtocol.LoadedSourcesArguments): Promise<DebugProtocol.LoadedSourcesResponse> {
		throw new Error('not implemented');
	}

	public setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): Promise<DebugProtocol.SetBreakpointsResponse> {
		throw new Error('not implemented');
	}

	public setFunctionBreakpoints(args: DebugProtocol.SetFunctionBreakpointsArguments): Promise<DebugProtocol.SetFunctionBreakpointsResponse> {
		throw new Error('not implemented');
	}

	public setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): Promise<DebugProtocol.SetExceptionBreakpointsResponse> {
		throw new Error('not implemented');
	}

	public readonly onDidStop: Event<DebugProtocol.StoppedEvent> = null!;
}
