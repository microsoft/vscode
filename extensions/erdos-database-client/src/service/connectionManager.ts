import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { Node } from "../model/interface/node";
import { QueryUnit } from "./queryUnit";
import { SSHConfig } from "../model/interface/sshConfig";
import { DatabaseCache } from "../service/common/databaseCache";
import { NodeUtil } from "../model/nodeUtil";
import { SSHTunnelService } from "./tunnel/sshTunnelService";
import { DbTreeDataProvider } from "../provider/treeDataProvider";
import { IConnection } from "./connect/connection";
import { DatabaseType } from "../common/constants";
import { EsConnection } from "./connect/esConnection";
import { MSSqlConnnection } from "./connect/mssqlConnection";
import { MysqlConnection } from "./connect/mysqlConnection";
import { PostgreSqlConnection } from "./connect/postgreSqlConnection";
import { RedisConnection } from "./connect/redisConnection";
import { FTPConnection } from "./connect/ftpConnection";
import { SqliteConnection } from "./connect/sqliteConnection";
import { Console } from "../common/console";
import { MongoConnection } from "./connect/mongoConnection";
import { ExasolConnection } from "./connect/exasolConnection";

interface ConnectionWrapper {
    connection: IConnection;
    ssh: SSHConfig;
    schema?: string
}

export interface GetRequest {
    retryCount?: number;
    sessionId?: string;
}

export class ConnectionManager {

    public static activeNode: Node;
    private static alivedConnection: { [key: string]: ConnectionWrapper } = {};
    private static tunnelService = new SSHTunnelService();

    public static tryGetConnection(): Node {

        return this.getByActiveFile() || this.activeNode;
    }

    public static getActiveConnectByKey(key: string): ConnectionWrapper {
        return this.alivedConnection[key]
    }

    public static removeConnection(uid: string) {

        try {
            const lcp = this.activeNode;
            if (lcp && lcp.getConnectId() == uid) {
                delete this.activeNode
            }
            const activeConnect = this.alivedConnection[uid];
            if (activeConnect) {
                this.end(uid, activeConnect)
            }
            DatabaseCache.clearDatabaseCache(uid)
        } catch (error) {
            Console.log(error)
        }

    }

    public static changeActive(connectionNode: Node) {
        this.activeNode = connectionNode;
        Global.updateStatusBarItems(connectionNode);
        DbTreeDataProvider.refresh()
    }

    public static getConnection(connectionNode: Node, getRequest: GetRequest = { retryCount: 1 }): Promise<IConnection> {
        if (!connectionNode) {
            throw new Error("Connection is dead!")
        }
        return new Promise(async (resolve, reject) => {

            NodeUtil.of(connectionNode)
            if (!getRequest.retryCount) getRequest.retryCount = 1;
            const key = getRequest.sessionId || connectionNode.getConnectId();
            const connection = this.alivedConnection[key];
            if (connection) {
                if (connection.connection.isAlive()) {
                    if (connection.schema != connectionNode.schema) {
                        const sql = connectionNode && connectionNode.dialect && connectionNode.dialect.pingDataBase(connectionNode.schema);
                        try {
                            if (sql) {
                                await QueryUnit.queryPromise(connection.connection, sql, false)
                            }
                            connection.schema = connectionNode.schema
                            resolve(connection.connection);
                            return;
                        } catch (err) {
                            ConnectionManager.end(key, connection);
                        }
                    } else {
                        resolve(connection.connection);
                        return;
                    }
                }
            }

            const ssh = connectionNode.ssh;
            let connectOption = connectionNode;
            if (connectOption.usingSSH) {
                connectOption = await this.tunnelService.createTunnel(connectOption, (err) => {
                    reject((err && err.message) || (err && err.errno));
                    if (err.errno == 'EADDRINUSE') { return; }
                    this.alivedConnection[key] = null
                })
                if (!connectOption) {
                    reject("create ssh tunnel fail!");
                    return;
                }
            }
            const newConnection = this.create(connectOption);
            this.alivedConnection[key] = { connection: newConnection, ssh };
            newConnection.connect(async (err: Error) => {
                if (err) {
                    this.end(key, this.alivedConnection[key])
                    reject(err)
                } else {
                    try {
                        const sql = connectionNode && connectionNode.dialect && connectionNode.dialect.pingDataBase(connectionNode.schema);
                        if (connectionNode.schema && sql) {
                            await QueryUnit.queryPromise(newConnection, sql, false)
                        }
                    } catch (error) {
                        console.log(err)
                    }

                    resolve(newConnection);
                }
            });

        });

    }

    private static create(opt: Node) {
        if (!opt.dbType) opt.dbType = DatabaseType.MYSQL
        switch (opt.dbType) {
            case DatabaseType.MSSQL:
                return new MSSqlConnnection(opt)
            case DatabaseType.PG:
                return new PostgreSqlConnection(opt)
            case DatabaseType.SQLITE:
                return new SqliteConnection(opt);
            case DatabaseType.ES:
                return new EsConnection(opt);
            case DatabaseType.MONGO_DB:
                return new MongoConnection(opt);
            case DatabaseType.REDIS:
                return new RedisConnection(opt);
            case DatabaseType.FTP:
                return new FTPConnection(opt);
            case DatabaseType.EXASOL:
                return new ExasolConnection(opt);
        }
        return new MysqlConnection(opt)
    }

    private static end(key: string, connection: ConnectionWrapper) {
        this.alivedConnection[key] = null
        try {
            this.tunnelService.closeTunnel(key)
            connection.connection.end();
        } catch (error) {
        }
    }

    public static getByActiveFile(): Node {
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            if (fileName.includes('cweijan')) {
                const queryName = path.basename(path.resolve(fileName, '..'))
                const [host, port, database, schema] = queryName
                    .replace(/^.*@@/, '') // new connection id
                    .replace(/#.+$/, '').split('@')
                if (host != null) {
                    const node = NodeUtil.of({ key: queryName.split('@@')[0], host, port: parseInt(port), database, schema });
                    if (node.getCache()) {
                        return node.getCache();
                    }
                }
            }
        }
        return null;
    }

}
