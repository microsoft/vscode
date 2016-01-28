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
import {PdbRunner, IPdbCommand} from './pdb';

const PDB_LOCALS_COMMAND = "import json; print(json.dumps({k:v for k,v in locals().items() if type(v) in (int, str, bool, unicode, float)}, skipkeys=True))";
const PDB_ARGS_COMMAND = "args";
const PDB_GLOBALS_COMMAND = "import json; print(json.dumps({k:v for k,v in globals().items() if type(v) in (int, str, bool, unicode, float)}, skipkeys=True))";
const PDB_PRINT_OBJECT_COMMAND = "import json; json.dumps(VARNAME, default=lambda o:o.__dict__, sort_keys=True)"

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

interface ICommand {
    name: string;
    prompt?: string
    promptResponse?: string;
    commandLineDetected?: boolean;
    commandLine: string;
    responseProtocol?: DebugProtocol.Response;
}

interface IStackInfo {
    fileName: string;
    lineNumber: number;
    function: string;
    source: string;
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
interface IBreakpoint {
    line: number
    fileName: string
}

interface DebugVariable {
    name: string;
    addr: number;
    type: string;
    realType: string;
    //kind: GoReflectKind;
    value: string;
    len: number;
    cap: number;
    children: DebugVariable[];
    unreadable: string;
}
class PythonDebugSession extends DebugSession {

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
 
        if (args.stopOnEntry) {
            this.launchResponse = response;
        } else {
            this.launchResponse = response;
            // we just start to run until we hit a breakpoint or an exception
            // this.continueRequest(response, { threadId: PythonDebugSession.THREAD_ID });
        }
        var fileDir = path.dirname(this._sourceFile);

        var pythonPath = "python";
        if (typeof args.pythonPath === "string" && args.pythonPath.trim().length > 0) {
            pythonPath = args.pythonPath;
        }
        var programArgs = Array.isArray(args.args) ? args.args : [];

        this.pdbRunner = new PdbRunner(this._sourceFile, this, null, programArgs, pythonPath, args.stopOnEntry);

        this.pdbRunner.pdbLoaded.then(() => {
            this.sendResponse(this.launchResponse);
            this.sendEvent(new StoppedEvent("entry", PythonDebugSession.THREAD_ID));
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

            function extractConsoleOutput(data: string[], command: string): string[] {
                if (command !== "next" && command !== "step" && command !== "continue" && command !== "return") {
                    return [];
                }
                var reversedLines = [].concat(data).reverse();
                var outputLines = [];
                for (var counter = 0; counter < data.length; counter++) {
                    var line = data[counter].trim();
                    if (line === "(pdb)" || line.indexOf("->") === 0 || line.indexOf(">") === 0) {
                        break;
                    }
                    if (line.indexOf("Error:") > 0 || line === "--Return--" || line === "--Call--") {
                        break;
                    }
                    if (line === "The program finished and will be restarted") {
                        break;
                    }
                    outputLines.push(data[counter]);
                }

                return outputLines;
            }

            function onCommandResponse(data: string[]) {
                if (command.name === "listLocalGlobalList") {
                    var line = data[0].substring("set([".length);
                    var varNames = line.substring(0, line.length - 2).replace(/'/g, "").split(",").map(item=> item.trim());
                    return resolve.call(that, varNames);
                }
                if (command.name === "locals" || command.name === "globals") {
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
                    return resolve.call(that, { variables: variables, id: callbackData });
                }
                if (command.name === "args") {
                    var variables = [];
                    try {
                        variables = data.map(v=> {
                            var startOfEquals = v.indexOf("=");

                            return {
                                name: v.substring(0, startOfEquals),
                                value: v.substring(startOfEquals + 1),
                                variablesReference: 0
                            }
                        });
                    }
                    catch (ex) {
                    }
                    return resolve.call(that, { variables: variables, id: callbackData });
                }

                if (command.name === "next" || command.name === "where" || command.name === "step" || command.name === "continue" || command.name === "return") {
                    //Extract any output that may have been sent by the program to the console window
                    var consoleOutput = extractConsoleOutput(data, command.name);
                    if (consoleOutput.length > 0) {
                        that.sendEvent(new OutputEvent(consoleOutput.join("\n") + "\n"));
                    }
                    
                    //Check if this is the end 
                    if (data.length > 0 && (data[0] === "--Return--")) {
                        that.sendResponse(command.responseProtocol);
                        try {
                            var stack = parseWhere(data);
                        }
                        catch (ex) {
                            that.sendEvent(new TerminatedEvent());
                            return resolve.call(that, data);
                        }
                    }
                    if (data.filter(l=> l === "The program finished and will be restarted").length > 0) {
                        that.sendResponse(command.responseProtocol);
                        that.sendEvent(new TerminatedEvent());
                    }
                    else {
                        var stack = parseWhere(data);
                        var ln = that._currentLine = stack.lineNumber - 1;
                        if (command.responseProtocol) {
                            if (command.name === "next" || command.name === "step" || command.name === "continue" || command.name === "return" || command.name === "where") {
                                //Check if there are any errors in the current stack
                                if (data.length > 0 && data[0].indexOf("Error:") > 0) {
                                    var error = data[0];
                                    that.sendErrorResponse(command.responseProtocol, 1, error);
                                    that.sendEvent(new StoppedEvent("exception", PythonDebugSession.THREAD_ID));
                                }
                                else {
                                    that.sendResponse(command.responseProtocol);
                                    that.sendEvent(new StoppedEvent(command.name, PythonDebugSession.THREAD_ID));
                                }
                            }
                        }
                    }
                }

                resolve.call(that, data);
            }
        });
    }

    private registeredBreakPoints: IBreakpoint[] = [];
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        this.pdbRunner.pdbLoaded.then(() => {
            var breakpoints = [];
            var that = [];
            var errorMessages: string[] = [];
            var successfullyAddedRemoved = false;
            new Promise(resolve=> {
                var linesInThisFile = this.registeredBreakPoints.filter(b=> b.fileName === args.source.path).map(l=> l.line);
                var linesToAdd = args.lines.filter(line=> linesInThisFile.indexOf(line) === -1);
                var linesToRemove = linesInThisFile.filter(line=> args.lines.indexOf(line) === -1);
                var promises = [];
                linesToAdd.forEach(line=> {
                    var prom = this.sendCommand("break", undefined, undefined, undefined, `break ${args.source.path}:${line}`).then((resp) => {
                        var respMsg = <string>resp[0];
                        if (respMsg.indexOf("**") === 0) {
                            //this.sendErrorResponse(response, 2000, respMsg);
                            errorMessages.push(respMsg);
                            breakpoints.push({ verified: false, line: line });
                            //return;
                        }
                        else {
                            breakpoints.push({ verified: true, line: line });
                            successfullyAddedRemoved = true;
                            this.registeredBreakPoints.push({
                                line: line,
                                fileName: args.source.path
                            })
                        }
                        // if (counter === args.lines.length) {
                        //     resolve();
                        // }
                    });

                    promises.push(prom);
                });

                linesToRemove.forEach(line=> {
                    var prom = this.sendCommand("clear", undefined, undefined, undefined, `clear ${args.source.path}:${line}`).then((resp) => {
                        successfullyAddedRemoved = true;
                        var itemToRemove = this.registeredBreakPoints.filter(b=> b.fileName === args.source.path && b.line === line)[0];
                        var indexToRemove = this.registeredBreakPoints.indexOf(itemToRemove);
                        this.registeredBreakPoints.splice(indexToRemove, 1);
                    });

                    promises.push(prom);
                });

                Promise.all(promises).then(() => {
                    resolve();
                });
            }).then(() => { 
                
                //Ok now get the list of items that need to be removed
                
                // send back the actual breakpoints
                response.body = {
                    breakpoints: breakpoints
                };

                if (successfullyAddedRemoved) {
                    this.sendResponse(response);
                }
                else {
                    this.sendErrorResponse(response, 2000, errorMessages.join());
                }
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
    private argumentsRefId: number;
    private globalsRefId: number;
    private variableCommandDefs: any = {};
    private _variableHandles: Handles<string>;

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();

        this.variablesRefId = this._variableHandles.create("local_" + frameReference);
        this.argumentsRefId = this._variableHandles.create("args_" + frameReference);
        this.globalsRefId = this._variableHandles.create("glob_" + frameReference);

        scopes.push(new Scope("Local", this.variablesRefId, false));
        scopes.push(new Scope("Arguments", this.argumentsRefId, false));
        scopes.push(new Scope("Globals", this.globalsRefId, false));

        this.variableCommandDefs[this.variablesRefId] = { "cmd": "locals", "commandLine": PDB_LOCALS_COMMAND, "listCmd": "print({k for k,v in locals().items()})" };
        this.variableCommandDefs[this.argumentsRefId] = { "cmd": "args", "commandLine": PDB_ARGS_COMMAND, "listCmd": "" };
        this.variableCommandDefs[this.globalsRefId] = { "cmd": "globals", "commandLine": PDB_GLOBALS_COMMAND, "listCmd": "print({k for k,v in globals().items()})" };

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        if (!this.pdbRunner.readyToAcceptCommands) {
            return
        }

        var cmdDetails = this.variableCommandDefs[args.variablesReference];

        this.sendCommand(cmdDetails.cmd, undefined, undefined, undefined, cmdDetails.commandLine, args.variablesReference).then((resp) => {
            var variables = <any[]>resp.variables;
            
            //Ensure all variables are strings
            //Displaying objects isn't supported (unfortunately)
            var variableNames = [];
            variables.forEach(v=> {
                v.value = v.value + "";
                variableNames.push(v.name);
            })

            response.body = {
                variables: variables
            };
             
            //             //Now some complex variables will be ignored, lets get those as well
            //             if (cmdDetails.listCmd.length > 0) {
            //                 this.sendCommand("listLocalGlobalList", undefined, undefined, undefined, cmdDetails.listCmd).then((resp) => {
            //                     //Now find missing items
            //                     var missingItems = (<string[]>resp).filter(vName=> variableNames.indexOf(vName) === -1);
            // 
            //                     var promises = [];
            //                     missingItems.forEach(vName=> {
            //                         var statement = "p " + vName;
            //                         statement = PDB_PRINT_OBJECT_COMMAND.replace("VARNAME", vName);
            //                         var p = new Promise<any>((resolve) => {
            //                             this.sendCommand("Print Value", undefined, undefined, undefined, statement).then((resp) => {
            //                                 try {
            //                                     var varJson = (<string[]>resp).join();
            //                                     varJson = varJson.substring(1, varJson.length - 1);
            //                                     var varObj = JSON.parse(varJson);
            //                                     if (typeof varObj === "object" && varObj !== null && Object.keys(varObj).length > 0) {
            //                                         response.body.variables.push({
            //                                             name: vName,
            //                                             value: varObj,
            //                                             variablesReference: 0
            //                                         });
            //                                     }
            //                                 }
            //                                 catch (ex) {
            // 
            //                                 }
            //                                 resolve();
            //                             });
            //                         });
            // 
            //                         promises.push(p);
            //                     });
            // 
            //                     Promise.all(promises).then(() => {
            //                         this.sendResponse(response);
            //                     });
            //                 });
            // 
            //             }
            //             else {
            this.sendResponse(response);
            // }
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

DebugSession.run(PythonDebugSession);
