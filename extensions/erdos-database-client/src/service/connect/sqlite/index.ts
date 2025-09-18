import * as child_process from 'child_process';
import { StreamParser } from './streamParser';
import { ResultSetParser } from './resultSetParser';
import { EOL } from 'os';
import { Result, ResultNew, ResultSet } from "./common";
import { validateSqliteCommand } from "./sqliteCommandValidation";
import { FieldInfo } from "../../../common/typeDef";

class SQLite {

    public readonly dbPath: string;
    private sqliteCommand!: string;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
        this.setSqliteCommand(null);
    }

    query(query: string): Promise<ResultNew | ResultNew[]> {
        if (!this.sqliteCommand) Promise.resolve({ error: "Unable to execute query: provide a valid sqlite3 executable in the setting sqlite.sqlite3." });
        return new Promise((res, rej) => {


            let resultSet: Array<Result>;
            let errorMessage = "";
            let streamParser = new StreamParser(new ResultSetParser());

            let args = [
                //dbPath,
                `-header`, // print the headers before the result rows
                `-nullvalue`, `NULL`, // print NULL for null values
                //`-echo`, // print the statement before the result
                `-cmd`, `.mode tcl`
            ];

            let proc = child_process.spawn(this.sqliteCommand, args, { stdio: ['pipe', "pipe", "pipe"] });
            // these next lines are written in the stdin to avoid errors when using unicode characters (see issues #32, #37)
            proc.stdin.write(`.open '${this.dbPath}'${EOL}`);
            proc.stdin.write(`.echo on${EOL}`);
            proc.stdin.end(query);

            proc.stdout.pipe(streamParser).once('done', (data: ResultSet) => {
                resultSet = data;
            });

            proc.stderr.on('data', (data) => {
                errorMessage += data.toString().trim();
            });

            proc.once('error', (data) => {
                errorMessage += data;
            });

            proc.once('close', () => {
                if (errorMessage) {
                    rej(new Error(errorMessage))
                    return;
                }
                if (!resultSet) resultSet = [{
                    stmt: query, rows: [], header: []
                }];
                const newResult = resultSet.map(result => {
                    return {
                        sql: result.stmt,
                        fields: result.header.map(head => ({ name: head })) as FieldInfo[],
                        rows: result.rows.map((row) => {
                            const obj = {};
                            for (let i = 0; i < result.header.length; i++) {
                                const head = result.header[i];
                                obj[head] = row[i];
                            }
                            return obj;
                        })
                    }
                })
                if (newResult.length == 1) {
                    res(newResult[0])
                } else {
                    res(newResult);
                }
            });
        })
    }

    setSqliteCommand(sqliteCommand: string) {
        this.sqliteCommand = validateSqliteCommand(sqliteCommand);
    }
}

export interface QueryResult { resultSet?: ResultSet; error?: Error; }

export default SQLite;