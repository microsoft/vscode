/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Declaration module describing the VS Code debug protocol
 */
declare module DebugProtocol {

	/** Base class of requests, responses, and events. */
	export interface ProtocolMessage {
		/** Sequence number */
		seq: number;
		/** One of "request", "response", or "event" */
		type: string;
	}

	/** Client-initiated request */
	export interface Request extends ProtocolMessage {
		/** The command to execute */
		command: string;
		/** Object containing arguments for the command */
		arguments?: any;
	}

	/** Server-initiated event */
	export interface Event extends ProtocolMessage {
		/** Type of event */
		event: string;
		/** Event-specific information */
		body?: any;
	}

	/** Server-initiated response to client request */
	export interface Response extends ProtocolMessage {
		/** Sequence number of the corresponding request */
		request_seq: number;
		/** Outcome of the request */
		success: boolean;
		/** The command requested */
		command: string;
		/** Contains error message if success == false. */
		message?: string;
		/** Contains request result if success is true and optional error details if success is false. */
		body?: any;
	}

	//---- Events

	/** Event message for "initialized" event type.
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
	}

	/** Event message for "stopped" event type.
		The event indicates that the execution of the debuggee has stopped due to some condition.
		This can be caused by a break point previously set, a stepping action has completed, by executing a debugger statement etc.
	*/
	export interface StoppedEvent extends Event {
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
			 **/
			allThreadsStopped?: boolean;
		};
	}

	/** Event message for "exited" event type.
		The event indicates that the debuggee has exited.
	*/
	export interface ExitedEvent extends Event {
		body: {
			/** The exit code returned from the debuggee. */
			exitCode: number;
		};
	}

	/** Event message for "terminated" event types.
		The event indicates that debugging of the debuggee has terminated.
	*/
	export interface TerminatedEvent extends Event {
		body?: {
			/** A debug adapter may set 'restart' to true to request that the front end restarts the session. */
			restart?: boolean;
		}
	}

	/** Event message for "thread" event type.
		The event indicates that a thread has started or exited.
	*/
	export interface ThreadEvent extends Event {
		body: {
			/** The reason for the event (such as: 'started', 'exited'). */
			reason: string;
			/** The identifier of the thread. */
			threadId: number;
		};
	}

	/** Event message for "output" event type.
		The event indicates that the target has produced output.
	*/
	export interface OutputEvent extends Event {
		body: {
			/** The category of output (such as: 'console', 'stdout', 'stderr', 'telemetry'). If not specified, 'console' is assumed. */
			category?: string;
			/** The output to report. */
			output: string;
			/** Optional data to report. For the 'telemetry' category the data will be sent to telemetry, for the other categories the data is shown in JSON format. */
			data?: any;
		};
	}

	/** Event message for "breakpoint" event type.
		The event indicates that some information about a breakpoint has changed.
	*/
	export interface BreakpointEvent extends Event {
		body: {
			/** The reason for the event (such as: 'changed', 'new'). */
			reason: string;
			/** The breakpoint. */
			breakpoint: Breakpoint;
		}
	}

	/** Event message for "module" event type.
		The event indicates that some information about a module has changed.
	 */
	export interface ModuleEvent extends Event {
		body: {
			/** The reason for the event. */
			reason: 'new' | 'changed' | 'removed';
			/** The new, changed, or removed module. In case of 'removed' only the module id is used. */
			module: Module;
		}
	}

	//---- Requests

	/** On error that is whenever 'success' is false, the body can provide more details.
	 */
	export interface ErrorResponse extends Response {
		body: {
			/** An optional, structured error message. */
			error?: Message
		}
	}

	/** Initialize request; value of command field is "initialize".
	*/
	export interface InitializeRequest extends Request {
		arguments: InitializeRequestArguments;
	}
	/** Arguments for "initialize" request. */
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
	}
	/** Response to Initialize request. */
	export interface InitializeResponse extends Response {
		/** The capabilities of this debug adapter */
		body?: Capabilites;
	}

	/** ConfigurationDone request; value of command field is "configurationDone".
		The client of the debug protocol must send this request at the end of the sequence of configuration requests (which was started by the InitializedEvent)
	*/
	export interface ConfigurationDoneRequest extends Request {
		arguments?: ConfigurationDoneArguments;
	}
	/** Arguments for "configurationDone" request. */
	export interface ConfigurationDoneArguments {
		/* The configurationDone request has no standardized attributes. */
	}
	/** Response to "configurationDone" request. This is just an acknowledgement, so no body field is required. */
	export interface ConfigurationDoneResponse extends Response {
	}

	/** Launch request; value of command field is "launch".
	*/
	export interface LaunchRequest extends Request {
		arguments: LaunchRequestArguments;
	}
	/** Arguments for "launch" request. */
	export interface LaunchRequestArguments {
		/* If noDebug is true the launch request should launch the program without enabling debugging. */
		noDebug?: boolean;
	}
	/** Response to "launch" request. This is just an acknowledgement, so no body field is required. */
	export interface LaunchResponse extends Response {
	}

	/** Attach request; value of command field is "attach".
	*/
	export interface AttachRequest extends Request {
		arguments: AttachRequestArguments;
	}
	/** Arguments for "attach" request. */
	export interface AttachRequestArguments {
		/* The attach request has no standardized attributes. */
	}
	/** Response to "attach" request. This is just an acknowledgement, so no body field is required. */
	export interface AttachResponse extends Response {
	}

	/** Disconnect request; value of command field is "disconnect".
	*/
	export interface DisconnectRequest extends Request {
		arguments?: DisconnectArguments;
	}
	/** Arguments for "disconnect" request. */
	export interface DisconnectArguments {
	}
	/** Response to "disconnect" request. This is just an acknowledgement, so no body field is required. */
	export interface DisconnectResponse extends Response {
	}

	/** SetBreakpoints request; value of command field is "setBreakpoints".
		Sets multiple breakpoints for a single source and clears all previous breakpoints in that source.
		To clear all breakpoint for a source, specify an empty array.
		When a breakpoint is hit, a StoppedEvent (event type 'breakpoint') is generated.
	*/
	export interface SetBreakpointsRequest extends Request {
		arguments: SetBreakpointsArguments;
	}
	/** Arguments for "setBreakpoints" request. */
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
	/** Response to "setBreakpoints" request.
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

	/** SetFunctionBreakpoints request; value of command field is "setFunctionBreakpoints".
		Sets multiple function breakpoints and clears all previous function breakpoints.
		To clear all function breakpoint, specify an empty array.
		When a function breakpoint is hit, a StoppedEvent (event type 'function breakpoint') is generated.
	*/
	export interface SetFunctionBreakpointsRequest extends Request {
		arguments: SetFunctionBreakpointsArguments;
	}
	/** Arguments for "setFunctionBreakpoints" request. */
	export interface SetFunctionBreakpointsArguments {
		/** The function names of the breakpoints. */
		breakpoints: FunctionBreakpoint[];
	}
	/** Response to "setFunctionBreakpoints" request.
		Returned is information about each breakpoint created by this request.
	*/
	export interface SetFunctionBreakpointsResponse extends Response {
		body: {
			/** Information about the breakpoints. The array elements correspond to the elements of the 'breakpoints' array. */
			breakpoints: Breakpoint[];
		};
	}

	/** SetExceptionBreakpoints request; value of command field is "setExceptionBreakpoints".
		Enable that the debuggee stops on exceptions with a StoppedEvent (event type 'exception').
	*/
	export interface SetExceptionBreakpointsRequest extends Request {
		arguments: SetExceptionBreakpointsArguments;
	}
	/** Arguments for "setExceptionBreakpoints" request. */
	export interface SetExceptionBreakpointsArguments {
		/** Names of enabled exception breakpoints. */
		filters: string[];
	}
	/** Response to "setExceptionBreakpoints" request. This is just an acknowledgement, so no body field is required. */
	export interface SetExceptionBreakpointsResponse extends Response {
	}

	/** Continue request; value of command field is "continue".
		The request starts the debuggee to run again.
	*/
	export interface ContinueRequest extends Request {
		arguments: ContinueArguments;
	}
	/** Arguments for "continue" request. */
	export interface ContinueArguments {
		/** Continue execution for the specified thread (if possible). If the backend cannot continue on a single thread but will continue on all threads, it should set the allThreadsContinued attribute in the response to true. */
		threadId: number;
	}
	/** Response to "continue" request. */
	export interface ContinueResponse extends Response {
		body: {
			/** If true, the continue request has ignored the specified thread and continued all threads instead. If this attribute is missing a value of 'true' is assumed for backward compatibility. */
			allThreadsContinued?: boolean;
		};
	}

	/** Next request; value of command field is "next".
		The request starts the debuggee to run again for one step.
		The debug adapter first sends the NextResponse and then a StoppedEvent (event type 'step') after the step has completed.
	*/
	export interface NextRequest extends Request {
		arguments: NextArguments;
	}
	/** Arguments for "next" request. */
	export interface NextArguments {
		/** Continue execution for this thread. */
		threadId: number;
	}
	/** Response to "next" request. This is just an acknowledgement, so no body field is required. */
	export interface NextResponse extends Response {
	}

	/** StepIn request; value of command field is "stepIn".
		The request starts the debuggee to run again for one step.
		The debug adapter first sends the StepInResponse and then a StoppedEvent (event type 'step') after the step has completed.
	*/
	export interface StepInRequest extends Request {
		arguments: StepInArguments;
	}
	/** Arguments for "stepIn" request. */
	export interface StepInArguments {
		/** Continue execution for this thread. */
		threadId: number;
	}
	/** Response to "stepIn" request. This is just an acknowledgement, so no body field is required. */
	export interface StepInResponse extends Response {
	}

	/** StepOut request; value of command field is "stepOut".
		The request starts the debuggee to run again for one step.
		The debug adapter first sends the StepOutResponse and then a StoppedEvent (event type 'step') after the step has completed.
	*/
	export interface StepOutRequest extends Request {
		arguments: StepOutArguments;
	}
	/** Arguments for "stepOut" request. */
	export interface StepOutArguments {
		/** Continue execution for this thread. */
		threadId: number;
	}
	/** Response to "stepOut" request. This is just an acknowledgement, so no body field is required. */
	export interface StepOutResponse extends Response {
	}

	/** StepBack request; value of command field is "stepBack".
		The request starts the debuggee to run one step backwards.
		The debug adapter first sends the StepBackResponse and then a StoppedEvent (event type 'step') after the step has completed.
	*/
	export interface StepBackRequest extends Request {
		arguments: StepBackArguments;
	}
	/** Arguments for "stepBack" request. */
	export interface StepBackArguments {
		/** Continue execution for this thread. */
		threadId: number;
	}
	/** Response to "stepBack" request. This is just an acknowledgement, so no body field is required. */
	export interface StepBackResponse extends Response {
	}

	/** Pause request; value of command field is "pause".
		The request suspenses the debuggee.
		The debug adapter first sends the PauseResponse and then a StoppedEvent (event type 'pause') after the thread has been paused successfully.
	*/
	export interface PauseRequest extends Request {
		arguments: PauseArguments;
	}
	/** Arguments for "pause" request. */
	export interface PauseArguments {
		/** Pause execution for this thread. */
		threadId: number;
	}
	/** Response to "pause" request. This is just an acknowledgement, so no body field is required. */
	export interface PauseResponse extends Response {
	}

	/** StackTrace request; value of command field is "stackTrace".
		The request returns a stacktrace from the current execution state.
	*/
	export interface StackTraceRequest extends Request {
		arguments: StackTraceArguments;
	}
	/** Arguments for "stackTrace" request. */
	export interface StackTraceArguments {
		/** Retrieve the stacktrace for this thread. */
		threadId: number;
		/** The index of the first frame to return; if omitted frames start at 0. */
		startFrame?: number;
		/** The maximum number of frames to return. If levels is not specified or 0, all frames are returned. */
		levels?: number;
	}
	/** Response to "stackTrace" request. */
	export interface StackTraceResponse extends Response {
		body: {
			/** The frames of the stackframe. If the array has length zero, there are no stackframes available.
				This means that there is no location information available. */
			stackFrames: StackFrame[];
			/** The total number of frames available. */
			totalFrames?: number;
		};
	}

	/** Scopes request; value of command field is "scopes".
		The request returns the variable scopes for a given stackframe ID.
	*/
	export interface ScopesRequest extends Request {
		arguments: ScopesArguments;
	}
	/** Arguments for "scopes" request. */
	export interface ScopesArguments {
		/** Retrieve the scopes for this stackframe. */
		frameId: number;
	}
	/** Response to "scopes" request. */
	export interface ScopesResponse extends Response {
		body: {
			/** The scopes of the stackframe. If the array has length zero, there are no scopes available. */
			scopes: Scope[];
		};
	}

	/** Variables request; value of command field is "variables".
		Retrieves all children for the given variable reference.
	*/
	export interface VariablesRequest extends Request {
		arguments: VariablesArguments;
	}
	/** Arguments for "variables" request. */
	export interface VariablesArguments {
		/** The Variable reference. */
		variablesReference: number;
	}
	/** Response to "variables" request. */
	export interface VariablesResponse extends Response {
		body: {
			/** All children for the given variable reference */
			variables: Variable[];
		};
	}

	/** setVariable request; value of command field is "setVariable".
		Set the variable with the given name in the variable container to a new value.
	*/
	export interface SetVariableRequest extends Request {
		arguments: SetVariableArguments;
	}
	/** Arguments for "setVariable" request. */
	export interface SetVariableArguments {
		/** The reference of the variable container. */
		variablesReference: number;
		/** The name of the variable. */
		name: string;
		/** The value of the variable. */
		value: string;
	}
	/** Response to "setVariable" request. */
	export interface SetVariableResponse extends Response {
		body: {
			/** the new value of the variable. */
			value: string;
		};
	}

	/** Source request; value of command field is "source".
		The request retrieves the source code for a given source reference.
	*/
	export interface SourceRequest extends Request {
		arguments: SourceArguments;
	}
	/** Arguments for "source" request. */
	export interface SourceArguments {
		/** The reference to the source. This is the value received in Source.reference. */
		sourceReference: number;
	}
	/** Response to "source" request. */
	export interface SourceResponse extends Response {
		body: {
			/** Content of the source reference */
			content: string;
			/** Optional content type (mime type) of the source. */
			mimeType?: string;
		};
	}

	/** Thread request; value of command field is "threads".
		The request retrieves a list of all threads.
	*/
	export interface ThreadsRequest extends Request {
	}
	/** Response to "threads" request. */
	export interface ThreadsResponse extends Response {
		body: {
			/** All threads. */
			threads: Thread[];
		};
	}

	/**
	 * Modules can be retrieved from the debug adapter with the ModulesRequest which can either return all modules or a range of modules to support paging.
	 */
	export interface ModulesRequest extends Request {
		arguments: ModulesArguments;
	}
	/** Arguments for "modules" request. */
	export interface ModulesArguments {
		/** The index of the first module to return; if omitted modules start at 0. */
		startModule?: number;
		/** The number of modules to return. If moduleCount is not specified or 0, all modules are returned. */
		moduleCount?: number;
	}
	/** Response to "modules" request. */
	export interface ModulesResponse extends Response {
		body: {
			/** All modules or range of modules. */
			modules: Module[];
			/** The total number of modules available. */
			totalModules?: number;
		};
	}

	/** Evaluate request; value of command field is "evaluate".
		Evaluates the given expression in the context of the top most stack frame.
		The expression has access to any variables and arguments that are in scope.
	*/
	export interface EvaluateRequest extends Request {
		arguments: EvaluateArguments;
	}
	/** Arguments for "evaluate" request. */
	export interface EvaluateArguments {
		/** The expression to evaluate. */
		expression: string;
		/** Evaluate the expression in the scope of this stack frame. If not specified, the expression is evaluated in the global scope. */
		frameId?: number;
		/** The context in which the evaluate request is run. Possible values are 'watch' if evaluate is run in a watch, 'repl' if run from the REPL console, or 'hover' if run from a data hover. */
		context?: string;
	}
	/** Response to "evaluate" request. */
	export interface EvaluateResponse extends Response {
		body: {
			/** The result of the evaluate. */
			result: string;
			/** If variablesReference is > 0, the evaluate result is structured and its children can be retrieved by passing variablesReference to the VariablesRequest */
			variablesReference: number;
		};
	}

	//---- Types

	/** Information about the capabilities of a debug adapter. */
	export interface Capabilites {
		/** The debug adapter supports the configurationDoneRequest. */
		supportsConfigurationDoneRequest?: boolean;
		/** The debug adapter supports functionBreakpoints. */
		supportsFunctionBreakpoints?: boolean;
		/** The debug adapter supports conditionalBreakpoints. */
		supportsConditionalBreakpoints?: boolean;
		/** The debug adapter supports a (side effect free) evaluate request for data hovers. */
		supportsEvaluateForHovers?: boolean;
		/** Available filters for the setExceptionBreakpoints request. */
		exceptionBreakpointFilters?: ExceptionBreakpointsFilter[];
		/** The debug adapter supports stepping back. */
		supportsStepBack?: boolean;
		/** The debug adapter supports setting a variable to a value. */
		supportsSetVariable?: boolean;
	}

	/** An ExceptionBreakpointsFilter is shown in the UI as an option for configuring how exceptions are dealt with. */
	export interface ExceptionBreakpointsFilter {
		/** The internal ID of the filter. This value is passed to the setExceptionBreakpoints request. */
		filter: string,
		/** The name of the filter. This will be shown in the UI. */
		label: string,
		/** Initial value of the filter. If not specified a value 'false' is assumed. */
		default?: boolean
	}

	/** A structured message object. Used to return errors from requests. */
	export interface Message {
		/** Unique identifier for the message. */
		id: number;
		/** A format string for the message. Embedded variables have the form '{name}'.
		    If variable name starts with an underscore character, the variable does not contain user data (PII) and can be safely used for telemetry purposes. */
		format: string;
		/** An object used as a dictionary for looking up the variables in the format string. */
		variables?: { [key: string]: string };
		/** if true send to telemetry */
		sendTelemetry?: boolean;
		/** if true show user */
		showUser?: boolean;
		/** An optional url where additional information about this message can be found. */
		url?: string;
		/** An optional label that is presented to the user as the UI for opening the url. */
		urlLabel?: string;
	}

	/**
	 * A Module object represents a row in the modules view.
	 * Two attributes are mandatory: an id identifies a module in the modules view and is used in a ModuleEvent for identifying a module for adding, updating or deleting.
	 * The name is used to minimally render the module in the UI.
	 *
	 * Additional attributes can be added to the module. They will show up in the module View if they have a corresponding ColumnDescriptor.
	 *
	 * To avoid an unnecessary proliferation of additional attributes with similar semantics but different names
	 * we recommend to re-use attributes from the 'recommended' list below first, and only introduce new attributes if nothing appropriate could be found.
	 */
	export interface Module {
		/** Unique identifier for the module. */
		id: number | string;
		/** A name of the module. */
		name: string;

		// optional but recommended attributes.
		// always try to use these first before introducing additional attributes.

		/** Logical full path to the module. The exact definition is implementation defined, but usually this would be a full path to the on-disk file for the module. */
		path?: string
		/** True if the module is optimized. */
		isOptimized?: boolean
		/** True if the module is considered 'user code' by a debugger that supports 'Just My Code'. */
		isUserCode?: boolean
		/** Version of Module. */
		version? : string
		/** User understandable description of if symbols were found for the module (ex: 'Symbols Loaded', 'Symbols not found', etc */
		symbolStatus?: string
		/** Logical full path to the symbol file. The exact definition is implementation defined. */
		symbolFilePath?: string
		/** Module created or modified. */
		dateTimeStamp?: string
		/** Address range covered by this module. */
		addressRange?: string
	}

	/**
	 * A ColumnDescriptor specifies what module attribute to show in a column of the ModulesView, how to format it, and what the column's label should be.
	 * It is only used if the underlying UI actually supports this level of customization.
	 */
	export interface ColumnDescriptor {
		/** Name of the attribute rendered in this column. */
		attributeName: string;
		/** Header UI label of column. */
		label: string;
		/** Format to use for the rendered values in this column. TBD how the format strings looks like. */
		format: string;
		/** Width of this column in characters (hint only). */
		width: number;
	}

	/**
	 * The ModulesViewDescriptor is the container for all declarative configuration options of a ModuleView.
	 * For now it only specifies the columns to be shown in the modules view.
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
		/** The short name of the source. Every source returned from the debug adapter has a name. When specifying a source to the debug adapter this name is optional. */
		name?: string;
		/** The long (absolute) path of the source. It is not guaranteed that the source exists at this location. */
		path?: string;
		/** If sourceReference > 0 the contents of the source can be retrieved through the SourceRequest. A sourceReference is only valid for a session, so it must not be used to persist a source. */
		sourceReference?: number;
		/** The (optional) origin of this source: possible values "internal module", "inlined content from source map", etc. */
		origin?: string;
		/** Optional data that a debug adapter might want to loop through the client. The client should leave the data intact and persist it across sessions. The client should not interpret the data. */
		adapterData?: any;
	}

	/** A Stackframe contains the source location. */
	export interface StackFrame {
		/** An identifier for the stack frame. This id can be used to retrieve the scopes of the frame with the 'scopesRequest'. */
		id: number;
		/** The name of the stack frame, typically a method name */
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
	}

	/** A Scope is a named container for variables. */
	export interface Scope {
		/** name of the scope (as such 'Arguments', 'Locals') */
		name: string;
		/** The variables of this scope can be retrieved by passing the value of variablesReference to the VariablesRequest. */
		variablesReference: number;
		/** If true, the number of variables in this scope is large or expensive to retrieve. */
		expensive: boolean;
	}

	/** A Variable is a name/value pair.
		Optionally a variable can have a 'type' that is shown if space permits or when hovering over the variable's name.
		An optional 'kind' is used to render additional properties of the variable, e.g. different icons can be used to indicate that a variable is public or private.
		If the value is structured (has children), a handle is provided to retrieve the children with the VariablesRequest.
	*/
	export interface Variable {
		/** The variable's name. */
		name: string;
		/** The variable's type. */
		type?: string;
		/** The variable's value. For structured objects this can be a multi line text, e.g. for a function the body of a function. */
		value: string;
		/** If variablesReference is > 0, the variable is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
		variablesReference: number;
		/** Properties of a variable that can be used to determine how to render the variable in the UI. Format of the string value: TBD. */
		kind?: string;
	}

	/** Properties of a breakpoint passed to the setBreakpoints request.
	*/
	export interface SourceBreakpoint {
		/** The source line of the breakpoint. */
		line: number;
		/** An optional source column of the breakpoint. */
		column?: number;
		/** An optional expression for conditional breakpoints. */
		condition?: string;
	}

	/** Properties of a breakpoint passed to the setFunctionBreakpoints request.
	*/
	export interface FunctionBreakpoint {
		/** The name of the function. */
		name: string;
		/** An optional expression for conditional breakpoints. */
		condition?: string;
	}

	/** Information about a Breakpoint created in setBreakpoints or setFunctionBreakpoints.
	*/
	export interface Breakpoint {
		/** An optional unique identifier for the breakpoint. */
		id?: number;
		/** If true breakpoint could be set (but not necessarily at the desired location).  */
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
		/**  An optional end column of the actual range covered by the breakpoint. If no end line is given, then the end column is assumed to be in the start line. */
		endColumn?: number;
	}
}
