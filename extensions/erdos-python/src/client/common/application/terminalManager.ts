// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import {
    Disposable,
    Event,
    EventEmitter,
    Terminal,
    TerminalOptions,
    TerminalShellExecutionEndEvent,
    TerminalShellIntegrationChangeEvent,
    window,
} from 'vscode';
import { traceLog } from '../../logging';
import { ITerminalManager } from './types';

@injectable()
export class TerminalManager implements ITerminalManager {
    private readonly didOpenTerminal = new EventEmitter<Terminal>();
    constructor() {
        window.onDidOpenTerminal((terminal) => {
            this.didOpenTerminal.fire(monkeyPatchTerminal(terminal));
        });
    }
    public get onDidCloseTerminal(): Event<Terminal> {
        return window.onDidCloseTerminal;
    }
    public get onDidOpenTerminal(): Event<Terminal> {
        return this.didOpenTerminal.event;
    }
    public createTerminal(options: TerminalOptions): Terminal {
        return monkeyPatchTerminal(window.createTerminal(options));
    }
    public onDidChangeTerminalShellIntegration(handler: (e: TerminalShellIntegrationChangeEvent) => void): Disposable {
        return window.onDidChangeTerminalShellIntegration(handler);
    }
    public onDidEndTerminalShellExecution(handler: (e: TerminalShellExecutionEndEvent) => void): Disposable {
        return window.onDidEndTerminalShellExecution(handler);
    }
}

/**
 * Monkeypatch the terminal to log commands sent.
 */
function monkeyPatchTerminal(terminal: Terminal) {
    if (!(terminal as any).isPatched) {
        const oldSendText = terminal.sendText.bind(terminal);
        terminal.sendText = (text: string, addNewLine: boolean = true) => {
            traceLog(`Send text to terminal: ${text}`);
            return oldSendText(text, addNewLine);
        };
        (terminal as any).isPatched = true;
    }
    return terminal;
}
