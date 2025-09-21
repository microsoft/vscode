import * as fs from "fs";
import { Node } from "../../model/interface/node";
import { Client, ClientConfig, QueryArrayResult, types } from "pg";
import { IConnection, queryCallback } from "./connection";
import { EventEmitter } from "events";

/**
 * https://www.npmjs.com/package/pg
 */
export class PostgreSqlConnection extends IConnection {
    private client: Client;
    constructor(node: Node) {
        super()
        let config = {
            host: node.host, port: node.port,
            user: node.user, password: node.password,
            database: node.database,
            connectionTimeoutMillis: node.options?.connectTimeout || 5000,
            statement_timeout: node.options?.requestTimeout || 10000,
        } as ClientConfig;
        if (node.ssl) {
            config.ssl = {
                rejectUnauthorized: false,
                ca: node.ssl.ca ? fs.readFileSync(node.ssl.ca) : null,
                cert: node.ssl.cert ? fs.readFileSync(node.ssl.cert) : null,
                key: node.ssl.key ? fs.readFileSync(node.ssl.key) : null,
            }
        }
        this.client = new Client(config);

    }
    isAlive(): boolean {
        const temp = this.client;
        return !this.dead && (this.client as {_connected?: boolean, _ending?: boolean})._connected && !(this.client as {_connected?: boolean, _ending?: boolean})._ending;
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {

        if (!callback && values instanceof Function) {
            callback = values;
        }
        const event = new EventEmitter()
        this.client.query(sql, (err, res) => {
            if (err) {
                if(callback) callback(err)
                this.end()
                event.emit("error", err.message)
            } else if (!callback) {
                if (res.rows.length == 0) {
                    event.emit("end")
                }
                for (let i = 1; i <= res.rows.length; i++) {
                    const row = res.rows[i - 1];
                    event.emit("result", this.convertToDump(row), res.rows.length == i)
                }
            } else {
                if (res instanceof Array) {
                    callback(null, res.map(row => this.adaptResult(row)), res.map(row => row.fields))
                } else {
                    callback(null, this.adaptResult(res), res.fields)
                }
            }
        })
        return event;
    }
    
    adaptResult(res: QueryArrayResult<any>) {
        if (res.command != 'SELECT' && res.command != 'SHOW') {
            return { affectedRows: res.rowCount }
        }
        return res.rows;
    }

    connect(callback: (err: Error) => void): void {
        this.client.connect(err => {
            callback(err)
            if (!err) {
                this.client.on("error", () => this.end())
                this.client.on("end", () => this.end())
            }
        })
    }
    async beginTransaction(callback: (err: Error) => void) {
        this.client.query("BEGIN", callback)
    }
    async rollback() {
        await this.client.query("ROLLBACK")
    }
    async commit() {
        await this.client.query("COMMIT")
    }
    end(): void {
        this.dead = true;
        if (this.client && typeof this.client.end === 'function') {
            this.client.end()
        }
    }



}

enum TypeId {
    BOOL = 16,
    BYTEA = 17,
    CHAR = 18,
    INT8 = 20,
    INT2 = 21,
    INT4 = 23,
    REGPROC = 24,
    TEXT = 25,
    OID = 26,
    TID = 27,
    XID = 28,
    CID = 29,
    JSON = 114,
    XML = 142,
    PG_NODE_TREE = 194,
    SMGR = 210,
    PATH = 602,
    POLYGON = 604,
    CIDR = 650,
    FLOAT4 = 700,
    FLOAT8 = 701,
    ABSTIME = 702,
    RELTIME = 703,
    TINTERVAL = 704,
    CIRCLE = 718,
    MACADDR8 = 774,
    MONEY = 790,
    MACADDR = 829,
    INET = 869,
    ACLITEM = 1033,
    BPCHAR = 1042,
    VARCHAR = 1043,
    DATE = 1082,
    TIME = 1083,
    TIMESTAMP = 1114,
    TIMESTAMPTZ = 1184,
    INTERVAL = 1186,
    TIMETZ = 1266,
    BIT = 1560,
    VARBIT = 1562,
    NUMERIC = 1700,
    REFCURSOR = 1790,
    REGPROCEDURE = 2202,
    REGOPER = 2203,
    REGOPERATOR = 2204,
    REGCLASS = 2205,
    REGTYPE = 2206,
    UUID = 2950,
    TXID_SNAPSHOT = 2970,
    PG_LSN = 3220,
    PG_NDISTINCT = 3361,
    PG_DEPENDENCIES = 3402,
    TSVECTOR = 3614,
    TSQUERY = 3615,
    GTSVECTOR = 3642,
    REGCONFIG = 3734,
    REGDICTIONARY = 3769,
    JSONB = 3802,
    REGNAMESPACE = 4089,
    REGROLE = 4096
}

types.setTypeParser(TypeId.TIMESTAMP, (val) => val)
types.setTypeParser(TypeId.TIMESTAMPTZ, (val) => val)
types.setTypeParser(TypeId.DATE, (val) => val)
types.setTypeParser(TypeId.JSON, (val) => val)