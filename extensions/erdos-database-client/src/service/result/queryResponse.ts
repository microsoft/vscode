import { ColumnMeta, FieldInfo } from "../../common/typeDef";

export class RunResponse {
    public sql: string;
}

export class MessageResponse {
    public message: string;
    public success: boolean;
}

export class DataResponse {
    public sql: string;
    public costTime: number;
    public primaryKey: string;
    public columnList: ColumnMeta[];
    public primaryKeyList: ColumnMeta[];
    public database?: string;
    public table: string | null;
    public data: any[];
    public fields: FieldInfo[];
    public pageSize: number;
    public tableCount: number;
    public total?: number;
}

export class ErrorResponse {
    public sql: string;
    public costTime: number;
    public message: string;
}

export class DMLResponse {
    public sql: string;
    public costTime: number;
    public message?: string;
    public affectedRows: number;
    public isInsert: boolean;
}

/**
 * Elastic Search Response
 */

export class EsDataResponse extends DataResponse{
    public request?: any;
}