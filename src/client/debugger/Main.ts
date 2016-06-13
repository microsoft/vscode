"use strict";

import {Variable, DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from "vscode-debugadapter";
import {ThreadEvent} from "vscode-debugadapter";
import {DebugProtocol} from "vscode-debugprotocol";
import {readFileSync} from "fs";
import {basename} from "path";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as child_process from "child_process";
import * as StringDecoder from "string_decoder";
import * as net from "net";
import {PythonProcess} from "./PythonProcess";
import {FrameKind, IPythonProcess, IPythonThread, IPythonModule, IPythonEvaluationResult, IPythonStackFrame, IDebugServer} from "./Common/Contracts";
import {IPythonBreakpoint, PythonBreakpointConditionKind, PythonBreakpointPassCountKind, IPythonException, PythonEvaluationResultReprKind, enum_EXCEPTION_STATE} from "./Common/Contracts";
import {BaseDebugServer} from "./DebugServers/BaseDebugServer";
import {DebugClient, DebugType} from "./DebugClients/DebugClient";
import {CreateAttachDebugClient, CreateLaunchDebugClient} from "./DebugClients/DebugFactory";
import {DjangoApp, LaunchRequestArguments, AttachRequestArguments, DebugFlags, DebugOptions} from "./Common/Contracts";

const CHILD_ENUMEARATION_TIMEOUT = 5000;

interface IDebugVariable {
    variables: IPythonEvaluationResult[];
    evaluateChildren?: Boolean;
}

export class PythonDebugger extends DebugSession {
    private _variableHandles: Handles<IDebugVariable>;
    private _pythonStackFrames: Handles<IPythonStackFrame>;
    private breakPointCounter: number = 0;
    private registeredBreakpoints: Map<number, IPythonBreakpoint>;
    private registeredBreakpointsByFileName: Map<string, IPythonBreakpoint[]>;
    private debuggerLoaded: Promise<any>;
    private debuggerLoadedPromiseResolve: () => void;

    private debugClient: DebugClient;

    public constructor(debuggerLinesStartAt1: boolean, isServer: boolean) {
        super(debuggerLinesStartAt1, isServer === true);
        this._variableHandles = new Handles<IDebugVariable>();
        this._pythonStackFrames = new Handles<IPythonStackFrame>();
        this.registeredBreakpoints = new Map<number, IPythonBreakpoint>();
        this.registeredBreakpointsByFileName = new Map<string, IPythonBreakpoint[]>();
    }
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        response.body.supportsEvaluateForHovers = true;
        this.sendResponse(response);
        // now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
        this.sendEvent(new InitializedEvent());
    }

    private pythonProcess: PythonProcess;
    private debugServer: BaseDebugServer;

    private startDebugServer(): Promise<IDebugServer> {
        let programDirectory = this.launchArgs ? path.dirname(this.launchArgs.program) : this.attachArgs.localRoot;
        this.pythonProcess = new PythonProcess(0, "", programDirectory);
        this.debugServer = this.debugClient.CreateDebugServer(this.pythonProcess);
        this.InitializeEventHandlers();
        return this.debugServer.Start();
    }
    private stopDebugServer() {
        if (this.debugClient) {
            this.debugClient.Stop();
            this.debugClient = null;
        }
        if (this.pythonProcess) {
            this.pythonProcess.Kill();
        }
    }
    private InitializeEventHandlers() {
        this.pythonProcess.on("last", arg => this.onDetachDebugger());
        this.pythonProcess.on("threadExited", arg => this.onPythonThreadExited(arg));
        this.pythonProcess.on("moduleLoaded", arg => this.onPythonModuleLoaded(arg));
        this.pythonProcess.on("threadCreated", arg => this.onPythonThreadCreated(arg));
        this.pythonProcess.on("processLoaded", arg => this.onPythonProcessLoaded(arg));
        this.pythonProcess.on("output", (pyThread, output) => this.onDebuggerOutput(pyThread, output));
        this.pythonProcess.on("exceptionRaised", (pyThread, ex) => this.onPythonException(pyThread, ex));
        this.pythonProcess.on("breakpointHit", (pyThread, breakpointId) => this.onBreakpointHit(pyThread, breakpointId));
        this.pythonProcess.on("stepCompleted", (pyThread) => this.onStepCompleted(pyThread));
        this.pythonProcess.on("detach", () => this.onDetachDebugger());
        this.pythonProcess.on("error", ex => this.sendEvent(new OutputEvent(ex, "stderr")));
        this.pythonProcess.on("asyncBreakCompleted", arg => this.onPythonProcessPaused(arg));

        this.debugServer.on("detach", () => this.onDetachDebugger());
    }
    private onDetachDebugger() {
        this.stopDebugServer();
        this.sendEvent(new TerminatedEvent());
        this.shutdown();
    }
    private onPythonThreadCreated(pyThread: IPythonThread) {
        this.sendEvent(new ThreadEvent("started", pyThread.Id));
    }
    private onStepCompleted(pyThread: IPythonThread) {
        this.sendEvent(new StoppedEvent("step", pyThread.Id));
    }
    private onPythonException(pyThread: IPythonThread, ex: IPythonException) {
        this.sendEvent(new StoppedEvent("exception", pyThread.Id, `${ex.TypeName}, ${ex.Description}`));
        this.sendEvent(new OutputEvent(`${ex.TypeName}, ${ex.Description}\n`, "stderr"));
    }
    private onPythonThreadExited(pyThread: IPythonThread) {
        this.sendEvent(new ThreadEvent("exited", pyThread.Id));
    }
    private onPythonProcessPaused(pyThread: IPythonThread) {
        this.sendEvent(new StoppedEvent("user request", pyThread.Id));
    }
    private onPythonModuleLoaded(module: IPythonModule) {
    }
    private debuggerHasLoaded: boolean;
    private onPythonProcessLoaded(pyThread: IPythonThread) {
        this.debuggerHasLoaded = true;
        this.sendResponse(this.entryResponse);
        this.debuggerLoadedPromiseResolve();
        if (this.launchArgs && this.launchArgs.stopOnEntry === true) {
            this.sendEvent(new StoppedEvent("entry", pyThread.Id));
        }
        else {
            // Is this the right place to do this?
            this.pythonProcess.SendResumeThread(pyThread.Id);
        }
    }

    private onDebuggerOutput(pyThread: IPythonThread, output: string) {
        if (!this.debuggerHasLoaded) {
            this.sendResponse(this.entryResponse);
            this.debuggerLoadedPromiseResolve();
        }
        this.sendEvent(new OutputEvent(output, "stdout"));
    }
    private entryResponse: DebugProtocol.LaunchResponse;
    private launchArgs: LaunchRequestArguments;
    private attachArgs: AttachRequestArguments;
    private canStartDebugger(): Promise<boolean> {
        return Promise.resolve(true);
    }
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        // Confirm the file exists
        if (!fs.existsSync(args.program)) {
            return this.sendErrorResponse(response, 2001, `File does not exist. "${args.program}"`);
        }
        this.launchArgs = args;
        this.debugClient = CreateLaunchDebugClient(args, this);

        this.debuggerLoaded = new Promise(resolve => {
            this.debuggerLoadedPromiseResolve = resolve;
        });

        this.entryResponse = response;
        let that = this;

        this.startDebugServer().then(dbgServer => {
            return that.debugClient.LaunchApplicationToDebug(dbgServer);
        }).catch(error => {
            this.sendEvent(new OutputEvent(error + "\n", "stderr"));
            this.sendErrorResponse(that.entryResponse, 2000, error);
        });
    }
    protected attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments) {
        this.attachArgs = args;
        this.debugClient = CreateAttachDebugClient(args, this);

        this.debuggerLoaded = new Promise(resolve => {
            this.debuggerLoadedPromiseResolve = resolve;
        });

        this.entryResponse = response;
        let that = this;

        this.canStartDebugger().then(() => {
            return this.startDebugServer().then(dbgServer => {
                return that.debugClient.LaunchApplicationToDebug(dbgServer);
            });
        }).catch(error => {
            this.sendEvent(new OutputEvent(error + "\n", "stderr"));
            this.sendErrorResponse(that.entryResponse, 2000, error);
        });
    }
    private onBreakpointHit(pyThread: IPythonThread, breakpointId: number) {
        // Break only if the breakpoint exists and it is enabled
        if (this.registeredBreakpoints.has(breakpointId) && this.registeredBreakpoints.get(breakpointId).Enabled === true) {
            this.sendEvent(new StoppedEvent("breakpoint", pyThread.Id));
        }
        else {
            this.pythonProcess.SendResumeThread(pyThread.Id);
        }
    }
    private buildBreakpointDetails(filePath: string, line: number, condition: string): IPythonBreakpoint {
        let isDjangoFile = false;
        if (this.launchArgs != null &&
            Array.isArray(this.launchArgs.debugOptions) &&
            this.launchArgs.debugOptions.indexOf(DebugOptions.DjangoDebugging) >= 0) {
            isDjangoFile = filePath.toUpperCase().endsWith(".HTML");
        }

        condition = typeof condition === "string" ? condition : "";

        return {
            Condition: condition,
            ConditionKind: condition.length === 0 ? PythonBreakpointConditionKind.Always : PythonBreakpointConditionKind.WhenTrue,
            Filename: filePath,
            Id: this.breakPointCounter++,
            LineNo: line,
            PassCount: 0,
            PassCountKind: PythonBreakpointPassCountKind.Always,
            IsDjangoBreakpoint: isDjangoFile,
            Enabled: true
        };
    }
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        this.debuggerLoaded.then(() => {
            if (!this.registeredBreakpointsByFileName.has(args.source.path)) {
                this.registeredBreakpointsByFileName.set(args.source.path, []);
            }

            let breakpoints: { verified: boolean, line: number }[] = [];
            let breakpointsToRemove = [];
            let linesToAdd = args.breakpoints.map(b => b.line);
            let registeredBks = this.registeredBreakpointsByFileName.get(args.source.path);
            let linesToRemove = registeredBks.map(b => b.LineNo).filter(oldLine => linesToAdd.indexOf(oldLine) === -1);
            let linesToUpdate = registeredBks.map(b => b.LineNo).filter(oldLine => linesToAdd.indexOf(oldLine) >= 0);

            // Always add new breakpoints, don't re-enable previous breakpoints
            // Cuz sometimes some breakpoints get added too early (e.g. in django) and don't get registeredBks
            // and the response comes back indicating it wasn't set properly
            // However, at a later point in time, the program breaks at that point!!!            
            let linesToAddPromises = args.breakpoints.map(bk => {
                return new Promise(resolve => {
                    let breakpoint: IPythonBreakpoint;
                    let existingBreakpointsForThisLine = registeredBks.filter(registeredBk => registeredBk.LineNo === bk.line);
                    if (existingBreakpointsForThisLine.length > 0) {
                        // We have an existing breakpoint for this line
                        // just enable that
                        breakpoint = existingBreakpointsForThisLine[0];
                        breakpoint.Enabled = true;
                    }
                    else {
                        breakpoint = this.buildBreakpointDetails(this.convertClientPathToDebugger(args.source.path), bk.line, bk.condition);
                    }

                    this.pythonProcess.BindBreakpoint(breakpoint).then(() => {
                        this.registeredBreakpoints.set(breakpoint.Id, breakpoint);
                        breakpoints.push({ verified: true, line: bk.line });
                        registeredBks.push(breakpoint);
                        resolve();
                    }).catch(reason => {
                        this.registeredBreakpoints.set(breakpoint.Id, breakpoint);
                        breakpoints.push({ verified: false, line: bk.line });
                        registeredBks.push(breakpoint);
                        resolve();
                    });
                });
            });

            let linesToRemovePromises = linesToRemove.map(line => {
                return new Promise(resolve => {
                    let registeredBks = this.registeredBreakpointsByFileName.get(args.source.path);
                    let bk = registeredBks.filter(b => b.LineNo === line)[0];
                    // Ok, we won't get a response back, so update the breakpoints list  indicating this has been disabled
                    bk.Enabled = false;
                    this.pythonProcess.DisableBreakPoint(bk);
                    resolve();
                });
            });

            let promises = linesToAddPromises.concat(linesToRemovePromises);
            Promise.all(promises).then(() => {
                response.body = {
                    breakpoints: breakpoints
                };

                this.sendResponse(response);
            });
        });
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        let threads = [];
        this.pythonProcess.Threads.forEach(t => {
            threads.push(new Thread(t.Id, t.Name));
        });

        response.body = {
            threads: threads
        };
        this.sendResponse(response);
    }
    /** converts the remote path to local path */
    protected convertDebuggerPathToClient(remotePath: string): string {
        if (this.attachArgs && this.attachArgs.localRoot && this.attachArgs.remoteRoot) {
            // get the part of the path that is relative to the source root
            const pathRelativeToSourceRoot = path.relative(this.attachArgs.remoteRoot, remotePath);
            // resolve from the local source root
            return path.resolve(this.attachArgs.localRoot, pathRelativeToSourceRoot);
        } else {
            return remotePath;
        }
    }
    /** converts the local path to remote path */
    protected convertClientPathToDebugger(clientPath: string): string {
        if (this.attachArgs && this.attachArgs.localRoot && this.attachArgs.remoteRoot) {
            // get the part of the path that is relative to the client root
            const pathRelativeToClientRoot = path.relative(this.attachArgs.localRoot, clientPath);
            // resolve from the remote source root
            return path.resolve(this.attachArgs.remoteRoot, pathRelativeToClientRoot);
        } else {
            return clientPath;
        }
    }
    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        this.debuggerLoaded.then(() => {
            if (!this.pythonProcess.Threads.has(args.threadId)) {
                response.body = {
                    stackFrames: []
                };
                this.sendResponse(response);
            }

            let pyThread = this.pythonProcess.Threads.get(args.threadId);
            let maxFrames = typeof args.levels === "number" && args.levels > 0 ? args.levels : pyThread.Frames.length - 1;
            maxFrames = maxFrames < pyThread.Frames.length ? maxFrames : pyThread.Frames.length;

            let frames = [];
            for (let counter = 0; counter < maxFrames; counter++) {
                let frame = pyThread.Frames[counter];
                let frameId = this._pythonStackFrames.create(frame);
                frames.push(new StackFrame(frameId, frame.FunctionName,
                    new Source(path.basename(frame.FileName), this.convertDebuggerPathToClient(frame.FileName)),
                    this.convertDebuggerLineToClient(frame.LineNo - 1),
                    0));
            }

            response.body = {
                stackFrames: frames
            };

            this.sendResponse(response);
        });
    }
    protected stepInRequest(response: DebugProtocol.StepInResponse): void {
        this.sendResponse(response);
        this.pythonProcess.SendStepInto(this.pythonProcess.LastExecutedThread.Id);
    }
    protected stepOutRequest(response: DebugProtocol.StepInResponse): void {
        this.sendResponse(response);
        this.pythonProcess.SendStepOut(this.pythonProcess.LastExecutedThread.Id);
    }
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.sendResponse(response);
        this.pythonProcess.SendContinue();
    }
    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.sendResponse(response);
        this.pythonProcess.SendStepOver(this.pythonProcess.LastExecutedThread.Id);
    }
    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        this.debuggerLoaded.then(() => {
            let frame = this._pythonStackFrames.get(args.frameId);
            if (!frame) {
                response.body = {
                    result: null,
                    variablesReference: 0
                };
                return this.sendResponse(response);
            }

            this.pythonProcess.ExecuteText(args.expression, PythonEvaluationResultReprKind.Normal, frame).then(result => {
                let variablesReference = 0;
                // If this value can be expanded, then create a vars ref for user to expand it
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
                    this.sendErrorResponse(response, 2000, error);
                }
            );
        });
    }
    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        this.debuggerLoaded.then(() => {
            let frame = this._pythonStackFrames.get(args.frameId);
            if (!frame) {
                response.body = {
                    scopes: []
                };
                return this.sendResponse(response);
            }

            let scopes = [];
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
        });
    }
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        let varRef = this._variableHandles.get(args.variablesReference);

        if (varRef.evaluateChildren !== true) {
            let variables = [];
            varRef.variables.forEach(variable => {
                let variablesReference = 0;
                // If this value can be expanded, then create a vars ref for user to expand it
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

        // Ok, we need to evaluate the children of the current variable
        let variables = [];
        let promises = varRef.variables.map(variable => {
            return variable.Process.EnumChildren(variable.Expression, variable.Frame, CHILD_ENUMEARATION_TIMEOUT).then(children => {
                children.forEach(child => {
                    let variablesReference = 0;
                    // If this value can be expanded, then create a vars ref for user to expand it
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
            }, error => {
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
        this.pythonProcess.Break();
        this.sendResponse(response);
    }
    protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments): void {
        this.debuggerLoaded.then(() => {
            let mode = enum_EXCEPTION_STATE.BREAK_MODE_NEVER;
            if (args.filters.indexOf("uncaught") >= 0) {
                mode = enum_EXCEPTION_STATE.BREAK_MODE_UNHANDLED;
            }
            if (args.filters.indexOf("all") >= 0) {
                mode = enum_EXCEPTION_STATE.BREAK_MODE_ALWAYS;
            }
            let exToIgnore = null;
            let exceptionHandling = this.launchArgs.exceptionHandling;
            if (exceptionHandling) {
                exToIgnore = new Map<string, enum_EXCEPTION_STATE>();
                if (Array.isArray(exceptionHandling.ignore)) {
                    exceptionHandling.ignore.forEach(exType => {
                        exToIgnore.set(exType, enum_EXCEPTION_STATE.BREAK_MODE_NEVER);
                    });
                }
                if (Array.isArray(exceptionHandling.always)) {
                    exceptionHandling.always.forEach(exType => {
                        exToIgnore.set(exType, enum_EXCEPTION_STATE.BREAK_MODE_ALWAYS);
                    });
                }
                if (Array.isArray(exceptionHandling.unhandled)) {
                    exceptionHandling.unhandled.forEach(exType => {
                        exToIgnore.set(exType, enum_EXCEPTION_STATE.BREAK_MODE_UNHANDLED);
                    });
                }
            }
            this.pythonProcess.SendExceptionInfo(mode, exToIgnore);
            this.sendResponse(response);
        });
    }
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments) {
        this.stopDebugServer();
        this.sendResponse(response);
    }
}

DebugSession.run(PythonDebugger);