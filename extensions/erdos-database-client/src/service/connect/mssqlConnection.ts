import * as sql from 'mssql';
import { Node } from "../../model/interface/node";
import { EventEmitter } from "events";
import { queryCallback } from "./connection";
import { ConnectionPool } from "./pool/connectionPool";
import format = require('date-format');

/**
 * SQL Server connection using mssql package (wrapper around tedious)
 * This resolves connection hanging issues with direct tedious usage
 */
export class MSSqlConnnection extends ConnectionPool<sql.ConnectionPool>{
    private config: sql.config;
    private pool: sql.ConnectionPool | null = null;
    
    constructor(node: Node) {
        super()
        this.config = {
            user: node.user,
            password: node.password,
            server: node.host,
            port: node.options?.instanceName ? undefined : parseInt(String(node.port)),
            database: node.database || undefined,
            options: {
                port: node.options?.instanceName?undefined:parseInt(String(node.port)),
                instanceName: node.options?.instanceName,
                useUTC: false,
                trustServerCertificate: true,
                database: node.database || undefined,
                connectTimeout: node.options?.connectTimeout ? parseInt(String(node.options.connectTimeout || "5000")) : 5000,
                requestTimeout: node.options?.requestTimeout ? parseInt(String(node.options.requestTimeout || "10000")) : 10000,
                encrypt: node.options?.encrypt
            },
            authentication: {
                type: (node.options?.authType || 'default') as 'default' | 'ntlm' | 'azure-active-directory-password',
                options: {
                    domain: node.options?.domain,
                    userName: node.user,
                    password: node.password,
                }
            }
        };
        
        // Add domain authentication if specified
        if (node.options?.domain) {
            this.config.domain = node.options.domain;
        }
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }

        const event = new EventEmitter();

        this.getConnection(async (poolConnection) => {
            try {
                const pool = poolConnection.actual;
                const request = pool.request();
                
                const isDML = sql.match(/^\s*\b(insert|update|delete)\b/i);
                const result = await request.query(sql);
                
                if (callback) {
                    if (isDML) {
                        callback(null, { affectedRows: result.rowsAffected[0] || 0 });
                    } else {
                        // Convert mssql result format to match expected format
                        // MSSQL library always provides column metadata in result.recordset.columns
                        const fields = Object.keys(result.recordset.columns).map(key => ({
                            name: key,
                            orgTable: result.recordset.columns[key].table || ''
                        }));
                        
                        // Format dates and handle dump mode
                        const formattedRows = result.recordset.map(row => {
                            const temp = {};
                            for (const [key, value] of Object.entries(row)) {
                                temp[key] = value instanceof Date ? format("yyyy-MM-dd hh:mm:ss", value) : value;
                                if (this.dumpMode && temp[key] !== null && temp[key] !== undefined) {
                                    temp[key] = `'${temp[key]}'`;
                                }
                            }
                            return temp;
                        });
                        
                        callback(null, formattedRows, fields);
                    }
                } else {
                    // For streaming mode, emit results
                    result.recordset.forEach(row => {
                        const temp = {};
                        for (const [key, value] of Object.entries(row)) {
                            temp[key] = value instanceof Date ? format("yyyy-MM-dd hh:mm:ss", value) : value;
                            if (this.dumpMode && temp[key] !== null && temp[key] !== undefined) {
                                temp[key] = `'${temp[key]}'`;
                            }
                        }
                        event.emit("result", temp);
                    });
                }
                
                event.emit("end");
                this.release(poolConnection);
            } catch (error) {
                if (callback) {
                    callback(error);
                } else {
                    event.emit("error", error);
                }
                this.release(poolConnection);
            }
        });

        return event;
    }
    connect(callback: (err: Error) => void): void {
        this.pool = new sql.ConnectionPool(this.config);
        this.pool.connect().then(() => {
            callback(null);
            this.fill();
        }).catch(err => {
            callback(err);
        });
    }

    protected newConnection(callback: (err: Error, connection: sql.ConnectionPool) => void): void {
        const pool = new sql.ConnectionPool(this.config);
        pool.connect().then(() => {
            callback(null, pool);
        }).catch(err => {
            callback(err, null);
        });
    }

    async beginTransaction(callback: (err: Error) => void) {
        const connection = await this.getConnection();
        const transaction = new sql.Transaction(connection.actual);
        await transaction.begin();
        callback(null);
        this.release(connection);
    }

    async rollback() {
        const connection = await this.getConnection();
        const transaction = new sql.Transaction(connection.actual);
        await transaction.rollback();
        this.release(connection);
    }

    async commit() {
        const connection = await this.getConnection();
        const transaction = new sql.Transaction(connection.actual);
        await transaction.commit();
        this.release(connection);
    }
}