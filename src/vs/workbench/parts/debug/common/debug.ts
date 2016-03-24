/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import ee = require('vs/base/common/eventEmitter');
import severity from 'vs/base/common/severity';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import editor = require('vs/editor/common/editorCommon');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { Source } from 'vs/workbench/parts/debug/common/debugSource';

export const VIEWLET_ID = 'workbench.view.debug';
export const REPL_ID = 'workbench.panel.repl';
export const DEBUG_SERVICE_ID = 'debugService';
export const CONTEXT_IN_DEBUG_MODE = 'inDebugMode';
export const EDITOR_CONTRIBUTION_ID = 'editor.contrib.debug';

// raw

export interface IRawModelUpdate {
	threadId: number;
	thread?: DebugProtocol.Thread;
	callStack?: DebugProtocol.StackFrame[];
	stoppedDetails?: IRawStoppedDetails;
	allThreadsStopped?: boolean;
}

export interface IRawStoppedDetails {
	reason: string;
	threadId?: number;
	text?: string;
}

// model

export interface ITreeElement {
	getId(): string;
}

export interface IExpressionContainer extends ITreeElement {
	reference: number;
	getChildren(debugService: IDebugService): TPromise<IExpression[]>;
}

export interface IExpression extends ITreeElement, IExpressionContainer {
	name: string;
	value: string;
	valueChanged: boolean;
}

export interface IThread extends ITreeElement {
	threadId: number;
	name: string;
	stoppedDetails: IRawStoppedDetails;

	/**
	 * Queries the debug adapter for the callstack and returns a promise with
	 * the stack frames of the callstack.
	 * If the thread is not stopped, it returns a promise to an empty array.
	 */
	getCallStack(debugService: IDebugService): TPromise<IStackFrame[]>;

	/**
	 * Gets the callstack if it has already been received from the debug
	 * adapter, otherwise it returns undefined.
	 */
	getCachedCallStack(): IStackFrame[];

	/**
	 * Invalidates the callstack cache
	 */
	clearCallStack(): void;

	/**
	 * Indicates whether this thread is stopped. The callstack for stopped
	 * threads can be retrieved from the debug adapter.
	 */
	stopped: boolean;
}

export interface IScope extends IExpressionContainer {
	name: string;
	expensive: boolean;
}

export interface IStackFrame extends ITreeElement {
	threadId: number;
	name: string;
	lineNumber: number;
	column: number;
	frameId: number;
	source: Source;
	getScopes(debugService: IDebugService): TPromise<IScope[]>;
}

export interface IEnablement extends ITreeElement {
	enabled: boolean;
}

export interface IRawBreakpoint {
	uri: uri;
	lineNumber: number;
	enabled: boolean;
	condition?: string;
}

export interface IBreakpoint extends IEnablement {
	source: Source;
	lineNumber: number;
	desiredLineNumber: number;
	condition: string;
	verified: boolean;
	idFromAdapter: number;
	message: string;
}

export interface IFunctionBreakpoint extends IEnablement {
	name: string;
	verified: boolean;
	idFromAdapter: number;
}

export interface IExceptionBreakpoint extends IEnablement {
	filter: string;
	label: string;
}

// events

export var ModelEvents = {
	BREAKPOINTS_UPDATED: 'BreakpointsUpdated',
	CALLSTACK_UPDATED: 'CallStackUpdated',
	WATCH_EXPRESSIONS_UPDATED: 'WatchExpressionsUpdated',
	REPL_ELEMENTS_UPDATED: 'ReplElementsUpdated'
};

export var ViewModelEvents = {
	FOCUSED_STACK_FRAME_UPDATED: 'FocusedStackFrameUpdated',
	SELECTED_EXPRESSION_UPDATED: 'SelectedExpressionUpdated',
	SELECTED_FUNCTION_BREAKPOINT_UPDATED: 'SelectedFunctionBreakpointUpdated'
};

export var ServiceEvents = {
	STATE_CHANGED: 'StateChanged',
	TYPE_NOT_SUPPORTED: 'TypeNotSupported',
	CONFIGURATION_CHANGED: 'ConfigurationChanged'
};

export var SessionEvents = {
	INITIALIZED: 'initialized',
	STOPPED: 'stopped',
	DEBUGEE_TERMINATED: 'terminated',
	SERVER_EXIT: 'exit',
	CONTINUED: 'continued',
	THREAD: 'thread',
	OUTPUT: 'output',
	BREAKPOINT: 'breakpoint'
};

// model interfaces

export interface IViewModel extends ee.EventEmitter {
	getFocusedStackFrame(): IStackFrame;
	getSelectedExpression(): IExpression;
	getFocusedThreadId(): number;
	setSelectedExpression(expression: IExpression);
	getSelectedFunctionBreakpoint(): IFunctionBreakpoint;
	setSelectedFunctionBreakpoint(functionBreakpoint: IFunctionBreakpoint): void;
}

export interface IModel extends ee.IEventEmitter, ITreeElement {
	getThreads(): { [threadId: number]: IThread; };
	getBreakpoints(): IBreakpoint[];
	areBreakpointsActivated(): boolean;
	getFunctionBreakpoints(): IFunctionBreakpoint[];
	getExceptionBreakpoints(): IExceptionBreakpoint[];
	getWatchExpressions(): IExpression[];
	getReplElements(): ITreeElement[];
}

// service enums

export enum State {
	Disabled,
	Inactive,
	Initializing,
	Stopped,
	Running,
	RunningNoDebug
}

// service interfaces

export interface IGlobalConfig {
	version: string;
	debugServer?: number;
	configurations: IConfig[];
}

export interface IConfig {
	name?: string;
	type: string;
	request: string;
	program?: string;
	stopOnEntry?: boolean;
	args?: string[];
	cwd?: string;
	runtimeExecutable?: string;
	runtimeArgs?: string[];
	env?: { [key: string]: string; };
	sourceMaps?: boolean;
	outDir?: string;
	address?: string;
	port?: number;
	preLaunchTask?: string;
	externalConsole?: boolean;
	debugServer?: number;
	noDebug?: boolean;
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
	enableBreakpointsFor?: { languageIds: string[] };
	configurationAttributes?: any;
	initialConfigurations?: any[];
	aiKey?: string;
	win?: IRawEnvAdapter;
	winx86?: IRawEnvAdapter;
	windows?: IRawEnvAdapter;
	osx?: IRawEnvAdapter;
	linux?: IRawEnvAdapter;
}

export interface IRawDebugSession extends ee.EventEmitter {
	getType(): string;
	isAttach: boolean;
	capabilities: DebugProtocol.Capabilites;
	disconnect(restart?: boolean, force?: boolean): TPromise<DebugProtocol.DisconnectResponse>;

	next(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse>;
	stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse>;
	stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse>;
	continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse>;
	pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse>;

	stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse>;
	scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse>;
	variables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse>;
	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse>;
}

export var IDebugService = createDecorator<IDebugService>(DEBUG_SERVICE_ID);

export interface IDebugService extends ee.IEventEmitter {
	serviceId: ServiceIdentifier<any>;
	getState(): State;
	canSetBreakpointsIn(model: editor.IModel): boolean;

	getConfigurationName(): string;
	setConfiguration(name: string): TPromise<void>;
	openConfigFile(sideBySide: boolean): TPromise<boolean>;
	loadLaunchConfig(): TPromise<IGlobalConfig>;

	setFocusedStackFrameAndEvaluate(focusedStackFrame: IStackFrame): void;

	/**
	 * Sets breakpoints for a model. Does not send them to the adapter.
	 */
	setBreakpointsForModel(modelUri: uri, rawData: IRawBreakpoint[]): void;
	toggleBreakpoint(IRawBreakpoint): TPromise<void>;
	enableOrDisableAllBreakpoints(enabled: boolean): TPromise<void>;
	toggleEnablement(element: IEnablement): TPromise<void>;
	toggleBreakpointsActivated(): TPromise<void>;
	removeAllBreakpoints(): TPromise<any>;
	sendAllBreakpoints(): TPromise<any>;
	editBreakpoint(editor: editorbrowser.ICodeEditor, lineNumber: number): TPromise<void>;

	addFunctionBreakpoint(): void;
	renameFunctionBreakpoint(id: string, newFunctionName: string): TPromise<void>;
	removeFunctionBreakpoints(id?: string): TPromise<void>;

	addReplExpression(name: string): TPromise<void>;
	clearReplExpressions(): void;

	logToRepl(value: string, severity?: severity): void;
	logToRepl(value: { [key: string]: any }, severity?: severity): void;

	appendReplOutput(value: string, severity?: severity): void;

	addWatchExpression(name?: string): TPromise<void>;
	renameWatchExpression(id: string, newName: string): TPromise<void>;
	clearWatchExpressions(id?: string): void;

	/**
	 * Creates a new debug session. Depending on the configuration will either 'launch' or 'attach'.
	 */
	createSession(noDebug: boolean): TPromise<any>;

	/**
	 * Restarts an active debug session or creates a new one if there is no active session.
	 */
	restartSession(): TPromise<any>;

	/**
	 * Returns the active debug session or null if debug is inactive.
	 */
	getActiveSession(): IRawDebugSession;

	/**
	 * Gets the current debug model.
	 */
	getModel(): IModel;

	/**
	 * Gets the current view model.
	 */
	getViewModel(): IViewModel;

	/**
	 * Opens a new or reveals an already visible editor showing the source.
	 */
	openOrRevealEditor(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): TPromise<any>;

	/**
	 * Reveals the repl.
	 */
	revealRepl(focus?: boolean): TPromise<void>;
}

// Editor interfaces
export interface IDebugEditorContribution extends editor.IEditorContribution {
	showHover(range: editor.IEditorRange, hoveringOver: string, focus: boolean): TPromise<void>;
}

// utils

const _formatPIIRegexp = /{([^}]+)}/g;

export function formatPII(value:string, excludePII: boolean, args: {[key: string]: string}): string {
	return value.replace(_formatPIIRegexp, function(match, group) {
		if (excludePII && group.length > 0 && group[0] !== '_') {
			return match;
		}

		return args && args.hasOwnProperty(group) ?
			args[group] :
			match;
	});
}
