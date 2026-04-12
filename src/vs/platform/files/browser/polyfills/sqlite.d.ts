export interface StatementSync {
    run(..._params: unknown[]): object;
    get(..._params: unknown[]): unknown;
    all(..._params: unknown[]): unknown[];
    expandedSQL(): string;
    sourceSQL(): string;
}
interface StatementSyncConstructor {
    new (): StatementSync;
    (this: any): void;
    prototype: any;
}
export declare const StatementSync: StatementSyncConstructor;
export interface DatabaseSync {
    close(): void;
    exec(_sql: string): void;
    prepare(_sql: string): StatementSync;
    open(): void;
}
interface DatabaseSyncConstructor {
    new (_location: string, _options?: object): DatabaseSync;
    (this: any, _location: string, _options?: object): void;
    prototype: any;
}
export declare const DatabaseSync: DatabaseSyncConstructor;
declare const _default: {
    DatabaseSync: DatabaseSyncConstructor;
    StatementSync: StatementSyncConstructor;
};
export default _default;
