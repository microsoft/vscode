'use strict';

import {readFileSync} from 'fs';
import {basename} from 'path';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as StringDecoder from 'string_decoder';

interface IPendingCommand {
    commandLine: string;
    promise: Promise<string[]>;
    resolve: (value: string[]) => void;
}

export interface CommandRunnerConfig {
    LastLineOfProgram: string;
    OnErrorCallback: (value: string[]) => void;
}
export class CommandRunner {
    private loaded: Promise<any>;
    public get Loaded(): Promise<any> {
        return this.loaded;
    }

    private readyToAcceptCommands: boolean;
    public get ReadyToAcceptCommands(): boolean {
        return this.readyToAcceptCommands;
    }

    private Proc: child_process.ChildProcess;

    private commandLine: string;
    private commandArgs: string[];
    private cwd: string;
    private loadedResolve: () => void;
    private runnerArgs: CommandRunnerConfig;

    public constructor(commandLine: string, args: string[], cwd: string, runnerArgs: CommandRunnerConfig) {
        this.runnerArgs = runnerArgs;
        this.commandLine = commandLine;
        this.commandArgs = args;
        this.cwd = cwd;
        this.initProc();
    }

    private sendRemoteConsoleLog(msg) {
        //this.debugSession.sendEvent(new OutputEvent(msg));
    }

    private initProc() {
        //Watch out for pdb successfully loaded
        this.loaded = new Promise<any>((resolve) => {
            this.loadedResolve = resolve;
        }).then(() => {
            this.readyToAcceptCommands = true;
        });

        try {
            this.Proc = child_process.spawn(this.commandLine, this.commandArgs, {
                cwd: this.cwd
            });
        }
        catch (ex) {
            this.sendRemoteConsoleLog(ex.message);
        }

        //read the pdb output
        var that = this;
        this.Proc.stdout.on("data", (data) => {
            that.onDataReceived.call(that, data);
        });
        this.Proc.stdout.on("error", (data) => {
            that.sendRemoteConsoleLog("Pdb Error " + data);
            this.runnerArgs.OnErrorCallback((data + "").split(/(\r?\n)/g));
        });
        this.Proc.stdout.on("exit", (data) => {
            this.runnerArgs.OnErrorCallback((data + "").split(/(\r?\n)/g));
        });
        this.Proc.stdout.on("close", (data) => {
            this.runnerArgs.OnErrorCallback((data + "").split(/(\r?\n)/g));
        });
        this.Proc.stderr.on("data", (data) => {
            this.runnerArgs.OnErrorCallback((data + "").split(/(\r?\n)/g));
        });
    }

    private pendingCommands: IPendingCommand[] = [];
    private executingCommands: IPendingCommand[] = [];

    public sendCommand(command: string): Promise<string[]> {
        return new Promise<string[]>(resolve=> {
            this.loaded.then(() => {
                var cmd: IPendingCommand = { commandLine: command, promise: null, resolve: null };
                cmd.promise = new Promise<string[]>(resolve=> {
                    cmd.resolve = resolve;
                });
                cmd.promise.then((d) => {
                    resolve(d);
                });
                if (this.executingCommands.length > 1) {
                    //This is not possible
                    var y = "";
                }

                this.pendingCommands.push(cmd);
                this.invokeNextCommand();
            });
        });
    }

    private invokeNextCommand() {
        if (this.pendingCommands.length === 0) {
            return;
        }
        if (this.executingCommands.length > 0) {
            //This is not possible
            var y = "";
            return;
        }

        var cmd = this.pendingCommands[0];
        this.executingCommands.push(cmd);
        this.Proc.stdin.write(cmd.commandLine + "\n");
    }

    private outputBuffer: string = "";
    private onDataReceived(data) {
        console.log(data + "");
        if (this.executingCommands.length > 1) {
            //This isn't possible
            var y = "";
        }

        this.outputBuffer = this.outputBuffer + new Buffer(data).toString('utf-8');
        //var lines = this.outputBuffer.split(/(\r?\n)/g).filter(line=> line.length > 0 && line !== os.EOL && line !== "\n" && line !== "\r").map(line=> line.trim());
        var lines = this.outputBuffer.split(/(\r?\n)/g);
        if (lines.length === 0) {
            return;
        }

        var lastLine = lines[lines.length - 1];
        var isEndOfLine = (lastLine.trim() === this.runnerArgs.LastLineOfProgram);

        if (isEndOfLine) {
            this.outputBuffer = "";
        }

        if (this.executingCommands.length === 0 && isEndOfLine && !this.readyToAcceptCommands) {
            this.loadedResolve.call(this);
            return;
        }
        if (this.executingCommands.length === 0) {
            return;
        }

        // var lastCmd = this.executingCommands[this.executingCommands.length - 1];
        // var isPrompt = lastLine === lastCmd.prompt;

        // if (isPrompt) {
        //     this.outputBuffer = "";
        //     this.pythonProc.stdin.write(lastCmd.promptResponse + "\n");
        //     return;
        // }
        if (isEndOfLine) {
            var lastCmd = this.executingCommands[this.executingCommands.length - 1];            
            //Remove (Pdb) prompt
            lines.pop();

            this.pendingCommands.shift();
            this.executingCommands.pop();
            lastCmd.resolve(lines);
            this.invokeNextCommand();
        }
    }
}
