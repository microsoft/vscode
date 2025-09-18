interface SchemaDumpOptions {
    /**
     * True to include engine values in schema, false otherwise.
     * Defaults to true.
     */
    engine?: boolean;
    /**
     * Options for table dumps
     */
    table?: {
        /**
         * Guard create table calls with an "IF NOT EXIST"
         * Defaults to true.
         */
        ifNotExist?: boolean;
        /**
         * Drop tables before creation (overrides `ifNotExist`).
         * Defaults to false.
         */
        dropIfExist?: boolean;
    };
    view?: {
        /**
         * Uses `CREATE OR REPLACE` to define views.
         * Defaults to true.
         */
        createOrReplace?: boolean;
        definer?: boolean;
        /**
         * Include the `ALGORITHM = {UNDEFINED | MERGE | TEMPTABLE}` in the view definition or not
         * Defaults to false.
         */
        algorithm?: boolean;
        /**
         * Incldue the `SQL SECURITY {DEFINER | INVOKER}` in the view definition or not
         * Defaults to false.
         */
        sqlSecurity?: boolean;
    };
}

interface TriggerDumpOptions {
    /**
     * Drop triggers before creation.
     * Defaults to false.
     */
    dropIfExist?: boolean;
    definer?: boolean;
}

interface FunctionDumpOptions {
    /**
     * Drop function before creation.
     * Defaults to false.
     */
    dropIfExist?: boolean;
    definer?: boolean;
}

interface ProcedureDumpOptions {
    /**
     * Drop procedure before creation.
     * Defaults to false.
     */
    dropIfExist?: boolean;
    definer?: boolean;
}

interface DataDumpOptions {
    /**
     * Use a read lock during the data dump (see: https://dev.mysql.com/doc/refman/5.7/en/replication-solutions-backups-read-only.html)
     * Defaults to false.
     */
    lockTables?: boolean;
    /**
     * Maximum number of rows to include in each multi-line insert statement
     * Defaults to 1 (i.e. new statement per row).
     */
    maxRowsPerInsertStatement?: number;
    /**
     * A map of tables to additional where strings to add.
     * Use this to limit the number of data that is dumped.
     * Defaults to no limits
     */
    where?: {
        [k: string]: string;
    };
}

interface DumpOptions {
    /**
     * The list of tables that you want to dump.
     * Defaults to all tables (signalled by passing an empty array).
     */
    tables?: Array<string>;
    viewList?: Array<string>;
    procedureList?: Array<string>;
    functionList?: Array<string>;
    triggerList?: Array<string>;
    /**
     * Dump file with database
     */
    withDatabase?: boolean;
    /**
     * Explicitly set to false to not include the schema in the dump.
     * Defaults to including the schema.
     */
    schema?: false | SchemaDumpOptions;
    /**
     * Explicitly set to false to not include data in the dump.
     * Defaults to including the data.
     */
    data?: false | DataDumpOptions;
    /**
     * Explicitly set to false to not include triggers in the dump.
     * Defaults to including the triggers.
     */
    trigger?: false | TriggerDumpOptions;
    /**
     * Explicitly set to false to not include procedures in the dump.
     * Defaults to including the procedures.
     */
    procedure?: false | ProcedureDumpOptions;
    
    /**
     * Explicitly set to false to not include function in the dump.
     * Defaults to including the function.
     */
    function?: null | FunctionDumpOptions;
}

interface Options {
    /**
     * Dump configuration options
     */
    dump?: DumpOptions;
    /**
     * Set to a path to dump to a file.
     * Exclude to just return the string.
     */
    dumpToFile?: string | null;
}

// Recursively requires all properties on an object
type RequiredRecursive<T> = {
    [TK in keyof T]-?: Exclude<T[TK], undefined> extends (
        | string
        | number
        | boolean
        | Array<string>
        | Array<number>
        | Array<boolean>)
    ? T[TK]
    : RequiredRecursive<T[TK]>
};

interface CompletedOptions {
    dump: RequiredRecursive<DumpOptions>;
    dumpToFile: string | null;
}

export {
    CompletedOptions,
    DataDumpOptions,
    DumpOptions,
    Options,
    SchemaDumpOptions,
    TriggerDumpOptions,
    ProcedureDumpOptions,
    FunctionDumpOptions
};
