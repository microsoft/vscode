/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Declaration module describing the VS Code debug protocol.
	Auto-generated from json schema. Do not edit manually.
*/
declare module DebugProtocol {

	/** Base class of requests, responses, and events. */
	export interface ProtocolMessage {
		/** Sequence number. */
		seq: number;
		/** One of 'request', 'response', or 'event'. */
		type: string;
	}

	/** A client or server-initiated request. */
	export interface Request extends ProtocolMessage {
		// type: 'request';
		/** The command to execute. */
		command: string;
		/** Object containing arguments for the command. */
		arguments?: any;
	}

	/** Server-initiated event. */
	export interface Event extends ProtocolMessage {
		// type: 'event';
		/** Type of event. */
		event: string;
		/** Event-specific information. */
		body?: any;
	}

	/** Response to a request. */
	export interface Response extends ProtocolMessage {
		// type: 'response';
		/** Sequence number of the corresponding request. */
		request_seq: number;
		/** Outcome of the request. */
		success: boolean;
		/** The command requested. */
		command: string;
		/** Contains error message if success == false. */
		message?: string;
		/** Contains request result if success is true and optional error details if success is false. */
		body?: any;
	}

	/** Event message for 'initialized' event type.
		This event indicates that the debug adapter is ready to accept configuration requests (e.g. SetBreakpointsRequest, SetExceptionBreakpointsRequest).
		A debug adapter is expected to send this event when it is ready to accept configuration requests (but not before the InitializeRequest has finished).
		The sequence of events/requests is as follows:
		- adapters sends InitializedEvent (after the InitializeRequest has returned)
		- frontend sends zero or more SetBreakpointsRequest
		- frontend sends one SetFunctionBreakpointsRequest
		- frontend sends a SetExceptionBreakpointsRequest if one or more exceptionBreakpointFilters have been defined (or if supportsConfigurationDoneRequest is not defined or false)
		- frontend sends other future configuration requests
		- frontend sends one ConfigurationDoneRequest to indicate the end of the configuration
	*/
	export interface InitializedEvent extends Event {
		// event: 'initialized';
	}

	/** Event message for 'stopped' event type.
		The event indicates that the execution of the debuggee has stopped due to some condition.
		This can be caused by a break point previously set, a stepping action has completed, by executing a debugger statement etc.
	*/
	export interface StoppedEvent extends Event {
		// event: 'stopped';
		body: {
			/** The reason for the event (such as: 'step', 'breakpoint', 'exception', 'pause'). This string is shown in the UI. */
			reason: string;
			/** The thread which was stopped. */
			threadId?: number;
			/** Additional information. E.g. if reason is 'exception', text contains the exception name. This string is shown in the UI. */
			text?: string;
			/** If allThreadsStopped is true, a debug adapter can announce that all threads have stopped.
				*  The client should use this information to enable that all threads can be expanded to access their stacktraces.
				*  If the attribute is missing or false, only the thread with the given threadId can be expanded.
			*/
			allThreadsStopped?: boolean;
		};
	}

	/** Event message for 'continued' event type.
		The event indicates that the execution of the debuggee has continued.
		Please note: a debug adapter is not expected to send this event in response to a request that implies that execution continues, e.g. 'launch' or 'continue'.
		It is only necessary to send a ContinuedEvent if there was no previous request that implied this.
	*/
	export interface ContinuedEvent extends Event {
		// event: 'continued';
		body: {
			/** The thread which was continued. */
			threadId: number;
			/** If allThreadsContinued is true, a debug adapter can announce that all threads have continued. */
			allThreadsContinued?: boolean;
		};
	}

	/** Event message for 'exited' event type.
		The event indicates that the debuggee has exited.
	*/
	export interface ExitedEvent extends Event {
		// event: 'exited';
		body: {
			/** The exit code returned from the debuggee. */
			exitCode: number;
		};
	}

	/** Event message for 'terminated' event types.
		The event indicates that debugging of the debuggee has terminated.
	*/
	export interface TerminatedEvent extends Event {
		// event: 'terminated';
		body?: {
			/** A debug adapter may set 'restart' to true to request that the front end restarts the session. */
			restart?: boolean;
		};
	}

	/** Event message for 'thread' event type.
		The event indicates that a thread has started or exited.
	*/
	export interface ThreadEvent extends Event {
		// event: 'thread';
		body: {
			/** The reason for the event (such as: 'started', 'exited'). */
			reason: string;
			/** The identifier of the thread. */
			threadId: number;
		};
	}

	/** Event message for 'output' event type.
		The event indicates that the target has produced some output.
	*/
	export interface OutputEvent extends Event {
		// event: 'output';
		body: {
			/** The category of output (such as: 'console', 'stdout', 'stderr', 'telemetry'). If not specified, 'console' is assumed. */
			category?: string;
			/** The output to report. */
			output: string;
			/** If an attribute 'variablesReference' exists and its value is > 0, the output contains objects which can be retrieved by passing variablesReference to the VariablesRequest. */
			variablesReference?: number;
			/** Optional data to report. For the 'telemetry' category the data will be sent to telemetry, for the other categories the data is shown in JSON format. */
			data?: any;
		};
	}

	/** Event message for 'breakpoint' event type.
		The event indicates that some information about a breakpoint has changed.
	*/
	export interface BreakpointEvent extends Event {
		// event: 'breakpoint';
		body: {
			/** The reason for the event (such as: 'changed', 'new'). */
			reason: string;
			/** The breakpoint. */
			breakpoint: Breakpoint;
		};
	}

	/** Event message for 'module' event type.
		The event indicates that some information about a module has changed.
	*/
	export interface ModuleEvent extends Event {
		// event: 'module';
		body: {
			/** The reason for the event. */
			reason: 'new' | 'changed' | 'removed';
			/** The new, changed, or removed module. In case of 'removed' only the module id is used. */
			module: Module;
		};
	}

	/** runInTerminal request; value of command field is 'runInTerminal'.
		With this request a debug adapter can run a command in a terminal.
	*/
	export interface RunInTerminalRequest extends Request {
		// command: 'runInTerminal';
		arguments: RunInTerminalRequestArguments;
	}

	/** Arguments for 'runInTerminal' request. */
	export interface RunInTerminalRequestArguments {
		/** What kind of terminal to launch. */
		kind?: 'integrated' | 'external';
		/** Optional title of the terminal. */
		title?: string;
		/** Working directory of the command. */
		cwd: string;
		/** List of arguments. The first argument is the command to run. */
		args: string[];
		/** Environment key-value pairs that are added to the default environment. */
		env?: { [key: string]: string; };
	}

	/** Response to Initialize request. */
	export interface RunInTerminalResponse extends Response {
		body: {
			/** The process ID. */
			processId?: number;
		};
	}

	/** On error that is whenever 'success' is false, the body can provide more details. */
	export interface ErrorResponse extends Response {
		body: {
			/** An optional, structured error message. */
			error?: Message;
		};
	}

	/** Initialize request; value of command field is 'initialize'. */
	export interface InitializeRequest extends Request {
		// command: 'initialize';
		arguments: InitializeRequestArguments;
	}

	/** Arguments for 'initialize' request. */
	export interface InitializeRequestArguments {
		/** The ID of the debugger adapter. Used to select or verify debugger adapter. */
		adapterID: string;
		/** If true all line numbers are 1-based (default). */
		linesStartAt1?: boolean;
		/** If true all column numbers are 1-based (default). */
		columnsStartAt1?: boolean;
		/** Determines in what format paths are specified. Possible values are 'path' or 'uri'. The default is 'path', which is the native format. */
		pathFormat?: string;
		/** Client supports the optional type attribute for variables. */
		supportsVariableType?: boolean;
		/** Client supports the paging of variables. */
		supportsVariablePaging?: boolean;
		/** Client supports the runInTerminal request. */
		supportsRunInTerminalRequest?: boolean;
	}

	/** Response to 'initialize' request. */
	export interface InitializeResponse extends Response {
		/** The capabilities of this debug adapter. */
		body?: Capabilities;
	}

	/** ConfigurationDone request; value of command field is 'configurationDone'.
		The client of the debug protocol must send this request at the end of the sequence of configuration requests (which was started by the InitializedEvent).
	*/
	export interface ConfigurationDoneRequest extends Request {
		// command: 'configurationDone';
		arguments?: ConfigurationDoneArguments;
	}

	/** Arguments for 'configurationDone' request.
		The configurationDone request has no standardized attributes.
	*/
	export interface ConfigurationDoneArguments {
	}

	/** Response to 'configurationDone' request. This is just an acknowledgement, so no body field is required. */
	export interface ConfigurationDoneResponse extends Response {
	}

	/** Launch request; value of command field is 'launch'. */
	export interface LaunchRequest extends Request {
		// command: 'launch';
		arguments: LaunchRequestArguments;
	}

	/** Arguments for 'launch' request. */
	export interface LaunchRequestArguments {
		/** If noDebug is true the launch request should launch the program without enabling debugging. */
		noDebug?: boolean;
	}

	/** Response to 'launch' request. This is just an acknowledgement, so no body field is required. */
	export interface LaunchResponse extends Response {
	}

	/** Attach request; value of command field is 'attach'. */
	export interface AttachRequest extends Request {
		// command: 'attach';
		arguments: AttachRequestArguments;
	}

	/** Arguments for 'attach' request.
		The attach request has no standardized attributes.
	*/
	export interface AttachRequestArguments {
	}

	/** Response to 'attach' request. This is just an acknowledgement, so no body field is required. */
	export interface AttachResponse extends Response {
	}

	/** Restart request; value of command field is 'restart'.
		Restarts a debug session. If the capability 'supportsRestartRequest' is missing or has the value false,
		the client will implement 'restart' by terminating the debug adapter first and then launching it anew.
		A debug adapter can override this default behaviour by implementing a restart request
		and setting the capability 'supportsRestartRequest' to true.
	*/
	export interface RestartRequest extends Request {
		// command: 'restart';
		arguments?: RestartArguments;
	}

	/** Arguments for 'restart' request.
		The restart request has no standardized attributes.
	*/
	export interface RestartArguments {
	}

	/** Response to 'restart' request. This is just an acknowledgement, so no body field is required. */
	export interface RestartResponse extends Response {
	}

	/** Disconnect request; value of command field is 'disconnect'. */
	export interface DisconnectRequest extends Request {
		// command: 'disconnect';
		arguments?: DisconnectArguments;
	}

	/** Arguments for 'disconnect' request.
		The disconnect request has no standardized attributes.
	*/
	export interface DisconnectArguments {
	}

	/** Response to 'disconnect' request. This is just an acknowledgement, so no body field is required. */
	export interface DisconnectResponse extends Response {
	}

	/** SetBreakpoints request; value of command field is 'setBreakpoints'.
		Sets multiple breakpoints for a single source and clears all previous breakpoints in that source.
		To clear all breakpoint for a source, specify an empty array.
		When a breakpoint is hit, a StoppedEvent (event type 'breakpoint') is generated.
	*/
	export interface SetBreakpointsRequest extends Request {
		// command: 'setBreakpoints';
		arguments: SetBreakpointsArguments;
	}

	/** Arguments for 'setBreakpoints' request. */
	export interface SetBreakpointsArguments {
		/** The source location of the breakpoints; either source.path or source.reference must be specified. */
		source: Source;
		/** The code locations of the breakpoints. */
		breakpoints?: SourceBreakpoint[];
		/** Deprecated: The code locations of the breakpoints. */
		lines?: number[];
		/** A value of true indicates that the underlying source has been modified which results in new breakpoint locations. */
		sourceModified?: boolean;
	}

	/** Response to 'setBreakpoints' request.
		Returned is information about each breakpoint created by this request.
		This includes the actual code location and whether the breakpoint could be verified.
		The breakpoints returned are in the same order as the elements of the 'breakpoints'
		(or the deprecated 'lines') in the SetBreakpointsArguments.
	*/
	export interface SetBreakpointsResponse extends Response {
		body: {
			/** Information about the breakpoints. The array elements are in the same order as the elements of the 'breakpoints' (or the deprecated 'lines') in the SetBreakpointsArguments. */
			breakpoints: Breakpoint[];
		};
	}

	/** SetFunctionBreakpoints request; value of command field is 'setFunctionBreakpoints'.
		Sets multiple function breakpoints and clears all previous function breakpoints.
		To clear all function breakpoint, specify an empty array.
		When a function breakpoint is hit, a StoppedEvent (event type 'function breakpoint') is generated.
	*/
	export interface SetFunctionBreakpointsRequest extends Request {
		// command: 'setFunctionBreakpoints';
		arguments: SetFunctionBreakpointsArguments;
	}

	/** Arguments for 'setFunctionBreakpoints' request. */
	export interface SetFunctionBreakpointsArguments {
		/** The function names of the breakpoints. */
		breakpoints: FunctionBreakpoint[];
	}

	/** Response to 'setFunctionBreakpoints' request.
		Returned is information about each breakpoint created by this request.
	*/
	export interface SetFunctionBreakpointsResponse extends Response {
		body: {
			/** Information about the breakpoints. The array elements correspond to the elements of the 'breakpoints' array. */
			breakpoints: Breakpoint[];
		};
	}

	/** SetExceptionBreakpoints request; value of command field is 'setExceptionBreakpoints'.
		The request configures the debuggers response to thrown exceptions. If an execption is configured to break, a StoppedEvent is fired (event type 'exception').
	*/
	export interface SetExceptionBreakpointsRequest extends Request {
		// command: 'setExceptionBreakpoints';
		arguments: SetExceptionBreakpointsArguments;
	}

	/** Arguments for 'setExceptionBreakpoints' request. */
	export interface SetExceptionBreakpointsArguments {
		/** IDs of checked exception options. The set of IDs is returned via the 'exceptionBreakpointFilters' capability. */
		filters: string[];
		/** Configuration options for selected exceptions. */
		exceptionOptions?: ExceptionOptions[];
	}

	/** Response to 'setExceptionBreakpoints' request. This is just an acknowledgement, so no body field is required. */
	export interface SetExceptionBreakpointsResponse extends Response {
	}

	/** Continue request; value of command field is 'continue'.
		The request starts the debuggee to run again.
	*/
	export interface ContinueRequest extends Request {
		// command: 'continue';
		arguments: ContinueArguments;
	}

	/** Arguments for 'continue' request. */
	export interface ContinueArguments {
		/** Continue execution for the specified thread (if possible). If the backend cannot continue on a single thread but will continue on all threads, it should set the allThreadsContinued attribute in the response to true. */
		threadId: number;
	}

	/** Response to 'continue' request. */
	export interface ContinueResponse extends Response {
		body: {
			/** If true, the continue request has ignored the specified thread and continued all threads instead. If this attribute is missing a value of 'true' is assumed for backward compatibility. */
			allThreadsContinued?: boolean;
		};
	}

	/** Next request; value of command field is 'next'.
		The request starts the debuggee to run again for one step.
		The debug adapter first sends the NextResponse and then a StoppedEvent (event type 'step') after the step has completed.
	*/
	export interface NextRequest extends Request {
		// command: 'next';
		arguments: NextArguments;
	}

	/** Arguments for 'next' request. */
	export interface NextArguments {
		/** Execute 'next' for this thread. */
		threadId: number;
	}

	/** Response to 'next' request. This is just an acknowledgement, so no body field is required. */
	export interface NextResponse extends Response {
	}

	/** StepIn request; value of command field is 'stepIn'.
		The request starts the debuggee to step into a function/method if possible.
		If it cannot step into a target, 'stepIn' behaves like 'next'.
		The debug adapter first sends the StepInResponse and then a StoppedEvent (event type 'step') after the step has completed.
		If there are multiple function/method calls (or other targets) on the source line,
		the optional argument 'targetId' can be used to control into which target the 'stepIn' should occur.
		The list of possible targets for a given source line can be retrieved via the 'stepInTargets' request.
	*/
	export interface StepInRequest extends Request {
		// command: 'stepIn';
		arguments: StepInArguments;
	}

	/** Arguments for 'stepIn' request. */
	export interface StepInArguments {
		/** Execute 'stepIn' for this thread. */
		threadId: number;
		/** Optional id of the target to step into. */
		targetId?: number;
	}

	/** Response to 'stepIn' request. This is just an acknowledgement, so no body field is required. */
	export interface StepInResponse extends Response {
	}

	/** StepOut request; value of command field is 'stepOut'.
		The request starts the debuggee to run again for one step.
		The debug adapter first sends the StepOutResponse and then a StoppedEvent (event type 'step') after the step has completed.
	*/
	export interface StepOutRequest extends Request {
		// command: 'stepOut';
		arguments: StepOutArguments;
	}

	/** Arguments for 'stepOut' request. */
	export interface StepOutArguments {
		/** Execute 'stepOut' for this thread. */
		threadId: number;
	}

	/** Response to 'stepOut' request. This is just an acknowledgement, so no body field is required. */
	export interface StepOutResponse extends Response {
	}

	/** StepBack request; value of command field is 'stepBack'.
		The request starts the debuggee to run one step backwards.
		The debug adapter first sends the StepBackResponse and then a StoppedEvent (event type 'step') after the step has completed. Clients should only call this request if the capability supportsStepBack is true.
	*/
	export interface StepBackRequest extends Request {
		// command: 'stepBack';
		arguments: StepBackArguments;
	}

	/** Arguments for 'stepBack' request. */
	export interface StepBackArguments {
		/** Exceute 'stepBack' for this thread. */
		threadId: number;
	}

	/** Response to 'stepBack' request. This is just an acknowledgement, so no body field is required. */
	export interface StepBackResponse extends Response {
	}

	/** ReverseContinue request; value of command field is 'reverseContinue'.
		The request starts the debuggee to run backward. Clients should only call this request if the capability supportsStepBack is true.
	*/
	export interface ReverseContinueRequest extends Request {
		// command: 'reverseContinue';
		arguments: ReverseContinueArguments;
	}

	/** Arguments for 'reverseContinue' request. */
	export interface ReverseContinueArguments {
		/** Exceute 'reverseContinue' for this thread. */
		threadId: number;
	}

	/** Response to 'reverseContinue' request. This is just an acknowledgement, so no body field is required. */
	export interface ReverseContinueResponse extends Response {
	}

	/** RestartFrame request; value of command field is 'restartFrame'.
		The request restarts execution of the specified stackframe.
		The debug adapter first sends the RestartFrameResponse and then a StoppedEvent (event type 'restart') after the restart has completed.
	*/
	export interface RestartFrameRequest extends Request {
		// command: 'restartFrame';
		arguments: RestartFrameArguments;
	}

	/** Arguments for 'restartFrame' request. */
	export interface RestartFrameArguments {
		/** Restart this stackframe. */
		frameId: number;
	}

	/** Response to 'restartFrame' request. This is just an acknowledgement, so no body field is required. */
	export interface RestartFrameResponse extends Response {
	}

	/** Goto request; value of command field is 'goto'.
		The request sets the location where the debuggee will continue to run.
		This makes it possible to skip the execution of code or to executed code again.
		The code between the current location and the goto target is not executed but skipped.
		The debug adapter first sends the GotoResponse and then a StoppedEvent (event type 'goto').
	*/
	export interface GotoRequest extends Request {
		// command: 'goto';
		arguments: GotoArguments;
	}

	/** Arguments for 'goto' request. */
	export interface GotoArguments {
		/** Set the goto target for this thread. */
		threadId: number;
		/** The location where the debuggee will continue to run. */
		targetId: number;
	}

	/** Response to 'goto' request. This is just an acknowledgement, so no body field is required. */
	export interface GotoResponse extends Response {
	}

	/** Pause request; value of command field is 'pause'.
		The request suspenses the debuggee.
		The debug adapter first sends the PauseResponse and then a StoppedEvent (event type 'pause') after the thread has been paused successfully.
	*/
	export interface PauseRequest extends Request {
		// command: 'pause';
		arguments: PauseArguments;
	}

	/** Arguments for 'pause' request. */
	export interface PauseArguments {
		/** Pause execution for this thread. */
		threadId: number;
	}

	/** Response to 'pause' request. This is just an acknowledgement, so no body field is required. */
	export interface PauseResponse extends Response {
	}

	/** StackTrace request; value of command field is 'stackTrace'. The request returns a stacktrace from the current execution state. */
	export interface StackTraceRequest extends Request {
		// command: 'stackTrace';
		arguments: StackTraceArguments;
	}

	/** Arguments for 'stackTrace' request. */
	export interface StackTraceArguments {
		/** Retrieve the stacktrace for this thread. */
		threadId: number;
		/** The index of the first frame to return; if omitted frames start at 0. */
		startFrame?: number;
		/** The maximum number of frames to return. If levels is not specified or 0, all frames are returned. */
		levels?: number;
		/** Specifies details on how to format the stack frames. */
		format?: StackFrameFormat;
	}

	/** Response to 'stackTrace' request. */
	export interface StackTraceResponse extends Response {
		body: {
			/** The frames of the stackframe. If the array has length zero, there are no stackframes available.
				This means that there is no location information available.
			*/
			stackFrames: StackFrame[];
			/** The total number of frames available. */
			totalFrames?: number;
		};
	}

	/** Scopes request; value of command field is 'scopes'.
		The request returns the variable scopes for a given stackframe ID.
	*/
	export interface ScopesRequest extends Request {
		// command: 'scopes';
		arguments: ScopesArguments;
	}

	/** Arguments for 'scopes' request. */
	export interface ScopesArguments {
		/** Retrieve the scopes for this stackframe. */
		frameId: number;
	}

	/** Response to 'scopes' request. */
	export interface ScopesResponse extends Response {
		body: {
			/** The scopes of the stackframe. If the array has length zero, there are no scopes available. */
			scopes: Scope[];
		};
	}

	/** Variables request; value of command field is 'variables'.
		Retrieves all child variables for the given variable reference.
		An optional filter can be used to limit the fetched children to either named or indexed children.
	*/
	export interface VariablesRequest extends Request {
		// command: 'variables';
		arguments: VariablesArguments;
	}

	/** Arguments for 'variables' request. */
	export interface VariablesArguments {
		/** The Variable reference. */
		variablesReference: number;
		/** Optional filter to limit the child variables to either named or indexed. If ommited, both types are fetched. */
		filter?: 'indexed' | 'named';
		/** The index of the first variable to return; if omitted children start at 0. */
		start?: number;
		/** The number of variables to return. If count is missing or 0, all variables are returned. */
		count?: number;
		/** Specifies details on how to format the Variable values. */
		format?: ValueFormat;
	}

	/** Response to 'variables' request. */
	export interface VariablesResponse extends Response {
		body: {
			/** All (or a range) of variables for the given variable reference. */
			variables: Variable[];
		};
	}

	/** setVariable request; value of command field is 'setVariable'.
		Set the variable with the given name in the variable container to a new value.
	*/
	export interface SetVariableRequest extends Request {
		// command: 'setVariable';
		arguments: SetVariableArguments;
	}

	/** Arguments for 'setVariable' request. */
	export interface SetVariableArguments {
		/** The reference of the variable container. */
		variablesReference: number;
		/** The name of the variable. */
		name: string;
		/** The value of the variable. */
		value: string;
	}

	/** Response to 'setVariable' request. */
	export interface SetVariableResponse extends Response {
		body: {
			/** The new value of the variable. */
			value: string;
			/** The type of the new value. Typically shown in the UI when hovering over the value. */
			type?: string;
			/** If variablesReference is > 0, the new value is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
			variablesReference?: number;
			/** The number of named child variables.
				The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
			*/
			namedVariables?: number;
			/** The number of indexed child variables.
				The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
			*/
			indexedVariables?: number;
		};
	}

	/** Source request; value of command field is 'source'.
		The request retrieves the source code for a given source reference.
	*/
	export interface SourceRequest extends Request {
		// command: 'source';
		arguments: SourceArguments;
	}

	/** Arguments for 'source' request. */
	export interface SourceArguments {
		/** The reference to the source. This is the value received in Source.reference. */
		sourceReference: number;
	}

	/** Response to 'source' request. */
	export interface SourceResponse extends Response {
		body: {
			/** Content of the source reference. */
			content: string;
			/** Optional content type (mime type) of the source. */
			mimeType?: string;
		};
	}

	/** Thread request; value of command field is 'threads'.
		The request retrieves a list of all threads.
	*/
	export interface ThreadsRequest extends Request {
		// command: 'threads';
	}

	/** Response to 'threads' request. */
	export interface ThreadsResponse extends Response {
		body: {
			/** All threads. */
			threads: Thread[];
		};
	}

	/** Modules can be retrieved from the debug adapter with the ModulesRequest which can either return all modules or a range of modules to support paging. */
	export interface ModulesRequest extends Request {
		// command: 'modules';
		arguments: ModulesArguments;
	}

	/** Arguments for 'modules' request. */
	export interface ModulesArguments {
		/** The index of the first module to return; if omitted modules start at 0. */
		startModule?: number;
		/** The number of modules to return. If moduleCount is not specified or 0, all modules are returned. */
		moduleCount?: number;
	}

	/** Response to 'modules' request. */
	export interface ModulesResponse extends Response {
		body: {
			/** All modules or range of modules. */
			modules: Module[];
			/** The total number of modules available. */
			totalModules?: number;
		};
	}

	/** Evaluate request; value of command field is 'evaluate'.
		Evaluates the given expression in the context of the top most stack frame.
		The expression has access to any variables and arguments that are in scope.
	*/
	export interface EvaluateRequest extends Request {
		// command: 'evaluate';
		arguments: EvaluateArguments;
	}

	/** Arguments for 'evaluate' request. */
	export interface EvaluateArguments {
		/** The expression to evaluate. */
		expression: string;
		/** Evaluate the expression in the scope of this stack frame. If not specified, the expression is evaluated in the global scope. */
		frameId?: number;
		/** The context in which the evaluate request is run. Possible values are 'watch' if evaluate is run in a watch, 'repl' if run from the REPL console, or 'hover' if run from a data hover. */
		context?: string;
		/** Specifies details on how to format the Evaluate result. */
		format?: ValueFormat;
	}

	/** Response to 'evaluate' request. */
	export interface EvaluateResponse extends Response {
		body: {
			/** The result of the evaluate request. */
			result: string;
			/** The optional type of the evaluate result. */
			type?: string;
			/** If variablesReference is > 0, the evaluate result is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
			variablesReference: number;
			/** The number of named child variables.
				The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
			*/
			namedVariables?: number;
			/** The number of indexed child variables.
				The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
			*/
			indexedVariables?: number;
		};
	}

	/** StepInTargets request; value of command field is 'stepInTargets'.
		This request retrieves the possible stepIn targets for the specified stack frame.
		These targets can be used in the 'stepIn' request.
		The StepInTargets may only be called if the 'supportsStepInTargetsRequest' capability exists and is true.
	*/
	export interface StepInTargetsRequest extends Request {
		// command: 'stepInTargets';
		arguments: StepInTargetsArguments;
	}

	/** Arguments for 'stepInTargets' request. */
	export interface StepInTargetsArguments {
		/** The stack frame for which to retrieve the possible stepIn targets. */
		frameId: number;
	}

	/** Response to 'stepInTargets' request. */
	export interface StepInTargetsResponse extends Response {
		body: {
			/** The possible stepIn targets of the specified source location. */
			targets: StepInTarget[];
		};
	}

	/** GotoTargets request; value of command field is 'gotoTargets'.
		This request retrieves the possible goto targets for the specified source location.
		These targets can be used in the 'goto' request.
		The GotoTargets request may only be called if the 'supportsGotoTargetsRequest' capability exists and is true.
	*/
	export interface GotoTargetsRequest extends Request {
		// command: 'gotoTargets';
		arguments: GotoTargetsArguments;
	}

	/** Arguments for 'gotoTargets' request. */
	export interface GotoTargetsArguments {
		/** The source location for which the goto targets are determined. */
		source: Source;
		/** The line location for which the goto targets are determined. */
		line: number;
		/** An optional column location for which the goto targets are determined. */
		column?: number;
	}

	/** Response to 'gotoTargets' request. */
	export interface GotoTargetsResponse extends Response {
		body: {
			/** The possible goto targets of the specified location. */
			targets: GotoTarget[];
		};
	}

	/** CompletionsRequest request; value of command field is 'completions'.
		Returns a list of possible completions for a given caret position and text.
		The CompletionsRequest may only be called if the 'supportsCompletionsRequest' capability exists and is true.
	*/
	export interface CompletionsRequest extends Request {
		// command: 'completions';
		arguments: CompletionsArguments;
	}

	/** Arguments for 'completions' request. */
	export interface CompletionsArguments {
		/** Returns completions in the scope of this stack frame. If not specified, the completions are returned for the global scope. */
		frameId?: number;
		/** One or more source lines. Typically this is the text a user has typed into the debug console before he asked for completion. */
		text: string;
		/** The character position for which to determine the completion proposals. */
		column: number;
		/** An optional line for which to determine the completion proposals. If missing the first line of the text is assumed. */
		line?: number;
	}

	/** Response to 'completions' request. */
	export interface CompletionsResponse extends Response {
		body: {
			/** The possible completions for . */
			targets: CompletionItem[];
		};
	}

	/** Information about the capabilities of a debug adapter. */
	export interface Capabilities {
		/** The debug adapter supports the configurationDoneRequest. */
		supportsConfigurationDoneRequest?: boolean;
		/** The debug adapter supports function breakpoints. */
		supportsFunctionBreakpoints?: boolean;
		/** The debug adapter supports conditional breakpoints. */
		supportsConditionalBreakpoints?: boolean;
		/** The debug adapter supports breakpoints that break execution after a specified number of hits. */
		supportsHitConditionalBreakpoints?: boolean;
		/** The debug adapter supports a (side effect free) evaluate request for data hovers. */
		supportsEvaluateForHovers?: boolean;
		/** Available filters or options for the setExceptionBreakpoints request. */
		exceptionBreakpointFilters?: ExceptionBreakpointsFilter[];
		/** The debug adapter supports stepping back via the stepBack and reverseContinue requests. */
		supportsStepBack?: boolean;
		/** The debug adapter supports setting a variable to a value. */
		supportsSetVariable?: boolean;
		/** The debug adapter supports restarting a frame. */
		supportsRestartFrame?: boolean;
		/** The debug adapter supports the gotoTargetsRequest. */
		supportsGotoTargetsRequest?: boolean;
		/** The debug adapter supports the stepInTargetsRequest. */
		supportsStepInTargetsRequest?: boolean;
		/** The debug adapter supports the completionsRequest. */
		supportsCompletionsRequest?: boolean;
		/** The debug adapter supports the modules request. */
		supportsModulesRequest?: boolean;
		/** The set of additional module information exposed by the debug adapter. */
		additionalModuleColumns?: ColumnDescriptor[];
		/** Checksum algorithms supported by the debug adapter. */
		supportedChecksumAlgorithms?: ChecksumAlgorithm[];
		/** The debug adapter supports the RestartRequest. In this case a client should not implement 'restart' by terminating and relaunching the adapter but by calling the RestartRequest. */
		supportsRestartRequest?: boolean;
		/** The debug adapter supports 'exceptionOptions' on the setExceptionBreakpoints request. */
		supportsExceptionOptions?: boolean;
		/** The debug adapter supports a 'format' attribute on the stackTraceRequest, variablesRequest, and evaluateRequest. */
		supportsValueFormattingOptions?: boolean;
	}

	/** An ExceptionBreakpointsFilter is shown in the UI as an option for configuring how exceptions are dealt with. */
	export interface ExceptionBreakpointsFilter {
		/** The internal ID of the filter. This value is passed to the setExceptionBreakpoints request. */
		filter: string;
		/** The name of the filter. This will be shown in the UI. */
		label: string;
		/** Initial value of the filter. If not specified a value 'false' is assumed. */
		default?: boolean;
	}

	/** A structured message object. Used to return errors from requests. */
	export interface Message {
		/** Unique identifier for the message. */
		id: number;
		/** A format string for the message. Embedded variables have the form '{name}'.
			If variable name starts with an underscore character, the variable does not contain user data (PII) and can be safely used for telemetry purposes.
		*/
		format: string;
		/** An object used as a dictionary for looking up the variables in the format string. */
		variables?: { [key: string]: string; };
		/** If true send to telemetry. */
		sendTelemetry?: boolean;
		/** If true show user. */
		showUser?: boolean;
		/** An optional url where additional information about this message can be found. */
		url?: string;
		/** An optional label that is presented to the user as the UI for opening the url. */
		urlLabel?: string;
	}

	/** A Module object represents a row in the modules view.
		Two attributes are mandatory: an id identifies a module in the modules view and is used in a ModuleEvent for identifying a module for adding, updating or deleting.
		The name is used to minimally render the module in the UI.

		Additional attributes can be added to the module. They will show up in the module View if they have a corresponding ColumnDescriptor.

		To avoid an unnecessary proliferation of additional attributes with similar semantics but different names
		we recommend to re-use attributes from the 'recommended' list below first, and only introduce new attributes if nothing appropriate could be found.
	*/
	export interface Module {
		/** Unique identifier for the module. */
		id: number | string;
		/** A name of the module. */
		name: string;
		/** optional but recommended attributes.
			always try to use these first before introducing additional attributes.

			Logical full path to the module. The exact definition is implementation defined, but usually this would be a full path to the on-disk file for the module.
		*/
		path?: string;
		/** True if the module is optimized. */
		isOptimized?: boolean;
		/** True if the module is considered 'user code' by a debugger that supports 'Just My Code'. */
		isUserCode?: boolean;
		/** Version of Module. */
		version?: string;
		/** User understandable description of if symbols were found for the module (ex: 'Symbols Loaded', 'Symbols not found', etc. */
		symbolStatus?: string;
		/** Logical full path to the symbol file. The exact definition is implementation defined. */
		symbolFilePath?: string;
		/** Module created or modified. */
		dateTimeStamp?: string;
		/** Address range covered by this module. */
		addressRange?: string;
	}

	/** A ColumnDescriptor specifies what module attribute to show in a column of the ModulesView, how to format it, and what the column's label should be.
		It is only used if the underlying UI actually supports this level of customization.
	*/
	export interface ColumnDescriptor {
		/** Name of the attribute rendered in this column. */
		attributeName: string;
		/** Header UI label of column. */
		label: string;
		/** Format to use for the rendered values in this column. TBD how the format strings looks like. */
		format?: string;
		/** Datatype of values in this column.  Defaults to 'string' if not specified. */
		type?: 'string' | 'number' | 'boolean' | 'unixTimestampUTC';
		/** Width of this column in characters (hint only). */
		width?: number;
	}

	/** The ModulesViewDescriptor is the container for all declarative configuration options of a ModuleView.
		For now it only specifies the columns to be shown in the modules view.
	*/
	export interface ModulesViewDescriptor {
		columns: ColumnDescriptor[];
	}

	/** A Thread */
	export interface Thread {
		/** Unique identifier for the thread. */
		id: number;
		/** A name of the thread. */
		name: string;
	}

	/** A Source is a descriptor for source code. It is returned from the debug adapter as part of a StackFrame and it is used by clients when specifying breakpoints. */
	export interface Source {
		/** The short name of the source. Every source returned from the debug adapter has a name. When sending a source to the debug adapter this name is optional. */
		name?: string;
		/** The path of the source to be shown in the UI. It is only used to locate and load the content of the source if no sourceReference is specified (or its vaule is 0). */
		path?: string;
		/** If sourceReference > 0 the contents of the source must be retrieved through the SourceRequest (even if a path is specified). A sourceReference is only valid for a session, so it must not be used to persist a source. */
		sourceReference?: number;
		/** An optional hint for how to present the source in the UI. A value of 'deemphasize' can be used to indicate that the source is not available or that it is skipped on stepping. */
		presentationHint?: 'emphasize' | 'deemphasize';
		/** The (optional) origin of this source: possible values 'internal module', 'inlined content from source map', etc. */
		origin?: string;
		/** Optional data that a debug adapter might want to loop through the client. The client should leave the data intact and persist it across sessions. The client should not interpret the data. */
		adapterData?: any;
		/** The checksums associated with this file. */
		checksums?: Checksum[];
	}

	/** A Stackframe contains the source location. */
	export interface StackFrame {
		/** An identifier for the stack frame. It must be unique across all threads. This id can be used to retrieve the scopes of the frame with the 'scopesRequest' or to restart the execution of a stackframe. */
		id: number;
		/** The name of the stack frame, typically a method name. */
		name: string;
		/** The optional source of the frame. */
		source?: Source;
		/** The line within the file of the frame. If source is null or doesn't exist, line is 0 and must be ignored. */
		line: number;
		/** The column within the line. If source is null or doesn't exist, column is 0 and must be ignored. */
		column: number;
		/** An optional end line of the range covered by the stack frame. */
		endLine?: number;
		/** An optional end column of the range covered by the stack frame. */
		endColumn?: number;
		/** The module associated with this frame, if any. */
		moduleId?: number | string;
	}

	/** A Scope is a named container for variables. Optionally a scope can map to a source or a range within a source. */
	export interface Scope {
		/** Name of the scope such as 'Arguments', 'Locals'. */
		name: string;
		/** The variables of this scope can be retrieved by passing the value of variablesReference to the VariablesRequest. */
		variablesReference: number;
		/** The number of named variables in this scope.
			The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
		*/
		namedVariables?: number;
		/** The number of indexed variables in this scope.
			The client can use this optional information to present the variables in a paged UI and fetch them in chunks.
		*/
		indexedVariables?: number;
		/** If true, the number of variables in this scope is large or expensive to retrieve. */
		expensive: boolean;
		/** Optional source for this scope. */
		source?: Source;
		/** Optional start line of the range covered by this scope. */
		line?: number;
		/** Optional start column of the range covered by this scope. */
		column?: number;
		/** Optional end line of the range covered by this scope. */
		endLine?: number;
		/** Optional end column of the range covered by this scope. */
		endColumn?: number;
	}

	/** A Variable is a name/value pair.
		Optionally a variable can have a 'type' that is shown if space permits or when hovering over the variable's name.
		An optional 'kind' is used to render additional properties of the variable, e.g. different icons can be used to indicate that a variable is public or private.
		If the value is structured (has children), a handle is provided to retrieve the children with the VariablesRequest.
		If the number of named or indexed children is large, the numbers should be returned via the optional 'namedVariables' and 'indexedVariables' attributes.
		The client can use this optional information to present the children in a paged UI and fetch them in chunks.
	*/
	export interface Variable {
		/** The variable's name. */
		name: string;
		/** The variable's value. This can be a multi-line text, e.g. for a function the body of a function. */
		value: string;
		/** The type of the variable's value. Typically shown in the UI when hovering over the value. */
		type?: string;
		/** Properties of a variable that can be used to determine how to render the variable in the UI. Format of the string value: TBD. */
		kind?: string;
		/** Optional evaluatable name of this variable which can be passed to the 'EvaluateRequest' to fetch the variable's value. */
		evaluateName?: string;
		/** If variablesReference is > 0, the variable is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
		variablesReference: number;
		/** The number of named child variables.
			The client can use this optional information to present the children in a paged UI and fetch them in chunks.
		*/
		namedVariables?: number;
		/** The number of indexed child variables.
			The client can use this optional information to present the children in a paged UI and fetch them in chunks.
		*/
		indexedVariables?: number;
	}

	/** Properties of a breakpoint passed to the setBreakpoints request. */
	export interface SourceBreakpoint {
		/** The source line of the breakpoint. */
		line: number;
		/** An optional source column of the breakpoint. */
		column?: number;
		/** An optional expression for conditional breakpoints. */
		condition?: string;
		/** An optional expression that controls how many hits of the breakpoint are ignored. The backend is expected to interpret the expression as needed. */
		hitCondition?: string;
	}

	/** Properties of a breakpoint passed to the setFunctionBreakpoints request. */
	export interface FunctionBreakpoint {
		/** The name of the function. */
		name: string;
		/** An optional expression for conditional breakpoints. */
		condition?: string;
		/** An optional expression that controls how many hits of the breakpoint are ignored. The backend is expected to interpret the expression as needed. */
		hitCondition?: string;
	}

	/** Information about a Breakpoint created in setBreakpoints or setFunctionBreakpoints. */
	export interface Breakpoint {
		/** An optional unique identifier for the breakpoint. */
		id?: number;
		/** If true breakpoint could be set (but not necessarily at the desired location). */
		verified: boolean;
		/** An optional message about the state of the breakpoint. This is shown to the user and can be used to explain why a breakpoint could not be verified. */
		message?: string;
		/** The source where the breakpoint is located. */
		source?: Source;
		/** The start line of the actual range covered by the breakpoint. */
		line?: number;
		/** An optional start column of the actual range covered by the breakpoint. */
		column?: number;
		/** An optional end line of the actual range covered by the breakpoint. */
		endLine?: number;
		/** An optional end column of the actual range covered by the breakpoint. If no end line is given, then the end column is assumed to be in the start line. */
		endColumn?: number;
	}

	/** A StepInTarget can be used in the 'stepIn' request and determines into which single target the stepIn request should step. */
	export interface StepInTarget {
		/** Unique identifier for a stepIn target. */
		id: number;
		/** The name of the stepIn target (shown in the UI). */
		label: string;
	}

	/** A GotoTarget describes a code location that can be used as a target in the 'goto' request.
		The possible goto targets can be determined via the 'gotoTargets' request.
	*/
	export interface GotoTarget {
		/** Unique identifier for a goto target. This is used in the goto request. */
		id: number;
		/** The name of the goto target (shown in the UI). */
		label: string;
		/** The line of the goto target. */
		line: number;
		/** An optional column of the goto target. */
		column?: number;
		/** An optional end line of the range covered by the goto target. */
		endLine?: number;
		/** An optional end column of the range covered by the goto target. */
		endColumn?: number;
	}

	/** CompletionItems are the suggestions returned from the CompletionsRequest. */
	export interface CompletionItem {
		/** The label of this completion item. By default this is also the text that is inserted when selecting this completion. */
		label: string;
		/** If text is not falsy then it is inserted instead of the label. */
		text?: string;
		/** The item's type. Typically the client uses this information to render the item in the UI with an icon. */
		type?: CompletionItemType;
		/** When a completion is selected it replaces 'length' characters starting at 'start' in the text passed to the CompletionsRequest.
			If missing the frontend will try to determine these values heuristically.
		*/
		start?: number;
		length?: number;
	}

	/** Some predefined types for the CompletionItem. Please note that not all clients have specific icons for all of them. */
	export type CompletionItemType = 'method' | 'function' | 'constructor' | 'field' | 'variable' | 'class' | 'interface' | 'module' | 'property' | 'unit' | 'value' | 'enum' | 'keyword' | 'snippet' | 'text' | 'color' | 'file' | 'reference' | 'customcolor';

	/** Names of checksum algorithms that may be supported by a debug adapter. */
	export type ChecksumAlgorithm = 'MD5' | 'SHA1' | 'SHA256' | 'timestamp';

	/** The checksum of an item calculated by the specified algorithm. */
	export interface Checksum {
		/** The algorithm used to calculate this checksum. */
		algorithm: ChecksumAlgorithm;
		/** Value of the checksum. */
		checksum: string;
	}

	/** Provides formatting information for a value. */
	export interface ValueFormat {
		/** Display the value in hex. */
		hex?: boolean;
	}

	/** Provides formatting information for a stack frame. */
	export interface StackFrameFormat extends ValueFormat {
		/** Displays parameters for the stack frame. */
		parameters?: boolean;
		/** Displays the types of parameters for the stack frame. */
		parameterTypes?: boolean;
		/** Displays the names of parameters for the stack frame. */
		parameterNames?: boolean;
		/** Displays the values of parameters for the stack frame. */
		parameterValues?: boolean;
		/** Displays the line number of the stack frame. */
		line?: boolean;
		/** Displays the module of the stack frame. */
		module?: boolean;
	}

	/** An ExceptionOptions assigns configuration options to a set of exceptions. */
	export interface ExceptionOptions {
		/** A path that selects a single or multiple exceptions in a tree. If 'path' is missing, the whole tree is selected. By convention the first segment of the path is a category that is used to group exceptions in the UI. */
		path?: ExceptionPathSegment[];
		/** Condition when a thrown exception should result in a break. */
		breakMode: ExceptionBreakMode;
	}

	/** This enumeration defines all possible conditions when a thrown exception should result in a break.
		never: never breaks,
		always: always breaks,
		unhandled: breaks when excpetion unhandled,
		userUnhandled: breaks if the exception is not handled by user code.
	*/
	export type ExceptionBreakMode = 'never' | 'always' | 'unhandled' | 'userUnhandled';

	/** An ExceptionPathSegment represents a segment in a path that is used to match leafs or nodes in a tree of exceptions. If a segment consists of more than one name, it matches the names provided if 'negate' is false or missing or it matches anything except the names provided if 'negate' is true. */
	export interface ExceptionPathSegment {
		/** If false or missing this segment matches the names provided, otherwise it matches anything except the names provided. */
		negate?: boolean;
		/** Depending on the value of 'negate' the names that should match or not match. */
		names: string[];
	}
}

