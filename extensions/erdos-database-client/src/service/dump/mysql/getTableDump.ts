import { Node } from "../../../model/interface/node";
import { TableNode } from "../../../model/main/tableNode";
import { table } from 'console';
import { SchemaDumpOptions } from './interfaces/Options';

export interface ShowCreateTable {
    Table: string;
    'Create Table': string;
}

export async function getTableDump(node: Node, sessionId: string, options: Required<SchemaDumpOptions>, tables: Array<string>): Promise<string> {
    if (tables.length == 0) return '';
    const createStatements = tables.map(async (table) => {
        let schema = await node.getByRegion<TableNode>(table).showSource(false);
        if (!options.engine) {
            schema = schema.replace(/ENGINE\s*=\s*\w+ /, '');
        }
        if (options.table.dropIfExist) {
            schema = schema.replace(
                /^CREATE TABLE/,
                `DROP TABLE IF EXISTS ${table};\nCREATE TABLE`,
            );
        } else if (options.table.ifNotExist) {
            schema = schema.replace(
                /^CREATE TABLE/,
                'CREATE TABLE IF NOT EXISTS',
            );
        }
        return `${schema};`;
    });
    return (await Promise.all(createStatements)).join("\n\n");
}