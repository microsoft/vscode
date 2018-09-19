/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI as uri } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import { Event } from 'vs/base/common/event';
import { IJSONSchemaSnippet } from 'vs/base/common/jsonSchema';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel as EditorIModel } from 'vs/editor/common/model';
import { IEditor } from 'vs/workbench/common/editor';
import { Position } from 'vs/editor/common/core/position';
import { ISuggestion } from 'vs/editor/common/modes';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { Range, IRange } from 'vs/editor/common/core/range';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IViewContainersRegistry, ViewContainer, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { TaskIdentifier } from 'vs/workbench/parts/tasks/common/tasks';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IOutputService } from 'vs/workbench/parts/output/common/output';

export const VIEWLET_ID = 'workbench.view.debug';
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(VIEWLET_ID);

export const VARIABLES_VIEW_ID = 'workbench.debug.variablesView';
export const WATCH_VIEW_ID = 'workbench.debug.watchExpressionsView';
export const CALLSTACK_VIEW_ID = 'workbench.debug.callStackView';
export const LOADED_SCRIPTS_VIEW_ID = 'workbench.debug.loadedScriptsView';
export const BREAKPOINTS_VIEW_ID = 'workbench.debug.breakPointsView';
export const REPL_ID = 'workbench.panel.repl';
export const DEBUG_SERVICE_ID = 'debugService';
export const CONTEXT_DEBUG_TYPE = new RawContextKey<string>('debugType', undefined);
export const CONTEXT_DEBUG_STATE = new RawContextKey<string>('debugState', 'inactive');
export const CONTEXT_IN_DEBUG_MODE = new RawContextKey<boolean>('inDebugMode', false);
export const CONTEXT_NOT_IN_DEBUG_MODE = CONTEXT_IN_DEBUG_MODE.toNegated();
export const CONTEXT_IN_DEBUG_REPL = new RawContextKey<boolean>('inDebugRepl', false);
export const CONTEXT_BREAKPOINT_WIDGET_VISIBLE = new RawContextKey<boolean>('breakpointWidgetVisible', false);
export const CONTEXT_IN_BREAKPOINT_WIDGET = new RawContextKey<boolean>('inBreakpointWidget', false);
export const CONTEXT_BREAKPOINTS_FOCUSED = new RawContextKey<boolean>('breakpointsFocused', true);
export const CONTEXT_WATCH_EXPRESSIONS_FOCUSED = new RawContextKey<boolean>('watchExpressionsFocused', true);
export const CONTEXT_VARIABLES_FOCUSED = new RawContextKey<boolean>('variablesFocused', true);
export const CONTEXT_EXPRESSION_SELECTED = new RawContextKey<boolean>('expressionSelected', false);
export const CONTEXT_BREAKPOINT_SELECTED = new RawContextKey<boolean>('breakpointSelected', false);
export const CONTEXT_CALLSTACK_ITEM_TYPE = new RawContextKey<string>('callStackItemType', undefined);
export const CONTEXT_LOADED_SCRIPTS_SUPPORTED = new RawContextKey<boolean>('loadedScriptsSupported', false);
export const CONTEXT_LOADED_SCRIPTS_ITEM_TYPE = new RawContextKey<string>('loadedScriptsItemType', undefined);

export const EDITOR_CONTRIBUTION_ID = 'editor.contrib.debug';
export const DEBUG_SCHEME = 'debug';
export const INTERNAL_CONSOLE_OPTIONS_SCHEMA = {
	enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
	default: 'openOnFirstSessionStart',
	description: nls.localize('internalConsoleOptions', "Controls when the internal debug console should open.")
};

// raw

export interface IRawModelUpdate {
	threadId: number;
	sessionId: string;
	thread?: DebugProtocol.Thread;
	callStack?: DebugProtocol.StackFrame[];
	stoppedDetails?: IRawStoppedDetails;
}

export interface IRawStoppedDetails {
	reason: string;
	description?: string;
	threadId?: number;
	text?: string;
	totalFrames?: number;
	allThreadsStopped?: boolean;
	framesErrorMessage?: string;
}

// model

export interface ITreeElement {
	getId(): string;
}

export interface IReplElement extends ITreeElement {
	toString(): string;
	readonly sourceData?: IReplElementSource;
}

export interface IReplElementSource {
	readonly source: Source;
	readonly lineNumber: number;
	readonly column: number;
}

export interface IExpressionContainer extends ITreeElement {
	readonly hasChildren: boolean;
	getChildren(): TPromise<ReadonlyArray<IExpression>>;
}

export interface IExpression extends IReplElement, IExpressionContainer {
	name: string;
	readonly value: string;
	readonly valueChanged?: boolean;
	readonly type?: string;
}

export interface IDebugger {
	createDebugAdapter(session: IDebugSession, root: IWorkspaceFolder, config: IConfig, outputService: IOutputService): TPromise<IDebugAdapter>;
	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments): TPromise<void>;
	getCustomTelemetryService(): TPromise<TelemetryService>;
}

export type ActualBreakpoints = { [id: string]: DebugProtocol.Breakpoint };

export enum State {
	Inactive,
	Initializing,
	Stopped,
	Running
}

export class AdapterEndEvent {
	error?: Error;
	sessionLengthInSeconds: number;
	emittedStopped: boolean;
}

export interface LoadedSourceEvent {
	reason: 'new' | 'changed' | 'removed';
	source: Source;
}

export interface IDebugSession extends ITreeElement {

	readonly configuration: IConfig;
	readonly unresolvedConfiguration: IConfig;
	readonly state: State;
	readonly root: IWorkspaceFolder;

	getName(includeRoot: boolean): string;

	getSourceForUri(modelUri: uri): Source;
	getSource(raw: DebugProtocol.Source): Source;

	rawUpdate(data: IRawModelUpdate): void;

	// session events
	readonly onDidEndAdapter: Event<AdapterEndEvent>;
	readonly onDidChangeState: Event<State>;

	// DA capabilities
	readonly capabilities: DebugProtocol.Capabilities;

	// DAP events

	readonly onDidLoadedSource: Event<LoadedSourceEvent>;
	readonly onDidCustomEvent: Event<DebugProtocol.Event>;

	// Disconnects and clears state. Session can be initialized again for a new connection.
	shutdown(): void;

	// DAP request

	initialize(dbgr: IDebugger): TPromise<void>;
	launchOrAttach(config: IConfig): TPromise<void>;
	restart(): TPromise<DebugProtocol.RestartResponse>;
	terminate(restart?: boolean /* false */): TPromise<void>;
	disconnect(restart?: boolean /* false */): TPromise<void>;

	sendBreakpoints(modelUri: uri, bpts: IBreakpoint[], sourceModified: boolean): TPromise<ActualBreakpoints | undefined>;
	sendFunctionBreakpoints(fbps: IFunctionBreakpoint[]): TPromise<ActualBreakpoints | undefined>;
	sendExceptionBreakpoints(exbpts: IExceptionBreakpoint[]): TPromise<any>;

	stackTrace(threadId: number, startFrame: number, levels: number): TPromise<DebugProtocol.StackTraceResponse>;
	exceptionInfo(threadId: number): TPromise<IExceptionInfo>;
	scopes(frameId: number): TPromise<DebugProtocol.ScopesResponse>;
	variables(variablesReference: number, filter: 'indexed' | 'named', start: number, count: number): TPromise<DebugProtocol.VariablesResponse>;
	evaluate(expression: string, frameId?: number, context?: string): TPromise<DebugProtocol.EvaluateResponse>;
	customRequest(request: string, args: any): TPromise<DebugProtocol.Response>;

	restartFrame(frameId: number, threadId: number): TPromise<DebugProtocol.RestartFrameResponse>;
	next(threadId: number): TPromise<DebugProtocol.NextResponse>;
	stepIn(threadId: number): TPromise<DebugProtocol.StepInResponse>;
	stepOut(threadId: number): TPromise<DebugProtocol.StepOutResponse>;
	stepBack(threadId: number): TPromise<DebugProtocol.StepBackResponse>;
	continue(threadId: number): TPromise<DebugProtocol.ContinueResponse>;
	reverseContinue(threadId: number): TPromise<DebugProtocol.ReverseContinueResponse>;
	pause(threadId: number): TPromise<DebugProtocol.PauseResponse>;
	terminateThreads(threadIds: number[]): TPromise<DebugProtocol.TerminateThreadsResponse>;

	completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]>;
	setVariable(variablesReference: number, name: string, value: string): TPromise<DebugProtocol.SetVariableResponse>;
	loadSource(resource: uri): TPromise<DebugProtocol.SourceResponse>;
	getLoadedSources(): TPromise<Source[]>;

	getThread(threadId: number): IThread;
	getAllThreads(): ReadonlyArray<IThread>;
	clearThreads(removeThreads: boolean, reference?: number): void;
}

export interface IThread extends ITreeElement {

	/**
	 * Process the thread belongs to
	 */
	readonly session: IDebugSession;

	/**
	 * Id of the thread generated by the debug adapter backend.
	 */
	readonly threadId: number;

	/**
	 * Name of the thread.
	 */
	readonly name: string;

	/**
	 * Information about the current thread stop event. Null if thread is not stopped.
	 */
	readonly stoppedDetails: IRawStoppedDetails;

	/**
	 * Information about the exception if an 'exception' stopped event raised and DA supports the 'exceptionInfo' request, otherwise null.
	 */
	readonly exceptionInfo: TPromise<IExceptionInfo>;

	/**
	 * Gets the callstack if it has already been received from the debug
	 * adapter, otherwise it returns null.
	 */
	getCallStack(): ReadonlyArray<IStackFrame>;

	/**
	 * Invalidates the callstack cache
	 */
	clearCallStack(): void;

	/**
	 * Indicates whether this thread is stopped. The callstack for stopped
	 * threads can be retrieved from the debug adapter.
	 */
	readonly stopped: boolean;

	next(): TPromise<any>;
	stepIn(): TPromise<any>;
	stepOut(): TPromise<any>;
	stepBack(): TPromise<any>;
	continue(): TPromise<any>;
	pause(): TPromise<any>;
	terminate(): TPromise<any>;
	reverseContinue(): TPromise<any>;
}

export interface IScope extends IExpressionContainer {
	readonly name: string;
	readonly expensive: boolean;
	readonly range?: IRange;
}

export interface IStackFrame extends ITreeElement {
	readonly thread: IThread;
	readonly name: string;
	readonly presentationHint: string;
	readonly frameId: number;
	readonly range: IRange;
	readonly source: Source;
	getScopes(): TPromise<ReadonlyArray<IScope>>;
	getMostSpecificScopes(range: IRange): TPromise<ReadonlyArray<IScope>>;
	getSpecificSourceName(): string;
	restart(): TPromise<any>;
	toString(): string;
	openInEditor(editorService: IEditorService, preserveFocus?: boolean, sideBySide?: boolean): TPromise<any>;
}

export interface IEnablement extends ITreeElement {
	readonly enabled: boolean;
}

export interface IBreakpointData {
	readonly id?: string;
	readonly lineNumber: number;
	readonly column?: number;
	readonly enabled?: boolean;
	readonly condition?: string;
	readonly logMessage?: string;
	readonly hitCondition?: string;
}

export interface IBreakpointUpdateData {
	readonly condition?: string;
	readonly hitCondition?: string;
	readonly logMessage?: string;
	readonly lineNumber?: number;
	readonly column?: number;
}

export interface IBaseBreakpoint extends IEnablement {
	readonly condition: string;
	readonly hitCondition: string;
	readonly logMessage: string;
	readonly verified: boolean;
	readonly idFromAdapter: number;
}

export interface IBreakpoint extends IBaseBreakpoint {
	readonly uri: uri;
	readonly lineNumber: number;
	readonly endLineNumber?: number;
	readonly column: number;
	readonly endColumn?: number;
	readonly message: string;
	readonly adapterData: any;
}

export interface IFunctionBreakpoint extends IBaseBreakpoint {
	readonly name: string;
}

export interface IExceptionBreakpoint extends IEnablement {
	readonly filter: string;
	readonly label: string;
}

export interface IExceptionInfo {
	readonly id?: string;
	readonly description?: string;
	readonly breakMode: string;
	readonly details?: DebugProtocol.ExceptionDetails;
}

// model interfaces

export interface IViewModel extends ITreeElement {
	/**
	 * Returns the focused debug session or null if no session is stopped.
	 */
	readonly focusedSession: IDebugSession;

	/**
	 * Returns the focused thread or null if no thread is stopped.
	 */
	readonly focusedThread: IThread;

	/**
	 * Returns the focused stack frame or null if there are no stack frames.
	 */
	readonly focusedStackFrame: IStackFrame;

	getSelectedExpression(): IExpression;
	getSelectedFunctionBreakpoint(): IFunctionBreakpoint;
	setSelectedExpression(expression: IExpression): void;
	setSelectedFunctionBreakpoint(functionBreakpoint: IFunctionBreakpoint): void;

	isMultiSessionView(): boolean;

	onDidFocusSession: Event<IDebugSession | undefined>;
	onDidFocusStackFrame: Event<{ stackFrame: IStackFrame, explicit: boolean }>;
	onDidSelectExpression: Event<IExpression>;
}

export interface IModel extends ITreeElement {
	getSessions(): ReadonlyArray<IDebugSession>;
	getBreakpoints(filter?: { uri?: uri, lineNumber?: number, column?: number, enabledOnly?: boolean }): ReadonlyArray<IBreakpoint>;
	areBreakpointsActivated(): boolean;
	getFunctionBreakpoints(): ReadonlyArray<IFunctionBreakpoint>;
	getExceptionBreakpoints(): ReadonlyArray<IExceptionBreakpoint>;
	getWatchExpressions(): ReadonlyArray<IExpression>;
	getReplElements(): ReadonlyArray<IReplElement>;

	onDidChangeBreakpoints: Event<IBreakpointsChangeEvent>;
	onDidChangeCallStack: Event<void>;
	onDidChangeWatchExpressions: Event<IExpression>;
	onDidChangeReplElements: Event<void>;
}

/**
 * An event describing a change to the set of [breakpoints](#debug.Breakpoint).
 */
export interface IBreakpointsChangeEvent {
	added?: (IBreakpoint | IFunctionBreakpoint)[];
	removed?: (IBreakpoint | IFunctionBreakpoint)[];
	changed?: (IBreakpoint | IFunctionBreakpoint)[];
	sessionOnly?: boolean;
}

// Debug configuration interfaces

export interface IDebugConfiguration {
	allowBreakpointsEverywhere: boolean;
	openDebug: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart' | 'openOnDebugBreak';
	openExplorerOnEnd: boolean;
	inlineValues: boolean;
	toolBarLocation: 'floating' | 'docked' | 'hidden';
	showInStatusBar: 'never' | 'always' | 'onFirstSessionStart';
	internalConsoleOptions: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
	extensionHostDebugAdapter: boolean;
	enableAllHovers: boolean;
}

export interface IGlobalConfig {
	version: string;
	compounds: ICompound[];
	configurations: IConfig[];
}

export interface IEnvConfig {
	internalConsoleOptions?: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
	preLaunchTask?: string | TaskIdentifier;
	postDebugTask?: string | TaskIdentifier;
	debugServer?: number;
	noDebug?: boolean;
}

export interface IConfig extends IEnvConfig {

	// fundamental attributes
	type: string;
	request: string;
	name?: string;

	// platform specifics
	windows?: IEnvConfig;
	osx?: IEnvConfig;
	linux?: IEnvConfig;

	// internals
	__sessionId?: string;
	__restart?: any;
	__autoAttach?: boolean;
	port?: number; // TODO
}

export interface ICompound {
	name: string;
	configurations: (string | { name: string, folder: string })[];
}

export interface IDebugAdapter extends IDisposable {
	readonly onError: Event<Error>;
	readonly onExit: Event<number>;
	onRequest(callback: (request: DebugProtocol.Request) => void);
	onEvent(callback: (event: DebugProtocol.Event) => void);
	startSession(): TPromise<void>;
	sendMessage(message: DebugProtocol.ProtocolMessage): void;
	sendResponse(response: DebugProtocol.Response): void;
	sendRequest(command: string, args: any, clb: (result: DebugProtocol.Response) => void, timemout?: number): void;
	stopSession(): TPromise<void>;
}

export interface IDebugAdapterProvider extends ITerminalLauncher {
	createDebugAdapter(session: IDebugSession, folder: IWorkspaceFolder, config: IConfig): IDebugAdapter;
	substituteVariables(folder: IWorkspaceFolder, config: IConfig): TPromise<IConfig>;
}

export interface IAdapterExecutable {
	readonly type: 'executable';
	readonly command: string;
	readonly args: string[];
	readonly cwd?: string;
	readonly env?: { [key: string]: string };
}

export interface IAdapterServer {
	readonly type: 'server';
	readonly port: number;
	readonly host?: string;
}

export type IAdapterDescriptor = IAdapterExecutable | IAdapterServer;

export interface IPlatformSpecificAdapterContribution {
	program?: string;
	args?: string[];
	runtime?: string;
	runtimeArgs?: string[];
}

export interface IDebuggerContribution extends IPlatformSpecificAdapterContribution {
	type?: string;
	label?: string;
	// debug adapter executable
	adapterExecutableCommand?: string;
	win?: IPlatformSpecificAdapterContribution;
	winx86?: IPlatformSpecificAdapterContribution;
	windows?: IPlatformSpecificAdapterContribution;
	osx?: IPlatformSpecificAdapterContribution;
	linux?: IPlatformSpecificAdapterContribution;

	// internal
	aiKey?: string;

	// supported languages
	languages?: string[];
	enableBreakpointsFor?: { languageIds: string[] };

	// debug configuration support
	configurationAttributes?: any;
	initialConfigurations?: any[];
	configurationSnippets?: IJSONSchemaSnippet[];
	variables?: { [key: string]: string };
}

export interface IDebugConfigurationProvider {
	readonly type: string;
	handle: number;
	resolveDebugConfiguration?(folderUri: uri | undefined, debugConfiguration: IConfig): TPromise<IConfig>;
	provideDebugConfigurations?(folderUri: uri | undefined): TPromise<IConfig[]>;
	provideDebugAdapter?(session: IDebugSession, folderUri: uri | undefined, config: IConfig): TPromise<IAdapterDescriptor>;
}

export interface ITerminalLauncher {
	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void>;
}

export interface ITerminalSettings {
	external: {
		windowsExec: string,
		osxExec: string,
		linuxExec: string
	};
	integrated: {
		shell: {
			osx: string,
			windows: string,
			linux: string
		}
	};
}

export interface IConfigurationManager {
	/**
	 * Returns true if breakpoints can be set for a given editor model. Depends on mode.
	 */
	canSetBreakpointsIn(model: EditorIModel): boolean;

	/**
	 * Returns an object containing the selected launch configuration and the selected configuration name. Both these fields can be null (no folder workspace).
	 */
	readonly selectedConfiguration: {
		launch: ILaunch;
		name: string;
	};

	selectConfiguration(launch: ILaunch, name?: string, debugStarted?: boolean): void;

	getLaunches(): ReadonlyArray<ILaunch>;

	getLaunch(workspaceUri: uri): ILaunch | undefined;

	/**
	 * Allows to register on change of selected debug configuration.
	 */
	onDidSelectConfiguration: Event<void>;

	registerDebugConfigurationProvider(handle: number, debugConfigurationProvider: IDebugConfigurationProvider): void;
	unregisterDebugConfigurationProvider(handle: number): void;

	resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, debugConfiguration: any): TPromise<any>;
	provideDebugAdapter(session: IDebugSession, folderUri: uri | undefined, config: IConfig): TPromise<IAdapterDescriptor | undefined>;

	registerDebugAdapterProvider(debugTypes: string[], debugAdapterLauncher: IDebugAdapterProvider): IDisposable;
	createDebugAdapter(session: IDebugSession, folder: IWorkspaceFolder, config: IConfig): IDebugAdapter;

	substituteVariables(debugType: string, folder: IWorkspaceFolder, config: IConfig): TPromise<IConfig>;
	runInTerminal(debugType: string, args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void>;
}

export interface ILaunch {

	/**
	 * Resource pointing to the launch.json this object is wrapping.
	 */
	readonly uri: uri;

	/**
	 * Name of the launch.
	 */
	readonly name: string;

	/**
	 * Workspace of the launch. Can be null.
	 */
	readonly workspace: IWorkspaceFolder;

	/**
	 * Should this launch be shown in the debug dropdown.
	 */
	readonly hidden: boolean;

	/**
	 * Returns a configuration with the specified name.
	 * Returns null if there is no configuration with the specified name.
	 */
	getConfiguration(name: string): IConfig;

	/**
	 * Returns a compound with the specified name.
	 * Returns null if there is no compound with the specified name.
	 */
	getCompound(name: string): ICompound;

	/**
	 * Returns the names of all configurations and compounds.
	 * Ignores configurations which are invalid.
	 */
	getConfigurationNames(includeCompounds?: boolean): string[];

	/**
	 * Opens the launch.json file. Creates if it does not exist.
	 */
	openConfigFile(sideBySide: boolean, preserveFocus: boolean, type?: string): TPromise<{ editor: IEditor, created: boolean }>;
}

// Debug service interfaces

export const IDebugService = createDecorator<IDebugService>(DEBUG_SERVICE_ID);

export interface IDebugService {
	_serviceBrand: any;

	/**
	 * Gets the current debug state.
	 */
	readonly state: State;

	/**
	 * Allows to register on debug state changes.
	 */
	onDidChangeState: Event<State>;

	/**
	 * Allows to register on new session events.
	 */
	onDidNewSession: Event<IDebugSession>;

	/**
	 * Allows to register on sessions about to be created (not yet fully initialised)
	 */
	onWillNewSession: Event<IDebugSession>;

	/**
	 * Allows to register on end session events.
	 */
	onDidEndSession: Event<IDebugSession>;

	/**
	 * Gets the current configuration manager.
	 */
	getConfigurationManager(): IConfigurationManager;

	/**
	 * Sets the focused stack frame and evaluates all expressions against the newly focused stack frame,
	 */
	focusStackFrame(focusedStackFrame: IStackFrame, thread?: IThread, session?: IDebugSession, explicit?: boolean): void;

	/**
	 * Adds new breakpoints to the model for the file specified with the uri. Notifies debug adapter of breakpoint changes.
	 */
	addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): TPromise<IBreakpoint[]>;

	/**
	 * Updates the breakpoints.
	 */
	updateBreakpoints(uri: uri, data: { [id: string]: IBreakpointUpdateData }, sendOnResourceSaved: boolean): void;

	/**
	 * Enables or disables all breakpoints. If breakpoint is passed only enables or disables the passed breakpoint.
	 * Notifies debug adapter of breakpoint changes.
	 */
	enableOrDisableBreakpoints(enable: boolean, breakpoint?: IEnablement): TPromise<void>;

	/**
	 * Sets the global activated property for all breakpoints.
	 * Notifies debug adapter of breakpoint changes.
	 */
	setBreakpointsActivated(activated: boolean): TPromise<void>;

	/**
	 * Removes all breakpoints. If id is passed only removes the breakpoint associated with that id.
	 * Notifies debug adapter of breakpoint changes.
	 */
	removeBreakpoints(id?: string): TPromise<any>;

	/**
	 * Adds a new function breakpoint for the given name.
	 */
	addFunctionBreakpoint(name?: string, id?: string): void;

	/**
	 * Renames an already existing function breakpoint.
	 * Notifies debug adapter of breakpoint changes.
	 */
	renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void>;

	/**
	 * Removes all function breakpoints. If id is passed only removes the function breakpoint with the passed id.
	 * Notifies debug adapter of breakpoint changes.
	 */
	removeFunctionBreakpoints(id?: string): TPromise<void>;

	/**
	 * Sends all breakpoints to the passed session.
	 * If session is not passed, sends all breakpoints to each session.
	 */
	sendAllBreakpoints(session?: IDebugSession): TPromise<any>;

	/**
	 * Adds a new expression to the repl.
	 */
	addReplExpression(name: string): TPromise<void>;

	/**
	 * Removes all repl expressions.
	 */
	removeReplExpressions(): void;

	/**
	 * Appends the passed string to the debug repl.
	 */
	logToRepl(value: string | IExpression, sev?: severity, source?: IReplElementSource): void;

	/**
	 * Adds a new watch expression and evaluates it against the debug adapter.
	 */
	addWatchExpression(name?: string): void;

	/**
	 * Renames a watch expression and evaluates it against the debug adapter.
	 */
	renameWatchExpression(id: string, newName: string): void;

	/**
	 * Moves a watch expression to a new possition. Used for reordering watch expressions.
	 */
	moveWatchExpression(id: string, position: number): void;

	/**
	 * Removes all watch expressions. If id is passed only removes the watch expression with the passed id.
	 */
	removeWatchExpressions(id?: string): void;

	/**
	 * Starts debugging. If the configOrName is not passed uses the selected configuration in the debug dropdown.
	 * Also saves all files, manages if compounds are present in the configuration
	 * and resolveds configurations via DebugConfigurationProviders.
	 */
	startDebugging(launch: ILaunch, configOrName?: IConfig | string, noDebug?: boolean): TPromise<void>;

	/**
	 * Restarts a session or creates a new one if there is no active session.
	 */
	restartSession(session: IDebugSession, restartData?: any): TPromise<any>;

	/**
	 * Stops the session. If the session does not exist then stops all sessions.
	 */
	stopSession(session: IDebugSession): TPromise<any>;

	/**
	 * Makes unavailable all sources with the passed uri. Source will appear as grayed out in callstack view.
	 */
	sourceIsNotAvailable(uri: uri): void;

	/**
	 * returns Session with the given ID (or undefined if ID is not found)
	 */
	getSession(sessionId: string): IDebugSession;

	/**
	 * Gets the current debug model.
	 */
	getModel(): IModel;

	/**
	 * Gets the current view model.
	 */
	getViewModel(): IViewModel;

	/**
	 * Try to auto focus the top stack frame of the passed thread.
	 */
	tryToAutoFocusStackFrame(thread: IThread): TPromise<any>;
}

// Editor interfaces
export const enum BreakpointWidgetContext {
	CONDITION = 0,
	HIT_COUNT = 1,
	LOG_MESSAGE = 2
}

export interface IDebugEditorContribution extends IEditorContribution {
	showHover(range: Range, focus: boolean): TPromise<void>;
	showBreakpointWidget(lineNumber: number, column: number, context?: BreakpointWidgetContext): void;
	closeBreakpointWidget(): void;
	addLaunchConfiguration(): TPromise<any>;
}
