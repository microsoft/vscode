import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class MongoDialect implements SqlDialect{
    dropIndex(table: string, indexName: string): string {
        throw new Error("Method not implemented.");
    }
    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        throw new Error("Method not implemented.");
    }
    showIndex(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    createIndex(createIndexParam: CreateIndexParam): string {
        throw new Error("Method not implemented.");
    }
    showSchemas(): string {
        throw new Error("Method not implemented.");
    }
    updateTable(update: UpdateTableParam): string {
        throw new Error("Method not implemented.");
    }
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        throw new Error("Method not implemented.");
    }
    showDatabases(): string {
        return 'show dbs';
    }
    showTables(database: string): string {
        throw new Error("Method not implemented.");
    }
    addColumn(table: string): string {
        throw new Error("Method not implemented.");
    }
    showColumns(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showViews(database: string): string {
        throw new Error("Method not implemented.");
    }
    showSystemViews(database: string): string {
        throw new Error("Method not implemented.");
    }
    showUsers(): string {
        throw new Error("Method not implemented.");
    }
    createUser(): string {
        throw new Error("Method not implemented.");
    }
    showTriggers(database: string): string {
        throw new Error("Method not implemented.");
    }
    showProcedures(database: string): string {
        throw new Error("Method not implemented.");
    }
    showFunctions(database: string): string {
        throw new Error("Method not implemented.");
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return `db('${database}').collection('${table}').find({}).limit(${pageSize}).toArray()`;
    }
    countSql(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    createDatabase(database: string): string {
        throw new Error("Method not implemented.");
    }
    truncateDatabase(database: string): string {
        throw new Error("Method not implemented.");
    }
    renameTable(database: string, tableName: string, newName: string): string {
        throw new Error("Method not implemented.");
    }
    showTableSource(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showViewSource(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showProcedureSource(database: string, name: string): string {
        throw new Error("Method not implemented.");
    }
    showFunctionSource(database: string, name: string): string {
        throw new Error("Method not implemented.");
    }
    showTriggerSource(database: string, name: string): string {
        throw new Error("Method not implemented.");
    }
    tableTemplate(): string {
        throw new Error("Method not implemented.");
    }
    viewTemplate(): string {
        throw new Error("Method not implemented.");
    }
    procedureTemplate(): string {
        throw new Error("Method not implemented.");
    }
    triggerTemplate(): string {
        throw new Error("Method not implemented.");
    }
    functionTemplate(): string {
        throw new Error("Method not implemented.");
    }
    processList(): string {
        throw new Error("Method not implemented.");
    }
    variableList(): string {
        throw new Error("Method not implemented.");
    }
    statusList(): string {
        throw new Error("Method not implemented.");
    }
    pingDataBase(database: string): string {
        return null;
    }
    dropTriggerTemplate(name: string): string {
        throw new Error("Method not implemented.");
    }

}