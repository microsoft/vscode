import { EventEmitter } from 'events';
import { injectable } from 'inversify';
import * as net from 'net';
import { ISocketServer } from '../../types';
import { createDeferred, Deferred } from '../../utils/async';
import { noop } from '../../utils/misc';

@injectable()
export class SocketServer extends EventEmitter implements ISocketServer {
    private socketServer: net.Server | undefined;
    private clientSocket: Deferred<net.Socket>;
    public get client(): Promise<net.Socket> {
        return this.clientSocket.promise;
    }
    constructor() {
        super();
        this.clientSocket = createDeferred<net.Socket>();
    }
    public dispose() {
        this.Stop();
    }
    public Stop() {
        if (!this.socketServer) {
            return;
        }
        try {
            this.socketServer.close();
        } catch (ex) {}
        this.socketServer = undefined;
    }

    public Start(options: { port?: number; host?: string } = {}): Promise<number> {
        const def = createDeferred<number>();
        this.socketServer = net.createServer(this.connectionListener.bind(this));

        const port = typeof options.port === 'number' ? options.port! : 0;
        const host = typeof options.host === 'string' ? options.host! : 'localhost';
        this.socketServer!.on('error', (ex) => {
            const msg = `Failed to start the socket server. (Error: ${ex.message})`;

            def.reject(msg);
        });
        this.socketServer!.listen({ port, host }, () => {
            def.resolve((this.socketServer!.address() as net.AddressInfo).port);
        });

        return def.promise;
    }

    private connectionListener(client: net.Socket) {
        if (!this.clientSocket.completed) {
            this.clientSocket.resolve(client);
        }
        client.on('close', () => {
            this.emit('close', client);
        });
        client.on('data', (data: Buffer) => {
            this.emit('data', client, data);
        });
        client.on('error', () => noop);

        client.on('timeout', () => {
            // let msg = "Debugger client timedout, " + d;
        });
    }
}
