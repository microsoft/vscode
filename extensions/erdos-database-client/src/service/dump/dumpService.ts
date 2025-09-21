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
            const tableList = await new TableGroup(node).getChildren();
            let childrenList = [...tableList]
            if (Global.getConfig("showView")) {
                childrenList.push(...(await new ViewGroup(node).getChildren()))
            }
            if (Global.getConfig("showProcedure")) {
                childrenList.push(...(await new ProcedureGroup(node).getChildren()))
            }
            if (Global.getConfig("showFunction")) {
                childrenList.push(...(await new FunctionGroup(node).getChildren()))
            }
            if (Global.getConfig("showTrigger")) {
                childrenList.push(...(await new TriggerGroup(node).getChildren()))
            }
            const pickItems = childrenList.filter(item => item.contextValue != ModelType.INFO)
                .map(node => { return { label: node.label, description: node.contextValue, picked: true }; });
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

        const tables = items.filter(item => item.description == ModelType.TABLE).map(item => item.label)
        const viewList = items.filter(item => item.description == ModelType.VIEW).map(item => item.label)
        const procedureList = items.filter(item => item.description == ModelType.PROCEDURE).map(item => item.label)
        const functionList = items.filter(item => item.description == ModelType.FUNCTION).map(item => item.label)
        const triggerList = items.filter(item => item.description == ModelType.TRIGGER).map(item => item.label)

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


}
