/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import * as net from 'net';
import * as objects from '../../../../base/common/objects.js';
import * as path from '../../../../base/common/path.js';
import * as platform from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { Promises } from '../../../../base/node/pfs.js';
import * as nls from '../../../../nls.js';
import { AbstractDebugAdapter } from '../common/abstractDebugAdapter.js';
import { killTree } from '../../../../base/node/processes.js';
/**
 * An implementation that communicates via two streams with the debug adapter.
 */
export class StreamDebugAdapter extends AbstractDebugAdapter {
    static { this.TWO_CRLF = '\r\n\r\n'; }
    static { this.HEADER_LINESEPARATOR = /\r?\n/; } // allow for non-RFC 2822 conforming line separators
    static { this.HEADER_FIELDSEPARATOR = /: */; }
    constructor() {
        super();
        this.rawData = Buffer.allocUnsafe(0);
        this.contentLength = -1;
    }
    connect(readable, writable) {
        this.outputStream = writable;
        this.rawData = Buffer.allocUnsafe(0);
        this.contentLength = -1;
        readable.on('data', (data) => this.handleData(data));
    }
    sendMessage(message) {
        if (this.outputStream) {
            const json = JSON.stringify(message);
            this.outputStream.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}${StreamDebugAdapter.TWO_CRLF}${json}`, 'utf8');
        }
    }
    handleData(data) {
        this.rawData = Buffer.concat([this.rawData, data]);
        while (true) {
            if (this.contentLength >= 0) {
                if (this.rawData.length >= this.contentLength) {
                    const message = this.rawData.toString('utf8', 0, this.contentLength);
                    this.rawData = this.rawData.slice(this.contentLength);
                    this.contentLength = -1;
                    if (message.length > 0) {
                        try {
                            this.acceptMessage(JSON.parse(message));
                        }
                        catch (e) {
                            this._onError.fire(new Error((e.message || e) + '\n' + message));
                        }
                    }
                    continue; // there may be more complete messages to process
                }
            }
            else {
                const idx = this.rawData.indexOf(StreamDebugAdapter.TWO_CRLF);
                if (idx !== -1) {
                    const header = this.rawData.toString('utf8', 0, idx);
                    const lines = header.split(StreamDebugAdapter.HEADER_LINESEPARATOR);
                    for (const h of lines) {
                        const kvPair = h.split(StreamDebugAdapter.HEADER_FIELDSEPARATOR);
                        if (kvPair[0] === 'Content-Length') {
                            this.contentLength = Number(kvPair[1]);
                        }
                    }
                    this.rawData = this.rawData.slice(idx + StreamDebugAdapter.TWO_CRLF.length);
                    continue;
                }
            }
            break;
        }
    }
}
export class NetworkDebugAdapter extends StreamDebugAdapter {
    startSession() {
        return new Promise((resolve, reject) => {
            let connected = false;
            this.socket = this.createConnection(() => {
                this.connect(this.socket, this.socket);
                resolve();
                connected = true;
            });
            this.socket.on('close', () => {
                if (connected) {
                    this._onError.fire(new Error('connection closed'));
                }
                else {
                    reject(new Error('connection closed'));
                }
            });
            this.socket.on('error', error => {
                // On ipv6 posix this can be an AggregateError which lacks a message. Use the first.
                if (error instanceof AggregateError) {
                    error = error.errors[0];
                }
                if (connected) {
                    this._onError.fire(error);
                }
                else {
                    reject(error);
                }
            });
        });
    }
    async stopSession() {
        await this.cancelPendingRequests();
        if (this.socket) {
            this.socket.end();
            this.socket = undefined;
        }
    }
}
/**
 * An implementation that connects to a debug adapter via a socket.
*/
export class SocketDebugAdapter extends NetworkDebugAdapter {
    constructor(adapterServer) {
        super();
        this.adapterServer = adapterServer;
    }
    createConnection(connectionListener) {
        return net.createConnection(this.adapterServer.port, this.adapterServer.host || '127.0.0.1', connectionListener);
    }
}
/**
 * An implementation that connects to a debug adapter via a NamedPipe (on Windows)/UNIX Domain Socket (on non-Windows).
 */
export class NamedPipeDebugAdapter extends NetworkDebugAdapter {
    constructor(adapterServer) {
        super();
        this.adapterServer = adapterServer;
    }
    createConnection(connectionListener) {
        return net.createConnection(this.adapterServer.path, connectionListener);
    }
}
/**
 * An implementation that launches the debug adapter as a separate process and communicates via stdin/stdout.
*/
export class ExecutableDebugAdapter extends StreamDebugAdapter {
    constructor(adapterExecutable, debugType) {
        super();
        this.adapterExecutable = adapterExecutable;
        this.debugType = debugType;
    }
    async startSession() {
        const command = this.adapterExecutable.command;
        const args = this.adapterExecutable.args;
        const options = this.adapterExecutable.options || {};
        try {
            // verify executables asynchronously
            if (command) {
                if (path.isAbsolute(command)) {
                    const commandExists = await Promises.exists(command);
                    if (!commandExists) {
                        throw new Error(nls.localize('debugAdapterBinNotFound', "Debug adapter executable '{0}' does not exist.", command));
                    }
                }
                else {
                    // relative path
                    if (command.indexOf('/') < 0 && command.indexOf('\\') < 0) {
                        // no separators: command looks like a runtime name like 'node' or 'mono'
                        // TODO: check that the runtime is available on PATH
                    }
                }
            }
            else {
                throw new Error(nls.localize({ key: 'debugAdapterCannotDetermineExecutable', comment: ['Adapter executable file not found'] }, "Cannot determine executable for debug adapter '{0}'.", this.debugType));
            }
            let env = process.env;
            if (options.env && Object.keys(options.env).length > 0) {
                env = objects.mixin(objects.deepClone(process.env), options.env);
            }
            if (command === 'node') {
                if (Array.isArray(args) && args.length > 0) {
                    const isElectron = !!process.env['ELECTRON_RUN_AS_NODE'] || !!process.versions['electron'];
                    const forkOptions = {
                        env: env,
                        execArgv: isElectron ? ['-e', 'delete process.env.ELECTRON_RUN_AS_NODE;require(process.argv[1])'] : [],
                        silent: true
                    };
                    if (options.cwd) {
                        forkOptions.cwd = options.cwd;
                    }
                    const child = cp.fork(args[0], args.slice(1), forkOptions);
                    if (!child.pid) {
                        throw new Error(nls.localize('unableToLaunchDebugAdapter', "Unable to launch debug adapter from '{0}'.", args[0]));
                    }
                    this.serverProcess = child;
                }
                else {
                    throw new Error(nls.localize('unableToLaunchDebugAdapterNoArgs', "Unable to launch debug adapter."));
                }
            }
            else {
                let spawnCommand = command;
                let spawnArgs = args;
                const spawnOptions = {
                    env: env
                };
                if (options.cwd) {
                    spawnOptions.cwd = options.cwd;
                }
                if (platform.isWindows && (command.endsWith('.bat') || command.endsWith('.cmd'))) {
                    // https://github.com/microsoft/vscode/issues/224184
                    spawnOptions.shell = true;
                    spawnCommand = `"${command}"`;
                    spawnArgs = args.map(a => {
                        a = a.replace(/"/g, '\\"'); // Escape existing double quotes with \
                        // Wrap in double quotes
                        return `"${a}"`;
                    });
                }
                this.serverProcess = cp.spawn(spawnCommand, spawnArgs, spawnOptions);
            }
            this.serverProcess.on('error', err => {
                this._onError.fire(err);
            });
            this.serverProcess.on('exit', (code, signal) => {
                this._onExit.fire(code);
            });
            this.serverProcess.stdout.on('close', () => {
                this._onError.fire(new Error('read error'));
            });
            this.serverProcess.stdout.on('error', error => {
                this._onError.fire(error);
            });
            this.serverProcess.stdin.on('error', error => {
                this._onError.fire(error);
            });
            this.serverProcess.stderr.resume();
            // finally connect to the DA
            this.connect(this.serverProcess.stdout, this.serverProcess.stdin);
        }
        catch (err) {
            this._onError.fire(err);
        }
    }
    async stopSession() {
        if (!this.serverProcess) {
            return Promise.resolve(undefined);
        }
        // when killing a process in windows its child
        // processes are *not* killed but become root
        // processes. Therefore we use TASKKILL.EXE
        await this.cancelPendingRequests();
        if (platform.isWindows) {
            return killTree(this.serverProcess.pid, true).catch(() => {
                this.serverProcess?.kill();
            });
        }
        else {
            this.serverProcess.kill('SIGTERM');
            return Promise.resolve(undefined);
        }
    }
    static extract(platformContribution, extensionFolderPath) {
        if (!platformContribution) {
            return undefined;
        }
        const result = Object.create(null);
        if (platformContribution.runtime) {
            if (platformContribution.runtime.indexOf('./') === 0) { // TODO
                result.runtime = path.join(extensionFolderPath, platformContribution.runtime);
            }
            else {
                result.runtime = platformContribution.runtime;
            }
        }
        if (platformContribution.runtimeArgs) {
            result.runtimeArgs = platformContribution.runtimeArgs;
        }
        if (platformContribution.program) {
            if (!path.isAbsolute(platformContribution.program)) {
                result.program = path.join(extensionFolderPath, platformContribution.program);
            }
            else {
                result.program = platformContribution.program;
            }
        }
        if (platformContribution.args) {
            result.args = platformContribution.args;
        }
        const contribution = platformContribution;
        if (contribution.win) {
            result.win = ExecutableDebugAdapter.extract(contribution.win, extensionFolderPath);
        }
        if (contribution.winx86) {
            result.winx86 = ExecutableDebugAdapter.extract(contribution.winx86, extensionFolderPath);
        }
        if (contribution.windows) {
            result.windows = ExecutableDebugAdapter.extract(contribution.windows, extensionFolderPath);
        }
        if (contribution.osx) {
            result.osx = ExecutableDebugAdapter.extract(contribution.osx, extensionFolderPath);
        }
        if (contribution.linux) {
            result.linux = ExecutableDebugAdapter.extract(contribution.linux, extensionFolderPath);
        }
        return result;
    }
    static platformAdapterExecutable(extensionDescriptions, debugType) {
        let result = Object.create(null);
        debugType = debugType.toLowerCase();
        // merge all contributions into one
        for (const ed of extensionDescriptions) {
            if (ed.contributes) {
                const debuggers = ed.contributes['debuggers'];
                if (debuggers && debuggers.length > 0) {
                    debuggers.filter(dbg => typeof dbg.type === 'string' && strings.equalsIgnoreCase(dbg.type, debugType)).forEach(dbg => {
                        // extract relevant attributes and make them absolute where needed
                        const extractedDbg = ExecutableDebugAdapter.extract(dbg, ed.extensionLocation.fsPath);
                        // merge
                        result = objects.mixin(result, extractedDbg, ed.isBuiltin);
                    });
                }
            }
        }
        // select the right platform
        let platformInfo;
        if (platform.isWindows && !process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')) {
            platformInfo = result.winx86 || result.win || result.windows;
        }
        else if (platform.isWindows) {
            platformInfo = result.win || result.windows;
        }
        else if (platform.isMacintosh) {
            platformInfo = result.osx;
        }
        else if (platform.isLinux) {
            platformInfo = result.linux;
        }
        platformInfo = platformInfo || result;
        // these are the relevant attributes
        const program = platformInfo.program || result.program;
        const args = platformInfo.args || result.args;
        const runtime = platformInfo.runtime || result.runtime;
        const runtimeArgs = platformInfo.runtimeArgs || result.runtimeArgs;
        if (runtime) {
            return {
                type: 'executable',
                command: runtime,
                args: (runtimeArgs || []).concat(typeof program === 'string' ? [program] : []).concat(args || [])
            };
        }
        else if (program) {
            return {
                type: 'executable',
                command: program,
                args: args || []
            };
        }
        // nothing found
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvbm9kZS9kZWJ1Z0FkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDcEMsT0FBTyxLQUFLLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFFM0IsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUcxQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFOUQ7O0dBRUc7QUFDSCxNQUFNLE9BQWdCLGtCQUFtQixTQUFRLG9CQUFvQjthQUU1QyxhQUFRLEdBQUcsVUFBVSxBQUFiLENBQWM7YUFDdEIseUJBQW9CLEdBQUcsT0FBTyxBQUFWLENBQVcsR0FBQyxvREFBb0Q7YUFDcEYsMEJBQXFCLEdBQUcsS0FBSyxBQUFSLENBQVM7SUFNdEQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQUpELFlBQU8sR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLGtCQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFJM0IsQ0FBQztJQUVTLE9BQU8sQ0FBQyxRQUF5QixFQUFFLFFBQXlCO1FBRXJFLElB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