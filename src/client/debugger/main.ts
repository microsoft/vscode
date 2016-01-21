/*---------------------------------------------------------
 ** Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';
import * as path from 'path';
// import * as pty from 'pty.js';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as StringDecoder from 'string_decoder';
import {PdbRunner, IPdbCommand} from './pdb';

const PDB_LABELS_COMMAND = "import json; print(json.dumps({k:v for k,v in locals().items() if type(v) in (int, str, bool, unicode, float)}, skipkeys=True))";

/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
    /** Automatically stop target after launch. If not specified, target does not stop. */
    stopOnEntry?: boolean;
}

interface ICommand {
    name: string;
    prompt?: string
    promptResponse?: string;
    commandLineDetected?: boolean;
    commandLine: string;
    responseProtocol?: DebugProtocol.Response
}

interface IStackInfo {
    fileName: string,
    lineNumber: number,
    function: string
    source: string
}

function ignoreEmpty(line) {
    return line.trim() !== "" && line.trim() !== "(Pdb)" && line.trim() !== "\n" && line.trim() !== "\r" && line.trim() !== "\r\n";
}
function ignorePrefix(line) {
    line = line.trim();
    return line !== "->" && line !== ">" && line;
}
function parseWhere(data: string[]): IStackInfo {
    data = data.filter(ignoreEmpty).filter(ignorePrefix);
    var currentLine = data[data.length - 2];
    var lineParts = currentLine.trim().split(/\s+/);
    var line = lineParts.length === 1 ? lineParts[0] : lineParts[1];
    var parts = line.match(/(.*)\((\d+)\)(.*)/);
    var src = data[data.length - 1].split(/\s+/)[1];
    //var src = lines[1].split(/\s+/)[1];
    var currentStack: IStackInfo = {
        fileName: parts[1],
        lineNumber: parseInt(parts[2], 10),
        function: parts[3],
        source: src
    };
    return currentStack;
}
interface ICommandToExecute {
    name: string
    command?: string
    responseProtocol?: DebugProtocol.Response
}

class MockDebugSession extends DebugSession {

    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    private static THREAD_ID = 1;
    private commands: ICommand[] = [];
    private __currentLine: number;
    private get _currentLine(): number {
        return this.__currentLine;
    }
    private set _currentLine(line: number) {
        this.__currentLine = line;
    }

    private _sourceFile: string;
    //private _sourceLines: string[];
    private _breakPoints: any;
    private _variableHandles: Handles<string>;


    public constructor(debuggerLinesStartAt1: boolean, isServer: boolean) {
        super(debuggerLinesStartAt1, isServer === true);
        this._sourceFile = null;
        //this._sourceLines = [];
        
        this._currentLine = 0;
        this._breakPoints = {};
        this._variableHandles = new Handles<string>();
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.sendResponse(response);

        // now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
        this.sendEvent(new InitializedEvent());
    }

    private pdbRunner: PdbRunner;
    private launchResponse: DebugProtocol.LaunchResponse;
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        this._sourceFile = args.program;
        //this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
        console.log("YAYA");

        if (args.stopOnEntry) {
            this.launchResponse = response;
        } else {
            // we just start to run until we hit a breakpoint or an exception
            this.continueRequest(response, { threadId: MockDebugSession.THREAD_ID });
        }
        var fileDir = path.dirname(this._sourceFile);

        this.pdbRunner = new PdbRunner(this._sourceFile);

        this.pdbRunner.pdbLoaded.then(() => {
            this.sendEvent(new StoppedEvent("entry", MockDebugSession.THREAD_ID));
        });
    }

    private sendCommand(cmd: string, responseProtocol?: DebugProtocol.Response, prompt?: string, promptResponse?: string, commandLine?: string, callbackData?: any): Promise<any> {
        if (!this.pdbRunner.readyToAcceptCommands) {
            return Promise.resolve([]);
        }
        return new Promise<any>((resolve, reject) => {
            var command: ICommand = {
                name: cmd,
                commandLine: commandLine || cmd,
                responseProtocol: responseProtocol,
                promptResponse: promptResponse,
            };
            var that = this;
            var pdbCommand: IPdbCommand = {
                callbackScope: that,
                commandLine: command.commandLine,
                prompt: command.prompt,
                promptResponse: command.promptResponse
            }
            //if there are other commands wait for them to be completed
            this.pdbRunner.sendCmd(pdbCommand).then((data) => {
                onCommandResponse.call(that, data);
            });

            function onCommandResponse(data: string[]) {
                if (command.name === "locals") {
                    var variables = [];
                    try {
                        var variablesAsJson = <Object>JSON.parse(data.join());
                        var variableNames = Object.keys(variablesAsJson);
                        variables = variableNames.map(varName=> {
                            return {
                                name: varName,
                                value: variablesAsJson[varName],
                                variablesReference: 0
                            }
                        });
                    }
                    catch (ex) {
                    }
                    resolve.call(this, { variables: variables, id: callbackData });
                }

                if (command.name === "next" || command.name === "where" || command.name === "step" || command.name === "continue" || command.name === "return") {
                    //Check if this is the end 
                    if (data.length > 0 && (data[0] === "--Return--")) {
                        this.sendResponse(command.responseProtocol);
                        try {
                            var stack = parseWhere(data);
                        }
                        catch (ex) {
                            this.sendEvent(new TerminatedEvent());
                            return resolve.call(this, data);
                        }
                    }
                    if (data.filter(l=> l === "The program finished and will be restarted").length > 0) {
                        this.sendResponse(command.responseProtocol);
                        this.sendEvent(new TerminatedEvent());
                    }
                    else {
                        var stack = parseWhere(data);
                        var ln = this._currentLine = stack.lineNumber - 1;
                        if (command.responseProtocol) {
                            if (command.name === "next" || command.name === "step" || command.name === "continue" || command.name === "return" || command.name === "where") {
                                //Check if there are any errors in the current stack
                                if (data.length > 0 && data[0].indexOf("Error:") > 0) {
                                    var error = data[0];
                                    this.sendErrorResponse(command.responseProtocol, 1, error);
                                    this.sendEvent(new StoppedEvent("exception", MockDebugSession.THREAD_ID));
                                }
                                else {
                                    this.sendResponse(command.responseProtocol);
                                    this.sendEvent(new StoppedEvent(command.name, MockDebugSession.THREAD_ID));
                                }
                            }
                        }
                    }
                }
                resolve.call(this, data);
            }
        });
    }
  
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        this.pdbRunner.pdbLoaded.then(() => {
            var breakpoints = [];
            var that = [];
            new Promise(resolve=> {
                var newPositions = [];
                var counter = 0;
                args.lines.forEach(line=> {
                    this.sendCommand("break", undefined, undefined, undefined, `break ${args.source.path}:${line}`).then(() => {
                        newPositions.push(line);
                        breakpoints.push({ verified: true, line: line });
                        counter = counter + 1;
                        if (counter === args.lines.length){
                            resolve();
                        }
                    });
                })
            }).then(() => {
                // send back the actual breakpoints
                response.body = {
                    breakpoints: breakpoints
                };
                this.sendResponse(response);
            });
        });
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

        // return the default thread
        response.body = {
            threads: [
                new Thread(MockDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    private parseStackTrace(data: string[]): IStackInfo[] {
        var stackInfo: IStackInfo[] = [];
        var linesInPairs: any[] = [];
        while (true) {
            var lineInfo = [];
            lineInfo.push(data.pop());
            lineInfo.push(data.pop());
            lineInfo.reverse();
            try {
                stackInfo.push(parseWhere(lineInfo));
            }
            catch (ex) {
                break;
            }
        }

        return stackInfo;
    }

    private refreshStackInfo: boolean = true;

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        if (!this.pdbRunner.readyToAcceptCommands) {
            return
        }

        this.pdbRunner.pdbLoaded.then(() => {
            this.sendCommand("where").then((data) => {
                this.refreshStackInfo = false;
                const frames = new Array<StackFrame>();

                this.parseStackTrace(data).forEach((stackInfo, i) => {
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
        });
    }

    private variablesRefId: number;
    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();

        this.variablesRefId = this._variableHandles.create("local_" + frameReference);

        scopes.push(new Scope("Local", this.variablesRefId, false));
        //scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
        // scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    private lastRequestedVariableId: string;
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        if (!this.pdbRunner.readyToAcceptCommands) {
            return
        }

        var cmd = this.variablesRefId === args.variablesReference ? "locals" : "locals";
        //this._variableHandles.get(args.variablesReference);
        //var newid = this._variableHandles.get(args.variablesReference);
        this.sendCommand("locals", undefined, undefined, undefined, PDB_LABELS_COMMAND, args.variablesReference).then((resp) => {
            var variables = <any[]>resp.variables;
            response.body = {
                variables: variables
            };
            this.sendResponse(response);
        });
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse): void {
        this.sendCommand("step", response).then(() => {
            this.refreshStackInfo = true;
        });
    }

    protected stepOutRequest(response: DebugProtocol.StepInResponse): void {
        this.sendCommand("return", response).then(() => {
            this.refreshStackInfo = true;
        });
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.sendCommand("continue", response).then(() => {
            this.refreshStackInfo = true;
        });
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.sendCommand("next", response).then(() => {
            this.refreshStackInfo = true;
        });
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        this.sendCommand(`p ${args.expression}`, response).then((data) => {
            response.body = {
                result: (<string[]>data).join(),
                variablesReference: 0
            };
            this.sendResponse(response);
        });
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

DebugSession.run(MockDebugSession);
