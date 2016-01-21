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
}

export class PdbRunner {
    public pdbLoaded: Promise<any>;
    public readyToAcceptCommands: boolean;

    private pythonProc: child_process.ChildProcess;//pty.Terminal;
    private _sourceFile: string;
    private debugSession: DebugSession;

    public constructor(sourceFile: string, debugSession: DebugSession) {
        this._sourceFile = sourceFile;
        this.debugSession = debugSession;
        this.initProc();
    }

    private sendRemoteConsoleLog(msg) {
        this.debugSession.sendEvent(new OutputEvent(msg));
    }

    private initProc() {
        var fileDir = path.dirname(this._sourceFile);
        this.pythonProc = child_process.spawn("python", ["-u", "-m", "pdb", this._sourceFile], {
            cwd: fileDir
        });
        
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
                pdbCmd.promise.then(resolve);

                if (this.executingCommands.length === 0) {
                    this.executingCommands.push(pdbCmd);
                    this.pythonProc.stdin.write(pdbCmd.commandLine + "\n");
                }
                else {
                    var promises = this.pendingCommands.map(cmd=> cmd.promise);
                    this.pendingCommands.push(pdbCmd);
                    Promise.all(promises).then(() => {
                        this.executingCommands.push(pdbCmd);
                        this.pythonProc.stdin.write(pdbCmd.commandLine + "\n");
                    });
                }
            });
        });
    }

    private outputBuffer: string = "";
    private stringDecoder = new StringDecoder.StringDecoder('utf8');
    private pendingCommands: IPdbRunnerCommand[] = [];
    private executingCommands: IPdbRunnerCommand[] = [];
    private pdbLoadedResolve: () => void;
    private onDataReceived(data) {
        console.log(data + "");

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
            this.pendingCommands.pop();
            this.executingCommands.pop();
            lastCmd.promiseResolve.call(lastCmd.callbackScope, lines);
        }
    }
}
