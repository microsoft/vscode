'use strict';

import * as net from 'net';
import { EventEmitter } from 'events';
import { SocketStream } from './SocketStream';
import { SocketServer } from './socketServer';

export abstract class SocketCallbackHandler extends EventEmitter {
    private _stream!: SocketStream;
    private commandHandlers: Map<string, Function>;
    private handeshakeDone!: boolean;

    constructor(socketServer: SocketServer) {
        super();
        this.commandHandlers = new Map<string, Function>();
        socketServer.on('data', this.onData.bind(this));
    }
    private disposed!: boolean;
    public dispose() {
        this.disposed = true;
        this.commandHandlers.clear();
    }
    private onData(socketClient: net.Socket, data: Buffer) {
        if (this.disposed) {
            return;
        }
        this.HandleIncomingData(data, socketClient);
    }

    protected get stream(): SocketStream {
        return this._stream;
    }

    protected SendRawCommand(commandId: Buffer) {
        this.stream.Write(commandId);
    }

    protected registerCommandHandler(commandId: string, handler: Function) {
        this.commandHandlers.set(commandId, handler);
    }

    protected abstract handleHandshake(): boolean;

    private HandleIncomingData(buffer: Buffer, socket: net.Socket): boolean | undefined {
        if (!this._stream) {
            this._stream = new SocketStream(socket, buffer);
        } else {
            this._stream.Append(buffer);
        }

        if (!this.handeshakeDone && !this.handleHandshake()) {
            return;
        }

        this.handeshakeDone = true;

        this.HandleIncomingDataFromStream();
        return true;
    }

    private HandleIncomingDataFromStream() {
        if (this.stream.Length === 0) {
            return;
        }
        this.stream.BeginTransaction();

        let cmd = this.stream.ReadAsciiString(4);
        if (this.stream.HasInsufficientDataForReading) {
            this.stream.RollBackTransaction();
            return;
        }

        if (this.commandHandlers.has(cmd)) {
            const handler = this.commandHandlers.get(cmd)!;
            handler();
        } else {
            this.emit('error', `Unhandled command '${cmd}'`);
        }

        if (this.stream.HasInsufficientDataForReading) {
            // Most possibly due to insufficient data
            this.stream.RollBackTransaction();
            return;
        }

        this.stream.EndTransaction();
        if (this.stream.Length > 0) {
            this.HandleIncomingDataFromStream();
        }
    }
}
