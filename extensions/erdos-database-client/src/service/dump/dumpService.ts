import { TableGroup } from "../../model/main/tableGroup";
import { ViewGroup } from "../../model/main/viewGroup";
import { ViewNode } from "../../model/main/viewNode";
import * as vscode from "vscode";
import { Node } from "../../model/interface/node";
import { TableNode } from "../../model/main/tableNode";
import format = require('date-format');
import { FunctionGroup } from "../../model/main/functionGroup";
import { ProcedureGroup } from "../../model/main/procedureGroup";
import { TriggerGroup } from "../../model/main/triggerGroup";
import { ConfigKey, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import mysqldump, { Options } from './mysql/main';
import { Global } from "../../common/global";
import { SchemaNode } from "../../model/database/schemaNode";
import * as officegen from 'officegen';
import { DumpDocument as GenerateDocument } from "./generateDocument";
import { createWriteStream } from "fs";
import { ColumnNode } from "../../model/other/columnNode";
import { Console } from "../../common/console";

export class DumpService {

    public async dump(node: Node, withData: boolean) {

        let nodes = []
        if (node instanceof TableNode || node instanceof ViewNode) {
            nodes = [{ label: node.table, description: node.contextValue }]
        } else {
            let childrenList = []
            
            // Special handling for databases with multiple schemas
            if (this.shouldGetAllSchemas(node)) {
                
                // Get all schemas in the database
                const schemas = await this.getAllSchemas(node);
                
                // Get tables from each schema
                for (const schema of schemas) {                    
                    // Temporarily modify the node's schema property
                    const originalSchema = node.schema;
                    node.schema = schema;
                    
                    const tableList = await new TableGroup(node).getChildren();
                    const validTables = tableList.filter(t => t.contextValue !== ModelType.INFO);
                    
                    // Create display items with schema prefixes for export dialog, but keep original nodes intact
                    const prefixedTables = validTables.map(table => ({
                        ...table,
                        displayLabel: `${schema}.${table.label}`,
                        originalLabel: table.label,
                        schema: schema
                    }));
                    childrenList.push(...prefixedTables);
                    
                    if (Global.getConfig("showView")) {
                        const viewList = await new ViewGroup(node).getChildren();
                        const validViews = viewList.filter(v => v.contextValue !== ModelType.INFO);
                        const prefixedViews = validViews.map(view => ({
                            ...view,
                            displayLabel: `${schema}.${view.label}`,
                            originalLabel: view.label,
                            schema: schema
                        }));
                        childrenList.push(...prefixedViews);
                    }
                    
                    if (Global.getConfig("showProcedure")) {
                        const procList = await new ProcedureGroup(node).getChildren();
                        const validProcs = procList.filter(p => p.contextValue !== ModelType.INFO);
                        const prefixedProcs = validProcs.map(proc => ({
                            ...proc,
                            displayLabel: `${schema}.${proc.label}`,
                            originalLabel: proc.label,
                            schema: schema
                        }));
                        childrenList.push(...prefixedProcs);
                    }
                    
                    if (Global.getConfig("showFunction")) {
                        const funcList = await new FunctionGroup(node).getChildren();
                        const validFuncs = funcList.filter(f => f.contextValue !== ModelType.INFO);
                        const prefixedFuncs = validFuncs.map(func => ({
                            ...func,
                            displayLabel: `${schema}.${func.label}`,
                            originalLabel: func.label,
                            schema: schema
                        }));
                        childrenList.push(...prefixedFuncs);
                    }
                    
                    if (Global.getConfig("showTrigger")) {
                        const triggerList = await new TriggerGroup(node).getChildren();
                        const validTriggers = triggerList.filter(t => t.contextValue !== ModelType.INFO);
                        const prefixedTriggers = validTriggers.map(trigger => ({
                            ...trigger,
                            displayLabel: `${schema}.${trigger.label}`,
                            originalLabel: trigger.label,
                            schema: schema
                        }));
                        childrenList.push(...prefixedTriggers);
                    }
                    
                    // Restore original schema
                    node.schema = originalSchema;
                }
            } else {
                // Standard logic for single-schema databases or when schema is specified
                const tableList = await new TableGroup(node).getChildren();
                
                // Filter out InfoNode objects immediately
                const validTables = tableList.filter(t => t.contextValue !== ModelType.INFO);
                childrenList = [...validTables]
                
                if (Global.getConfig("showView")) {
                    const viewList = await new ViewGroup(node).getChildren();
                    const validViews = viewList.filter(v => v.contextValue !== ModelType.INFO);
                    childrenList.push(...validViews);
                }
                
                if (Global.getConfig("showProcedure")) {
                    const procList = await new ProcedureGroup(node).getChildren();
                    const validProcs = procList.filter(p => p.contextValue !== ModelType.INFO);
                    childrenList.push(...validProcs);
                }
                
                if (Global.getConfig("showFunction")) {
                    const funcList = await new FunctionGroup(node).getChildren();
                    const validFuncs = funcList.filter(f => f.contextValue !== ModelType.INFO);
                    childrenList.push(...validFuncs);
                }
                
                if (Global.getConfig("showTrigger")) {
                    const triggerList = await new TriggerGroup(node).getChildren();
                    const validTriggers = triggerList.filter(t => t.contextValue !== ModelType.INFO);
                    childrenList.push(...validTriggers);
                }
            }
            
            // All items in childrenList are already valid (InfoNode objects filtered out)
            const pickItems = childrenList.map(node => { 
                return { 
                    label: node.displayLabel || node.label, // Use displayLabel for prefixed names, fallback to label
                    description: node.contextValue, 
                    picked: true,
                    originalLabel: node.originalLabel || node.label, // Store original name for dump process
                    schema: node.schema
                }; 
            });
            
            if (pickItems.length === 0) {
                vscode.window.showWarningMessage('No exportable items found in this database/schema.');
                return;
            }
            
            nodes = await vscode.window.showQuickPick(pickItems, { canPickMany: true, matchOnDescription: true, ignoreFocusOut: true })
            if (!nodes) {
                return;
            }
        }

        this.triggerSave(node).then((folderPath) => {
            if (folderPath) {
                this.dumpData(node, folderPath.fsPath, withData, nodes)
            }
        })

    }

    protected triggerSave(node: Node) {
        const tableName = node instanceof TableNode ? node.table : null;
        const exportSqlName = `${tableName ? tableName : ''}_${format('yyyy-MM-dd_hhmmss', new Date())}_${node.schema}.sql`;

        return vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(exportSqlName), filters: { 'sql': ['sql'] } });
    }

    private dumpData(node: Node, dumpFilePath: string, withData: boolean, items: vscode.QuickPickItem[]): void {

        // Use originalLabel if available (from multi-schema export), otherwise use label
        const getOriginalName = (item: any) => {
            return item.originalLabel || item.label;
        };

        const tables = items.filter(item => item.description == ModelType.TABLE).map(item => getOriginalName(item))
        const viewList = items.filter(item => item.description == ModelType.VIEW).map(item => getOriginalName(item))
        const procedureList = items.filter(item => item.description == ModelType.PROCEDURE).map(item => getOriginalName(item))
        const functionList = items.filter(item => item.description == ModelType.FUNCTION).map(item => getOriginalName(item))
        const triggerList = items.filter(item => item.description == ModelType.TRIGGER).map(item => getOriginalName(item))

        const option: Options = {
            dump: {
                withDatabase: node instanceof SchemaNode,
                tables, viewList, procedureList, functionList, triggerList
            },
            dumpToFile: dumpFilePath,
        };
        if (!withData) {
            option.dump.data = false;
        }
        Util.process(`Doing backup ${node.host}_${node.schema}...`, (done) => {
            mysqldump(option, node).then(() => {
            }).catch(err => Console.log(err.message)).finally(done)
        })

    }

    public async generateDocument(node: Node) {

        const exportSqlName = `${format('yyyy-MM-dd_hhmmss', new Date())}_${node.schema}.docx`;

        vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(exportSqlName), filters: { 'docx': ['docx'] } }).then(async (generatePath) => {
            if (generatePath) {
                const nodes = await new TableGroup(node).getChildren();
                // Using imported officegen
                var docx = officegen('docx')
                docx.on('finalize', (written) => {
                    console.log(
                        'Finish to create Word file.\nTotal bytes created: ' + written + '\n'
                    )
                })
                docx.on('error', (err) => {
                    console.log(err)
                })
                let data = []
                for (const tableNode of nodes) {
                    data.push(...[{
                        type: 'text',
                        val: tableNode.label
                    },
                    {
                        type: 'table',
                        val: [
                            GenerateDocument.header,
                            ...(await tableNode.getChildren()).map((child: ColumnNode) => {
                                const column = child.column;
                                return [
                                    child.label, child.type, column.comment, child.isPrimaryKey ? 'YES' : '', column.nullable,
                                    column.defaultValue
                                ]
                            })
                        ],
                        opt: GenerateDocument.tableStyle
                    },
                    {
                        type: 'linebreak'
                    }, {
                        type: 'linebreak'
                    }
                    ])
                }
                docx.createByJson(data)
                var out = createWriteStream(generatePath.fsPath)
                out.on('error', function (err) {
                    console.log(err)
                })
                out.on("close", () => {
                })
                docx.generate(out)
            }
        })

    }

    /**
     * Determine if we should get all schemas for this database type
     */
    private shouldGetAllSchemas(node: Node): boolean {
        // Check if this is a database/catalog node without a specific schema
        const hasNoSchema = !node.schema || node.schema === '';
        
        // Database types that support multiple schemas
        const multiSchemaTypes = ['PostgreSQL', 'SqlServer'];
        
        return hasNoSchema && multiSchemaTypes.includes(node.dbType);
    }

    /**
     * Get all schemas for the appropriate database type using the dialect pattern
     */
    private async getAllSchemas(node: Node): Promise<string[]> {
        // Use the dialect pattern to get the appropriate schema query
        const schemaQuery = node.dialect.showSchemas();
        const schemas = await node.execute<any[]>(schemaQuery);
        
        // Extract schema names from the result - different databases use different column names
        const schemaNames = schemas.map(row => 
            row.schema_name || row.SCHEMA_NAME || row.schema || row.Schema || row.name || row.Name
        ).filter(name => name); // Filter out any null/undefined values
                    
        // Apply database-specific filtering and defaults
        return this.filterAndDefaultSchemas(schemaNames, node.dbType);
    }

    /**
     * Filter out system schemas and provide defaults based on database type
     */
    private filterAndDefaultSchemas(schemaNames: string[], dbType: string): string[] {
        let filteredSchemas: string[] = [];
        
        switch (dbType) {
            case 'PostgreSQL':
                // Filter out PostgreSQL system schemas
                filteredSchemas = schemaNames.filter(name => 
                    !['information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'].includes(name)
                );
                break;
            case 'SqlServer':
                // Filter out SQL Server system schemas  
                filteredSchemas = schemaNames.filter(name =>
                    !['sys', 'information_schema', 'guest', 'INFORMATION_SCHEMA'].includes(name)
                );
                break;
            default:
                // For other databases, use all schemas
                filteredSchemas = schemaNames;
                break;
        }
        
        // If no schemas found after filtering, use defaults
        if (filteredSchemas.length === 0) {
            return this.getDefaultSchemas(dbType);
        }
        
        return filteredSchemas;
    }

    /**
     * Get default schemas for each database type
     */
    private getDefaultSchemas(dbType: string): string[] {
        switch (dbType) {
            case 'PostgreSQL':
                return ['public'];
            case 'SqlServer':
                return ['dbo'];
            case 'MySQL':
                return ['default'];
            default:
                return ['default'];
        }
    }


}
