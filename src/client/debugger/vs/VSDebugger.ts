"use string";

import {Variable, DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from 'vscode-debugadapter';
import {ThreadEvent} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as StringDecoder from 'string_decoder';
import * as net from 'net';
import {PythonProcess} from './PythonProcess';
import {FrameKind, IPythonProcess, IPythonThread, IPythonModule, IPythonEvaluationResult, IPythonStackFrame, IDebugServer} from './Common/Contracts';
import {IPythonBreakpoint, PythonBreakpointConditionKind, PythonBreakpointPassCountKind, IPythonException, PythonEvaluationResultReprKind, enum_EXCEPTION_STATE} from './Common/Contracts';

const CHILD_ENUMEARATION_TIMEOUT = 5000;
 
/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean;
    args: string[];
    pythonPath: string;
}

interface IDebugVariable {
    variables: IPythonEvaluationResult[];
    evaluateChildren?: Boolean;
}

class PythonDebugSession extends DebugSession {
    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static THREAD_ID = 1;
    private _variableHandles: Handles<IDebugVariable>;
    private breakPointCounter: number = 0;
    private registeredBreakpoints: Map<number, IPythonBreakpoint>;
    private registeredBreakpointsByFileName: Map<string, IPythonBreakpoint[]>;
    private stopOnEntry: boolean;
    private debuggerLoaded: Promise<any>;
    private debuggerLoadedPromiseResolve: () => void;
    public constructor(debuggerLinesStartAt1: boolean, isServer: boolean) {
        super(debuggerLinesStartAt1, isServer === true);
        this._variableHandles = new Handles<IDebugVariable>();
        this.registeredBreakpoints = new Map<number, IPythonBreakpoint>();
        this.registeredBreakpointsByFileName = new Map<string, IPythonBreakpoint[]>();
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.sendResponse(response);

        // now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
        this.sendEvent(new InitializedEvent());
    }
    private startedHandlingMessages: Boolean;
    private pythonProcess: PythonProcess;
    private debugSocketServer: net.Server;
    private startDebugServer(): Promise<IDebugServer> {
        return new Promise<IDebugServer>((resolve, reject) => {
            var that = this;
            this.pythonProcess = new PythonProcess(0, "", this.programDirectory);
            this.InitializeEventHandlers();
            this.debugSocketServer = net.createServer(c => { //'connection' listener
                var pythonProcess: PythonProcess;
                var connected = false;
                console.log('client connected');
                c.on('end', (ex) => {
                    var msg = "Debugger client disconneced, " + ex;
                    that.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                    console.log(msg);
                });
                c.on("data", (buffer: Buffer) => {
                    if (!connected) {
                        connected = true;
                        that.pythonProcess.Connect(buffer, c);
                    }
                    else {
                        that.pythonProcess.HandleIncomingData(buffer)
                        that.startedHandlingMessages = true;
                    }
                });
                c.on("close", d=> {
                    var msg = "Debugger client closed, " + d;
                    console.log(msg);
                    that.emit("detach", d);
                    that.onDetachDebugger();
                });
                c.on("error", d=> {
                    // var msg = "Debugger client error, " + d;
                    // that.sendEvent(new OutputEvent(msg + "\n", "Python"));
                    // console.log(msg);
                    // // that.onDetachDebugger();
                });
                c.on("timeout", d=> {
                    var msg = "Debugger client timedout, " + d;
                    that.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                    console.log(msg);
                });
            });
            this.debugSocketServer.on("error", ex=> {
                var exMessage = JSON.stringify(ex);
                var msg = "";
                if (ex.code === "EADDRINUSE") {
                    msg = `The port used for debugging is in use, please try again or try restarting Visual Studio Code, Error = ${exMessage}`;
                }
                else {
                    msg = `There was an error in starting the debug server. Error = ${exMessage}`;
                }
                that.sendEvent(new OutputEvent(msg + "\n", "stderr"));
                console.log(msg);
                reject(msg);
            });

            this.debugSocketServer.listen(0, () => {
                var server = that.debugSocketServer.address();
                console.log(`Debug server started, listening on port ${server.port}`);
                resolve({ port: server.port });
            });
        });
    }

    private stopDebugServer() {
        try {
            this.debugSocketServer.close();
        }
        catch (ex) {
        }
        try {
            this.pyProc.kill();
        }
        catch (ex) {
        }
        this.debugSocketServer = null;
        this.pyProc = null;
    }

    private InitializeEventHandlers() {
        this.pythonProcess.on("threadExited", arg => this.onPythonThreadExited(arg));
        this.pythonProcess.on("moduleLoaded", arg=> this.onPythonModuleLoaded(arg));
        this.pythonProcess.on("threadCreated", arg=> this.onPythonThreadCreated(arg));
        this.pythonProcess.on("processLoaded", arg=> this.onPythonProcessLoaded(arg));
        this.pythonProcess.on("output", (pyThread, output) => this.onDebuggerOutput(pyThread, output));
        this.pythonProcess.on("exceptionRaised", (pyThread, ex) => this.onPythonException(pyThread, ex));
        this.pythonProcess.on("breakpointHit", (pyThread, breakpointId) => this.onBreakpointHit(pyThread, breakpointId));
        this.pythonProcess.on("detach", () => this.onDetachDebugger());
        this.pythonProcess.on("error", ex => this.sendEvent(new OutputEvent(ex, "stderr")));
    }
    private onDetachDebugger() {
        this.stopDebugServer();
        this.sendEvent(new TerminatedEvent());
        this.shutdown();
    }
    private onPythonThreadCreated(pyThread: IPythonThread) {
        this.sendEvent(new ThreadEvent("started", pyThread.Id));
    }
    private onPythonException(pyThread: IPythonThread, ex: IPythonException) {
        this.sendEvent(new StoppedEvent("exception", pyThread.Id, `${ex.TypeName}, ${ex.Description}`));
        this.sendEvent(new OutputEvent(`${ex.TypeName}, ${ex.Description}\n`, "stderr"));
        // this.sendEvent(new StoppedEvent("breakpoint", pyThread.Id));
    }
    private onPythonThreadExited(pyThread: IPythonThread) {
        this.sendEvent(new ThreadEvent("exited", pyThread.Id));
    }
    private onPythonModuleLoaded(module: IPythonModule) {
    }
    private onPythonProcessLoaded(pyThread: IPythonThread) {
        this.sendResponse(this.entryResponse);
        this.sendEvent(new StoppedEvent("entry", pyThread.Id));
        this.debuggerLoadedPromiseResolve();
    }
    private onDebuggerOutput(pyThread: IPythonThread, output: string) {
        this.sendEvent(new OutputEvent(output));
    }

    private entryResponse: DebugProtocol.LaunchResponse;
    private programDirectory: string;
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        var fileDir = path.dirname(args.program);
        this.programDirectory = fileDir;
        var fileNameWithoutPath = path.basename(args.program);
        this.stopOnEntry = args.stopOnEntry;
        var pythonPath = "python";
        if (typeof args.pythonPath === "string" && args.pythonPath.trim().length > 0) {
            pythonPath = args.pythonPath;
        }

        this.debuggerLoaded = new Promise(resolve=> {
            this.debuggerLoadedPromiseResolve = resolve;
        });
        this.entryResponse = response;

        var that = this;
        this.startDebugServer().then(dbgServer => {
            dbgServer.port
            var vsDebugOptions = "RedirectOutput";//,\"WaitOnNormalExit\"";
            //GUID is hardcoded for now, will have to be fixed 
            var currentFileName = module.filename;
            var ptVSToolsFilePath = path.join(path.dirname(currentFileName), "..", "..", "..", "..", "pythonFiles", "PythonTools", "visualstudio_py_launcher.py");// ""; //C:\Users\djayamanne\.vscode\extensions\pythonVSCode\pythonFiles\PythonTools
            var programArgs = Array.isArray(args.args) && args.args.length > 0 ? args.args.join(" ") : "";

            var commandLine = `${pythonPath} \"${ptVSToolsFilePath}\" \"${fileDir}" ${dbgServer.port} 34806ad9-833a-4524-8cd6-18ca4aa74f14 \"${vsDebugOptions}\" ${fileNameWithoutPath} ${programArgs}`;
            that.pyProc = child_process.exec(commandLine, { cwd: fileDir }, (error, stdout, stderr) => {
                if (that.startedHandlingMessages) {
                    return;
                }
                var hasErrors = (error && error.message.length > 0) || (stderr && stderr.length > 0);
                if (hasErrors && (typeof stdout !== "string" || stdout.length === 0)) {
                    var errorMsg = (error && error.message) ? error.message : (stderr && stderr.length > 0 ? stderr.toString("utf-8") : "");
                    that.sendEvent(new OutputEvent(errorMsg + "\n", "stderr"));
                    that.sendErrorResponse(that.entryResponse, 2000, errorMsg);
                    console.error(errorMsg);
                }
            });
        });
    }
    private pyProc: child_process.ChildProcess;
    private onBreakpointHit(pyThread: IPythonThread, breakpointId: number) {
        if (this.registeredBreakpoints.has(breakpointId)) {
            this.sendEvent(new StoppedEvent("breakpoint", pyThread.Id));
        }
        else {
            this.pythonProcess.SendResumeThread(pyThread.Id);
        }
    }
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        this.debuggerLoaded.then(() => {
            if (!this.registeredBreakpointsByFileName.has(args.source.path)) {
                this.registeredBreakpointsByFileName.set(args.source.path, []);
            }

            var breakpoints: { verified: boolean, line: number }[] = [];
            var breakpointsToRemove = [];
            var linesToAdd: number[] = [];
            if (Array.isArray(args.breakpoints)) {
                linesToAdd = args.breakpoints.map(b=> b.line);
            }
            else {
                linesToAdd = args.lines;
            }

            var linesToRemove = [];
            var registeredBks = this.registeredBreakpointsByFileName.get(args.source.path);
            linesToRemove = registeredBks.map(b=> b.LineNo).filter(oldLine=> linesToAdd.indexOf(oldLine) === -1);

            var linesToAddPromises = linesToAdd.map(line=> {
                return new Promise(resolve=> {
                    var breakpoint: IPythonBreakpoint = {
                        Condition: "",
                        ConditionKind: PythonBreakpointConditionKind.Always,
                        Filename: args.source.path,
                        Id: this.breakPointCounter++,
                        LineNo: line,
                        PassCount: 0,
                        PassCountKind: PythonBreakpointPassCountKind.Always
                    };

                    this.pythonProcess.BindBreakpoint(breakpoint).then(() => {
                        this.registeredBreakpoints.set(breakpoint.Id, breakpoint);
                        breakpoints.push({ verified: true, line: line });
                        registeredBks.push(breakpoint);
                        resolve();
                    }, reason=> {
                        this.registeredBreakpoints.set(breakpoint.Id, breakpoint);
                        breakpoints.push({ verified: false, line: line });
                        resolve();
                    });
                });
            });

            var linesToRemovePromises = linesToRemove.map(line=> {
                return new Promise(resolve=> {
                    var registeredBks = this.registeredBreakpointsByFileName.get(args.source.path);
                    var bk = registeredBks.filter(b=> b.LineNo === line)[0];
                    this.pythonProcess.DisableBreakPoint(bk);
                });
            });

            var promises = linesToAddPromises.concat(linesToRemovePromises);
            Promise.all(promises).then(() => {
                response.body = {
                    breakpoints: breakpoints
                };

                this.sendResponse(response);
            });
        });
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        // return the default thread
        var threads = [];
        this.pythonProcess.Threads.forEach(t=> {
            threads.push(new Thread(t.Id, t.Name));
        });

        response.body = {
            threads: threads
        };
        this.sendResponse(response);
    }

    private currentStackThread: IPythonThread;
    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        if (!this.pythonProcess.Threads.has(args.threadId)) {
            response.body = {
                stackFrames: []
            };
            this.currentStackThread = null;
            this.sendResponse(response);
        }

        var pyThread = this.pythonProcess.Threads.get(args.threadId);
        this.currentStackThread = pyThread;
        var maxFrames = typeof args.levels === "number" && args.levels > 0 ? args.levels : pyThread.Frames.length - 1;
        maxFrames = maxFrames < pyThread.Frames.length ? maxFrames : pyThread.Frames.length;

        var frames = [];
        for (var counter = 0; counter < maxFrames; counter++) {
            var frame = pyThread.Frames[counter];
            frames.push(new StackFrame(counter, frame.FunctionName,
                new Source(path.basename(frame.FileName), this.convertDebuggerPathToClient(frame.FileName)),
                this.convertDebuggerLineToClient(frame.LineNo - 1),
                0));
        }

        response.body = {
            stackFrames: frames
        };

        this.sendResponse(response);
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse): void {
        this.pythonProcess.SendStepInto(this.pythonProcess.LastExecutedThread.Id).then(pyThread => {
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("step", pyThread.Id));
        });
    }

    protected stepOutRequest(response: DebugProtocol.StepInResponse): void {
        this.pythonProcess.SendStepOut(this.pythonProcess.LastExecutedThread.Id).then(pyThread => {
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("return", pyThread.Id));
        });
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.pythonProcess.SendContinue().then(() => {
            this.sendResponse(response);
        });
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.pythonProcess.SendStepOver(this.pythonProcess.LastExecutedThread.Id).then(pyThread => {
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("next", pyThread.Id));
        });
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {        
        //Find the last thread for which we dislay the stack frames
        if (!this.currentStackThread) {
            response.body = {
                result: null,
                variablesReference: 0
            };
            return this.sendResponse(response);
        }

        var frame = this.currentStackThread.Frames[args.frameId];
        this.pythonProcess.ExecuteText(args.expression, PythonEvaluationResultReprKind.Normal, frame).then(result=> {
            let variablesReference = 0; 
            //If this value can be expanded, then create a vars ref for user to expand it
            if (result.IsExpandable) {
                const parentVariable: IDebugVariable = {
                    variables: [result],
                    evaluateChildren: true
                };
                variablesReference = this._variableHandles.create(parentVariable);
            }

            response.body = {
                result: result.StringRepr,
                variablesReference: variablesReference
            };
            this.sendResponse(response);
        },
            error => {
                // this.sendResponse(response);
                this.sendErrorResponse(response, 2000, error);
            }
        );
    }


    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        //Find the last thread for which we dislay the stack frames
        if (!this.currentStackThread) {
            response.body = {
                scopes: []
            };
            return this.sendResponse(response);
        }

        var frame = this.currentStackThread.Frames[args.frameId];
        frame.Locals
        var scopes = [];
        if (Array.isArray(frame.Locals) && frame.Locals.length > 0) {
            let values: IDebugVariable = { variables: frame.Locals };
            scopes.push(new Scope("Local", this._variableHandles.create(values), false));
        }
        if (Array.isArray(frame.Parameters) && frame.Parameters.length > 0) {
            let values: IDebugVariable = { variables: frame.Parameters };
            scopes.push(new Scope("Arguments", this._variableHandles.create(values), false));
        }
        response.body = { scopes };
        this.sendResponse(response);
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        var varRef = this._variableHandles.get(args.variablesReference);

        if (varRef.evaluateChildren !== true) {
            let variables = [];
            varRef.variables.forEach(variable=> {
                let variablesReference = 0;
                //If this value can be expanded, then create a vars ref for user to expand it
                if (variable.IsExpandable) {
                    const parentVariable: IDebugVariable = {
                        variables: [variable],
                        evaluateChildren: true
                    };
                    variablesReference = this._variableHandles.create(parentVariable);
                }

                variables.push({
                    name: variable.Expression,
                    value: variable.StringRepr,
                    variablesReference: variablesReference
                });
            });

            response.body = {
                variables: variables
            };

            return this.sendResponse(response);
        }

       
                
        //Ok, we need to evaluate the children of the current variable
        var variables = [];
        var promises = varRef.variables.map(variable=> {
            return variable.Process.EnumChildren(variable.Expression, variable.Frame, CHILD_ENUMEARATION_TIMEOUT).then(children=> {
                children.forEach(child=> {
                    let variablesReference = 0;
                    //If this value can be expanded, then create a vars ref for user to expand it
                    if (child.IsExpandable) {
                        const childVariable: IDebugVariable = {
                            variables: [child],
                            evaluateChildren: true
                        };
                        variablesReference = this._variableHandles.create(childVariable);
                    }

                    variables.push({
                        name: child.ChildName,
                        value: child.StringRepr,
                        variablesReference: variablesReference
                    });
                });
            }, error=> {
                this.sendErrorResponse(response, 2001, error);
            });
        });

        Promise.all(promises).then(() => {
            response.body = {
                variables: variables
            };

            return this.sendResponse(response);
        });
    }
            
    protected pauseRequest(response: DebugProtocol.PauseResponse): void {
        console.error('Not yet implemented: pauseRequest');
        this.sendErrorResponse(response, 2000, "Pause is not yet supported");
    }

    protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments): void {
        this.debuggerLoaded.then(() => {
            var mode = enum_EXCEPTION_STATE.BREAK_MODE_NEVER;
            if (args.filters.indexOf("uncaught") >= 0) {
                mode = enum_EXCEPTION_STATE.BREAK_MODE_UNHANDLED;
            }
            if (args.filters.indexOf("all") >= 0) {
                mode = enum_EXCEPTION_STATE.BREAK_MODE_ALWAYS;
            }
            this.pythonProcess.SendExceptionInfo(mode, null);
            this.sendResponse(response);
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments) {
        this.stopDebugServer();
        this.sendResponse(response);
    }
}

DebugSession.run(PythonDebugSession);
