import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class MysqlDialect extends SqlDialect {
    createIndex(createIndexParam: CreateIndexParam): string {
        return `ALTER TABLE ${createIndexParam.table} ADD ${createIndexParam.type} (${createIndexParam.column})`;
    }
    dropIndex(table: string, indexName: string): string {
        return `ALTER TABLE ${table} DROP INDEX ${indexName}`
    }
    showIndex(database: string, table: string): string {
        return `SELECT column_name,index_name,non_unique,index_type FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema='${database}' and table_name='${table}';`
    }
    variableList(): string {
        return 'show global VARIABLES'
    }
    statusList(): string {
        return 'show global status'
    }
    processList(): string {
        return 'show processlist'
    }
    addColumn(table: string): string {
        return `ALTER TABLE
        ${table} 
    ADD 
        COLUMN [column] [type] NOT NULL comment '';`;
    }
    createUser(): string {
        return `CREATE USER 'username'@'%' IDENTIFIED BY 'password';`;
    }
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        const defaultDefinition = nullable == "YES" ? "" : " NOT NULL";
        comment = comment ? ` comment '${comment}'` : "";
        return `ALTER TABLE\n\t${table} CHANGE ${column} ${column} ${type}${defaultDefinition}${comment};`;
    }
    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        let {columnName,columnType,newColumnName,comment,nullable,table}=updateColumnParam
        const defaultDefinition = nullable ? "" : " NOT NULL";
        comment = comment ? ` comment '${comment}'` : "";
        return `ALTER TABLE\n\t${table} CHANGE ${columnName} ${newColumnName} ${columnType}${defaultDefinition}${comment};`;
    }
    showUsers(): string {
        return `SELECT concat(user,'@',host) user FROM mysql.user;`;
    }
    pingDataBase(database: string): string {
        if (!database) {
            // mysql not using connection poll, so need ping connnection active.
            return "select 1";
        }
        return `use \`${database}\``;
    }
    updateTable(update: UpdateTableParam): string {
        const { table, newTableName, comment, newComment } = update
        let sql = "";
        if (newComment && newComment != comment) {
            sql = `ALTER TABLE ${table} COMMENT = '${newComment}';`;
        }
        if (newTableName && table != newTableName) {
            sql += `ALTER TABLE ${table} RENAME TO ${newTableName};`
        }
        return sql;
    }
    truncateDatabase(database: string): string {
        return `SELECT Concat('TRUNCATE TABLE \`',table_schema,'\`.\`',TABLE_NAME, '\`;') trun FROM INFORMATION_SCHEMA.TABLES where  table_schema ='${database}' and TABLE_TYPE<>'VIEW';`
    }
    createDatabase(database: string): string {
        return `create database \`${database}\` default character set = 'utf8mb4' `;
    }
    showTableSource(database: string, table: string): string {
        return `SHOW CREATE TABLE \`${database}\`.\`${table}\`;`
    }
    showViewSource(database: string, table: string): string {
        return `SHOW CREATE VIEW  \`${database}\`.\`${table}\`;`
    }
    showProcedureSource(database: string, name: string): string {
        return `SHOW CREATE PROCEDURE \`${database}\`.\`${name}\`;`
    }
    showFunctionSource(database: string, name: string): string {
        return `SHOW CREATE FUNCTION \`${database}\`.\`${name}\`;`;
    }
    showTriggerSource(database: string, name: string): string {
        return `SHOW CREATE TRIGGER \`${database}\`.\`${name}\`;`;
    }
    showColumns(database: string, table: string): string {
        return `SELECT COLUMN_NAME name,DATA_TYPE simpleType,COLUMN_TYPE type,COLUMN_COMMENT comment,COLUMN_KEY \`key\`,IS_NULLABLE nullable,CHARACTER_MAXIMUM_LENGTH maxLength,COLUMN_DEFAULT defaultValue,EXTRA extra FROM information_schema.columns WHERE table_schema = '${database}' AND table_name = '${table}' ORDER BY ORDINAL_POSITION;`;
    }
    showTriggers(database: string): string {
        return `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${database}'`;
    }
    showProcedures(database: string): string {
        return `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${database}' and ROUTINE_TYPE='PROCEDURE'`;
    }
    showFunctions(database: string): string {
        return `SELECT ROUTINE_NAME FROM information_schema.routines WHERE ROUTINE_SCHEMA = '${database}' and ROUTINE_TYPE='FUNCTION'`;
    }
    showViews(database: string): string {
        return `SELECT TABLE_NAME name FROM information_schema.VIEWS  WHERE TABLE_SCHEMA = '${database}'`;
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${table} LIMIT ${pageSize};`;
    }
    countSql(database: string, table: string): string {
        return `SELECT count(*) FROM ${table};`;
    }
    showTables(database: string): string {
        return `SELECT table_comment \`comment\`,TABLE_NAME as \`name\`,TABLE_ROWS \`rows\`,auto_increment,\`row_format\`,data_length,index_length FROM information_schema.TABLES  WHERE TABLE_SCHEMA = '${database}' and TABLE_TYPE<>'VIEW' order by table_name;`
    }
    showSchemas(): string {
        return "show databases"
    }
    tableTemplate(): string {
        return `CREATE TABLE [name](  
    id int NOT NULL primary key AUTO_INCREMENT comment 'primary key',
    create_time DATETIME COMMENT 'create time',
    update_time DATETIME COMMENT 'update time',
    [column] varchar(255) comment ''
) default charset utf8 comment '';`
    }
    viewTemplate(): string {
        return `CREATE VIEW [name]
AS
(SELECT * FROM ...);`
    }
    procedureTemplate(): string {
        return `CREATE PROCEDURE [name]()
BEGIN

END;`;
    }
    triggerTemplate(): string {
        return `CREATE TRIGGER [name] 
[BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW BEGIN

END;`
    }
    functionTemplate(): string {
        return `CREATE FUNCTION [name]() RETURNS [TYPE]
BEGIN
    return [value];
END;`
    }
}
