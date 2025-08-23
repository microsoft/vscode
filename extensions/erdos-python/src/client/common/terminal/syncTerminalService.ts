// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject } from 'inversify';
import { CancellationToken, Disposable, Event, TerminalShellExecution } from 'vscode';
import { IInterpreterService } from '../../interpreter/contracts';
import { traceVerbose } from '../../logging';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { Cancellation } from '../cancellation';
import { IFileSystem, TemporaryFile } from '../platform/types';
import * as internalScripts from '../process/internal/scripts';
import { createDeferred, Deferred } from '../utils/async';
import { noop } from '../utils/misc';
import { TerminalService } from './service';
import { ITerminalService } from './types';

enum State {
    notStarted = 0,
    started = 1,
    completed = 2,
    errored = 4,
}

class ExecutionState implements Disposable {
    public state: State = State.notStarted;
    private _completed: Deferred<void> = createDeferred();
    private disposable?: Disposable;
    constructor(
        public readonly lockFile: string,
        private readonly fs: IFileSystem,
        private readonly command: string[],
    ) {
        this.registerStateUpdate();
        this._completed.promise.finally(() => this.dispose()).ignoreErrors();
    }
    public get completed(): Promise<void> {
        return this._completed.promise;
    }
    public dispose() {
        if (this.disposable) {
            this.disposable.dispose();
            this.disposable = undefined;
        }
    }
    private registerStateUpdate() {
        const timeout = setInterval(async () => {
            const state = await this.getLockFileState(this.lockFile);
            if (state !== this.state) {
                traceVerbose(`Command state changed to ${state}. ${this.command.join(' ')}`);
            }
            this.state = state;
            if (state & State.errored) {
                const errorContents = await this.fs.readFile(`${this.lockFile}.error`).catch(() => '');
                this._completed.reject(
                    new Error(
                        `Command failed with errors, check the terminal for details. Command: ${this.command.join(
                            ' ',
                        )}\n${errorContents}`,
                    ),
                );
            } else if (state & State.completed) {
                this._completed.resolve();
            }
        }, 100);

        this.disposable = {
            dispose: () => clearInterval(timeout as any),
        };
    }
    private async getLockFileState(file: string): Promise<State> {
        const source = await this.fs.readFile(file);
        let state: State = State.notStarted;
        if (source.includes('START')) {
            state |= State.started;
        }
        if (source.includes('END')) {
            state |= State.completed;
        }
        if (source.includes('FAIL')) {
            state |= State.completed | State.errored;
        }
        return state;
    }
}

/**
 * This is a decorator class that ensures commands send to a terminal are completed and then execution is returned back to calling code.
 * The tecnique used is simple:
 * - Instead of sending actual text to a terminal,
 * - Send text to a terminal that executes our python file, passing in the original text as args
 * - The pthon file will execute the commands as a subprocess
 * - At the end of the execution a file is created to singal completion.
 */
export class SynchronousTerminalService implements ITerminalService, Disposable {
    private readonly disposables: Disposable[] = [];
    public get onDidCloseTerminal(): Event<void> {
        return this.terminalService.onDidCloseTerminal;
    }
    constructor(
        @inject(IFileSystem) private readonly fs: IFileSystem,
        @inject(IInterpreterService) private readonly interpreter: IInterpreterService,
        public readonly terminalService: TerminalService,
        private readonly pythonInterpreter?: PythonEnvironment,
    ) {}
    public dispose() {
        this.terminalService.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.shift();
            if (disposable) {
                try {
                    disposable.dispose();
                } catch {
                    noop();
                }
            } else {
                break;
            }
        }
    }
    public async sendCommand(
        command: string,
        args: string[],
        cancel?: CancellationToken,
        swallowExceptions: boolean = true,
    ): Promise<void> {
        if (!cancel) {
            return this.terminalService.sendCommand(command, args);
        }
        const lockFile = await this.createLockFile();
        const state = new ExecutionState(lockFile.filePath, this.fs, [command, ...args]);
        try {
            const pythonExec = this.pythonInterpreter || (await this.interpreter.getActiveInterpreter(undefined));
            const sendArgs = internalScripts.shell_exec(command, lockFile.filePath, args);
            await this.terminalService.sendCommand(pythonExec?.path || 'python', sendArgs);
            const promise = swallowExceptions ? state.completed : state.completed.catch(noop);
            await Cancellation.race(() => promise, cancel);
        } finally {
            state.dispose();
            lockFile.dispose();
        }
    }
    /** @deprecated */
    public sendText(text: string): Promise<void> {
        return this.terminalService.sendText(text);
    }
    public executeCommand(commandLine: string, isPythonShell: boolean): Promise<TerminalShellExecution | undefined> {
        return this.terminalService.executeCommand(commandLine, isPythonShell);
    }
    public show(preserveFocus?: boolean | undefined): Promise<void> {
        return this.terminalService.show(preserveFocus);
    }

    private createLockFile(): Promise<TemporaryFile> {
        return this.fs.createTemporaryFile('.log').then((l) => {
            this.disposables.push(l);
            return l;
        });
    }
}
