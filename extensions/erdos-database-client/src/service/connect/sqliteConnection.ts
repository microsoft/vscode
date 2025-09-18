import { Node } from "../../model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";
import SQLite from "./sqlite";

export class SqliteConnection extends IConnection {
    private sqlite: SQLite;
    private conneted: boolean;
    constructor(node: Node) {
        super()
        this.sqlite = new SQLite(node.dbPath);
    }
    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        const event = new EventEmitter()
        this.sqlite.query(sql + ";").then(res => {
            if (Array.isArray(res)) {
                callback(null, res)
            } else if (callback) {
                callback(null, res.rows, res.fields)
            } else {
                for (let i = 1; i <= res.rows.length; i++) {
                    const row = res.rows[i - 1];
                    event.emit("result", this.convertToDump(row), res.rows.length == i)
                }
            }
        }).catch(err => {
            if (callback) callback(err)
            event.emit("error", err.message)
        })
        return event;
    }
    connect(callback: (err: Error) => void): void {
        if(!this.sqlite.dbPath){
            callback(new Error("Sqlite db path cannot be null!"))
            return;
        }
        callback(null)
        this.conneted = true;
    }
    beginTransaction(callback: (err: Error) => void): void {
        callback(null)
    }
    rollback(): void {
    }
    commit(): void {
    }
    end(): void {
        // this.sqlite.close()
    }
    isAlive(): boolean {
        return this.conneted;
    }

}