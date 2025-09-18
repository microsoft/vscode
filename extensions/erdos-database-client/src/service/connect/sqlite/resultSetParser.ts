// Simple replacement for missing function
function replaceEscapedOctetsWithChar(str: string): string {
  return str;
}

import { ChunksParser } from "./streamParser";
import { ResultSet } from "./common";

export class ResultSetParser implements ChunksParser<ResultSet|undefined> {
    private resultSet?: ResultSet;

    private isInStmt: boolean;
    private isInHeader: boolean;
    private isInString: boolean;
    private stringChar: string;
    private stmt: string;
    private row: string[];
    private lastChar: string;

    constructor() {
        this.isInStmt = true;
        this.isInHeader = false;
        this.isInString = false;
        this.stringChar = "";
        this.stmt = "";
        this.row = [];
        this.lastChar = "";
    }

    done() {
        return this.resultSet;
    }

    push(chunk: string) {
        if (!this.resultSet) {
            this.resultSet = [];
        }
        
        let last = <T>(arr: Array<T>): T => { return arr[arr.length-1]; };

        for (let i = 0; i < chunk.length; i++) {
            let char = chunk[i];
            let prevChar = (n?: number) => {
                n = Math.abs(n !== undefined ? n : 1);
                return i - n >= 0 ? chunk[i - n] : this.lastChar !== ""? this.lastChar : "";
            };

            if (i === chunk.length-1) {
                this.lastChar = char;
            }

            if (this.isInStmt) {
                // start of string
                if (!this.isInString && (char === `"` || char === `'`)) {
                    this.stmt += char;
                    this.isInString = true;
                    this.stringChar = char;
                    continue;
                }
                // end of string
                if (this.isInString && char === this.stringChar) {
                    this.stmt += char;
                    this.isInString = false;
                    this.stringChar = "";
                    continue;
                }
                // end of stmt
                if (!this.isInString && char === `;`) {
                    this.stmt += char;
                    this.isInStmt = false;

                    this.resultSet.push({stmt: this.stmt, header: [], rows: []});

                    this.stmt = "";
                    this.isInHeader = true; // the first thing after the statement is the header
                    continue;
                }

                this.stmt += char;

            } else {
                if (this.isInString) {
                    // end of field
                    if (char === `"` && prevChar() !== `\\`) {
                        this.isInString = false;

                        this.row[this.row.length-1] = replaceEscapedOctetsWithChar(last(this.row));

                        continue;
                    }
                    // if the string contains \" (escaped quote)
                    // we just write the " (quote) without the escape
                    if (char === `"` && prevChar() === `\\`) {
                        // remove escape char
                        this.row[this.row.length - 1] = last(this.row).slice(0,-1);
                        // add quote char
                        this.row[this.row.length - 1] += char;
                        continue;
                    }

                    // inside field
                    this.row[this.row.length - 1] += char;

                } else {
                    // end of rows and start of new stmt
                    if (char !== `"` && prevChar() === `\n`) {
                        this.isInStmt = true;
                        this.stmt = char;
                        continue;
                    }
                    // end of row
                    if ( (char === `\n` || char === `\r`) && prevChar() === `"` ) {
                        if (this.isInHeader) {
                            last(this.resultSet).header = this.row;
                            this.row = [];
                            this.isInHeader = false;
                        } else {
                            last(this.resultSet).rows.push(this.row);
                            this.row = [];
                        }
                        continue;
                    }
                    // start of field
                    if (char === `"`) {
                        this.isInString = true;
                        this.row.push("");
                        continue;
                    }
                }
            }
        }
    }
}