/**
 * A simple file parser that can tell whether the first character of a line is quoted or not
 * Converted from src/jupytext/stringparser.py
 */

import { COMMENT } from './languages.js';

export class StringParser {
    private single: string | null = null;
    private triple: string | null = null;
    private tripleStart: number = -1;
    private ignore: boolean;
    private python: boolean;
    private comment: string | undefined;

    constructor(language: string | null) {
        this.ignore = language === null;
        this.python = language !== "R";
        this.comment = language ? COMMENT[language] : undefined;
    }

    isQuoted(): boolean {
        if (this.ignore) {
            return false;
        }
        return Boolean(this.single || this.triple);
    }

    readLine(line: string): void {
        if (this.ignore) {
            return;
        }

        // Do not search for quotes when the line is commented out (and not quoted)
        if (!this.isQuoted() && 
            this.comment !== undefined && 
            line.trimStart().startsWith(this.comment)) {
            return;
        }

        this.tripleStart = -1;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (this.single === null && 
                this.triple === null && 
                this.comment && 
                this.comment.startsWith(char) && 
                line.slice(i).startsWith(this.comment)) {
                break;
            }
            
            if (char !== '"' && char !== "'") {
                continue;
            }
            
            // Is the char escaped?
            if (line.slice(i - 1, i) === "\\") {
                continue;
            }

            if (this.single === char) {
                this.single = null;
                continue;
            }
            if (this.single !== null) {
                continue;
            }

            if (!this.python) {
                continue;
            }

            if (line.slice(i - 2, i + 1) === char.repeat(3) && i >= this.tripleStart + 3) {
                // End of a triple quote
                if (this.triple === char) {
                    this.triple = null;
                    this.tripleStart = i;
                    continue;
                }

                // Are we looking for a different triple quote?
                if (this.triple !== null) {
                    continue;
                }

                // Triple quote starting
                this.triple = char;
                this.tripleStart = i;
                continue;
            }

            // Inside a multiline quote
            if (this.triple !== null) {
                continue;
            }

            this.single = char;
        }

        // Line ended
        if (this.python) {
            this.single = null;
        }
    }
}
