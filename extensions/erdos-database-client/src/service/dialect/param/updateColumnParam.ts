export interface UpdateColumnParam {
    table: string;
    comment: string;
    columnName: string;
    newColumnName: string;
    columnType: string;
    nullable: boolean;
}