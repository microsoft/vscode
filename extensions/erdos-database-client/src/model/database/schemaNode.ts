import { FileModel } from "../../common/filesManager";
import { Global } from "../../common/global";
import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { FunctionGroup } from "../main/functionGroup";
import { ProcedureGroup } from "../main/procedureGroup";
import { TableGroup } from "../main/tableGroup";
import { TriggerGroup } from "../main/triggerGroup";
import { ViewGroup } from "../main/viewGroup";
import { MongoTableGroup } from "../mongo/mongoTableGroup";
import { QueryGroup } from "../query/queryGroup";

export class SchemaNode extends Node implements CopyAble {


    public contextValue: string = ModelType.SCHEMA;
    constructor(public schema: string, readonly parent: Node) {
        super(schema)
        this.init(this.parent)
        this.cacheSelf()
        this.iconPath = this.getIcon()
        const lcp = ConnectionManager.activeNode;
        if (this.isActive(lcp) && (lcp.database == this.database) && (lcp.schema == this.schema)) {
            this.iconPath=this.getIcon(true)
            this.description = `Active`
        }
    }

    private getIcon(active?: boolean): vscode.ThemeIcon {

        const iconId = this.dbType == DatabaseType.MYSQL ? "database" : "symbol-struct"
        if(Util.supportColorIcon()){
            return new vscode.ThemeIcon(iconId, new vscode.ThemeColor(active?'charts.blue':'dropdown.foreground'));
        }
        return new vscode.ThemeIcon(iconId);
    }

    public getChildren(): Promise<Node[]> | Node[] {

        if(this.dbType==DatabaseType.MONGO_DB){
            return [ new MongoTableGroup(this) ]
        }

        let childs: Node[] = [new TableGroup(this)];

        if (Global.getConfig('showView')) {
            childs.push(new ViewGroup(this))
        }

        if (Global.getConfig('showQuery')) {
            childs.push(new QueryGroup(this))
        }
        if (Global.getConfig('showProcedure')) {
            childs.push(new ProcedureGroup(this))
        }
        if (Global.getConfig('showFunction')) {
            childs.push(new FunctionGroup(this))
        }
        if (Global.getConfig('showTrigger')) {
            childs.push(new TriggerGroup(this))
        }

        return childs;
    }

    public dropDatatabase() {

        const target = this.dbType == DatabaseType.MSSQL || this.dbType == DatabaseType.PG ? 'schema' : 'database';
        vscode.window.showInputBox({ prompt: `Are you sure you want to drop ${target} ${this.schema} ?     `, placeHolder: `Input ${target} name to confirm.` }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.schema.toLowerCase()) {
                this.execute(`DROP ${target} ${this.wrap(this.schema)}`).then(async () => {
                    for (const child of await this.getChildren()) {
                        child.setChildCache(null)
                    }
                    DatabaseCache.clearDatabaseCache(`${this.getConnectId()}`)
                    DbTreeDataProvider.refresh(this.parent);
                    vscode.window.showInformationMessage(`Drop ${target} ${this.schema} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel drop ${target} ${this.schema}`)
            }
        })

    }


    public async truncateDb() {


        vscode.window.showInputBox({ prompt: `Dangerous: Are you sure you want to truncate database ${this.schema} ?     `, placeHolder: 'Input database name to confirm.' }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.schema.toLowerCase()) {
                const connection = await ConnectionManager.getConnection(this);
                QueryUnit.queryPromise(connection, this.dialect.truncateDatabase(this.schema)).then(async (res: any) => {
                    await QueryUnit.runBatch(connection, res.map(data => data.trun))
                    vscode.window.showInformationMessage(`Truncate database ${this.schema} success!`)
                })
            } else {
                vscode.window.showInformationMessage(`Cancel truncate database ${this.schema}!`)
            }
        })

    }

    public async newQuery() {

        QueryUnit.showSQLTextDocument(this,'',`${this.schema}.sql`,FileModel.APPEND)

    }

    public copyName() {
        Util.copyToBoard(this.schema)
    }

}
