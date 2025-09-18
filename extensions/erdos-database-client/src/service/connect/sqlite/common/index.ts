import { FieldInfo } from "../../../../common/typeDef";

export type ResultSet = Array<Result>;

export interface Result {
    stmt: string;
    header: string[];
    rows: string[][];
}

export interface ResultNew {
    sql: string;
    fields: FieldInfo[];
    rows: object[];
}