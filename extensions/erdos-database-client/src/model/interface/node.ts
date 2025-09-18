import { Console } from "../../common/console";
import { DatabaseType, ModelType } from "../../common/constants";
import { getKey } from "../../common/state";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { getSqliteBinariesPath } from "../../service/connect/sqlite/sqliteCommandValidation";
import { ConnectionManager } from "../../service/connectionManager";
import { SqlDialect } from "../../service/dialect/sqlDialect";
import { QueryUnit } from "../../service/queryUnit";
import { ServiceManager } from "../../service/serviceManager";
import { platform } from "os";
import * as vscode from "vscode";
import { Memento } from "vscode";
import { sync as commandExistsSync } from 'command-exists';
import { DatabaseCache } from "../../service/common/databaseCache";
import { NodeUtil } from "../nodeUtil";
import { CopyAble } from "./copyAble";
import { SSHConfig } from "./sshConfig";

export interface SwitchOpt {
    isGlobal?: boolean;
    withSchema?: boolean;
    schema?: string;
}

export abstract class Node extends vscode.TreeItem implements CopyAble {

    public host: string;
    public port: number;
    public user: string;
    public password?: string;
    public dbType?: DatabaseType;
    public dialect?: SqlDialect;
    public database?: string;
    public schema: string;
    public name?: string;
    public timezone?: string;
    public connectTimeout?: number;
    public requestTimeout?: number;
    public includeDatabases?: string;
    public connectionUrl?: string;
    /**
     * ssh
     */
    public usingSSH?: boolean;
    public ssh?: SSHConfig;

    /**
     * status
     */
    public connectionKey: string;
    public description: string = "";
    public global?: boolean;
    public disable?: boolean;

    /**
     * using to distingush connectHolder, childCache, elementState
     */
    public uid: string;
    public key: string;
    public provider?: DbTreeDataProvider;
    public context?: Memento;
    public parent?: Node;

    public useSSL?: boolean;
    public caPath?: string;
    public clientCertPath?: string;
    public clientKeyPath?: string;

    /**
     * sqlite only
     */
    public dbPath?: string;

    /**
      * mssql only
      */
    public encrypt?: boolean;
    public instanceName?: string;
    public domain?: string;
    public authType?: string;

    /**
     * es only
     */
    public scheme: string;
    public esAuth: string;
    public esToken: string;
    /**
     * using when ssh tunnel
     */
    public esUrl: string;

    /**
     * encoding, ftp only
     */
    public encoding: string;
    public showHidden: boolean;

    constructor(public label: string) {
        super(label)
    }
    copyName(): void {
        Util.copyToBoard(this.label)
    }

    protected init(source: Node) {
        this.host = source.host
        this.port = source.port
        this.user = source.user
        this.password = source.password
        this.timezone = source.timezone
        this.useSSL = source.useSSL
        this.clientCertPath = source.clientCertPath
        this.clientKeyPath = source.clientKeyPath
        this.ssh = source.ssh
        this.usingSSH = source.usingSSH
        this.scheme = source.scheme
        this.esAuth = source.esAuth
        this.esToken = source.esToken
        this.encoding = source.encoding
        this.showHidden = source.showHidden
        this.connectionKey = source.connectionKey
        this.global = source.global
        this.dbType = source.dbType
        this.connectionUrl = source.connectionUrl
        if (source.connectTimeout) {
            this.connectTimeout = parseInt(String(source.connectTimeout || "5000"))
            source.connectTimeout = parseInt(String(source.connectTimeout || "5000"))
        }
        if (source.requestTimeout) {
            this.requestTimeout = parseInt(String(source.requestTimeout || "10000"))
            source.requestTimeout = parseInt(String(source.requestTimeout || "10000"))
        }
        this.encrypt = source.encrypt
        this.instanceName = source.instanceName
        this.dbPath = source.dbPath
        this.domain = source.domain
        this.authType = source.authType
        this.disable = source.disable
        this.includeDatabases = source.includeDatabases
        if (!this.database) this.database = source.database
        if (!this.schema) this.schema = source.schema
        if (!this.provider) this.provider = source.provider
        if (!this.context) this.context = source.context
        // init dialect
        if (!this.dialect && this.dbType != DatabaseType.REDIS) {
            this.dialect = ServiceManager.getDialect(this.dbType)
        }
        if (this.disable) {
            this.command = { command: "mysql.connection.open", title: "Open Connection", arguments: [this] }
        }
        this.key = source.key || this.key;
        this.initUid();
        // init tree state
        this.collapsibleState = DatabaseCache.getElementState(this)
    }

    public initKey() {
        if (this.key) return this.key;
        this.key = new Date().getTime() + "";
    }

    public async refresh() {
        await this.getChildren(true)
        this.provider.reload(this)
    }

    public async indent(command: IndentCommand) {

        try {
            const connectionKey = getKey(command.connectionKey || this.connectionKey);
            const connections = this.context.get<{ [key: string]: Node }>(connectionKey, {});
            const key = this.key

            switch (command.command) {
                case CommandKey.add:
                    connections[key] = NodeUtil.removeParent(this);
                    break;
                case CommandKey.update:
                    connections[key] = NodeUtil.removeParent(this);
                    ConnectionManager.removeConnection(key)
                    break;
                case CommandKey.delete:
                    ConnectionManager.removeConnection(key)
                    delete connections[key]
                default:
                    break;
            }


            await this.context.update(connectionKey, connections);

            if (command.refresh !== false) {
                DbTreeDataProvider.refresh();
            }
        } catch (error) {
            Console.log(error)
        }

    }

    public getChildCache<T extends Node>(): T[] {
        return DatabaseCache.getChildCache(this.uid)
    }

    public setChildCache(childs: Node[]) {
        DatabaseCache.setChildCache(this.uid, childs)
    }

    public static nodeCache = {};
    public cacheSelf() {
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.ES_CONNECTION) {
            Node.nodeCache[`${this.getConnectId()}`] = this;
        } else if (this.contextValue == ModelType.SCHEMA) {
            Node.nodeCache[`${this.getConnectId({ withSchema: true })}`] = this;
        } else {
            Node.nodeCache[`${this.uid}`] = this;
        }
    }
    public getCache() {
        if (this.schema) {
            return Node.nodeCache[`${this.getConnectId({ withSchema: true })}`]
        }
        return Node.nodeCache[`${this.getConnectId()}`]
    }

    public getByRegion<T extends Node>(region?: string): T {
        if (!region) {
            return Node.nodeCache[`${this.getConnectId({ withSchema: true })}`]
        }
        return Node.nodeCache[`${this.getConnectId({ withSchema: true })}#${region}`]
    }

    public getChildren(isRresh?: boolean): Node[] | Promise<Node[]> {
        return []
    }

    public initUid() {
        if (this.uid) return;
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.CATALOG) {
            this.uid = this.getConnectId();
        } else if (this.contextValue == ModelType.SCHEMA || this.contextValue == ModelType.REDIS_CONNECTION) {
            this.uid = `${this.getConnectId({ withSchema: true })}`;
        } else {
            this.uid = `${this.getConnectId({ withSchema: true })}#${this.label}`;
        }
    }

    public isActive(cur: Node) {
        return cur && cur.getConnectId() == this.getConnectId();
    }

    public getConnectId(opt?: SwitchOpt): string {


        let uid = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.instanceName ? this.instanceName : this.port}`;

        uid = `${this.key}@@${uid}`

        const database = this.database;
        if (database && this && this.contextValue != ModelType.CONNECTION) {
            uid = `${uid}@${database}`;
        }

        const schema = (opt && opt.schema) || this.schema;
        if (opt && opt.withSchema && schema) {
            uid = `${uid}@${schema}`
        }

        return uid.replace(/[\:\*\?"\<\>]*/g, "");
    }


    public getHost(): string { return this.usingSSH ? this.ssh.host : this.host }
    public getPort(): number { return this.usingSSH ? this.ssh.port : this.port }
    public getUser(): string { return this.usingSSH ? this.ssh.username : this.user }

    public async execute<T>(sql: string, sessionId?: string): Promise<T> {
        return (await QueryUnit.queryPromise<T>(await ConnectionManager.getConnection(this, { sessionId }), sql)).rows
    }

    public async getConnection() {
        return ConnectionManager.getConnection(this)
    }

    public wrap(origin: string) {
        return Util.wrap(origin, this.dbType)
    }


    public openTerminal() {
        let command: string;
        if (this.dbType == DatabaseType.MYSQL) {
            this.checkCommand('mysql');
            command = `mysql -u ${this.user} -p${this.password} -h ${this.host} -P ${this.port} \n`;
        } else if (this.dbType == DatabaseType.PG) {
            this.checkCommand('psql');
            let prefix = platform() == 'win32' ? 'set' : 'export';
            command = `${prefix} "PGPASSWORD=${this.password}" && psql -U ${this.user} -h ${this.host} -p ${this.port} -d ${this.database} \n`;
        } else if (this.dbType == DatabaseType.REDIS) {
            this.checkCommand('redis-cli');
            command = `redis-cli -h ${this.host} -p ${this.port} \n`;
        } else if (this.dbType == DatabaseType.MONGO_DB) {
            this.checkCommand('mongo');
            command = `mongo --host ${this.host} --port ${this.port} ${this.user && this.password ? ` -u ${this.user} -p ${this.password}` : ''} \n`;
        } else if (this.dbType == DatabaseType.SQLITE) {
            command = `${getSqliteBinariesPath()} ${this.dbPath} \n`;
        } else {
            vscode.window.showErrorMessage(`Database type ${this.dbType} not support open terminal.`)
            return;
        }
        const terminal = vscode.window.createTerminal(this.dbType.toString())
        terminal.sendText(command)
        terminal.show()
    }

    checkCommand(command: string) {
        if (!commandExistsSync(command)) {
            const errText = `Command ${command} not exists in path!`;
            vscode.window.showErrorMessage(errText)
            throw new Error(errText);
        }
    }

}
export class IndentCommand {
    command: CommandKey;
    refresh?: boolean;
    connectionKey?: string;
}
export enum CommandKey {
    update, add, delete
}