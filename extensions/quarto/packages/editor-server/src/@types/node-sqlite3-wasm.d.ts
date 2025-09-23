
declare module 'node-sqlite3-wasm' {
  export class Database {
    constructor(filename, { fileMustExist = false } = {}) : Database;
    get isOpen() : boolean;
    get inTransaction() : boolean;
    close() : void;
    exec(sql: string) : void;
    prepare(sql: string): void;
    run(sql: string, values: Record<string,unknown>) : void; 
    all(sql: string, values?: Record<string,unknown>, options?: { expand: boolean }) : unknown;
  }
}