import { Connection, ConnectionConfiguration, Request, ConnectionError } from 'tedious';
import { ColumnMetadata } from 'tedious/lib/token/colmetadata-token-parser';
import { Node } from "../../model/interface/node";
import { EventEmitter } from "events";
import { queryCallback } from "./connection";
import { ConnectionPool } from "./pool/connectionPool";
import format = require('date-format');

/**
 * tedious not support connection queue, so need using pool.
 * http://tediousjs.github.io/tedious/getting-started.html
 */
export class MSSqlConnnection extends ConnectionPool<Connection>{
    private config: ConnectionConfiguration;
    constructor(node: Node) {
        super()
        this.config = {
            server: node.host,
            options: {
                port: node.instanceName?undefined:parseInt(String(node.port)),
                instanceName: node.instanceName,
                useUTC: false,
                trustServerCertificate: true,
                database: node.database || undefined,
                connectTimeout: node.connectTimeout ? parseInt(String(node.connectTimeout || "5000")) : 5000,
                requestTimeout: node.requestTimeout ? parseInt(String(node.requestTimeout || "10000")) : 10000,
                encrypt: node.encrypt
            },
            authentication: {
                type: (node.authType || 'default') as 'default' | 'ntlm' | 'azure-active-directory-password',
                options: {
                    domain: node.domain,
                    userName: node.user,
                    password: node.password,
                }
            }
        };
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        let fields = [];
        let datas = [];

        const event = new EventEmitter()

        this.getConnection(poolConnection => {

            let tempDatas = [];
            let columnCount = 0;
            const connection = poolConnection.actual;

            const isDML = sql.match(/^\s*\b(insert|update|delete)\b/i)
            connection.execSql(new Request(sql, err => {
                const multi = columnCount > 1;
                event.emit("end")
                if (callback) {
                    if (err) {
                        callback(err, null)
                    } else if (isDML) {
                        callback(null, { affectedRows: datas.length })
                    } else {
                        if (multi) datas.push(tempDatas)
                        callback(null, multi ? datas : tempDatas, multi ? fields : fields[0] || [])
                    }
                }
                this.release(poolConnection)
            }).on('columnMetadata', (columns: ColumnMetadata[] | { [key: string]: ColumnMetadata }) => {
                columnCount++;
                let tempFields = []
                
                // Handle both array and object formats
                const columnArray = Array.isArray(columns) ? columns : Object.values(columns);
                columnArray.forEach((column) => {
                    tempFields.push({
                        name: column.colName,
                        orgTable: column.tableName as string
                    })
                });
                fields.push(tempFields)
                if (columnCount > 1) {
                    datas.push(tempDatas)
                    tempDatas = []
                }
            }).on('row', columns => {
                let temp = {};
                columns.forEach((column) => {
                    temp[column.metadata.colName] = column.value
                    if (column.value instanceof Date) {
                        temp[column.metadata.colName] = format("yyyy-MM-dd hh:mm:ss", column.value)
                    }
                    if (this.dumpMode) {
                        temp[column.metadata.colName] = `'${temp[column.metadata.colName]}'`
                    }
                });
                if (!callback) {
                    event.emit("result", temp)
                    return;
                }
                tempDatas.push(temp)
            }))

        })
        return event;
    }
    connect(callback: (err: Error) => void): void {
        try {
            const con = new Connection(this.config)
            con.on("connect", err => {
                callback(err)
                if (!err) {
                    this.fill()
                }
            }).on("error", err => {
                callback(err)
            })
        } catch (error) {
            callback(error)
        }
    }

    protected newConnection(callback: (err: Error, connection: Connection) => void): void {
        const connection = new Connection(this.config)
        connection.on("connect", err => {
            callback(err, connection)
        })
    }
    async beginTransaction(callback: (err: Error) => void) {
        const connection = await this.getConnection();
        connection.actual.beginTransaction((err) => {
            callback(err)
            this.release(connection)
        })
    }
    async rollback() {
        const connection = await this.getConnection();
        connection.actual.rollbackTransaction(() => {
            this.release(connection)
        })
    }
    async commit() {
        const connection = await this.getConnection();
        connection.actual.commitTransaction(() => {
            this.release(connection)
        })
    }
}