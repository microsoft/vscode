/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import Event from 'vs/base/common/event';
import { IJSONSchemaSnippet } from 'vs/base/common/jsonSchema';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel as EditorIModel } from 'vs/editor/common/model';
import { IEditor } from 'vs/platform/editor/common/editor';
import { Position } from 'vs/editor/common/core/position';
import { ISuggestion } from 'vs/editor/common/modes';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { Range, IRange } from 'vs/editor/common/core/range';
import { RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export const VIEWLET_ID = 'workbench.view.debug';
export const VARIABLES_VIEW_ID = 'workbench.debug.variablesView';
export const WATCH_VIEW_ID = 'workbench.debug.watchExpressionsView';
export const CALLSTACK_VIEW_ID = 'workbench.debug.callStackView';
export const BREAKPOINTS_VIEW_ID = 'workbench.debug.breakPointsView';
export const REPL_ID = 'workbench.panel.repl';
export const DEBUG_SERVICE_ID = 'debugService';
export const CONTEXT_DEBUG_TYPE = new RawContextKey<string>('debugType', undefined);
export const CONTEXT_DEBUG_STATE = new RawContextKey<string>('debugState', undefined);
export const CONTEXT_IN_DEBUG_MODE = new RawContextKey<boolean>('inDebugMode', false);
export const CONTEXT_NOT_IN_DEBUG_MODE: ContextKeyExpr = CONTEXT_IN_DEBUG_MODE.toNegated();
export const CONTEXT_IN_DEBUG_REPL = new RawContextKey<boolean>('inDebugRepl', false);
export const CONTEXT_NOT_IN_DEBUG_REPL: ContextKeyExpr = CONTEXT_IN_DEBUG_REPL.toNegated();
export const CONTEXT_ON_FIRST_DEBUG_REPL_LINE = new RawContextKey<boolean>('onFirsteDebugReplLine', false);
export const CONTEXT_ON_LAST_DEBUG_REPL_LINE = new RawContextKey<boolean>('onLastDebugReplLine', false);
export const CONTEXT_BREAKPOINT_WIDGET_VISIBLE = new RawContextKey<boolean>('breakpointWidgetVisible', false);
export const CONTEXT_BREAKPOINTS_FOCUSED = new RawContextKey<boolean>('breakpointsFocused', true);
export const CONTEXT_WATCH_EXPRESSIONS_FOCUSED = new RawContextKey<boolean>('watchExpressionsFocused', true);
export const CONTEXT_VARIABLES_FOCUSED = new RawContextKey<boolean>('variablesFocused', true);
export const CONTEXT_EXPRESSION_SELECTED = new RawContextKey<boolean>('expressionSelected', false);
export const CONTEXT_BREAKPOINT_SELECTED = new RawContextKey<boolean>('breakpointSelected', false);

export const EDITOR_CONTRIBUTION_ID = 'editor.contrib.debug';
export const DEBUG_SCHEME = 'debug';
export const INTERNAL_CONSOLE_OPTIONS_SCHEMA = {
	enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
	default: 'openOnFirstSessionStart',
	description: nls.localize('internalConsoleOptions', "Controls behavior of the internal debug console.")
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
	sourceData?: IReplElementSource;
}

export interface IReplElementSource {
	source: Source;
	lineNumber: number;
	column: number;
}

export interface IExpressionContainer extends ITreeElement {
	hasChildren: boolean;
	getChildren(): TPromise<IExpression[]>;
}

export interface IExpression extends IReplElement, IExpressionContainer {
	name: string;
	value: string;
	valueChanged?: boolean;
	type?: string;
}

export interface ISession {
	root: IWorkspaceFolder;
	stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse>;
	exceptionInfo(args: DebugProtocol.ExceptionInfoArguments): TPromise<DebugProtocol.ExceptionInfoResponse>;
	scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse>;
	variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse>;
	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse>;

	capabilities: DebugProtocol.Capabilities;
	disconnect(restart?: boolean, force?: boolean): TPromise<DebugProtocol.DisconnectResponse>;
	custom(request: string, args: any): TPromise<DebugProtocol.Response>;
	onDidEvent: Event<DebugProtocol.Event>;
	onDidInitialize: Event<DebugProtocol.InitializedEvent>;
	onDidExitAdapter: Event<DebugEvent>;
	restartFrame(args: DebugProtocol.RestartFrameArguments, threadId: number): TPromise<DebugProtocol.RestartFrameResponse>;

	next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse>;
	stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse>;
	stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse>;
	continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse>;
	pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse>;
	stepBack(args: DebugProtocol.StepBackArguments): TPromise<DebugProtocol.StepBackResponse>;
	reverseContinue(args: DebugProtocol.ReverseContinueArguments): TPromise<DebugProtocol.ReverseContinueResponse>;

	completions(args: DebugProtocol.CompletionsArguments): TPromise<DebugProtocol.CompletionsResponse>;
	setVariable(args: DebugProtocol.SetVariableArguments): TPromise<DebugProtocol.SetVariableResponse>;
	source(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse>;
}

export enum ProcessState {
	INACTIVE,
	ATTACH,
	LAUNCH
}

export interface IProcess extends ITreeElement {
	getName(includeRoot: boolean): string;
	configuration: IConfig;
	session: ISession;
	sources: Map<string, Source>;
	state: ProcessState;
	getThread(threadId: number): IThread;
	getAllThreads(): IThread[];
	getSource(raw: DebugProtocol.Source): Source;
	completions(frameId: number, text: string, position: Position, overwriteBefore: number): TPromise<ISuggestion[]>;
}

export interface IThread extends ITreeElement {

	/**
	 * Process the thread belongs to
	 */
	process: IProcess;

	/**
	 * Id of the thread generated by the debug adapter backend.
	 */
	threadId: number;

	/**
	 * Name of the thread.
	 */
	name: string;

	/**
	 * Information about the current thread stop event. Null if thread is not stopped.
	 */
	stoppedDetails: IRawStoppedDetails;

	/**
	 * Information about the exception if an 'exception' stopped event raised and DA supports the 'exceptionInfo' request, otherwise null.
	 */
	exceptionInfo: TPromise<IExceptionInfo>;

	/**
	 * Gets the callstack if it has already been received from the debug
	 * adapter, otherwise it returns null.
	 */
	getCallStack(): IStackFrame[];

	/**
	 * Invalidates the callstack cache
	 */
	clearCallStack(): void;

	/**
	 * Indicates whether this thread is stopped. The callstack for stopped
	 * threads can be retrieved from the debug adapter.
	 */
	stopped: boolean;

	next(): TPromise<any>;
	stepIn(): TPromise<any>;
	stepOut(): TPromise<any>;
	stepBack(): TPromise<any>;
	continue(): TPromise<any>;
	pause(): TPromise<any>;
	reverseContinue(): TPromise<any>;
}

export interface IScope extends IExpressionContainer {
	name: string;
	expensive: boolean;
	range?: IRange;
}

export interface IStackFrame extends ITreeElement {
	thread: IThread;
	name: string;
	presentationHint: string;
	frameId: number;
	range: IRange;
	source: Source;
	getScopes(): TPromise<IScope[]>;
	getMostSpecificScopes(range: IRange): TPromise<IScope[]>;
	restart(): TPromise<any>;
	toString(): string;
	openInEditor(editorService: IWorkbenchEditorService, preserveFocus?: boolean, sideBySide?: boolean): TPromise<any>;
}

export interface IEnablement extends ITreeElement {
	enabled: boolean;
}

export interface IBreakpointData {
	id?: string;
	lineNumber: number;
	column?: number;
	enabled?: boolean;
	condition?: string;
	hitCondition?: string;
}

export interface IBreakpointUpdateData extends DebugProtocol.Breakpoint {
	condition?: string;
	hitCondition?: string;
}

export interface IBreakpoint extends IEnablement {
	uri: uri;
	lineNumber: number;
	endLineNumber?: number;
	column: number;
	endColumn?: number;
	condition: string;
	hitCondition: string;
	verified: boolean;
	idFromAdapter: number;
	message: string;
}

export interface IFunctionBreakpoint extends IEnablement {
	name: string;
	verified: boolean;
	idFromAdapter: number;
	hitCondition: string;
}

export interface IExceptionBreakpoint extends IEnablement {
	filter: string;
	label: string;
}

export interface IExceptionInfo {
	id?: string;
	description?: string;
	breakMode: string;
	details?: DebugProtocol.ExceptionDetails;
}

// model interfaces

export interface IViewModel extends ITreeElement {
	/**
	 * Returns the focused debug process or null if no process is stopped.
	 */
	focusedProcess: IProcess;

	/**
	 * Returns the focused thread or null if no thread is stopped.
	 */
	focusedThread: IThread;

	/**
	 * Returns the focused stack frame or null if there are no stack frames.
	 */
	focusedStackFrame: IStackFrame;
	getSelectedExpression(): IExpression;
	getSelectedFunctionBreakpoint(): IFunctionBreakpoint;
	setSelectedExpression(expression: IExpression): void;
	setSelectedFunctionBreakpoint(functionBreakpoint: IFunctionBreakpoint): void;

	isMultiProcessView(): boolean;

	onDidFocusProcess: Event<IProcess | undefined>;
	onDidFocusStackFrame: Event<{ stackFrame: IStackFrame, explicit: boolean }>;
	onDidSelectExpression: Event<IExpression>;
}

export interface IModel extends ITreeElement {
	getProcesses(): IProcess[];
	getBreakpoints(): IBreakpoint[];
	areBreakpointsActivated(): boolean;
	getFunctionBreakpoints(): IFunctionBreakpoint[];
	getExceptionBreakpoints(): IExceptionBreakpoint[];
	getWatchExpressions(): IExpression[];
	getReplElements(): IReplElement[];

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
	openDebug: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
	openExplorerOnEnd: boolean;
	inlineValues: boolean;
	hideActionBar: boolean;
	showInStatusBar: 'never' | 'always' | 'onFirstSessionStart';
	internalConsoleOptions: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
}

export interface IGlobalConfig {
	version: string;
	compounds: ICompound[];
	configurations: IConfig[];
}

export interface IEnvConfig {
	name?: string;
	type: string;
	request: string;
	internalConsoleOptions?: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
	preLaunchTask?: string;
	__restart?: any;
	__sessionId?: string;
	debugServer?: number;
	noDebug?: boolean;
	port?: number;
}

export interface IConfig extends IEnvConfig {
	windows?: IEnvConfig;
	osx?: IEnvConfig;
	linux?: IEnvConfig;
}

export interface ICompound {
	name: string;
	configurations: (string | { name: string, folder: string })[];
}

export interface IAdapterExecutable {
	command?: string;
	args?: string[];
}

export interface IRawEnvAdapter {
	type?: string;
	label?: string;
	program?: string;
	args?: string[];
	runtime?: string;
	runtimeArgs?: string[];
}

export interface IRawAdapter extends IRawEnvAdapter {
	adapterExecutableCommand?: string;
	enableBreakpointsFor?: { languageIds: string[] };
	configurationAttributes?: any;
	configurationSnippets?: IJSONSchemaSnippet[];
	initialConfigurations?: any[];
	languages?: string[];
	variables?: { [key: string]: string };
	aiKey?: string;
	win?: IRawEnvAdapter;
	winx86?: IRawEnvAdapter;
	windows?: IRawEnvAdapter;
	osx?: IRawEnvAdapter;
	linux?: IRawEnvAdapter;
}

export interface IDebugConfigurationProvider {
	type: string;
	handle: number;
	resolveDebugConfiguration?(folderUri: uri | undefined, debugConfiguration: IConfig): TPromise<IConfig>;
	provideDebugConfigurations?(folderUri: uri | undefined): TPromise<IConfig[]>;
	debugAdapterExecutable(folderUri: uri | undefined): TPromise<IAdapterExecutable>;
}

export interface IConfigurationManager {
	/**
	 * Returns true if breakpoints can be set for a given editor model. Depends on mode.
	 */
	canSetBreakpointsIn(model: EditorIModel): boolean;

	/**
	 * Returns an object containing the selected launch configuration and the selected configuration name. Both these fields can be null (no folder workspace).
	 */
	selectedConfiguration: {
		launch: ILaunch;
		name: string;
	};

	selectConfiguration(launch: ILaunch, name?: string, debugStarted?: boolean): void;

	getLaunches(): ILaunch[];

	getLaunch(workspaceUri: uri): ILaunch | undefined;

	/**
	 * Allows to register on change of selected debug configuration.
	 */
	onDidSelectConfiguration: Event<void>;

	registerDebugConfigurationProvider(handle: number, debugConfigurationProvider: IDebugConfigurationProvider): void;
	unregisterDebugConfigurationProvider(handle: number): void;

	resolveConfigurationByProviders(folderUri: uri | undefined, type: string | undefined, debugConfiguration: any): TPromise<any>;
	debugAdapterExecutable(folderUri: uri | undefined, type: string): TPromise<IAdapterExecutable | undefined>;
}

export interface ILaunch {

	/**
	 * Resource pointing to the launch.json this object is wrapping.
	 */
	uri: uri;

	/**
	 * Name of the launch.
	 */
	name: string;

	/**
	 * Workspace of the launch. Can be null.
	 */
	workspace: IWorkspaceFolder;

	/**
	 * Should this launch be shown in the debug dropdown.
	 */
	hidden: boolean;

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
	 * Returns the resolved configuration.
	 * Replaces os specific values, system variables, interactive variables.
	 */
	resolveConfiguration(config: IConfig): TPromise<IConfig>;

	/**
	 * Opens the launch.json file. Creates if it does not exist.
	 */
	openConfigFile(sideBySide: boolean, type?: string): TPromise<IEditor>;
}

// Debug service interfaces

export const IDebugService = createDecorator<IDebugService>(DEBUG_SERVICE_ID);

export interface DebugEvent extends DebugProtocol.Event {
	sessionId?: string;
}

export interface IDebugService {
	_serviceBrand: any;

	/**
	 * Gets the current debug state.
	 */
	state: State;

	/**
	 * Allows to register on debug state changes.
	 */
	onDidChangeState: Event<State>;

	/**
	 * Allows to register on new process events.
	 */
	onDidNewProcess: Event<IProcess>;

	/**
	 * Allows to register on end process events.
	 */
	onDidEndProcess: Event<IProcess>;

	/**
	 * Allows to register on custom DAP events.
	 */
	onDidCustomEvent: Event<DebugEvent>;

	/**
	 * Gets the current configuration manager.
	 */
	getConfigurationManager(): IConfigurationManager;

	/**
	 * Sets the focused stack frame and evaluates all expressions against the newly focused stack frame,
	 */
	focusStackFrame(focusedStackFrame: IStackFrame, thread?: IThread, process?: IProcess, explicit?: boolean): void;

	/**
	 * Adds new breakpoints to the model for the file specified with the uri. Notifies debug adapter of breakpoint changes.
	 */
	addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): TPromise<void>;

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
	logToRepl(value: string, sev?: severity): void;

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
	startDebugging(launch: ILaunch, configOrName?: IConfig | string, noDebug?: boolean): TPromise<any>;

	/**
	 * Restarts a process or creates a new one if there is no active session.
	 */
	restartProcess(process: IProcess): TPromise<any>;

	/**
	 * Stops the process. If the process does not exist then stops all processes.
	 */
	stopProcess(process: IProcess): TPromise<any>;

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
}

// Editor interfaces
export interface IDebugEditorContribution extends IEditorContribution {
	showHover(range: Range, focus: boolean): TPromise<void>;
	showBreakpointWidget(lineNumber: number, column: number): void;
	closeBreakpointWidget(): void;
	addLaunchConfiguration(): TPromise<any>;
}

// utils

const _formatPIIRegexp = /{([^}]+)}/g;

export function formatPII(value: string, excludePII: boolean, args: { [key: string]: string }): string {
	return value.replace(_formatPIIRegexp, function (match, group) {
		if (excludePII && group.length > 0 && group[0] !== '_') {
			return match;
		}

		return args && args.hasOwnProperty(group) ?
			args[group] :
			match;
	});
}
