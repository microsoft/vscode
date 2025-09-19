import { FieldInfo, ColumnMeta } from "../../common/typeDef";
import { Util } from "../../common/util";
import { EsRequest } from "../../model/es/esRequest";
import { ServiceManager } from "../../service/serviceManager";
import { basename, extname } from "path";
import { env, Uri, ViewColumn, window } from "vscode";
import { Trans } from "../../common/trans";
import { ConfigKey, DatabaseType, MessageType } from "../../common/constants";
import { Global } from "../../common/global";
import { ResultView } from "../../webview/resultView";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";
import { ExportService } from "../export/exportService";
import { QueryOption, QueryUnit } from "../queryUnit";
import { DataResponse } from "./queryResponse";

export class QueryParam<T> {
    public connection: Node;
    public singlePage?: boolean;
    public type: MessageType;
    public res: T;
    public queryOption?: QueryOption;
}

export class QueryPage {

    private static exportService: ExportService = new ExportService()
    private static resultView: ResultView | null = null;

    public static async send(queryParam: QueryParam<any>) {
        const dbOption: Node = queryParam.connection;
        await QueryPage.adaptData(queryParam);
        const type = this.keepSingle(queryParam);

        // Create or reuse ResultView
        if (!this.resultView) {
            this.resultView = new ResultView(Global.context.extensionUri);
        } else {
            this.resultView.reveal();
        }
        
        // Set connection and load results
        this.resultView.setConnection(dbOption);
        this.resultView.loadQueryResults(queryParam);
        this.resultView.show();
    }

    private static async adaptData(queryParam: QueryParam<any>) {
        switch (queryParam.type) {
            case MessageType.DATA:
                if (queryParam.connection.dbType == DatabaseType.ES) {
                    await this.loadEsColumnList(queryParam);
                } else if (queryParam.connection.dbType == DatabaseType.MONGO_DB) {
                    await this.loadMongoColumnList(queryParam);
                } else {
                    await this.loadColumnList(queryParam);
                }
                const pageSize = ServiceManager.getPageService(queryParam.connection.dbType).getPageSize(queryParam.res.sql);
                ((queryParam.res) as DataResponse).pageSize = (queryParam.res.data && queryParam.res.data.length && queryParam.res.data.length > pageSize)
                    ? queryParam.res.data.length : pageSize;
                break;
            case MessageType.MESSAGE_BLOCK:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}`;
                break;
            case MessageType.DML:
            case MessageType.DDL:
                queryParam.res.message = `EXECUTE SUCCESS:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>AffectedRows : ${queryParam.res.affectedRows}`;
                break;
            case MessageType.ERROR:
                queryParam.res.message = `EXECUTE FAIL:<br><br>&nbsp;&nbsp;${queryParam.res.sql}<br><br>Message :<br><br>&nbsp;&nbsp;${queryParam.res.message}`;
                break;
        }
    }

    private static keepSingle(queryParam: QueryParam<any>) {
        if (typeof queryParam.singlePage == 'undefined') {
            queryParam.singlePage = true;
        }
        if (!queryParam.queryOption) {
            queryParam.queryOption = {
                viewId: "Query"
            }
        }
        return queryParam.queryOption.viewId;
    }

    private static isActiveSql(option: QueryOption): boolean {

        if (!window.activeTextEditor || !window.activeTextEditor.document || option.split === false) { return false; }

        const extName = extname(window.activeTextEditor.document.fileName) && extname(window.activeTextEditor.document.fileName).toLowerCase()
        const fileName = basename(window.activeTextEditor.document.fileName) && basename(window.activeTextEditor.document.fileName).toLowerCase()

        return extName == '.sql' || fileName.match(/mock.json$/) != null || extName == '.es';
    }

    private static async loadEsColumnList(queryParam: QueryParam<DataResponse>) {
        const indexName = queryParam.res.sql.split(' ')[1].split('/')[1];
        queryParam.res.table = indexName
        // count, continue
        if (queryParam.res.fields.length == 1) {
            queryParam.res.columnList = this.convertFieldInfoToColumnMeta(queryParam.res.fields)
            return;
        }
        queryParam.res.primaryKey = '_id'
        queryParam.res.tableCount = 1

        queryParam.res.columnList = this.convertFieldInfoToColumnMeta(queryParam.res.fields.slice(4))
    }

    private static async loadMongoColumnList(queryParam: QueryParam<DataResponse>) {
        const parse = queryParam.res.sql.match(/db\('(.+?)'\)\.collection\('(.+?)'\)/);
        queryParam.res.database = parse[1]
        queryParam.res.table = parse[2]
        queryParam.res.primaryKey = '_id'
        queryParam.res.tableCount = 1
        queryParam.res.columnList = this.convertFieldInfoToColumnMeta(queryParam.res.fields)
    }

    private static async loadColumnList(queryParam: QueryParam<DataResponse>) {
        // fix null point on result view
        queryParam.res.columnList = []
        const sqlList = queryParam.res.sql.match(/(?<=\b(from|join)\b\s*)(\S+)/gi)
        if (!sqlList || sqlList.length == 0) {
            return;
        }

        let tableName = sqlList[0]
        let database: string;

        if (queryParam.connection.dbType == DatabaseType.MSSQL && tableName.indexOf(".") != -1) {
            tableName = tableName.split(".")[1]
        }

        // MySQL gets directly from result set
        const fields = queryParam.res.fields
        if (fields && fields[0] && fields[0].orgTable) {
            tableName = fields[0].orgTable;
            database = fields[0].schema || fields[0].db;
            queryParam.res.database = database;
        } else {
            tableName = tableName.replace(/^"?(.+?)"?$/, '$1')
        }

        const tableNode = queryParam.connection.getByRegion(tableName)
        if (tableNode) {
            let primaryKey: string;
            let primaryKeyList = [];
            const columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.isPrimaryKey) {
                    primaryKey = columnNode.column.name;
                    primaryKeyList.push(columnNode.column)
                }
                return columnNode.column;
            });
            
            queryParam.res.primaryKey = primaryKey;
            queryParam.res.columnList = columnList;
            queryParam.res.primaryKeyList = primaryKeyList;
            // compatible sqlite empty result.
            if (queryParam.res.fields.length == 0) {
                queryParam.res.fields = this.convertColumnMetaToFieldInfo(columnList);
            }
        }
        queryParam.res.tableCount = sqlList.length;
        queryParam.res.table = tableName;
    }

    /**
     * Convert FieldInfo array to ColumnMeta array with proper type mapping
     */
    private static convertFieldInfoToColumnMeta(fields: FieldInfo[]): ColumnMeta[] {
        return fields.map(field => ({
            name: field.name,
            simpleType: this.getSimpleType(field.type),
            type: this.getTypeWithLength(field),
            comment: '',
            key: '',
            nullable: 'YES',
            maxLength: (field.length && field.length.toString()) || '',
            defaultValue: field.default || null,
            extra: '',
            isNotNull: false,
            isAutoIncrement: false,
            isUnique: false,
            isPrimary: false,
            pk: ''
        }));
    }

    /**
     * Get simple type name from MySQL type enum
     */
    private static getSimpleType(type: any): string {
        // Map MySQL types to simple string names
        const typeMap: {[key: number]: string} = {
            0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float',
            5: 'double', 7: 'timestamp', 8: 'bigint', 9: 'mediumint',
            10: 'date', 11: 'time', 12: 'datetime', 13: 'year',
            15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal',
            247: 'enum', 248: 'set', 249: 'tinytext', 250: 'mediumtext',
            251: 'longtext', 252: 'text', 253: 'varchar', 254: 'char'
        };
        return typeMap[type] || 'unknown';
    }

    /**
     * Get type with length information
     */
    private static getTypeWithLength(field: FieldInfo): string {
        const simpleType = this.getSimpleType(field.type);
        if (field.length && ['varchar', 'char'].includes(simpleType)) {
            return `${simpleType}(${field.length})`;
        }
        return simpleType;
    }

    /**
     * Convert ColumnMeta array back to FieldInfo array
     */
    private static convertColumnMetaToFieldInfo(columns: ColumnMeta[]): FieldInfo[] {
        return columns.map(col => ({
            catalog: '',
            db: '',
            schema: '',
            table: '',
            orgTable: '',
            name: col.name,
            orgName: col.name,
            charsetNr: 0,
            length: parseInt(col.maxLength) || 0,
            flags: 0,
            decimals: 0,
            default: col.defaultValue,
            zeroFill: false,
            protocol41: true,
            type: this.parseTypeFromString(col.type)
        }));
    }

    /**
     * Parse MySQL type enum from string
     */
    private static parseTypeFromString(typeStr: string): any {
        const baseType = typeStr.split('(')[0].toLowerCase();
        const typeMap: {[key: string]: number} = {
            'decimal': 0, 'tinyint': 1, 'smallint': 2, 'int': 3, 'float': 4,
            'double': 5, 'timestamp': 7, 'bigint': 8, 'mediumint': 9,
            'date': 10, 'time': 11, 'datetime': 12, 'year': 13,
            'varchar': 15, 'bit': 16, 'json': 245, 'enum': 247, 'set': 248,
            'tinytext': 249, 'mediumtext': 250, 'longtext': 251, 'text': 252,
            'char': 254
        };
        return typeMap[baseType] || 252; // default to TEXT
    }

}