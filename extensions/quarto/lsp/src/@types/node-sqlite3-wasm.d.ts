declare module 'node-sqlite3-wasm' {
  export interface Database {
    close(): void;
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(pragma: string): any;
    all(sql: string, params?: Record<string, any>): any[];
  }
  
  export interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    finalize(): void;
  }
  
  export class Database {
    constructor(path: string, options?: any);
    close(): void;
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(pragma: string): any;
    all(sql: string, params?: Record<string, any>): any[];
  }
  
  export function verbose(): any;
  export default function(path: string, options?: any): Database;
}