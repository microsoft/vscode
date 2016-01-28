/*---------------------------------------------------------
 ** Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import {readFileSync} from 'fs';
import {basename} from 'path';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as StringDecoder from 'string_decoder';
import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles} from 'vscode-debugadapter';
import * as cmdRunner from './commandRunner';
import {DebugVariable, IBreakpoint, IStackInfo, IExecutionResult} from './common';
import {DebugProtocol} from 'vscode-debugprotocol';

const PDB_LOCALS_COMMAND = "import json; print(json.dumps({k:v for k,v in locals().items() if type(v) in (int, str, bool, unicode, float)}, skipkeys=True))";
const PDB_ARGS_COMMAND = "args";
const PDB_GLOBALS_COMMAND = "import json; print(json.dumps({k:v for k,v in globals().items() if type(v) in (int, str, bool, unicode, float)}, skipkeys=True))";
const PDB_PRINT_OBJECT_COMMAND = "import json; json.dumps(VARNAME, default=lambda o:o.__dict__, sort_keys=True)"

function ignoreEmpty(line) {
    return line.trim() !== "" && line.trim() !== "(Pdb)" && line.trim() !== "\n" && line.trim() !== "\r" && line.trim() !== "\r\n";
}
function ignorePrefix(line) {
    line = line.trim();
    return line !== "->" && line !== ">" && line;
}

export interface IPdbCommand {
    commandLine: string
    prompt?: string
    promptResponse?: string
    callbackScope: any
}
interface IPdbRunnerCommand extends IPdbCommand {
    promise: Promise<string[]>;
    promiseResolve: (data: string[]) => void;
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

function parseStackTrace(data: string[]): IStackInfo[] {
    data = data.filter(ignoreEmpty).filter(ignorePrefix);
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
function extractConsoleOutput(command: string, data: string[]): string[] {
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
 
    //Remove all linefeeds 
    outputLines = outputLines.filter(line=> {
        return line !== "\r" && line !== "\r\n" && line !== "\n";
    });

    return outputLines;
}

function parseExecution(commandName: string, data: string[]): IExecutionResult {
    var executionResult: IExecutionResult = {}

    //Extract any output that may have been sent by the program to the console window
    executionResult.consoleOutput = extractConsoleOutput(commandName, data);

    if (data.filter(l=> l === "The program finished and will be restarted").length > 0) {
        executionResult.completed = true;
        return executionResult;
    }

    executionResult.currentStack = parseWhere(data);
    if (commandName === "next" || commandName === "step" || commandName === "continue" || commandName === "return") {
        //Check if there are any errors in the current stack
        if (data.length > 0 && data[0].indexOf("Error:") > 0) {
            executionResult.errors = [data[0]];
        }
    }

    return executionResult;
}

export class PdbRunner {
    private commandRunner: cmdRunner.CommandRunner;

    public get PdbLoaded(): Promise<any> {
        return this.commandRunner.Loaded;
    }

    public get ReadyToAcceptCommands(): boolean {
        return this.commandRunner.ReadyToAcceptCommands;
    }

    private _sourceFile: string;
    private debugSession: DebugSession;
    private debugArgs: string[];
    private pythonPath: string;
    private stopOnEntry: boolean;

    public constructor(sourceFile: string, debugSession: DebugSession, args: string[], pythonPath: string, stopOnEntry?: boolean) {
        this._sourceFile = sourceFile;
        this.debugSession = debugSession;
        this.debugArgs = args;
        this.pythonPath = pythonPath;
        this.stopOnEntry = stopOnEntry === true;
        this.initProc();
    }

    private sendRemoteConsoleLog(msg) {
        this.debugSession.sendEvent(new OutputEvent(msg));
    }

    private initProc() {
        try {
            var fileDir = path.dirname(this._sourceFile);
            var args = ["-u", "-m", "pdb", this._sourceFile];
            args = args.concat(this.debugArgs);
            var runnerConfig: cmdRunner.CommandRunnerConfig = { LastLineOfProgram: "(Pdb)", OnErrorCallback: this.onError };
            this.commandRunner = new cmdRunner.CommandRunner(this.pythonPath, args, fileDir, runnerConfig);
        }
        catch (ex) {
            var y = "";
            this.sendRemoteConsoleLog(ex.message);
        }
    }

    private onError(data: string[]) {
        var y = "";
    }

    public GetStackTrace(): Promise<IStackInfo[]> {
        return new Promise<IStackInfo[]>(resolve=> {
            this.commandRunner.sendCommand("where").then(data=> {
                var stackInfo = parseStackTrace(data);
                resolve(stackInfo);
            });
        });
    }

    private invokeSimpleCommand(commandName): Promise<IExecutionResult> {
        return new Promise<IExecutionResult>(resolve=> {
            this.commandRunner.sendCommand(commandName).then(data=> {
                resolve(parseExecution(commandName, data));
            });
        });

    }

    public StepIn(): Promise<IExecutionResult> {
        return this.invokeSimpleCommand("step");
    }

    public StepOut(): Promise<IExecutionResult> {
        return this.invokeSimpleCommand("return");
    }

    public Continue(): Promise<IExecutionResult> {
        return this.invokeSimpleCommand("continue");
    }

    public Next(): Promise<IExecutionResult> {
        return this.invokeSimpleCommand("next");
    }

    public GetLocalVariables(): Promise<DebugVariable[]> {
        return new Promise<DebugVariable[]>(resolve=> {
            this.commandRunner.sendCommand(PDB_LOCALS_COMMAND).then(data=> {
                var variables: DebugVariable[] = [];
                try {
                    data = data.filter(ignoreEmpty);
                    var variablesAsJson = <Object>JSON.parse(data.join());
                    var variableNames = Object.keys(variablesAsJson);
                    variables = variableNames.map(varName=> {
                        return <DebugVariable>{
                            addr: 0,
                            cap: 0,
                            children: [],
                            len: 0,
                            realType: "",
                            type: "",
                            unreadable: "",
                            name: varName,
                            value: (variablesAsJson[varName] + "")
                        };
                    });
                }
                catch (ex) {
                    var x = "";
                }

                resolve(variables);
            });
        });
    }

    public GetGlobalVariables(): Promise<DebugVariable[]> {
        return new Promise<DebugVariable[]>(resolve=> {
            this.commandRunner.sendCommand(PDB_GLOBALS_COMMAND).then(data=> {
                var variables: DebugVariable[] = [];
                try {
                    data = data.filter(ignoreEmpty);
                    var variablesAsJson = <Object>JSON.parse(data.join());
                    var variableNames = Object.keys(variablesAsJson);
                    variables = variableNames.map(varName=> {
                        return <DebugVariable>{
                            addr: 0,
                            cap: 0,
                            children: [],
                            len: 0,
                            realType: "",
                            type: "",
                            unreadable: "",
                            name: varName,
                            value: (variablesAsJson[varName] + "")
                        };
                    });
                }
                catch (ex) {
                    var x = "";
                }

                resolve(variables);
            });
        });
    }

    public GetArguments(): Promise<DebugVariable[]> {
        return new Promise<DebugVariable[]>(resolve=> {
            this.commandRunner.sendCommand("args").then(data=> {
                var variables: DebugVariable[] = [];
                try {
                    data = data.filter(ignoreEmpty);
                    variables = data.map(varLine=> {
                        var startOfEquals = varLine.indexOf("=");
                        var varName = varLine.substring(0, startOfEquals);

                        return <DebugVariable>{
                            addr: 0,
                            cap: 0,
                            children: [],
                            len: 0,
                            realType: "",
                            type: "",
                            unreadable: "",
                            name: varName,
                            value: varLine.substring(startOfEquals + 1)
                        };
                    });
                }
                catch (ex) {
                    var x = "";
                }

                resolve(variables);
            });
        });
    }

    public EvaluateExpression(expression: string): Promise<string[]> {
        return new Promise<string[]>(resolve=> {
            this.commandRunner.sendCommand(`p ${expression}`).then(data=> {
                //Ignore the last line feed 
                var lastElement = data.length > 1 ? data[data.length - 1] : "";
                if (lastElement === "\r" || lastElement === "\r\n" || lastElement === "\n") {
                    data.pop();
                }

                resolve(data);
            });
        });
    }

    private registeredBreakPoints: IBreakpoint[] = [];

    public SetBreakPoints(args: DebugProtocol.SetBreakpointsArguments): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            var breakpoints = [];
            var that = [];
            var errorMessages: string[] = [];
            var successfullyAddedRemoved = false;
            var linesInThisFile = this.registeredBreakPoints.filter(b=> b.fileName === args.source.path).map(l=> l.line);
            var linesToAdd = args.lines.filter(line=> linesInThisFile.indexOf(line) === -1);
            var linesToRemove = linesInThisFile.filter(line=> args.lines.indexOf(line) === -1);
            var promises = [];

            //Add break points
            linesToAdd.forEach(line=> {
                var prom = this.commandRunner.sendCommand(`break ${args.source.path}:${line}`).then(resp => {
                    var respMsg = <string>resp[0];
                    if (respMsg.indexOf("**") === 0) {
                        errorMessages.push(respMsg);
                        breakpoints.push({ verified: false, line: line });
                    }
                    else {
                        breakpoints.push({ verified: true, line: line });
                        successfullyAddedRemoved = true;
                        this.registeredBreakPoints.push({
                            line: line,
                            fileName: args.source.path
                        })
                    }
                });

                promises.push(prom);
            });

            //Remove break points
            linesToRemove.forEach(line=> {
                var prom = this.commandRunner.sendCommand(`clear ${args.source.path}:${line}`).then((resp) => {
                    successfullyAddedRemoved = true;
                    var itemToRemove = this.registeredBreakPoints.filter(b=> b.fileName === args.source.path && b.line === line)[0];
                    var indexToRemove = this.registeredBreakPoints.indexOf(itemToRemove);
                    this.registeredBreakPoints.splice(indexToRemove, 1);
                });

                promises.push(prom);
            });

            Promise.all(promises).then(() => {
                if (errorMessages.length === 0) {
                    resolve();
                }
                else {
                    reject(errorMessages);
                }
            });
        });
    }
}
