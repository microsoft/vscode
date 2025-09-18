import { Node } from "../../../model/interface/node";
import { IConnection } from "../../../service/connect/connection";
import { ConnectionManager } from "../../../service/connectionManager";
import { EventEmitter } from 'events';
import * as fs from 'fs';
import { DataDumpOptions } from './interfaces/Options';

interface QueryRes {
    [k: string]: unknown;
}

function buildInsert(row: QueryRes, table: string, values: Array<string>): string {
    const sql = [
        `INSERT INTO ${table}(${Object.keys(row).join(
            ',',
        )})`,
        `VALUES${values.join(',')};`,
    ].join(' ')

    return sql;
}
function buildInsertValue(row: QueryRes): string {
    return `(${Object.keys(row).map(c => row[c]).join(',')})`;
}

function executeSql(connection: IConnection, sql: string): Promise<void> {
    return new Promise((resolve, reject) =>
        connection.query(sql, err =>
            err ? /* istanbul ignore next */ reject(err) : resolve(),
        ),
    );
}
async function getDataDump(node: Node, sessionId: string, options: Required<DataDumpOptions>, tables: Array<string>, dumpToFile: string | null,): Promise<void> {
    // ensure we have a non-zero max row option
    options.maxRowsPerInsertStatement = Math.max(
        options.maxRowsPerInsertStatement,
        0,
    );

    // clone the array
    tables = [...tables];

    const connection = await ConnectionManager.getConnection(node, { sessionId })

    let currentTableLines: Array<string> | null = null;

    // open the write stream (if configured to)
    const outFileStream = dumpToFile
        ? fs.createWriteStream(dumpToFile, {
            flags: 'a', // append to the file
            encoding: 'utf8',
        })
        : null;

    function saveChunk(str: string | Array<string>, inArray = true): void {
        if (!Array.isArray(str)) {
            str = [str];
        }

        // write to file if configured
        if (outFileStream) {
            str.forEach(s => outFileStream.write(`\n${s}`));
        }

        // write to memory if configured
        if (inArray && currentTableLines) {
            currentTableLines.push(...str);
        }
    }

    try {
        if (options.lockTables) {
            // see: https://dev.mysql.com/doc/refman/5.7/en/replication-solutions-backups-read-only.html
            await executeSql(connection, 'FLUSH TABLES WITH READ LOCK');
            await executeSql(connection, 'SET GLOBAL read_only = ON');
        }

        connection.dumpMode = true;

        // to avoid having to load an entire DB's worth of data at once, we select from each table individually
        // note that we use async/await within this loop to only process one table at a time (to reduce memory footprint)
        while (tables.length > 0) {
            const table = tables.shift()!;

            // currentTableLines = options.returnFromFunction ? [] : null;
            currentTableLines = null;

            if (tables.length > 0) {
                // add a newline before the next header to pad the dumps
                saveChunk('');
            }

            await new Promise((resolve, reject) => {
                // send the query
                const where = options.where[table]
                    ? ` WHERE ${options.where[table]}`
                    : '';
                const query = connection.query(
                    `SELECT * FROM ${table}${where}`,
                ) as EventEmitter;

                let rowQueue: Array<string> = [];

                let tempRow: QueryRes;
                // stream the data to the file
                query.on('result', (row: QueryRes, end) => {
                    // build the values list
                    rowQueue.push(buildInsertValue(row));

                    if (!tempRow) tempRow = row;
                    // if we've got a full queue
                    if (rowQueue.length === options.maxRowsPerInsertStatement) {
                        // create and write a fresh statement
                        const insert = buildInsert(row, table, rowQueue);
                        saveChunk(insert);
                        rowQueue = [];
                    }
                    if (end) {
                        query.emit("end")
                    }
                });
                query.on('end', () => {
                    // write the remaining rows to disk
                    if (rowQueue.length > 0) {
                        const insert = buildInsert(tempRow, table, rowQueue);
                        saveChunk(insert);
                        rowQueue = [];
                    }

                    resolve(null);
                });
                query.on('error', err => {
                    reject(err)
                });
            });

        }

    } finally {
        if (options.lockTables) {
            // see: https://dev.mysql.com/doc/refman/5.7/en/replication-solutions-backups-read-only.html
            await executeSql(connection, 'SET GLOBAL read_only = OFF');
            await executeSql(connection, 'UNLOCK TABLES');
        }
        connection.dumpMode = false;
    }

    if (outFileStream) {
        // tidy up the file stream, making sure writes are 100% flushed before continuing
        await new Promise(resolve => {
            outFileStream.once('finish', () => {
                resolve(null);
            });
            outFileStream.end();
        });
    }

}

export { getDataDump };

