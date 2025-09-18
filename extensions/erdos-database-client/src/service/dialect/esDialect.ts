import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class EsDialect extends SqlDialect{
    variableList(): string {
        throw new Error("Method not implemented.");
    }
    statusList(): string {
        throw new Error("Method not implemented.");
    }
    processList(): string {
        throw new Error("Method not implemented.");
    }
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        return "";
    }
    showSchemas(): string {
        return "";
    }
    showTables(database: string): string {
        return "";
    }
    addColumn(table: string): string {
        return "";
    }
    showColumns(database: string, table: string): string {
        return "";
    }
    showViews(database: string): string {
        return "";
    }
    showUsers(): string {
        return "";
    }
    createUser(): string {
        return "";
    }
    showTriggers(database: string): string {
        return "";
    }
    showProcedures(database: string): string {
        return "";
    }
    showFunctions(database: string): string {
        return "";
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        return "";
    }
    countSql(database: string, table: string): string {
        return "";
    }
    createDatabase(database: string): string {
        return "";
    }
    truncateDatabase(database: string): string {
        return "";
    }
    updateTable(update: UpdateTableParam): string {
        return "";
    }
    showTableSource(database: string, table: string): string {
        return "";
    }
    showViewSource(database: string, table: string): string {
        return "";
    }
    showProcedureSource(database: string, name: string): string {
        return "";
    }
    showFunctionSource(database: string, name: string): string {
        return "";
    }
    showTriggerSource(database: string, name: string): string {
        return "";
    }
    tableTemplate(): string {
        return `// Create index
PUT /[indexName]
{
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 1
    }
}`;
    }
    viewTemplate(): string {
        return "";
    }
    procedureTemplate(): string {
        return "";
    }
    triggerTemplate(): string {
        return "";
    }
    functionTemplate(): string {
        return "";
    }
    
}