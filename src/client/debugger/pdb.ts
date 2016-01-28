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
import * as settings from './../common/configSettings';

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
    promise: Promise<string[]>
    promiseResolve: (data: string[]) => void
    completed: boolean
}

export class PdbRunner {
    public pdbLoaded: Promise<any>;
    public readyToAcceptCommands: boolean;

    private pythonProc: child_process.ChildProcess;//pty.Terminal;
    private _sourceFile: string;
    private debugSession: DebugSession;
    private settings: settings.IPythonSettings;
    private debugArgs: string[];
    private pythonPath: string;
    private stopOnEntry: boolean;
    public constructor(sourceFile: string, debugSession: DebugSession, settings: settings.IPythonSettings, args: string[], pythonPath: string, stopOnEntry?: boolean) {
        this._sourceFile = sourceFile;
        this.debugSession = debugSession;
        this.settings = settings;
        this.debugArgs = args;
        this.pythonPath = pythonPath;
        this.stopOnEntry = stopOnEntry === true;
        this.initProc();
    }

    private sendRemoteConsoleLog(msg) {
        this.debugSession.sendEvent(new OutputEvent(msg));
    }

    private initProc() {
        var fileDir = path.dirname(this._sourceFile);
        try {
            //If there's a space in file path, use double quotes
            var sourceFile = this._sourceFile;
            if (this._sourceFile.indexOf(" ") > 0) {
                sourceFile = `"${sourceFile}"`;
            }

            var procArgs = [];
            // if (this.stopOnEntry) {
            procArgs = ["-u", "-m", "pdb", sourceFile];
            // }
            // else {
            //     procArgs = ["-u", "pdb", sourceFile];
            // }

            procArgs = procArgs.concat(this.debugArgs);
            this.pythonProc = child_process.spawn(this.pythonPath, procArgs, {
                cwd: fileDir
            });
        }
        catch (ex) {
            var y = "";
            this.sendRemoteConsoleLog(ex.message);
        }
        // // pipe the main process input to the child process
        // process.stdin.pipe(this.pythonProc.stdin);
        // this.pythonProc.stdout.pipe(process.stdout);

        //Watch out for pdb successfully loaded
        this.pdbLoaded = new Promise<any>((resolve) => {
            this.pdbLoadedResolve = resolve;
        }).then(() => {
            this.readyToAcceptCommands = true;
        });

        //read the pdb output
        var that = this;
        this.pythonProc.stdout.on("data", (data) => {
            that.onDataReceived(data);
        });
        this.pythonProc.stdout.on("error", (data) => {
            that.sendRemoteConsoleLog("Pdb Error " + data);
        });
        this.pythonProc.stdout.on("exit", (data) => {
            that.sendRemoteConsoleLog("Pdb Exit " + data);
        });
        this.pythonProc.stdout.on("close", (data) => {
            that.sendRemoteConsoleLog("Pdb Closed " + data);
        });
        this.pythonProc.stderr.on("data", (data) => {
            that.sendRemoteConsoleLog("Pdb Error Data" + data);
        });
    }

    public sendCmd(command: IPdbCommand): Promise<string[]> {
        return new Promise<string[]>(resolve=> {
            this.pdbLoaded.then(() => {
                var pdbCmd: IPdbRunnerCommand = <IPdbRunnerCommand>command;
                pdbCmd.promise = new Promise<string[]>(resolve=> {
                    pdbCmd.promiseResolve = resolve;
                });
                pdbCmd.completed = false;
                pdbCmd.promise.then((d) => {
                    pdbCmd.completed = true;
                    resolve(d);
                });
                if (this.executingCommands.length > 1) {
                    var y = "";
                }

                this.pendingCommands.push(pdbCmd);
                this.invokeNextCommand();
            });
        });
    }

    private invokeNextCommand() {
        if (this.pendingCommands.length === 0) {
            return;
        }
        if (this.executingCommands.length > 0) {
            var y = "";
            return;
        }

        var cmd = this.pendingCommands[0];
        this.executingCommands.push(cmd);
        this.pythonProc.stdin.write(cmd.commandLine + "\n");
    }

    private outputBuffer: string = "";
    private stringDecoder = new StringDecoder.StringDecoder('utf8');
    private pendingCommands: IPdbRunnerCommand[] = [];
    private executingCommands: IPdbRunnerCommand[] = [];
    private pdbLoadedResolve: () => void;
    private onDataReceived(data) {
        console.log(data + "");
        if (this.executingCommands.length > 1) {
            var y = "";
        }
        this.outputBuffer = this.outputBuffer + new Buffer(data).toString('utf-8');
        var lines = this.outputBuffer.split(/(\r?\n)/g).filter(line=> line.length > 0 && line !== os.EOL && line !== "\n" && line !== "\r").map(line=> line.trim());
        if (lines.length === 0) {
            return;
        }

        var lastLine = lines[lines.length - 1];
        var isEndOfLine = lastLine === "(Pdb)";

        if (isEndOfLine) {
            this.outputBuffer = "";
        }

        if (this.executingCommands.length === 0 && isEndOfLine && !this.readyToAcceptCommands) {
            this.pdbLoadedResolve.call(this);
            return;
        }
        if (this.executingCommands.length === 0) {
            return;
        }
        var lastCmd = this.executingCommands[this.executingCommands.length - 1];
        var isPrompt = lastLine === lastCmd.prompt;

        if (isPrompt) {
            this.outputBuffer = "";
            this.pythonProc.stdin.write(lastCmd.promptResponse + "\n");
            return;
        }
        if (isEndOfLine) {
            
            //Remove (Pdb) prompt
            lines.pop();
            this.pendingCommands.shift();
            this.executingCommands.pop();
            lastCmd.promiseResolve.call(lastCmd.callbackScope, lines);
            this.invokeNextCommand();
        }
    }
}
