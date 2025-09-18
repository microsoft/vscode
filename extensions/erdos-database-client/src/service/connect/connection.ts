import { EventEmitter } from "events";
import { FieldInfo } from "../../common/typeDef";
import * as sqlstring from 'sqlstring';

export abstract class IConnection {
    public dumpMode: boolean = false;
    public dead: boolean = false;
    abstract query(sql: string, callback?: queryCallback): void | EventEmitter;
    abstract query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    abstract connect(callback: (err: Error) => void): void;
    abstract beginTransaction(callback: (err: Error) => void): void;
    abstract rollback(): void;
    abstract commit(): void;
    abstract end(): void;
    abstract isAlive(): boolean;
    convertToDump(row: any): any {
        for (const key in row) {
            const element = row[key];
            if (!element) {
                row[key] = 'NULL'
            } else {
                row[key] = sqlstring.escape(element)
            }
        }
        return row;
    }
}


/**
 * fieldInfo, need name/orgTable
 */
export type queryCallback = (err: Error | null, results?: any, fields?: FieldInfo[], total?: number) => void;

export interface QueryFunction {

    (options: string, callback?: queryCallback);

    (options: string, values: any, callback?: queryCallback);
}


