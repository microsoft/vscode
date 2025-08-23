// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as fs from '../../client/common/platform/fs-paths';
import * as path from 'path';
import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { EXTENSION_ROOT_DIR } from '../../client/common/constants';
import { sleep } from '../../client/common/utils/async';
import { getDebugpyLauncherArgs } from '../../client/debugger/extension/adapter/remoteLaunchers';
import { PythonFixture } from '../fixtures';
import { Proc, ProcOutput, ProcResult } from '../proc';

const launchJSON = path.join(EXTENSION_ROOT_DIR, 'src', 'test', '.vscode', 'launch.json');

export function getConfig(name: string): vscode.DebugConfiguration {
    const configs = fs.readJSONSync(launchJSON);
    for (const config of configs.configurations) {
        if (config.name === name) {
            return config;
        }
    }
    throw Error(`debug config "${name}" not found`);
}

type DAPSource = 'vscode' | 'debugpy';
type DAPHandler = (src: DAPSource, msg: DebugProtocol.ProtocolMessage) => void;

type TrackedDebugger = {
    id: number;
    output: ProcOutput;
    dapHandler?: DAPHandler;
    session?: vscode.DebugSession;
    exitCode?: number;
};

class DebugAdapterTracker {
    constructor(
        // This contains all the state.
        private readonly tracked: TrackedDebugger,
    ) {}

    // debugpy -> VS Code

    public onDidSendMessage(message: any): void {
        this.onDAPMessage('debugpy', message as DebugProtocol.ProtocolMessage);
    }

    // VS Code -> debugpy

    public onWillReceiveMessage(message: any): void {
        this.onDAPMessage('vscode', message as DebugProtocol.ProtocolMessage);
    }

    public onExit(code: number | undefined, signal: string | undefined): void {
        if (code) {
            this.tracked.exitCode = code;
        } else if (signal) {
            this.tracked.exitCode = 1;
        } else {
            this.tracked.exitCode = 0;
        }
    }

    // The following vscode.DebugAdapterTracker methods are not implemented:
    //
    //  * onWillStartSession(): void;
    //  * onWillStopSession(): void;
    //  * onError(error: Error): void;

    private onDAPMessage(src: DAPSource, msg: DebugProtocol.ProtocolMessage) {
        // Unomment this to see the DAP messages sent between VS Code and debugpy:
        //console.log(`| DAP (${src === 'vscode' ? 'VS Code -> debugpy' : 'debugpy -> VS Code'})\n`, msg, '\n| DAP');

        // See: https://microsoft.github.io/debug-adapter-protocol/specification
        if (this.tracked.dapHandler) {
            this.tracked.dapHandler(src, msg);
        }
        if (msg.type === 'event') {
            const event = ((msg as unknown) as DebugProtocol.Event).event;
            if (event === 'output') {
                this.onOutputEvent((msg as unknown) as DebugProtocol.OutputEvent);
            }
        }
    }

    private onOutputEvent(msg: DebugProtocol.OutputEvent) {
        if (msg.body.category === undefined) {
            msg.body.category = 'stdout';
        }
        const data = Buffer.from(msg.body.output, 'utf-8');
        if (msg.body.category === 'stdout') {
            this.tracked.output.addStdout(data);
        } else if (msg.body.category === 'stderr') {
            this.tracked.output.addStderr(data);
        } else {
            // Ignore it.
        }
    }
}

class Debuggers {
    private nextID = 0;
    private tracked: { [id: number]: TrackedDebugger } = {};
    private results: { [id: number]: ProcResult } = {};

    public track(config: vscode.DebugConfiguration, output?: ProcOutput): number {
        if (this.nextID === 0) {
            vscode.debug.registerDebugAdapterTrackerFactory('python', this);
        }
        if (output === undefined) {
            output = new ProcOutput();
        }
        this.nextID += 1;
        const id = this.nextID;
        this.tracked[id] = { id, output };
        config._test_session_id = id;
        return id;
    }

    public setDAPHandler(id: number, handler: DAPHandler) {
        const tracked = this.tracked[id];
        if (tracked !== undefined) {
            tracked.dapHandler = handler;
        }
    }

    public getSession(id: number): vscode.DebugSession | undefined {
        const tracked = this.tracked[id];
        if (tracked === undefined) {
            return undefined;
        } else {
            return tracked.session;
        }
    }

    public async waitUntilDone(id: number): Promise<ProcResult> {
        const cachedResult = this.results[id];
        if (cachedResult !== undefined) {
            return cachedResult;
        }
        const tracked = this.tracked[id];
        if (tracked === undefined) {
            throw Error(`untracked debugger ${id}`);
        } else {
            while (tracked.exitCode === undefined) {
                await sleep(10); // milliseconds
            }
            const result = {
                exitCode: tracked.exitCode,
                stdout: tracked.output.stdout,
            };
            this.results[id] = result;
            return result;
        }
    }

    // This is for DebugAdapterTrackerFactory:
    public createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        const id = session.configuration._test_session_id;
        const tracked = this.tracked[id];
        if (tracked !== undefined) {
            tracked.session = session;
            return new DebugAdapterTracker(tracked);
        } else if (id !== undefined) {
            // This should not have happened, but we don't worry about
            // it for now.
        }
        return undefined;
    }
}
const debuggers = new Debuggers();

class DebuggerSession {
    private started: boolean = false;
    private raw: vscode.DebugSession | undefined;
    private stopped: { breakpoint: boolean; threadId: number } | undefined;
    constructor(
        public readonly id: number,
        public readonly config: vscode.DebugConfiguration,
        private readonly wsRoot?: vscode.WorkspaceFolder,
        private readonly proc?: Proc,
    ) {}

    public async start() {
        if (this.started) {
            throw Error('already started');
        }
        this.started = true;

        // Un-comment this to see the debug config used in this session:
        //console.log('|', session.config, '|');
        const started = await vscode.debug.startDebugging(this.wsRoot, this.config);
        expect(started).to.be.equal(true, 'Debugger did not sart');
        this.raw = debuggers.getSession(this.id);
        expect(this.raw).to.not.equal(undefined, 'session not set');
    }

    public async waitUntilDone(): Promise<ProcResult> {
        if (this.proc) {
            return this.proc.waitUntilDone();
        } else {
            return debuggers.waitUntilDone(this.id);
        }
    }

    public addBreakpoint(filename: string, line: number, ch?: number): vscode.Breakpoint {
        // The arguments are 1-indexed.
        const loc = new vscode.Location(
            vscode.Uri.file(filename),
            // VS Code wants 0-indexed line and column numbers.
            // We default to the beginning of the line.
            new vscode.Position(line - 1, ch ? ch - 1 : 0),
        );
        const bp = new vscode.SourceBreakpoint(loc);
        vscode.debug.addBreakpoints([bp]);
        return bp;
    }

    public async waitForBreakpoint(bp: vscode.Breakpoint, opts: { clear: boolean } = { clear: true }) {
        while (!this.stopped || !this.stopped.breakpoint) {
            await sleep(10); // milliseconds
        }
        if (opts.clear) {
            vscode.debug.removeBreakpoints([bp]);
            await this.raw!.customRequest('continue', { threadId: this.stopped.threadId });
            this.stopped = undefined;
        }
    }

    public handleDAPMessage(_src: DAPSource, baseMsg: DebugProtocol.ProtocolMessage) {
        if (baseMsg.type === 'event') {
            const event = ((baseMsg as unknown) as DebugProtocol.Event).event;
            if (event === 'stopped') {
                const msg = (baseMsg as unknown) as DebugProtocol.StoppedEvent;
                this.stopped = {
                    breakpoint: msg.body.reason === 'breakpoint',
                    threadId: (msg.body.threadId as unknown) as number,
                };
            } else {
                // For now there aren't any other events we care about.
            }
        } else if (baseMsg.type === 'request') {
            // For now there aren't any requests we care about.
        } else if (baseMsg.type === 'response') {
            // For now there aren't any responses we care about.
        } else {
            // This shouldn't happen but for now we don't worry about it.
        }
    }

    // The old debug adapter tests used
    // 'vscode-debugadapter-testsupport'.DebugClient to interact with
    // the debugger.  This is helpful info when we are considering
    // additional debugger-related tests.  Here are the methods/props
    // the old tests used:
    //
    // * defaultTimeout
    // * start()
    // * stop()
    // * initializeRequest()
    // * configurationSequence()
    // * launch()
    // * attachRequest()
    // * waitForEvent()
    // * assertOutput()
    // * threadsRequest()
    // * continueRequest()
    // * scopesRequest()
    // * variablesRequest()
    // * setBreakpointsRequest()
    // * setExceptionBreakpointsRequest()
    // * assertStoppedLocation()
}

export class DebuggerFixture extends PythonFixture {
    public async resolveDebugger(
        configName: string,
        file: string,
        scriptArgs: string[],
        wsRoot?: vscode.WorkspaceFolder,
    ): Promise<DebuggerSession> {
        const config = getConfig(configName);
        let proc: Proc | undefined;
        if (config.request === 'launch') {
            config.program = file;
            config.args = scriptArgs;
            config.redirectOutput = false;
            // XXX set the file in the current vscode editor?
        } else if (config.request === 'attach') {
            if (config.port) {
                proc = await this.runDebugger(config.port, file, ...scriptArgs);
                if (wsRoot && config.name === 'attach to a local port') {
                    config.pathMappings.localRoot = wsRoot.uri.fsPath;
                }
            } else if (config.processId) {
                proc = this.runScript(file, ...scriptArgs);
                config.processId = proc.pid;
            } else {
                throw Error(`unsupported attach config "${configName}"`);
            }
            if (wsRoot && config.pathMappings) {
                config.pathMappings.localRoot = wsRoot.uri.fsPath;
            }
        } else {
            throw Error(`unsupported request type "${config.request}"`);
        }
        const id = debuggers.track(config);
        const session = new DebuggerSession(id, config, wsRoot, proc);
        debuggers.setDAPHandler(id, (src, msg) => session.handleDAPMessage(src, msg));
        return session;
    }

    public getLaunchTarget(filename: string, args: string[]): vscode.DebugConfiguration {
        return {
            type: 'python',
            name: 'debug',
            request: 'launch',
            program: filename,
            args: args,
            console: 'integratedTerminal',
        };
    }

    public getAttachTarget(filename: string, args: string[], port?: number): vscode.DebugConfiguration {
        if (port) {
            this.runDebugger(port, filename, ...args);
            return {
                type: 'python',
                name: 'debug',
                request: 'attach',
                port: port,
                host: 'localhost',
                pathMappings: [
                    {
                        localRoot: '${workspaceFolder}',
                        remoteRoot: '.',
                    },
                ],
            };
        } else {
            const proc = this.runScript(filename, ...args);
            return {
                type: 'python',
                name: 'debug',
                request: 'attach',
                processId: proc.pid,
            };
        }
    }

    public async runDebugger(port: number, filename: string, ...scriptArgs: string[]) {
        const args = await getDebugpyLauncherArgs({
            host: 'localhost',
            port: port,
            // This causes problems if we set it to true.
            waitUntilDebuggerAttaches: false,
        });
        args.push(filename, ...scriptArgs);
        return this.runScript(args[0], ...args.slice(1));
    }
}
