import { ExasolDriver } from '@exasol/exasol-driver-ts';
import { Node } from "../../model/interface/node";
import { IConnection } from './connection';
import { Console } from "../../common/console";
import { EventEmitter } from 'events';
import { ConnectionNode } from "../../model/database/connectionNode";
import { DatabaseType } from "../../common/constants";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { CommandKey } from "../../model/interface/node";
import { ConnectionManager } from "../../service/connectionManager";
import { GlobalState } from "../../common/state";
import { CacheKey } from "../../common/constants";
import { WebSocket } from 'ws';
import { DatabaseCache } from "../../service/common/databaseCache";
import { SchemaNode } from "../../model/database/schemaNode";
import * as vscode from 'vscode';

type queryCallback = (error: Error | null, rows?: any[], fields?: any[]) => void;

export class ExasolConnection extends IConnection {
    private driver: ExasolDriver;
    protected node: Node;
    private connected: boolean;
    private websocket: WebSocket | null = null;

    constructor(node: Node) {
        super();
        this.node = node;
        this.node.host = node.host || '127.0.0.1';
        this.node.port = node.port || 8563;
        this.node.user = node.user || 'sys';
        this.node.password = node.password || '';
        this.connected = false;
    }

    public connect(callback: (err: Error) => void): void {
        if (this.connected) {
            callback(null);
            return;
        }

        Console.log('[Exasol] Attempting to connect to: ' + this.node.host);
        
        const websocketFactory = (url: string) => {
            if (this.websocket) {
                return this.websocket;
            }

            this.websocket = new WebSocket(url);
            this.websocket.on('error', () => this.websocket = null);
            this.websocket.on('close', () => {
                this.websocket = null;
                this.connected = false;
            });
            
            return this.websocket;
        };

        this.driver = new ExasolDriver(
            websocketFactory,
            {
                host: String(this.node.host.trim()),
                port: Number(this.node.port),
                user: String(this.node.user),
                password: String(this.node.password),
                clientName: 'VSCode Database Client',
                clientVersion: '3.9.8',
                autocommit: true,
                encryption: true,
                compression: false,
                fetchSize: 1000,
                resultSetMaxRows: 100000
            }
        );

        this.driver.connect()
            .then(() => {
                this.connected = true;
                callback(null);
            })
            .catch(error => {
                this.connected = false;
                callback(error);
            });
    }

    public query(sql: string, callback?: queryCallback): void | EventEmitter;
    public query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    public query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }

        const event = new EventEmitter();
        
        const executeQuery = () => {
            try {
                this.driver.query(sql).then(result => {
                    const rows = result.getRows() || [];
                    const columns = result.getColumns() || [];
                    
                    Console.log('[Exasol] Query result:');
                    Console.log('[Exasol] Columns: ' + JSON.stringify(columns, null, 2));
                    Console.log('[Exasol] Row count: ' + rows.length);
                    Console.log('[Exasol] Rows: ' + JSON.stringify(rows, null, 2));

                    if (!callback) {
                        if (rows.length === 0) {
                            event.emit("end");
                        }
                        for (let i = 1; i <= rows.length; i++) {
                            const row = rows[i - 1];
                            event.emit("result", this.convertToDump(row), rows.length === i);
                        }
                    } else {
                        // Convert results to standard format
                        const fields = columns.map(col => ({
                            name: col.name,
                            dataType: col.dataType
                        }));
                        
                        // If it's a non-SELECT statement
                        if (!columns.length) {
                            callback(null, { affectedRows: rows.length });
                        } else {
                            // Convert row data to object format and handle special schema queries
                            const formattedRows = rows.map((row, rowIndex) => {
                                const obj: { [key: string]: any } = {};
                                // Handle array format row data
                                if (Array.isArray(row)) {
                                    columns.forEach((col, colIndex) => {
                                        const value = row[colIndex];
                                        if (col.name === 'SCHEMA_NAME') {
                                            obj.schema = value;
                                            obj.Database = value;
                                        } else if (col.name === 'TABLE_NAME') {
                                            obj.name = value;
                                        } else if (col.name === 'COLUMN_NAME') {
                                            obj.name = value;
                                        } else if (col.name === 'COLUMN_TYPE') {
                                            obj.type = value;
                                            obj.simpleType = value;
                                        } else if (col.name === 'IS_NULLABLE') {
                                            obj.nullable = value;
                                        } else if (col.name === 'COLUMN_DEFAULT') {
                                            obj.defaultValue = value;
                                        } else if (col.name === 'name') {
                                            obj.name = value;
                                        } else if (col.name === 'type') {
                                            obj.type = value;
                                            obj.simpleType = value;
                                        } else {
                                            obj[col.name] = value;
                                        }
                                    });
                                } else {
                                    // Handle object format row data
                                    if (row.SCHEMA_NAME) {
                                        obj.schema = row.SCHEMA_NAME;
                                        obj.Database = row.SCHEMA_NAME;
                                    }
                                    if (row.TABLE_NAME) {
                                        obj.name = row.TABLE_NAME;
                                    }
                                    if (row.COLUMN_NAME) {
                                        obj.name = row.COLUMN_NAME;
                                    }
                                    if (row.COLUMN_TYPE) {
                                        obj.type = row.COLUMN_TYPE;
                                        obj.simpleType = row.COLUMN_TYPE;
                                    }
                                    if (row.IS_NULLABLE) {
                                        obj.nullable = row.IS_NULLABLE;
                                    }
                                    if (row.COLUMN_DEFAULT) {
                                        obj.defaultValue = row.COLUMN_DEFAULT;
                                    }
                                    if (row.name) {
                                        obj.name = row.name;
                                    }
                                    if (row.type) {
                                        obj.type = row.type;
                                        obj.simpleType = row.type;
                                    }
                                    Object.keys(row).forEach(key => {
                                        if (!['name', 'type'].includes(key)) {
                                            obj[key] = row[key];
                                        }
                                    });
                                }
                                return obj;
                            });
                            
                            // If querying schema list, ensure each result has schema field
                            if (sql.includes('SYS.EXA_SCHEMAS')) {
                                Console.log('[Exasol] Schema list: ' + JSON.stringify(formattedRows));
                            }
                            
                            callback(null, formattedRows, fields);
                        }
                    }
                }).catch(err => {
                    if (callback) {
                        callback(err);
                    }
                    event.emit("error", err.message);
                });
            } catch (err) {
                if (callback) {
                    callback(err);
                }
                event.emit("error", err.message);
            }
        };

        if (!this.connected) {
            this.connect((err) => {
                if (err) {
                    if (callback) {
                        callback(err);
                    }
                    event.emit("error", err.message);
                } else {
                    executeQuery();
                }
            });
        } else {
            executeQuery();
        }

        return event;
    }

    public close(callback?: (err: Error) => void): void {
        if (this.driver) {
            this.driver.close()
                .then(() => {
                    this.connected = false;
                    if (this.websocket) {
                        this.websocket.close();
                        this.websocket = null;
                    }
                    if (callback) callback(null);
                })
                .catch(error => {
                    if (callback) callback(error);
                });
        } else if (callback) {
            callback(null);
        }
    }

    public end(callback?: (err: Error) => void): void {
        this.close(callback);
    }

    public beginTransaction(callback?: (err: Error) => void): void {
        this.query('START TRANSACTION', callback);
    }

    public commit(callback?: (err: Error) => void): void {
        this.query('COMMIT', callback);
    }

    public rollback(callback?: (err: Error) => void): void {
        this.query('ROLLBACK', callback);
    }

    public isAlive(): boolean {
        return this.connected;
    }
} 