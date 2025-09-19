import { Node } from "../../model/interface/node";
import * as fs from "fs";
import * as mysql from "mysql2";
import { IConnection, queryCallback } from "./connection";
import { dumpTypeCast } from './convert/mysqlTypeCast';

export class MysqlConnection extends IConnection {
    private con: mysql.Connection;
    constructor(node: Node) {
        super()
        let config = {
            host: node.host, port: node.port, user: node.user, password: node.password, database: node.database,
            timezone: node.timezone,
            multipleStatements: true, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
            connectTimeout: node.connectTimeout || 5000,
            typeCast: (field, next) => {
                if (this.dumpMode) return dumpTypeCast(field as mysql.FieldPacket)
                const buf = field.buffer();
                if (field.type == 'BIT') {
                    return this.bitToBoolean(buf)
                }
                return buf && buf.toString();
            }
        } as mysql.ConnectionOptions;
        if (node.ssl) {
            config.ssl = {
                rejectUnauthorized: false,
                ca: node.ssl.ca ? fs.readFileSync(node.ssl.ca).toString() : undefined,
                cert: node.ssl.cert ? fs.readFileSync(node.ssl.cert).toString() : undefined,
                key: node.ssl.key ? fs.readFileSync(node.ssl.key).toString() : undefined
            } as mysql.SslOptions
        }
        this.con = mysql.createConnection(config);
    }
    isAlive(): boolean {
        return !this.dead && ((this.con as {state?: string}).state == 'authenticated' || this.con.authorized)
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        return this.con.query({ sql, infileStreamFactory: (path: string) => fs.createReadStream(path) } as mysql.QueryOptions, values, callback)
    }
    connect(callback: (err: Error) => void): void {
        this.con.connect(callback)
        this.con.on("error", () => {
            this.dead = true;
        })
        this.con.on("end", () => {
            this.dead = true;
        })
    }
    beginTransaction(callback: (err: Error) => void): void {
        this.con.beginTransaction(callback)
    }
    rollback(): void {
        this.con.rollback(() => {})
    }
    commit(): void {
        this.con.commit()
    }
    end(): void {
        this.dead = true;
        this.con.end(() => {})
    }

    bitToBoolean(buf: Buffer): any {
        return buf ? buf[0] == 1 : null;
    }

}