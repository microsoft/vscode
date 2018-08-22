/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
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

export interface IRawSession {
	stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse>;
	exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): TPromise<DebugProtocol.ExceptionInfoResponse>;
	scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse>;
	variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse>;
	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse>;

	readonly capabilities: DebugProtocol.Capabilities;
	disconnect(restart?: boolean): TPromise<any>;
	terminate(restart?: boolean): TPromise<DebugProtocol.TerminateResponse>;
	custom(request: string, args: any): TPromise<DebugProtocol.Response>;
	restartFrame(args: DebugProtocol.RestartFrameArguments, threadId: number): TPromise<DebugProtocol.RestartFrameResponse>;

	next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse>;
	stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse>;
	stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse>;
	continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse>;
	pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse>;
	terminateThreads(args: DebugProtocol.TerminateThreadsArguments): TPromise<DebugProtocol.TerminateThreadsResponse>;
	stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse>;
	reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse>;

	completions(args: DebugProtocol.CompletionsArguments): TPromise<DebugProtocol.CompletionsResponse>;
	setVariable(args: DebugProtocol.SetVariableArguments): TPromise<DebugProtocol.SetVariableResponse>;
	source(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse>;
	loadedSources(args: DebugProtocol.LoadedSourcesArguments): TPromise<DebugProtocol.LoadedSourcesResponse>;

}

export interface ISession extends ITreeElement, IDisposable {
	readonly configuration: IConfig;
	readonly raw: IRawSession;
	readonly state: State;
	readonly root: IWorkspaceFolder;

	getName(includeRoot: boolean): string;
	getSourceForUri(modelUri: uri): Source;
	getThread(threadId: number): IThread;
	getAllThreads(): ReadonlyArray<IThread>;
	getSource(raw: DebugProtocol.Source): Source;
	getLoadedSources(): TPromise<Source[]>;
	completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]>;
	clearThreads(removeThreads: boolean, reference?: number): void;

	rawUpdate(data: IRawModelUpdate): void;

	/**
	 * Allows to register on loaded source events.
	 */
	onDidLoadedSource: Event<LoadedSourceEvent>;

	/**
	 * Allows to register on custom DAP events.
	 */
	onDidCustomEvent: Event<DebugEvent>;

	onDidExitAdapter: Event<void>;
}

export interface IThread extends ITreeElement {

	/**
	 * Process the thread belongs to
	 */
	readonly session: ISession;

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
	readonly focusedSession: ISession;

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

	onDidFocusSession: Event<ISession | undefined>;
	onDidFocusStackFrame: Event<{ stackFrame: IStackFrame, explicit: boolean }>;
	onDidSelectExpression: Event<IExpression>;
}

export interface IModel extends ITreeElement {
	getSessions(): ReadonlyArray<ISession>;
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

// Debug enums

export enum State {
	Inactive,
	Initializing,
	Stopped,
	Running
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
	sendRequest(command: string, args: any, clb: (result: DebugProtocol.Response) => void): void;
	stopSession(): TPromise<void>;
}

export interface IDebugAdapterProvider extends ITerminalLauncher {
	createDebugAdapter(debugType: string, adapterInfo: IAdapterExecutable | null, debugPort: number): IDebugAdapter;
	substituteVariables(folder: IWorkspaceFolder, config: IConfig): TPromise<IConfig>;
}

export interface IAdapterExecutable {
	readonly command?: string;
	readonly args?: string[];
}

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
	debugAdapterExecutable(folderUri: uri | undefined): TPromise<IAdapterExecutable>;
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
	debugAdapterExecutable(folderUri: uri | undefined, type: string): TPromise<IAdapterExecutable | undefined>;

	registerDebugAdapterProvider(debugTypes: string[], debugAdapterLauncher: IDebugAdapterProvider): IDisposable;
	createDebugAdapter(debugType: string, adapterExecutable: IAdapterExecutable | null, debugPort?: number): IDebugAdapter | undefined;
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

export interface DebugEvent extends DebugProtocol.Event {
	sessionId?: string;
}

export interface LoadedSourceEvent {
	reason: string;
	source: Source;
}

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
	onDidNewSession: Event<ISession>;

	/**
	 * Allows to register on end session events.
	 */
	onDidEndSession: Event<ISession>;

	/**
	 * Gets the current configuration manager.
	 */
	getConfigurationManager(): IConfigurationManager;

	/**
	 * Sets the focused stack frame and evaluates all expressions against the newly focused stack frame,
	 */
	focusStackFrame(focusedStackFrame: IStackFrame, thread?: IThread, session?: ISession, explicit?: boolean): void;

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
	restartSession(session: ISession, restartData?: any): TPromise<any>;

	/**
	 * Stops the session. If the session does not exist then stops all sessions.
	 */
	stopSession(session: ISession): TPromise<any>;

	/**
	 * Makes unavailable all sources with the passed uri. Source will appear as grayed out in callstack view.
	 */
	sourceIsNotAvailable(uri: uri): void;

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
export enum BreakpointWidgetContext {
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
