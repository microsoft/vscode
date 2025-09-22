import { Node } from "../../model/interface/node";
import EventEmitter = require("events");
import { IConnection, queryCallback } from "./connection";
import Client from "../../model/ftp/lib/connection"

interface FtpClient {
    list(path?: string, callback?: (err: Error, list: any[]) => void): void;
    put(input: any, remotePath: string, callback?: (err: Error) => void): void;
    get(remotePath: string, callback?: (err: Error, stream: any) => void): void;
    delete(remotePath: string, callback?: (err: Error) => void): void;
    mkdir(remotePath: string, callback?: (err: Error) => void): void;
    rmdir(remotePath: string, callback?: (err: Error) => void): void;
    connect(config: any): void;
    end(): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
}

export class FTPConnection extends IConnection {

    private client: FtpClient;
    constructor(private node: Node) {
        super()
        this.client = new (Client as any)();
    }

    public getClient(): FtpClient {
        return this.client;
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        
        if (!sql || typeof sql !== 'string') {
            callback(new Error('Invalid FTP command: command must be a non-empty string'));
            return;
        }
        
        const command = sql.trim().toUpperCase();
        const client = this.client;
        
        switch (command) {
            case 'LIST':
            case 'LIST /':
                client.list('/', (err, list) => {
                    if (err) {
                        callback(err);
                    } else {
                        // Format the list as a table-like structure for display
                        const results = list.map(item => ({
                            name: item.name,
                            type: item.type === 'd' ? 'Directory' : 'File',
                            size: item.size || 0,
                            date: item.date || new Date()
                        }));
                        callback(null, results);
                    }
                });
                break;
            case 'PWD':
                // Return current working directory
                callback(null, [{ path: '/' }]);
                break;
            case 'STATUS':
                // Return connection status
                callback(null, [{ 
                    status: 'Connected',
                    host: this.node.host,
                    port: this.node.port,
                    user: this.node.user
                }]);
                break;
            default:
                // For unknown commands, try to parse as LIST with path
                if (command.startsWith('LIST ')) {
                    const path = command.substring(5).trim() || '/';
                    client.list(path, (err, list) => {
                        if (err) {
                            callback(err);
                        } else {
                            const results = list.map(item => ({
                                name: item.name,
                                type: item.type === 'd' ? 'Directory' : 'File',
                                size: item.size || 0,
                                date: item.date || new Date()
                            }));
                            callback(null, results);
                        }
                    });
                } else {
                    callback(new Error(`Unsupported FTP command: ${command}. Supported commands: LIST [path], PWD, STATUS`));
                }
                break;
        }
    }
    connect(callback: (err: Error) => void): void {
        const client = this.client;
        client.on('ready', function () {
            callback(null)
        });
        client.on('error', (err: Error) => {
            callback(err)
        })
        client.on('close', () => {
            this.dead = true;
        })
        
        const connectOptions = {
            host: this.node.host,
            port: this.node.port,
            user: this.node.user,
            password: this.node.password,
            encoding:this.node.options?.encoding,
            secure: false,
            connTimeout: this.node.options?.connectTimeout||3000,
            pasvTimeout: this.node.options?.requestTimeout
        };
        client.connect(connectOptions);
    }
    beginTransaction(callback: (err: Error) => void): void {
        throw new Error("Method not implemented.");
    }
    rollback(): void {
        throw new Error("Method not implemented.");
    }
    commit(): void {
        throw new Error("Method not implemented.");
    }
    end(): void {
    }
    isAlive(): boolean {
        return true;
    }

}