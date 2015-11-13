/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import uri from 'vs/base/common/uri';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import ee = require('vs/base/common/eventEmitter');
import paths = require('vs/base/common/paths');
import severity from 'vs/base/common/severity';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import pluginsRegistry = require('vs/platform/plugins/common/pluginsRegistry');
import editor = require('vs/editor/common/editorCommon');

export var VIEWLET_ID = 'workbench.view.debug';
export var DEBUG_SERVICE_ID = 'debugService';
export var CONTEXT_IN_DEBUG_MODE = 'inDebugMode';

// Raw

export interface IRawModelUpdate {
	threadId: number;
	thread?: DebugProtocol.Thread;
	callStack?: DebugProtocol.StackFrame[];
	exception?: boolean;
}

// Model

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
}

export interface IThread extends ITreeElement {
	threadId: number;
	name: string;
	callStack: IStackFrame[];
	exception: boolean;
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

export interface IBreakpoint extends IEnablement {
	source: Source;
	lineNumber: number;
	desiredLineNumber: number;
}

export interface IExceptionBreakpoint extends IEnablement {
	name: string;
}

export class Source {

	public uri: uri;
	public inMemory: boolean;
	public available: boolean;

	private static INTERNAL_URI_PREFIX = 'debug://internal/';

	constructor(public name: string, uriStr: string, public reference = 0) {
		this.uri = uri.parse(uriStr);
		this.inMemory = uriStr.indexOf(Source.INTERNAL_URI_PREFIX) === 0;
		this.available = true;
	}

	public toRawSource(): DebugProtocol.Source {
		return this.inMemory ? { name: this.name } :
			{ path: paths.normalize(this.uri.fsPath, true) };
	}

	public static fromRawSource(rawSource: DebugProtocol.Source): Source {
		var uriStr = rawSource.path ? uri.file(rawSource.path).toString() : Source.INTERNAL_URI_PREFIX + rawSource.name;
		return new Source(rawSource.name, uriStr, rawSource.sourceReference);
	}

	public static fromUri(uri: uri): Source {
		var uriStr = uri.toString();
		return new Source(uriStr.substr(uriStr.lastIndexOf('/') + 1), uriStr);
	}
}

// Events

export var ModelEvents = {
	BREAKPOINTS_UPDATED: 'BreakpointsUpdated',
	CALLSTACK_UPDATED: 'CallStackUpdated',
	WATCH_EXPRESSIONS_UPDATED: 'WatchExpressionsUpdated',
	REPL_ELEMENTS_UPDATED: 'ReplElementsUpdated'
};

export var ViewModelEvents = {
	FOCUSED_STACK_FRAME_UPDATED: 'FocusedStackFrameUpdated',
	SELECTED_EXPRESSION_UPDATED: 'SelectedExpressionUpdated'
};

export var ServiceEvents = {
	STATE_CHANGED: 'StateChanged'
};

export var SessionEvents = {
	INITIALIZED: 'initialized',
	STOPPED: 'stopped',
	DEBUGEE_TERMINATED: 'terminated',
	SERVER_EXIT: 'exit',
	CONTINUED: 'continued',
	THREAD: 'thread',
	OUTPUT: 'output'
};

// Model interfaces

export interface IViewModel extends ee.EventEmitter {
	getFocusedStackFrame(): IStackFrame;
	getSelectedExpression(): IExpression;
	getFocusedThreadId(): number;
	setSelectedExpression(expression: IExpression);
}

export interface IModel extends ee.IEventEmitter, ITreeElement {
	getThreads(): { [reference: number]: IThread; };
	getBreakpoints(): IBreakpoint[];
	areBreakpointsActivated(): boolean;
	getExceptionBreakpoints(): IExceptionBreakpoint[];
	getWatchExpressions(): IExpression[];
	getReplElements(): ITreeElement[];
}

// Service enums

export enum State {
	Disabled,
	Inactive,
	Initializing,
	Stopped,
	Running
}

// Service interfaces

export interface IGlobalConfig {
	version: string;
	debugServer: number;
	configurations: IConfig[];
}

export interface IConfig {
	name: string;
	type: string;
	request: string;
	program: string;
	stopOnEntry: boolean;
	args: string[];
	cwd: string;
	runtimeExecutable: string;
	runtimeArgs: string[];
	env: { [key: string]: string; };
	sourceMaps: boolean;
	outDir: string;
	address: string;
	port: number;
	preLaunchTask: string;
	externalConsole: boolean;
	debugServer: number;
	extensionHostData: any;
}

export interface IRawEnvAdapter {
	type: string;
	label: string;
	program: string;
	args: string[];
	runtime: string;
	runtimeArgs: string[];
}

export interface IRawAdapter extends IRawEnvAdapter {
	enableBreakpointsFor: { languageIds: string[] };
	configurationAttributes: any;
	initialConfigurations: any[];
	win: IRawEnvAdapter;
	osx: IRawEnvAdapter;
	linux: IRawEnvAdapter;
}

export interface IRawDebugSession extends ee.EventEmitter {
	initialize(args: DebugProtocol.InitializeRequestArguments): TPromise<DebugProtocol.InitializeResponse>;
	launch(args: DebugProtocol.LaunchRequestArguments): TPromise<DebugProtocol.LaunchResponse>;
	attach(args: DebugProtocol.AttachRequestArguments): TPromise<DebugProtocol.AttachResponse>;
	stop(restart?: boolean): TPromise<DebugProtocol.DisconnectResponse>;

	stepOver(args: DebugProtocol.NextArguments): TPromise<DebugProtocol.NextResponse>;
	stepIn(args: DebugProtocol.StepInArguments): TPromise<DebugProtocol.StepInResponse>;
	stepOut(args: DebugProtocol.StepOutArguments): TPromise<DebugProtocol.StepOutResponse>;
	continue(args: DebugProtocol.ContinueArguments): TPromise<DebugProtocol.ContinueResponse>;
	pause(args: DebugProtocol.PauseArguments): TPromise<DebugProtocol.PauseResponse>;

	setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): TPromise<DebugProtocol.SetBreakpointsResponse>;
	setExceptionBreakpoints(args: DebugProtocol.SetExceptionBreakpointsArguments): TPromise<DebugProtocol.SetExceptionBreakpointsResponse>;
	stackTrace(args: DebugProtocol.StackTraceArguments): TPromise<DebugProtocol.StackTraceResponse>;
	scopes(args: DebugProtocol.ScopesArguments): TPromise<DebugProtocol.ScopesResponse>;
	resolveVariables(args: DebugProtocol.VariablesArguments): TPromise<DebugProtocol.VariablesResponse>;
	resolveSource(args: DebugProtocol.SourceArguments): TPromise<DebugProtocol.SourceResponse>;
	threads(): TPromise<DebugProtocol.ThreadsResponse>;
	evaluate(args: DebugProtocol.EvaluateArguments): TPromise<DebugProtocol.EvaluateResponse>;

	getLengthInSeconds(): number;
	getType(): string;
	emittedStopped: boolean;
}

export var IDebugService = createDecorator<IDebugService>(DEBUG_SERVICE_ID);

export interface IDebugService extends ee.IEventEmitter {
	serviceId: ServiceIdentifier<any>;
	getState(): State;
	canSetBreakpointsIn(model: editor.IModel, lineNumber: number): boolean;

	getConfiguration(): IConfig;
	setConfiguration(name: string): Promise;
	openConfigFile(sideBySide: boolean): Promise;
	loadLaunchConfig(): TPromise<IGlobalConfig>;

	setFocusedStackFrameAndEvaluate(focusedStackFrame: IStackFrame): void;

	setBreakpointsForModel(modelUri: uri, data: { lineNumber: number; enabled: boolean; }[]): Promise;
	toggleBreakpoint(modelUri: uri, lineNumber: number): Promise;
	enableOrDisableAllBreakpoints(enabled: boolean): Promise;
	toggleEnablement(element: IEnablement): Promise;
	clearBreakpoints(modelUri?: uri): Promise;
	toggleBreakpointsActivated(): Promise;
	sendAllBreakpoints(): Promise;

	addReplExpression(name: string): Promise;
	clearReplExpressions(): void;

	logToRepl(value: string, severity?: severity): void;
	logToRepl(value: { [key: string]: any }, severity?: severity): void;

	appendReplOutput(value: string, severity?: severity): void;

	addWatchExpression(name?: string): Promise;
	renameWatchExpression(id: string, newName: string): Promise;
	clearWatchExpressions(id?: string): void;

	createSession(): Promise;
	restartSession(): Promise;
	getActiveSession(): IRawDebugSession;

	getModel(): IModel;
	getViewModel(): IViewModel;

	openOrRevealEditor(source: Source, lineNumber: number, preserveFocus: boolean, sideBySide: boolean): Promise;
	revealRepl(inBackground?:boolean): Promise;
}

// Utils

var _formatPIIRegexp = /{([^}]+)}/g;

export function formatPII(value:string, excludePII: boolean, args: {[key: string]: string}): string {
	return value.replace(_formatPIIRegexp, function(match, group) {
		if (excludePII && group.length > 0 && group[0] !== '_') {
			return match;
		}

		return args.hasOwnProperty(group) ?
			args[group] :
			match;
	})
}

// Debuggers extension point

export var debuggersExtPoint = pluginsRegistry.PluginsRegistry.registerExtensionPoint<IRawAdapter[]>('debuggers', {
	description: nls.localize('vscode.extension.contributes.debuggers', 'Contributes debug adapters.'),
	type: 'array',
	default: [{ type: '', extensions: [] }],
	items: {
		type: 'object',
		default: { type: '', program: '', runtime: '', enableBreakpointsFor: { languageIds: [ '' ] } },
		properties: {
			type: {
				description: nls.localize('vscode.extension.contributes.debuggers.type', 'Unique identifier for this debug adapter.'),
				type: 'string'
			},
			enableBreakpointsFor: {
				description: nls.localize('vscode.extension.contributes.debuggers.enableBreakpointsFor', 'Allow breakpoints for these languages.'),
				type: 'object',
				properties: {
					languageIds : {
						description: nls.localize('vscode.extension.contributes.debuggers.enableBreakpointsFor.languageIds', 'List of languages.'),
						type: 'array',
						items: {
							type: 'string'
						}
					}
				}
			},
			program: {
				description: nls.localize('vscode.extension.contributes.debuggers.program', 'Path to the debug adapter program. Path is either absolute or relative to the extension folder.'),
				type: 'string'
			},
			runtime : {
				description: nls.localize('vscode.extension.contributes.debuggers.runtime', 'Optional runtime in case the program attribute is not an executable but requires a runtime.'),
				type: 'string'
			},
			runtimeArgs : {
				description: nls.localize('vscode.extension.contributes.debuggers.runtimeArgs', 'Optional runtime arguments.'),
				type: 'array'
			},
			initialConfigurations: {
				description: nls.localize('vscode.extension.contributes.debuggers.initialConfigurations', 'Configurations for generating the initial \'launch.json\'.'),
				type: 'array',
			},
			configurationAttributes: {
				description: nls.localize('vscode.extension.contributes.debuggers.configurationAttributes', 'JSON schema configurations for validating \'launch.json\'.'),
				type: 'object'
			},
			windows: {
				description: nls.localize('vscode.extension.contributes.debuggers.windows', 'Windows specific settings.'),
				type: 'object',
				properties: {
					runtime : {
						description: nls.localize('vscode.extension.contributes.debuggers.windows.runtime', 'Runtime used for Windows.'),
						type: 'string'
					}
				}
			},
			osx: {
				description: nls.localize('vscode.extension.contributes.debuggers.osx', 'OS X specific settings.'),
				type: 'object',
				properties: {
					runtime : {
						description: nls.localize('vscode.extension.contributes.debuggers.osx.runtime', 'Runtime used for OSX.'),
						type: 'string'
					}
				}
			},
			linux: {
				description: nls.localize('vscode.extension.contributes.debuggers.linux', 'Linux specific settings.'),
				type: 'object',
				properties: {
					runtime : {
						description: nls.localize('vscode.extension.contributes.debuggers.linux.runtime', 'Runtime used for Linux.'),
						type: 'string'
					}
				}
			}
		}
	}
});

// Debug General Schema

export var schemaId = 'local://schemas/launch';
export var schema: IJSONSchema = {
	id: schemaId,
	type: 'object',
	title: nls.localize('app.launch.json.title', "Launch configuration"),
	required: ['version', 'configurations'],
	default: {
		version: '0.2.0',
		configurations: [{
			name: 'Launch',
			type: 'node',
			request: 'launch'
		}, {
			name: 'Attach',
			type: 'node',
			request: 'attach',
			port: 5858
		}]
	},
	properties: {
		version: {
			type: 'string',
			description: nls.localize('app.launch.json.version', 'Version of this file format.'),
			default: '0.2.0'
		},
		configurations: {
			type: 'array',
			description: nls.localize('app.launch.json.configurations', 'List of configurations. Add new configurations or edit existing ones.'),
			items: {
				oneOf: []
			}
		}
	}
}
