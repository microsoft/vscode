
/*---------------------------------------------------------
 ** Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as StringDecoder from 'string_decoder';
import {PdbRunner, IPdbCommand} from './pdbRunner';
import {DebugVariable, IBreakpoint, IStackInfo, IExecutionResult, ScopeType} from './common';

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

class PythonDebugSession extends DebugSession {
    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static THREAD_ID = 1;
    private _variableHandles: Handles<DebugVariable>;

    public constructor(debuggerLinesStartAt1: boolean, isServer: boolean) {
        super(debuggerLinesStartAt1, isServer === true);
        this._variableHandles = new Handles<DebugVariable>();
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.sendResponse(response);

        // now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
        this.sendEvent(new InitializedEvent());
    }

    private pdbRunner: PdbRunner;
    private breakPointsLoaded: Promise<any>;
    private breakPointsResolve: () => void;
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        var fileDir = path.dirname(args.program);

        var pythonPath = "python";
        if (typeof args.pythonPath === "string" && args.pythonPath.trim().length > 0) {
            pythonPath = args.pythonPath;
        }

        var programArgs = Array.isArray(args.args) ? args.args : [];
        this.pdbRunner = new PdbRunner(args.program, this, programArgs, pythonPath, args.stopOnEntry);

        this.pdbRunner.PdbLoaded.then(() => {
            //If it wasn't supposed to stop on entry, then invoke the "continue" command
            if (args.stopOnEntry === true) {
                this.sendResponse(response);
                this.sendEvent(new StoppedEvent("entry", PythonDebugSession.THREAD_ID));
            }
            else {
                if (this.breakPointsLoaded) {
                    //Give time for the breakpoints to get loaded
                    //This will cause the callback to be registered after breakpoints would have added the callback :)
                    this.breakPointsLoaded.then(() => {
                        this.continueRequest(response, { threadId: PythonDebugSession.THREAD_ID });
                    });
                }
                else {
                    this.sendResponse(response);
                    this.sendEvent(new StoppedEvent("entry", PythonDebugSession.THREAD_ID));
                }
            }
        });
    }

    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        if (!this.pdbRunner) {
            return
        }

        this.breakPointsLoaded = new Promise<any>(resolve=> {
            this.breakPointsResolve = resolve;
        });

        this.pdbRunner.PdbLoaded.then(() => {
            this.pdbRunner.SetBreakPoints(args).then(() => {
                this.sendResponse(response);

                if (this.breakPointsResolve) {
                    this.breakPointsResolve();
                    this.breakPointsResolve = null;
                }
            }, (errors: string[]) => {
                this.sendErrorResponse(response, 2000, "Setting break points failed\n", errors.join());
            });
        });
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        // return the default thread
        response.body = {
            threads: [
                new Thread(PythonDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        if (!this.pdbRunner || !this.pdbRunner.ReadyToAcceptCommands) {
            return
        }

        this.pdbRunner.GetStackTrace().then(stackTrace=> {
            const frames = new Array<StackFrame>();
            stackTrace.forEach((stackInfo, i) => {
                var name = stackInfo.function;
                frames.push(new StackFrame(i, `${name}(${i})`,
                    new Source(basename(stackInfo.fileName), this.convertDebuggerPathToClient(stackInfo.fileName)),
                    this.convertDebuggerLineToClient(stackInfo.lineNumber - 1),
                    0));
            });

            response.body = {
                stackFrames: frames
            };

            this.sendResponse(response);
        });
    }

    private handleExecutionResult(commandName: string, response: DebugProtocol.Response, result: IExecutionResult) {
        result = result || {};
        if (Array.isArray(result.consoleOutput) && result.consoleOutput.length > 0) {
            this.sendEvent(new OutputEvent(result.consoleOutput.join("\n") + "\n"));
        }
        if (Array.isArray(result.errors) && result.errors.length > 0) {
            this.sendErrorResponse(response, 1, result.errors.join("\n"));
            this.sendEvent(new StoppedEvent("exception", PythonDebugSession.THREAD_ID));
            return;
        }
        if (result.completed === true) {
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
            return;
        }

        this.sendResponse(response);
        this.sendEvent(new StoppedEvent(commandName, PythonDebugSession.THREAD_ID));
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse): void {
        this.pdbRunner.StepIn().then(result => {
            this.handleExecutionResult("step", response, result);
        });
    }

    protected stepOutRequest(response: DebugProtocol.StepInResponse): void {
        this.pdbRunner.StepOut().then(result => {
            this.handleExecutionResult("return", response, result);
        });
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.pdbRunner.Continue().then(result => {
            this.handleExecutionResult("continue", response, result);
        });
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.pdbRunner.Next().then(result => {
            this.handleExecutionResult("next", response, result);
        });
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        this.pdbRunner.EvaluateExpression(`${args.expression}`).then(data => {
            response.body = {
                result: data.join(),
                variablesReference: 0
            };
            this.sendResponse(response);
        });
    }


    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();

        var promises = [];
        promises.push(new Promise<any>(resolve=> {
            this.pdbRunner.GetGlobalVariables().then(vars=> {
                if (vars.length === 0) {
                    return resolve();
                }
                var glob: DebugVariable = {
                    addr: 0,
                    cap: 0,
                    children: [],
                    len: 0,
                    name: "",
                    realType: "",
                    scope: ScopeType.global,
                    type: "everyone",
                    unreadable: "",
                    value: "gggg"
                };
                scopes.push(new Scope("Global", this._variableHandles.create(glob)));
                resolve();
            });
        }));

        promises.push(new Promise<any>(resolve=> {
            this.pdbRunner.GetLocalVariables().then(vars=> {
                if (vars.length === 0) {
                    return resolve();
                }
                var locs: DebugVariable = {
                    addr: 0,
                    cap: 0,
                    children: [],
                    len: 0,
                    name: "",
                    realType: "",
                    scope: ScopeType.local,
                    type: "my",
                    unreadable: "",
                    value: "lll"
                };
                scopes.push(new Scope("Local", this._variableHandles.create(locs)));
                resolve();
            });
        }));

        promises.push(new Promise<any>(resolve=> {
            this.pdbRunner.GetArguments().then(vars=> {
                if (vars.length === 0) {
                    return resolve();
                }
                var args: DebugVariable = {
                    addr: 0,
                    cap: 0,
                    children: [],
                    len: 0,
                    name: "argumms",
                    realType: "",
                    scope: ScopeType.args,
                    type: "",
                    unreadable: "",
                    value: "para"
                };
                scopes.push(new Scope("Globals", this._variableHandles.create(args)));
                resolve();
            });
        }));

        Promise.all(promises).then(() => {
            response.body = {
                scopes: scopes
            };
            this.sendResponse(response);
        });
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        if (!this.pdbRunner.ReadyToAcceptCommands) {
            return
        }

        var varDetails = this._variableHandles.get(args.variablesReference);
        var variables = [];
        variables.push({
            name: varDetails.name,
            value: varDetails.value,
            variableReference: 0
        });

        response.body = {
            variables: variables
        };

        this.sendResponse(response);
    }
            
    //Unsupported features
    protected pauseRequest(response: DebugProtocol.PauseResponse): void {
        console.error('Not yet implemented: pauseRequest');
        this.sendErrorResponse(response, 2000, "Pause is not yet supported");
    }

    protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments): void {
        console.error('Not yet implemented: setExceptionBreakPointsRequest');
        this.sendErrorResponse(response, 2000, "ExceptionBreakPointsRequest is not yet supported");
    }

}

DebugSession.run(PythonDebugSession);
