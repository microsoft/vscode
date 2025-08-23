// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as rpc from 'vscode-jsonrpc/node';
import { CancellationError, CancellationToken, Disposable } from 'vscode';
import { traceVerbose } from '../../logging';
import { isWindows } from '../utils/platform';
import { createDeferred } from '../utils/async';
import { noop } from '../utils/misc';

const { XDG_RUNTIME_DIR } = process.env;
export function generateRandomPipeName(prefix: string): string {
    // length of 10 picked because of the name length restriction for sockets
    const randomSuffix = crypto.randomBytes(10).toString('hex');
    if (prefix.length === 0) {
        prefix = 'python-ext-rpc';
    }

    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\${prefix}-${randomSuffix}`;
    }

    let result;
    if (XDG_RUNTIME_DIR) {
        result = path.join(XDG_RUNTIME_DIR, `${prefix}-${randomSuffix}`);
    } else {
        result = path.join(os.tmpdir(), `${prefix}-${randomSuffix}`);
    }

    return result;
}

async function mkfifo(fifoPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn('mkfifo', [fifoPath]);
        proc.on('error', (err) => {
            reject(err);
        });
        proc.on('exit', (code) => {
            if (code === 0) {
                resolve();
            }
        });
    });
}

export async function createWriterPipe(pipeName: string, token?: CancellationToken): Promise<rpc.MessageWriter> {
    // windows implementation of FIFO using named pipes
    if (isWindows()) {
        const deferred = createDeferred<rpc.MessageWriter>();
        const server = net.createServer((socket) => {
            traceVerbose(`Pipe connected: ${pipeName}`);
            server.close();
            deferred.resolve(new rpc.SocketMessageWriter(socket, 'utf-8'));
        });

        server.on('error', deferred.reject);
        server.listen(pipeName);
        if (token) {
            token.onCancellationRequested(() => {
                if (server.listening) {
                    server.close();
                }
                deferred.reject(new CancellationError());
            });
        }
        return deferred.promise;
    }
    // linux implementation of FIFO
    await mkfifo(pipeName);
    try {
        await fs.chmod(pipeName, 0o666);
    } catch {
        // Intentionally ignored
    }
    const writer = fs.createWriteStream(pipeName, {
        encoding: 'utf-8',
    });
    return new rpc.StreamMessageWriter(writer, 'utf-8');
}

class CombinedReader implements rpc.MessageReader {
    private _onError = new rpc.Emitter<Error>();

    private _onClose = new rpc.Emitter<void>();

    private _onPartialMessage = new rpc.Emitter<rpc.PartialMessageInfo>();

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
    private _callback: rpc.DataCallback = () => {};

    private _disposables: rpc.Disposable[] = [];

    private _readers: rpc.MessageReader[] = [];

    constructor() {
        this._disposables.push(this._onClose, this._onError, this._onPartialMessage);
    }

    onError: rpc.Event<Error> = this._onError.event;

    onClose: rpc.Event<void> = this._onClose.event;

    onPartialMessage: rpc.Event<rpc.PartialMessageInfo> = this._onPartialMessage.event;

    listen(callback: rpc.DataCallback): rpc.Disposable {
        this._callback = callback;
        // eslint-disable-next-line no-return-assign, @typescript-eslint/no-empty-function
        return new Disposable(() => (this._callback = () => {}));
    }

    add(reader: rpc.MessageReader): void {
        this._readers.push(reader);
        reader.listen((msg) => {
            this._callback(msg as rpc.NotificationMessage);
        });
        this._disposables.push(reader);
        reader.onClose(() => {
            this.remove(reader);
            if (this._readers.length === 0) {
                this._onClose.fire();
            }
        });
        reader.onError((e) => {
            this.remove(reader);
            this._onError.fire(e);
        });
    }

    remove(reader: rpc.MessageReader): void {
        const found = this._readers.find((r) => r === reader);
        if (found) {
            this._readers = this._readers.filter((r) => r !== reader);
            reader.dispose();
        }
    }

    dispose(): void {
        this._readers.forEach((r) => r.dispose());
        this._readers = [];
        this._disposables.forEach((disposable) => disposable.dispose());
        this._disposables = [];
    }
}

export async function createReaderPipe(pipeName: string, token?: CancellationToken): Promise<rpc.MessageReader> {
    if (isWindows()) {
        // windows implementation of FIFO using named pipes
        const deferred = createDeferred<rpc.MessageReader>();
        const combined = new CombinedReader();

        let refs = 0;
        const server = net.createServer((socket) => {
            traceVerbose(`Pipe connected: ${pipeName}`);
            refs += 1;

            socket.on('close', () => {
                refs -= 1;
                if (refs <= 0) {
                    server.close();
                }
            });
            combined.add(new rpc.SocketMessageReader(socket, 'utf-8'));
        });
        server.on('error', deferred.reject);
        server.listen(pipeName);
        if (token) {
            token.onCancellationRequested(() => {
                if (server.listening) {
                    server.close();
                }
                deferred.reject(new CancellationError());
            });
        }
        deferred.resolve(combined);
        return deferred.promise;
    }
    // mac/linux implementation of FIFO
    await mkfifo(pipeName);
    try {
        await fs.chmod(pipeName, 0o666);
    } catch {
        // Intentionally ignored
    }
    const fd = await fs.open(pipeName, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const socket = new net.Socket({ fd });
    const reader = new rpc.SocketMessageReader(socket, 'utf-8');
    socket.on('close', () => {
        fs.close(fd).catch(noop);
        reader.dispose();
    });

    return reader;
}
