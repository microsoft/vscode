/* eslint-disable import/no-duplicates, import/no-unresolved, import/no-extraneous-dependencies */
declare module 'mysql2' {

    export interface IQueryReturn<T> {
        0: T[];
        1: FieldInfo[];

        [Symbol.iterator](): T[] | FieldInfo[];
        [index: number]: T[] | FieldInfo[];
    }

    // Type definitions for mysql 2.15
    // Project: https://github.com/mysqljs/mysql
    // Definitions by:  William Johnston <https://github.com/wjohnsto>
    //                     Kacper Polak <https://github.com/kacepe>
    //                     Krittanan Pingclasai <https://github.com/kpping>
    //                     James Munro <https://github.com/jdmunro>
    //                     Sanders DeNardi <https://github.com/sedenardi>
    // Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
    // TypeScript Version: 2.1

    /// <reference types="node" />

    import stream = require('stream');
    import tls = require('tls');

    export interface EscapeFunctions {
        /**
         * Escape an untrusted string to be used as a SQL value. Use this on user
         * provided data.
         * @param value Value to escape
         * @param stringifyObjects If true, don't convert objects into SQL lists
         * @param timeZone Convert dates from UTC to the given timezone.
         */
        escape(value: any, stringifyObjects?: boolean, timeZone?: string): string;

        /**
         * Escape an untrusted string to be used as a SQL identifier (database,
         * table, or column name). Use this on user provided data.
         * @param value Value to escape.
         * @param forbidQualified Don't allow qualified identifiers (eg escape '.')
         */
        escapeId(value: string, forbidQualified?: boolean): string;

        /**
         * Safely format a SQL query containing multiple untrusted values.
         * @param sql Query, with insertion points specified with ? (for values) or
         * ?? (for identifiers)
         * @param values Array of objects to insert.
         * @param stringifyObjects If true, don't convert objects into SQL lists
         * @param timeZone Convert dates from UTC to the given timezone.
         */
        format(sql: string, values: any[], stringifyObjects?: boolean, timeZone?: string): string;
    }

    /**
     * Escape an untrusted string to be used as a SQL value. Use this on user
     * provided data.
     * @param value Value to escape
     * @param stringifyObjects If true, don't convert objects into SQL lists
     * @param timeZone Convert dates from UTC to the given timezone.
     */
    export function escape(value: any, stringifyObjects?: boolean, timeZone?: string): string;

    /**
     * Escape an untrusted string to be used as a SQL identifier (database,
     * table, or column name). Use this on user provided data.
     * @param value Value to escape.
     * @param forbidQualified Don't allow qualified identifiers (eg escape '.')
     */
    export function escapeId(value: string, forbidQualified?: boolean): string;

    /**
     * Safely format a SQL query containing multiple untrusted values.
     * @param sql Query, with insertion points specified with ? (for values) or
     * ?? (for identifiers)
     * @param values Array of objects to insert.
     * @param stringifyObjects If true, don't convert objects into SQL lists
     * @param timeZone Convert dates from UTC to the given timezone.
     */
    export function format(sql: string, values: any[], stringifyObjects?: boolean, timeZone?: string): string;

    export function createConnection(connectionUri: string | ConnectionConfig): Connection;

    export function createPool(config: PoolConfig | string): Pool;

    export function createPoolCluster(config?: PoolClusterConfig): PoolCluster;

    /**
     * Create a string that will be inserted unescaped with format(), escape().
     * Note: the value will still be escaped if used as an identifier (??) by
     * format().
     * @param sql
     */
    export function raw(sql: string): {
        toSqlString: () => string
    };

    export interface Connection extends EscapeFunctions {
        config: ConnectionConfig;

        state: 'connected' | 'authenticated' | 'disconnected' | 'protocol_error' | string;

        authorized: boolean;

        threadId: number | null;

        createQuery: QueryFunction;

        connect(callback?: (err: MysqlError, ...args: any[]) => void): void;

        connect(options: any, callback?: (err: MysqlError, ...args: any[]) => void): void;

        changeUser(options: ConnectionOptions, callback?: (err: MysqlError) => void): void;
        changeUser(callback: (err: MysqlError) => void): void;

        beginTransaction(options?: QueryOptions, callback?: (err: MysqlError) => void): void;

        beginTransaction(callback: (err: MysqlError) => void): void;

        commit(options?: QueryOptions, callback?: (err: MysqlError) => void): void;
        commit(callback: (err: MysqlError) => void): void;

        rollback(options?: QueryOptions, callback?: (err: MysqlError) => void): void;
        rollback(callback: (err: MysqlError) => void): void;

        query: QueryFunction;

        ping(options?: QueryOptions, callback?: (err: MysqlError) => void): void;
        ping(callback: (err: MysqlError) => void): void;

        statistics(options?: QueryOptions, callback?: (err: MysqlError) => void): void;
        statistics(callback: (err: MysqlError) => void): void;

        /**
         * Close the connection. Any queued data (eg queries) will be sent first. If
         * there are any fatal errors, the connection will be immediately closed.
         * @param callback Handler for any fatal error
         */
        end(callback?: (err?: MysqlError) => void): void;
        end(options: any, callback: (err?: MysqlError) => void): void;

        /**
         * Close the connection immediately, without waiting for any queued data (eg
         * queries) to be sent. No further events or callbacks will be triggered.
         */
        destroy(): void;

        /**
         * Pause the connection. No more 'result' events will fire until resume() is
         * called.
         */
        pause(): void;

        /**
         * Resume the connection.
         */
        resume(): void;

        on(ev: 'drain' | 'connect', callback: () => void): Connection;

        /**
         * Set handler to be run when the connection is closed.
         */
        on(ev: 'end', callback: (err?: MysqlError) => void): Connection;

        on(ev: 'fields', callback: (fields: any[]) => void): Connection;

        /**
         * Set handler to be run when a a fatal error occurs.
         */
        on(ev: 'error', callback: (err: MysqlError) => void): Connection;

        /**
         * Set handler to be run when a callback has been queued to wait for an
         * available connection.
         */
        // tslint:disable-next-line:unified-signatures
        on(ev: 'enqueue', callback: (err?: MysqlError) => void): Connection;

        /**
         * Set handler to be run on a certain event.
         */
        on(ev: string, callback: (...args: any[]) => void): Connection;
    }

    export interface PoolConnection extends Connection {
        release(): void;

        /**
         * Close the connection. Any queued data (eg queries) will be sent first. If
         * there are any fatal errors, the connection will be immediately closed.
         * @param callback Handler for any fatal error
         */
        end(): void;

        /**
         * Close the connection immediately, without waiting for any queued data (eg
         * queries) to be sent. No further events or callbacks will be triggered.
         */
        destroy(): void;
    }

    export interface Pool extends EscapeFunctions {
        config: PoolActualConfig;

        getConnection(callback: (err: MysqlError, connection: PoolConnection) => void): void;

        acquireConnection(
            connection: PoolConnection,
            callback: (err: MysqlError, connection: PoolConnection) => void,
        ): void;

        releaseConnection(connection: PoolConnection): void;

        /**
         * Close the connection. Any queued data (eg queries) will be sent first. If
         * there are any fatal errors, the connection will be immediately closed.
         * @param callback Handler for any fatal error
         */
        end(callback?: (err: MysqlError) => void): void;

        query: QueryFunction;

        /**
         * Set handler to be run when a new connection is made within the pool.
         */
        on(ev: 'connection', callback: (connection: PoolConnection) => void): Pool;

        /**
         * Set handler to be run when a connection is acquired from the pool. This
         * is called after all acquiring activity has been performed on the
         * connection, right before the connection is handed to the callback of the
         * acquiring code.
         */
        // tslint:disable-next-line:unified-signatures
        on(ev: 'acquire', callback: (connection: PoolConnection) => void): Pool;

        /**
         * Set handler to be run when a connection is released back to the pool.
         * This is called after all release activity has been performed on the
         * connection, so the connection will be listed as free at the time of the
         * event.
         */
        // tslint:disable-next-line:unified-signatures
        on(ev: 'release', callback: (connection: PoolConnection) => void): Pool;

        /**
         * Set handler to be run when a a fatal error occurs.
         */
        on(ev: 'error', callback: (err: MysqlError) => void): Pool;

        /**
         * Set handler to be run when a callback has been queued to wait for an
         * available connection.
         */
        on(ev: 'enqueue', callback: (err?: MysqlError) => void): Pool;

        /**
         * Set handler to be run on a certain event.
         */
        on(ev: string, callback: (...args: any[]) => void): Pool;
    }

    export interface PoolCluster {
        config: PoolClusterConfig;

        add(config: PoolConfig): void;

        add(id: string, config: PoolConfig): void;

        /**
         * Close the connection. Any queued data (eg queries) will be sent first. If
         * there are any fatal errors, the connection will be immediately closed.
         * @param callback Handler for any fatal error
         */
        end(callback?: (err: MysqlError) => void): void;

        of(pattern: string, selector?: string): Pool;
        of(pattern: undefined | null | false, selector: string): Pool;

        /**
         * remove all pools which match pattern
         */
        remove(pattern: string): void;

        getConnection(callback: (err: MysqlError, connection: PoolConnection) => void): void;

        getConnection(pattern: string, callback: (err: MysqlError, connection: PoolConnection) => void): void;

        getConnection(
            pattern: string,
            selector: string,
            callback: (err: MysqlError, connection: PoolConnection) => void,
        ): void;

        /**
         * Set handler to be run on a certain event.
         */
        on(ev: string, callback: (...args: any[]) => void): PoolCluster;

        /**
         * Set handler to be run when a node is removed or goes offline.
         */
        on(ev: 'remove' | 'offline', callback: (nodeId: string) => void): PoolCluster;
    }

    // related to Query
    export type packetCallback = (packet: any) => void;

    export interface Query {
        /**
         * Template query
         */
        sql: string;

        /**
         * Values for template query
         */
        values?: string[];

        /**
         * Default true
         */
        typeCast?: TypeCast;

        /**
         * Default false
         */
        nestedTables: boolean;

        /**
         * Emits a query packet to start the query
         */
        start(): void;

        /**
         * Determines the packet class to use given the first byte of the packet.
         *
         * @param byte The first byte of the packet
         * @param parser The packet parser
         */
        determinePacket(byte: number, parser: any): any;

        OkPacket: packetCallback;
        ErrorPacket: packetCallback;
        ResultSetHeaderPacket: packetCallback;
        FieldPacket: packetCallback;
        EofPacket: packetCallback;

        RowDataPacket(packet: any, parser: any, connection: Connection): void;

        /**
         * Creates a Readable stream with the given options
         *
         * @param options The options for the stream. (see readable-stream package)
         */
        stream(options?: stream.ReadableOptions): stream.Readable;

        on(ev: string, callback: (...args: any[]) => void): Query;

        on(ev: 'result', callback: (row: any, index: number) => void): Query;

        on(ev: 'error', callback: (err: MysqlError) => void): Query;

        on(ev: 'fields', callback: (fields: FieldInfo[], index: number) => void): Query;

        on(ev: 'packet', callback: (packet: any) => void): Query;

        on(ev: 'end', callback: () => void): Query;
    }

    export interface GeometryType extends Array<{ x: number; y: number } | GeometryType> {
        x: number;
        y: number;
    }

    export type TypeCast =
        | boolean
        | ((
            field: UntypedFieldInfo & {
                type: string;
                length: number;
                string(): string;
                buffer(): Buffer;
                geometry(): null | GeometryType;
            },
            next: () => void,
        ) => any);

    export type queryCallback = (err: MysqlError | null, results?: any, fields?: FieldInfo[]) => void;

    // values can be non [], see custom format (https://github.com/mysqljs/mysql#custom-format)
    export interface QueryFunction {
        (query: Query): Query;

        (options: string | QueryOptions, callback?: queryCallback): Query;

        (options: string | QueryOptions, values: any, callback?: queryCallback): Query;
    }

    export interface QueryOptions {
        /**
         * The SQL for the query
         */
        sql: string;

        /**
         * Values for template query
         */
        values?: any;

        /**
         * Every operation takes an optional inactivity timeout option. This allows you to specify appropriate timeouts for
         * operations. It is important to note that these timeouts are not part of the MySQL protocol, and rather timeout
         * operations through the client. This means that when a timeout is reached, the connection it occurred on will be
         * destroyed and no further operations can be performed.
         */
        timeout?: number;

        /**
         * Either a boolean or string. If true, tables will be nested objects. If string (e.g. '_'), tables will be
         * nested as tableName_fieldName
         */
        nestTables?: any;

        /**
         * Determines if column values should be converted to native JavaScript types. It is not recommended (and may go away / change in the future)
         * to disable type casting, but you can currently do so on either the connection or query level. (Default: true)
         *
         * You can also specify a function (field: any, next: () => void) => {} to do the type casting yourself.
         *
         * WARNING: YOU MUST INVOKE the parser using one of these three field functions in your custom typeCast callback. They can only be called once.
         *
         * field.string()
         * field.buffer()
         * field.geometry()
         *
         * are aliases for
         *
         * parser.parseLengthCodedString()
         * parser.parseLengthCodedBuffer()
         * parser.parseGeometryValue()
         *
         * You can find which field function you need to use by looking at: RowDataPacket.prototype._typeCast
         */
        typeCast?: TypeCast;
    }

    export interface ConnectionOptions {
        /**
         * The MySQL user to authenticate as
         */
        user?: string;

        /**
         * The password of that MySQL user
         */
        password?: string;

        /**
         * Name of the database to use for this connection
         */
        database?: string;

        /**
         * The charset for the connection. This is called "collation" in the SQL-level of MySQL (like utf8_general_ci).
         * If a SQL-level charset is specified (like utf8mb4) then the default collation for that charset is used.
         * (Default: 'UTF8_GENERAL_CI')
         */
        charset?: string;

        /**
         * Number of milliseconds
         */
        timeout?: number;
    }

    export interface ConnectionConfig extends ConnectionOptions {
        /**
         * The hostname of the database you are connecting to. (Default: localhost)
         */
        host?: string;

        /**
         * The port number to connect to. (Default: 3306)
         */
        port?: number;

        /**
         * The source IP address to use for TCP connection
         */
        localAddress?: string;

        /**
         * The path to a unix domain socket to connect to. When used host and port are ignored
         */
        socketPath?: string;

        /**
         * The timezone used to store local dates. (Default: 'local')
         */
        timezone?: string;

        /**
         * The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: 10 seconds)
         */
        connectTimeout?: number;

        /**
         * Stringify objects instead of converting to values. (Default: 'false')
         */
        stringifyObjects?: boolean;

        /**
         * Allow connecting to MySQL instances that ask for the old (insecure) authentication method. (Default: false)
         */
        insecureAuth?: boolean;

        /**
         * Determines if column values should be converted to native JavaScript types. It is not recommended (and may go away / change in the future)
         * to disable type casting, but you can currently do so on either the connection or query level. (Default: true)
         *
         * You can also specify a function (field: any, next: () => void) => {} to do the type casting yourself.
         *
         * WARNING: YOU MUST INVOKE the parser using one of these three field functions in your custom typeCast callback. They can only be called once.
         *
         * field.string()
         * field.buffer()
         * field.geometry()
         *
         * are aliases for
         *
         * parser.parseLengthCodedString()
         * parser.parseLengthCodedBuffer()
         * parser.parseGeometryValue()
         *
         * You can find which field function you need to use by looking at: RowDataPacket.prototype._typeCast
         */
        typeCast?: TypeCast;

        /**
         * A custom query format function
         */
        queryFormat?(query: string, values: any): string;

        /**
         * When dealing with big numbers (BIGINT and DECIMAL columns) in the database, you should enable this option
         * (Default: false)
         */
        supportBigNumbers?: boolean;

        /**
         * Enabling both supportBigNumbers and bigNumberStrings forces big numbers (BIGINT and DECIMAL columns) to be
         * always returned as JavaScript String objects (Default: false). Enabling supportBigNumbers but leaving
         * bigNumberStrings disabled will return big numbers as String objects only when they cannot be accurately
         * represented with [JavaScript Number objects] (http://ecma262-5.com/ELS5_HTML.htm#Section_8.5)
         * (which happens when they exceed the [-2^53, +2^53] range), otherwise they will be returned as Number objects.
         * This option is ignored if supportBigNumbers is disabled.
         */
        bigNumberStrings?: boolean;

        /**
         * Force date types (TIMESTAMP, DATETIME, DATE) to be returned as strings rather then inflated into JavaScript
         * Date objects. Can be true/false or an array of type names to keep as strings. (Default: false)
         */
        dateStrings?: boolean | Array<'TIMESTAMP' | 'DATETIME' | 'DATE'>;

        /**
         * This will print all incoming and outgoing packets on stdout.
         * You can also restrict debugging to packet types by passing an array of types (strings) to debug;
         *
         * (Default: false)
         */
        debug?: boolean | string[] | Types[];

        /**
         * Generates stack traces on errors to include call site of library entrance ("long stack traces"). Slight
         * performance penalty for most calls. (Default: true)
         */
        trace?: boolean;

        /**
         * Allow multiple mysql statements per query. Be careful with this, it exposes you to SQL injection attacks. (Default: false)
         */
        multipleStatements?: boolean;

        /**
         * List of connection flags to use other than the default ones. It is also possible to blacklist default ones
         */
        flags?: string | string[];

        /**
         * object with ssl parameters or a string containing name of ssl profile
         */
        ssl?: string | (tls.SecureContextOptions & { rejectUnauthorized?: boolean });
    }

    export interface PoolSpecificConfig {
        /**
         * The milliseconds before a timeout occurs during the connection acquisition. This is slightly different from connectTimeout,
         * because acquiring a pool connection does not always involve making a connection. (Default: 10 seconds)
         */
        acquireTimeout?: number;

        /**
         * Determines the pool's action when no connections are available and the limit has been reached. If true, the pool will queue
         * the connection request and call it when one becomes available. If false, the pool will immediately call back with an error.
         * (Default: true)
         */
        waitForConnections?: boolean;

        /**
         * The maximum number of connections to create at once. (Default: 10)
         */
        connectionLimit?: number;

        /**
         * The maximum number of connection requests the pool will queue before returning an error from getConnection. If set to 0, there
         * is no limit to the number of queued connection requests. (Default: 0)
         */
        queueLimit?: number;
    }

    export interface PoolConfig extends PoolSpecificConfig, ConnectionConfig {
    }

    export interface PoolActualConfig extends PoolSpecificConfig {
        connectionConfig: ConnectionConfig;
    }

    export interface PoolClusterConfig {
        /**
         * If true, PoolCluster will attempt to reconnect when connection fails. (Default: true)
         */
        canRetry?: boolean;

        /**
         * If connection fails, node's errorCount increases. When errorCount is greater than removeNodeErrorCount,
         * remove a node in the PoolCluster. (Default: 5)
         */
        removeNodeErrorCount?: number;

        /**
         * If connection fails, specifies the number of milliseconds before another connection attempt will be made.
         * If set to 0, then node will be removed instead and never re-used. (Default: 0)
         */
        restoreNodeTimeout?: number;

        /**
         * The default selector. (Default: RR)
         * RR: Select one alternately. (Round-Robin)
         * RANDOM: Select the node by random function.
         * ORDER: Select the first node available unconditionally.
         */
        defaultSelector?: string;
    }

    export interface MysqlError extends Error {
        /**
         * Either a MySQL server error (e.g. 'ER_ACCESS_DENIED_ERROR'),
         * a node.js error (e.g. 'ECONNREFUSED') or an internal error
         * (e.g. 'PROTOCOL_CONNECTION_LOST').
         */
        code: string;

        /**
         * The error number for the error code
         */
        errno: number;

        /**
         * The sql state marker
         */
        sqlStateMarker?: string;

        /**
         * The sql state
         */
        sqlState?: string;

        /**
         * The field count
         */
        fieldCount?: number;

        /**
         * The stack trace for the error
         */
        stack?: string;

        /**
         * Boolean, indicating if this error is terminal to the connection object.
         */
        fatal: boolean;

        /**
         * SQL of failed query
         */
        sql?: string;

        /**
         * Error message from MySQL
         */
        sqlMessage?: string;
    }

    // Result from an insert, update, or delete statement.
    export interface OkPacket {
        fieldCount: number;
        /**
         * The number of affected rows from an insert, update, or delete statement.
         */
        affectedRows: number;
        /**
         * The insert id after inserting a row into a table with an auto increment primary key.
         */
        insertId: number;
        serverStatus?: number;
        warningCount?: number;
        /**
         * The server result message from an insert, update, or delete statement.
         */
        message: string;
        /**
         * The number of changed rows from an update statement. "changedRows" differs from "affectedRows" in that it does not count updated rows whose values were not changed.
         */
        changedRows: number;
        protocol41: boolean;
    }

    export const enum Types {
        DECIMAL = 0x00, // aka DECIMAL (http://dev.mysql.com/doc/refman/5.0/en/precision-math-decimal-changes.html)
        TINY = 0x01, // aka TINYINT, 1 byte
        SHORT = 0x02, // aka SMALLINT, 2 bytes
        LONG = 0x03, // aka INT, 4 bytes
        FLOAT = 0x04, // aka FLOAT, 4-8 bytes
        DOUBLE = 0x05, // aka DOUBLE, 8 bytes
        NULL = 0x06, // NULL (used for prepared statements, I think)
        TIMESTAMP = 0x07, // aka TIMESTAMP
        LONGLONG = 0x08, // aka BIGINT, 8 bytes
        INT24 = 0x09, // aka MEDIUMINT, 3 bytes
        DATE = 0x0a, // aka DATE
        TIME = 0x0b, // aka TIME
        DATETIME = 0x0c, // aka DATETIME
        YEAR = 0x0d, // aka YEAR, 1 byte (don't ask)
        NEWDATE = 0x0e, // aka ?
        VARCHAR = 0x0f, // aka VARCHAR (?)
        BIT = 0x10, // aka BIT, 1-8 byte
        TIMESTAMP2 = 0x11, // aka TIMESTAMP with fractional seconds
        DATETIME2 = 0x12, // aka DATETIME with fractional seconds
        TIME2 = 0x13, // aka TIME with fractional seconds
        JSON = 0xf5, // aka JSON
        NEWDECIMAL = 0xf6, // aka DECIMAL
        ENUM = 0xf7, // aka ENUM
        SET = 0xf8, // aka SET
        TINY_BLOB = 0xf9, // aka TINYBLOB, TINYTEXT
        MEDIUM_BLOB = 0xfa, // aka MEDIUMBLOB, MEDIUMTEXT
        LONG_BLOB = 0xfb, // aka LONGBLOG, LONGTEXT
        BLOB = 0xfc, // aka BLOB, TEXT
        VAR_STRING = 0xfd, // aka VARCHAR, VARBINARY
        STRING = 0xfe, // aka CHAR, BINARY
        GEOMETRY = 0xff, // aka GEOMETRY
    }

    export interface UntypedFieldInfo {
        catalog: string;
        db: string;
        schema: string;
        table: string;
        orgTable: string;
        name: string;
        orgName: string;
        charsetNr: number;
        length: number;
        flags: number;
        decimals: number;
        default?: string;
        zeroFill: boolean;
        protocol41: boolean;
    }

    export interface FieldInfo extends UntypedFieldInfo {
        type: Types;
    }




    export { TypecastField, IConnectionConfig } from 'mysql2/promise';
}

declare module 'mysql2/promise' {
    import * as mysql from 'mysql2';

    export * from 'mysql2';

    export interface IQueryReturn<T> {
        0: T[];
        1: mysql.FieldInfo[];

        [Symbol.iterator](): T[] | mysql.FieldInfo[];
        [index: number]: T[] | mysql.FieldInfo[];
    }

    export interface IExecuteOptions extends mysql.QueryOptions {
        values: any[];
    }

    export type IPromiseQueryFunction = <T>(
        arg1: string | mysql.QueryOptions,
        values?: any | any[],
    ) => Promise<IQueryReturn<T>>;

    export type IPromiseExecuteFunction = <T>(
        arg1: string | IExecuteOptions,
        values?: any | any[],
    ) => Promise<IQueryReturn<T>>;

    export interface IPromiseConnection {
        connection: mysql.Connection;
        query: IPromiseQueryFunction;
        execute: IPromiseExecuteFunction;

        release(): void;

        end(): Promise<void>;
        end(options: any): Promise<void>;
    }

    export interface IPromisePool extends IPromiseConnection {
        connection: mysql.Connection;

        getConnection(): Promise<IPromiseConnection>;
        query: IPromiseQueryFunction;
        execute: IPromiseExecuteFunction;
    }

    type FieldTypes =
        | 'DECIMAL'
        | 'TINY'
        | 'SHORT'
        | 'LONG'
        | 'FLOAT'
        | 'DOUBLE'
        | 'NULL'
        | 'TIMESTAMP'
        | 'LONGLONG'
        | 'INT24'
        | 'DATE'
        | 'TIME'
        | 'DATETIME'
        | 'YEAR'
        | 'NEWDATE'
        | 'VARCHAR'
        | 'BIT'
        | 'JSON'
        | 'NEWDECIMAL'
        | 'ENUM'
        | 'SET'
        | 'TINY_BLOB'
        | 'MEDIUM_BLOB'
        | 'LONG_BLOB'
        | 'BLOB'
        | 'VAR_STRING'
        | 'STRING'
        | 'GEOMETRY';

    export interface TypecastField {
        buffer(): Buffer;
        string(): string;
        geometry(): any;
        db: string;
        length: number;
        name: string;
        table: string;
        type: FieldTypes;
    }
    export interface IConnectionConfig extends mysql.ConnectionOptions {
        /**
         * The hostname of the database you are connecting to. (Default: localhost)
         */
        host?: string;

        /**
         * The port number to connect to. (Default: 3306)
         */
        port?: number;

        /**
         * The source IP address to use for TCP connection
         */
        localAddress?: string;

        /**
         * The path to a unix domain socket to connect to. When used host and port are ignored
         */
        socketPath?: string;

        /**
         * The timezone used to store local dates. (Default: 'local')
         */
        timezone?: string;

        /**
         * The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: 10 seconds)
         */
        connectTimeout?: number;

        /**
         * Stringify objects instead of converting to values. (Default: 'false')
         */
        stringifyObjects?: boolean;

        /**
         * Allow connecting to MySQL instances that ask for the old (insecure) authentication method. (Default: false)
         */
        insecureAuth?: boolean;

        /**
         * Determines if column values should be converted to native JavaScript types. It is not recommended (and may go away / change in the future)
         * to disable type casting, but you can currently do so on either the connection or query level. (Default: true)
         *
         * You can also specify a function (field: any, next: () => void) => {} to do the type casting yourself.
         *
         * WARNING: YOU MUST INVOKE the parser using one of these three field functions in your custom typeCast callback. They can only be called once.
         *
         * field.string()
         * field.buffer()
         * field.geometry()
         *
         * are aliases for
         *
         * parser.parseLengthCodedString()
         * parser.parseLengthCodedBuffer()
         * parser.parseGeometryValue()
         *
         * You can find which field function you need to use by looking at: RowDataPacket.prototype._typeCast
         */
        typeCast?: (field: TypecastField, next: () => void) => any;

        /**
         * A custom query format function
         */
        queryFormat?: (query: string, values: any) => void;

        /**
         * When dealing with big numbers (BIGINT and DECIMAL columns) in the database, you should enable this option
         * (Default: false)
         */
        supportBigNumbers?: boolean;

        /**
         * Enabling both supportBigNumbers and bigNumberStrings forces big numbers (BIGINT and DECIMAL columns) to be
         * always returned as JavaScript String objects (Default: false). Enabling supportBigNumbers but leaving
         * bigNumberStrings disabled will return big numbers as String objects only when they cannot be accurately
         * represented with [JavaScript Number objects] (http://ecma262-5.com/ELS5_HTML.htm#Section_8.5)
         * (which happens when they exceed the [-2^53, +2^53] range), otherwise they will be returned as Number objects.
         * This option is ignored if supportBigNumbers is disabled.
         */
        bigNumberStrings?: boolean;

        /**
         * Force date types (TIMESTAMP, DATETIME, DATE) to be returned as strings rather then inflated into JavaScript Date
         * objects. (Default: false)
         */
        dateStrings?: boolean;

        /**
         * This will print all incoming and outgoing packets on stdout.
         * You can also restrict debugging to packet types by passing an array of types (strings) to debug;
         *
         * (Default: false)
         */
        debug?: any;

        /**
         * Generates stack traces on Error to include call site of library entrance ("long stack traces"). Slight
         * performance penalty for most calls. (Default: true)
         */
        trace?: boolean;

        /**
         * Allow multiple mysql statements per query. Be careful with this, it exposes you to SQL injection attacks. (Default: false)
         */
        multipleStatements?: boolean;

        /**
         * List of connection flags to use other than the default ones. It is also possible to blacklist default ones
         */
        flags?: string[];

        /**
         * object with ssl parameters or a string containing name of ssl profile
         */
        ssl?: any;
    }

    export function createConnection(
        options: IConnectionConfig,
    ): Promise<IPromiseConnection>;
    export function createPool(options: IConnectionConfig): IPromisePool;
}
