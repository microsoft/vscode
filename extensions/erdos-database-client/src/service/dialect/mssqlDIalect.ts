import { window } from "vscode";
import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class MssqlDIalect extends SqlDialect {
    createIndex(createIndexParam:CreateIndexParam): string{
        return `ALTER TABLE ${createIndexParam.table} ADD ${createIndexParam.type} (${createIndexParam.column})`;
    }
    dropIndex(table: string, indexName: string): string {
        return `DROP INDEX ${table}.${indexName}`
    }
    showIndex(database: string, table: string): string {
        return `SELECT
        index_name = ind.name,
        column_name = col.name,
        ind.is_primary_key,
        ind.is_unique,
        ind.is_unique_constraint
      FROM
        sys.indexes ind
        INNER JOIN sys.index_columns ic ON ind.object_id = ic.object_id
        and ind.index_id = ic.index_id
        INNER JOIN sys.columns col ON ic.object_id = col.object_id
        and ic.column_id = col.column_id
        INNER JOIN sys.tables t ON ind.object_id = t.object_id
      WHERE
        t.name = '${table}';`
    }
    variableList(): string {
        throw new Error("Method not implemented.");
    }
    statusList(): string {
        throw new Error("Method not implemented.");
    }
    processList(): string {
        return 'sp_who'
    }
    addColumn(table: string): string {
        return `ALTER TABLE
        ${table} 
    ADD 
        [column] [type];`;
    }
    createUser(): string {
        return `CREATE LOGIN [name] WITH PASSWORD = 'password'`;
    }
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        const defaultDefinition = nullable == "YES" ? "NULL":"NOT NULL" ;
        comment = comment ? ` comment '${comment}'` : "";
        return `EXEC sp_rename '${table}.${column}', '${column}', 'COLUMN'
ALTER TABLE ${table} ALTER COLUMN ${column} ${type} ${defaultDefinition};
`;
    }
    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        let {columnName,columnType,newColumnName,comment,nullable,table}=updateColumnParam
        const defaultDefinition = nullable ? "" : " NOT NULL";
        comment = comment ? ` comment '${comment}'` : "";
        return `ALTER TABLE\n\t${table} CHANGE ${columnName} ${newColumnName} ${columnType}${defaultDefinition}${comment};`;
    }
    showUsers(): string {
        return `SELECT name [user] from sys.database_principals where type='S'`
    }
    updateTable(update: UpdateTableParam):string{
        const {database,table,newTableName}=update
        return `sp_rename '${table}', '${newTableName}'`;
    }
    truncateDatabase(database: string): string {
        return `SELECT Concat('TRUNCATE TABLE [',table_schema,'].[',TABLE_NAME, '];') trun FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'  AND TABLE_SCHEMA='${database}'`
    }
    createDatabase(database: string): string {
        return `create database ${database}`;
    }
    showTableSource(database: string, table: string): string {
        return ``
    }
    showViewSource(database: string, table: string): string {
        return `SELECT definition 'Create View' FROM sys.sql_modules WHERE object_id = OBJECT_ID('${database}.${table}');`
    }
    showProcedureSource(database: string, name: string): string {
        return `SELECT definition 'Create Procedure','${database}.${name}' "Procedure" FROM sys.sql_modules WHERE object_id = OBJECT_ID('${database}.${name}');`
    }
    showFunctionSource(database: string, name: string): string {
        return `SELECT definition 'Create Function','${database}.${name}' "Function" FROM sys.sql_modules WHERE object_id = OBJECT_ID('${database}.${name}');`
    }
    showTriggerSource(database: string, name: string): string {
        return `SELECT definition 'SQL Original Statement','${database}.${name}' "Trigger" FROM sys.sql_modules WHERE object_id = OBJECT_ID('${database}.${name}');`
    }
    /**
     * remove extra、COLUMN_COMMENT(comment)、COLUMN_KEY(key)
     * mssql table column has primary and unique in same column, so it occur duplicate column.
     */
    showColumns(database: string, table: string): string {
        return `SELECT c.COLUMN_NAME "name", DATA_TYPE "simpleType", DATA_TYPE "type", IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue", '' "comment", tc.constraint_type "key" FROM
        INFORMATION_SCHEMA.COLUMNS c
        left join  INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
        on c.COLUMN_NAME=ccu.column_name and c.table_name=ccu.table_name and ccu.table_catalog=c.TABLE_CATALOG and ccu.TABLE_SCHEMA=c.TABLE_SCHEMA
        left join  INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        on tc.constraint_name=ccu.constraint_name
        and tc.table_catalog=c.TABLE_CATALOG and tc.TABLE_SCHEMA=c.TABLE_SCHEMA and tc.table_name=c.table_name WHERE c.TABLE_SCHEMA = '${database}' AND c.table_name = '${table}' ORDER BY ORDINAL_POSITION`;
    }
    showTriggers(database: string): string {
        return `SELECT t.name TRIGGER_NAME FROM SYS.OBJECTS t INNER JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE TYPE = 'TR' and s.name='${database}'`;
    }
    showProcedures(database: string): string {
        return `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE SPECIFIC_SCHEMA = '${database}' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE SPECIFIC_SCHEMA = '${database}' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        return `SELECT name FROM sys.all_views t where SCHEMA_NAME(t.schema_id)='${database}' order by name`;
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT TOP ${pageSize} * FROM ${database}.${table};`;
    }
    countSql(database: string, table: string): string {
        return `SELECT count(*) count FROM ${database}.${table};`;
    }
    showTables(database: string): string {
        return `SELECT TABLE_NAME 'name'
      FROM
        INFORMATION_SCHEMA.TABLES t
      WHERE
        TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA = '${database}' order by TABLE_NAME`
    //     return `SELECT
    //     TABLE_NAME 'name',ds.row_count rows
    //   FROM
    //     INFORMATION_SCHEMA.TABLES t
    //     join sys.dm_db_partition_stats ds on ds.object_id = object_id(t.TABLE_SCHEMA+ '.'+ t.TABLE_NAME)
    //     and ds.index_id IN (0, 1)
    //   WHERE
    //     TABLE_TYPE = 'BASE TABLE'
    //     AND TABLE_SCHEMA = '${database}' order by TABLE_NAME`
    }
    showDatabases(){
        return "SELECT name 'Database' FROM sys.databases"
    }
    showSchemas(): string {
        return "SELECT SCHEMA_NAME [schema] FROM INFORMATION_SCHEMA.SCHEMATA"
    }
    tableTemplate(): string {
        return `CREATE TABLE [name](  
    id int NOT NULL primary key,
    create_time DATETIME,
    update_time DATETIME,
    [column] varchar(255)
);
EXECUTE sp_addextendedproperty N'MS_Description', '[table_comment]', N'user', N'dbo', N'table', N'[table_name]', NULL, NULL;
EXECUTE sp_addextendedproperty N'MS_Description', '[column_comment]', N'user', N'dbo', N'table', N'[table_name]', N'column', N'[column_name]';
`
    }
    viewTemplate(): string {
        return `CREATE
VIEW [name]
AS
(SELECT * FROM ...);`
    }
    procedureTemplate(): string {
        return `CREATE
PROCEDURE [name]
AS
BEGIN

END;`;
    }
    triggerTemplate(): string {
        return `CREATE TRIGGER [name] 
ON [table]
[INSTEAD OF/AFTER] [INSERT/UPDATE/DELETE]
AS
BEGIN

END;`
    }
    functionTemplate(): string {
        return `CREATE FUNCTION [name]() RETURNS [TYPE]
BEGIN
    return [value];
END;`
    }
}