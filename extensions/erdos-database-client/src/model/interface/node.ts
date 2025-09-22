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

    public key: string;
    public provider?: DbTreeDataProvider;
    public context?: Memento;
    public parent?: Node;

    public ssl?: {
        ca?: string;
        cert?: string;
        key?: string;
    };

    /**
     * sqlite only
     */
    public dbPath?: string;

    public options?: {
        connectTimeout?: number;
        requestTimeout?: number;
        includeDatabases?: string;
        timezone?: string;
        // MongoDB specific
        srv?: boolean;
        useConnectionString?: boolean;
        connectionUrl?: string;
        // ElasticSearch specific
        elasticUrl?: string;
        esAuth?: 'none' | 'account' | 'token';
        esUsername?: string;
        esPassword?: string;
        esToken?: string;
        // SQL Server specific
        authType?: 'default' | 'ntlm';
        encrypt?: boolean;
        trustServerCertificate?: boolean;
        domain?: string;
        instanceName?: string;
        // FTP specific
        encoding?: string;
        showHidden?: boolean;
    };

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
        this.ssl = source.ssl
        this.ssh = source.ssh
        this.usingSSH = source.usingSSH
        this.options = source.options
        this.connectionKey = source.connectionKey
        this.global = source.global
        this.dbType = source.dbType
        this.connectionUrl = source.connectionUrl
        this.dbPath = source.dbPath
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
            this.command = { command: "database.connection.open", title: "Open Connection", arguments: [this] }
        }
        this.key = source.key || this.key;
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
        return DatabaseCache.getChildCache(this.getCacheKey())
    }

    public setChildCache(childs: Node[]) {
        DatabaseCache.setChildCache(this.getCacheKey(), childs)
    }

    public static nodeCache = {};
    public cacheSelf() {
        const cacheKey = this.getCacheKey();
        Node.nodeCache[cacheKey] = this;
    }
    public getCache() {
        const cacheKey = this.getCacheKey();
        return Node.nodeCache[cacheKey];
    }

    public getByRegion<T extends Node>(region?: string): T {
        const baseKey = this.getConnectId({ withSchema: true });
        const cacheKey = region ? `${baseKey}#${region}` : baseKey;
        return Node.nodeCache[cacheKey];
    }

    public getChildren(isRresh?: boolean): Node[] | Promise<Node[]> {
        return []
    }

    /**
     * Get the appropriate cache key for this node based on its type
     */
    public getCacheKey(): string {
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.CATALOG) {
            return this.getConnectId();
        } else if (this.contextValue == ModelType.SCHEMA || this.contextValue == ModelType.REDIS_CONNECTION) {
            return this.getConnectId({ withSchema: true });
        } else {
            return `${this.getConnectId({ withSchema: true })}#${this.label}`;
        }
    }

    /**
     * Get file-safe cache key for file system operations
     */
    public getFileSafeCacheKey(): string {
        return this.getCacheKey().replace(/[\:\*\?"\<\>]/g, "");
    }

    public isActive(cur: Node) {
        return cur && cur.getConnectId() == this.getConnectId();
    }

    public getConnectId(opt?: SwitchOpt): string {
        let uid = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.options?.instanceName ? this.options.instanceName : this.port}`;

        uid = `${this.key}@@${uid}`

        const database = this.database;
        if (database && this && this.contextValue != ModelType.CONNECTION) {
            uid = `${uid}@${database}`;
        }

        const schema = (opt && opt.schema) || this.schema;
        if (opt && opt.withSchema && schema) {
            uid = `${uid}@${schema}`
        }

        return uid;
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