import { SqlDialect } from "./sqlDialect";
import { CreateIndexParam } from "./param/createIndexParam";

export class ExasolDialect extends SqlDialect {
    createIndex(createIndexParam: CreateIndexParam): string {
        return `CREATE INDEX ${createIndexParam.table}_idx ON ${createIndexParam.table} (${createIndexParam.column});`;
    }

    showVersion(): string {
        return "SELECT PARAM_VALUE FROM SYS.EXA_PARAMETERS WHERE PARAM_NAME = 'databaseProductVersion';";
    }

    showDatabases(): string {
        return "SELECT SCHEMA_NAME FROM SYS.EXA_SCHEMAS ORDER BY SCHEMA_NAME;";
    }

    showSchemas(): string {
        return this.showDatabases();
    }

    showTables(database: string): string {
        return `SELECT TABLE_NAME FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = '${database}' ORDER BY TABLE_NAME;`;
    }

    showViews(database: string): string {
        return `SELECT VIEW_NAME FROM SYS.EXA_ALL_VIEWS WHERE VIEW_SCHEMA = '${database}' ORDER BY VIEW_NAME;`;
    }

    showColumns(database: string, table: string): string {
        return `SELECT 
            c.COLUMN_NAME AS "name",
            c.COLUMN_TYPE AS "type",
            c.COLUMN_TYPE AS "simpleType",
            c.COLUMN_DEFAULT AS "defaultValue",
            CASE WHEN c.COLUMN_IS_NULLABLE = 'YES' THEN 'YES' ELSE 'NO' END AS "nullable",
            '' AS "comment",
            CASE WHEN cc.CONSTRAINT_TYPE = 'PRIMARY KEY' THEN 'PRIMARY KEY'
                 WHEN cc.CONSTRAINT_TYPE = 'UNIQUE' THEN 'UNIQUE'
                 ELSE NULL END AS "key"
        FROM SYS.EXA_ALL_COLUMNS c
        LEFT JOIN SYS.EXA_ALL_CONSTRAINT_COLUMNS cc_col ON 
            c.COLUMN_SCHEMA = cc_col.CONSTRAINT_SCHEMA AND
            c.COLUMN_TABLE = cc_col.CONSTRAINT_TABLE AND
            c.COLUMN_NAME = cc_col.COLUMN_NAME
        LEFT JOIN SYS.EXA_ALL_CONSTRAINTS cc ON
            cc_col.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND
            cc_col.CONSTRAINT_TABLE = cc.CONSTRAINT_TABLE AND
            cc_col.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        WHERE c.COLUMN_SCHEMA = '${database}' 
        AND c.COLUMN_TABLE = '${table}' 
        ORDER BY c.COLUMN_ORDINAL_POSITION;`;
    }

    showTriggers(database: string): string {
        return `SELECT TRIGGER_NAME FROM SYS.EXA_ALL_TRIGGERS WHERE TRIGGER_SCHEMA = '${database}' ORDER BY TRIGGER_NAME;`;
    }

    showProcedures(database: string): string {
        return `SELECT PROCEDURE_NAME FROM SYS.EXA_ALL_PROCEDURES WHERE PROCEDURE_SCHEMA = '${database}' ORDER BY PROCEDURE_NAME;`;
    }

    showFunctions(database: string): string {
        return `SELECT FUNCTION_NAME FROM SYS.EXA_ALL_FUNCTIONS WHERE FUNCTION_SCHEMA = '${database}' ORDER BY FUNCTION_NAME;`;
    }

    tableTemplate(): string {
        return `CREATE TABLE table_name (
    id INTEGER IDENTITY PRIMARY KEY,
    name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;
    }

    viewTemplate(): string {
        return `CREATE VIEW view_name AS
SELECT * FROM table_name
WHERE condition;`;
    }

    procedureTemplate(): string {
        return `CREATE PROCEDURE procedure_name(IN param1 INTEGER)
AS
BEGIN
    -- Procedure logic here
END;`;
    }

    functionTemplate(): string {
        return `CREATE FUNCTION function_name(param1 INTEGER)
RETURNS INTEGER AS
BEGIN
    -- Function logic here
    RETURN 0;
END;`;
    }

    triggerTemplate(): string {
        return `CREATE TRIGGER trigger_name
BEFORE INSERT ON table_name
FOR EACH ROW
BEGIN
    -- Trigger logic here
END;`;
    }

    showUsers(): string {
        return "SELECT USER_NAME FROM SYS.EXA_ALL_USERS ORDER BY USER_NAME;";
    }

    userTemplate(): string {
        return `CREATE USER user_name IDENTIFIED BY 'password';`;
    }

    truncateDatabase(database: string): string {
        return `SELECT 'TRUNCATE TABLE ' || TABLE_SCHEMA || '.' || TABLE_NAME || ';' 
        FROM SYS.EXA_ALL_TABLES 
        WHERE TABLE_SCHEMA = '${database}';`;
    }

    createUser(): string {
        return `CREATE USER user_name IDENTIFIED BY 'password';`;
    }

    updateUser(): string {
        return `ALTER USER user_name IDENTIFIED BY 'new_password';`;
    }

    grantPrivileges(): string {
        return `GRANT privileges ON schema_name.* TO user_name;`;
    }

    updateColumn(): string {
        return `ALTER TABLE table_name MODIFY column_name column_type;`;
    }

    addColumn(): string {
        return `ALTER TABLE table_name ADD column_name column_type;`;
    }

    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM "${database}"."${table}" LIMIT 1000`;
    }

    countSql(database: string, table: string): string {
        return `SELECT COUNT(1) as count FROM "${database}"."${table}"`;
    }

    updateTable(): string {
        return `ALTER TABLE old_table_name RENAME TO new_table_name`;
    }

    showTableSource(database: string, table: string): string {
        return `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, 
            CASE WHEN COLUMN_IS_NULLABLE = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable,
            COLUMN_COMMENT
        FROM SYS.EXA_ALL_COLUMNS 
        WHERE COLUMN_SCHEMA = '${database}' 
        AND COLUMN_TABLE = '${table}' 
        ORDER BY COLUMN_ORDINAL_POSITION`;
    }

    showViewSource(database: string, view: string): string {
        return `SELECT VIEW_TEXT 
        FROM SYS.EXA_ALL_VIEWS 
        WHERE VIEW_SCHEMA = '${database}' 
        AND VIEW_NAME = '${view}'`;
    }

    showProcedureSource(database: string, procedure: string): string {
        return `SELECT PROCEDURE_TEXT 
        FROM SYS.EXA_ALL_PROCEDURES 
        WHERE PROCEDURE_SCHEMA = '${database}' 
        AND PROCEDURE_NAME = '${procedure}'`;
    }

    showFunctionSource(database: string, function_name: string): string {
        return `SELECT FUNCTION_TEXT 
        FROM SYS.EXA_ALL_FUNCTIONS 
        WHERE FUNCTION_SCHEMA = '${database}' 
        AND FUNCTION_NAME = '${function_name}'`;
    }

    showTriggerSource(database: string, trigger: string): string {
        return `SELECT TRIGGER_TEXT 
        FROM SYS.EXA_ALL_TRIGGERS 
        WHERE TRIGGER_SCHEMA = '${database}' 
        AND TRIGGER_NAME = '${trigger}'`;
    }

    showVariables(): string {
        return `SELECT PARAM_NAME, PARAM_VALUE 
        FROM SYS.EXA_PARAMETERS 
        ORDER BY PARAM_NAME`;
    }

    showStatus(): string {
        return `SELECT 'RUNNING' as status, 
            current_timestamp as server_time, 
            current_schema as current_database`;
    }

    processList(): string {
        return `SELECT SESSION_ID, USER_NAME, ACTIVITY, COMMAND_NAME, DURATION 
        FROM SYS.EXA_DBA_SESSIONS 
        WHERE STATUS = 'RUNNING'`;
    }

    variableList(): string {
        return this.showVariables();
    }

    statusList(): string {
        return this.showStatus();
    }

    createDatabase(): string {
        return `CREATE SCHEMA schema_name`;
    }
}