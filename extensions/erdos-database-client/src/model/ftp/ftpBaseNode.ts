import { FTPConnection } from "../../service/connect/ftpConnection";
import { ConnectionManager } from "../../service/connectionManager";
import { ModelType } from "../../common/constants";
import Client from './lib/connection'
import { Node } from "../interface/node";

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

export class FtpBaseNode extends Node {

    constructor(label: string) {
        super(label)
    }

    public async getClient(): Promise<FtpClient> {
        // For FTP connections, we need to find the root FTP connection node
        let connectionNode = this;
        while (connectionNode.parent && connectionNode.contextValue !== ModelType.FTP_CONNECTION) {
            connectionNode = connectionNode.parent as any;
        }
        const ftpConnection = await ConnectionManager.getConnection(connectionNode) as FTPConnection
        return ftpConnection.getClient()
    }

}