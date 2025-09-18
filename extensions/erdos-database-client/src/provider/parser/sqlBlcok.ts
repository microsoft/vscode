import { Position, Range } from "vscode";

export class SQLBlock {
    sql: string;
    range: Range;
    tokens: SQLToken[];
    scopes: Range[] = [];
}

export class SQLToken {
    content: string;
    type?: string = 'text';
    range: Range;
}
