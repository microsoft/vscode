import { Position, Range } from "vscode";
import { SQLToken } from "./sqlBlcok";

export class TokenContext {
    tokens: SQLToken[] = [];
    scopes: Range[] = [];
    word: string = '';
    wordStart: Position;
    bracketStart: SQLToken[] = [];

    public appendChar(i: number, j: number, char: string) {
        if (char.match(/\s/)) {
            this.endToken(i, j)
            return;
        }

        switch (char) {
            case ".":
                const pre = this.getToken(-1);
                this.splitToken(i, j, char)
                if (pre && pre.content && pre.content.match(/into|from|update|table|join/i)) {
                    this.getToken(-1).type = 'schema_dot'
                    this.getToken(-2).type = 'schema'
                }
                break;
            case ",":
                this.splitToken(i, j, char);
                break;
            case "(":
                const token = this.splitToken(i, j, char);
                this.bracketStart.push(token)
                break;
            case ")":
                const startToken = this.bracketStart.pop()
                const endToken = this.splitToken(i, j, char);
                if (startToken && startToken.type == 'bracketStart') {
                    this.scopes.push(new Range(startToken.range.start, endToken.range.end))
                }
                break;
            default:
                this.addChar(i, j, char);
        }
    }

    private addChar(i: number, j: number, char: string) {
        if (!this.wordStart) {
            this.wordStart = new Position(i, j)
        }
        this.word = this.word + char;
    }

    public splitToken(i: number, j: number, divide: string): SQLToken {
        this.endToken(i, j)
        this.addChar(i, j, divide)
        return this.endToken(i, j + 1)
    }
    public endToken(i: number, j: number): SQLToken {
        if (!this.wordStart) return;
        const token: SQLToken = {
            content: this.word, type: this.getType(),
            range: new Range(this.wordStart, new Position(i, j))
        };
        this.tokens.push(token)
        this.word = '';
        this.wordStart = null;
        return token;
    }

    private getToken(index: number): SQLToken {
        if (index > 0) return this.tokens[index];
        return this.tokens[this.tokens.length + index]
    }

    private getType(): string {
        const preivous = this.getToken(-1);
        if (preivous) {
            if ((preivous.content.match(/into|from|update|table|join/i)) || (preivous.type == 'schema_dot')) {
                return 'table'
            }
            if (preivous.content == '(' &&
                (this.word.toLowerCase() == 'select' || (this.getToken(-2) && this.getToken(-2).type=='table'))
            ) {
                preivous.type = 'bracketStart'
            }
        }
        return 'text'
    }

}