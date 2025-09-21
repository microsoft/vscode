import { Console } from "../../common/console";
import { Global } from "../../common/global";
import * as path from "path";
import * as vscode from "vscode";
import { ConfigKey, Constants, DatabaseType, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { DatabaseCache } from "../../service/common/databaseCache";
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { CommandKey, Node } from "../interface/node";
import { TableGroup } from "../main/tableGroup";
import { ViewGroup } from "../main/viewGroup";
import { CatalogNode } from "./catalogNode";
import { SchemaNode } from "./schemaNode";
import { UserGroup } from "./userGroup";

/**
 * TODO: Switch to using connection pool, currently causes incorrect queue consumption, causing views to lose response
 */
export class ConnectionNode extends Node implements CopyAble {

    public iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, "icon/mysql.svg");
    public contextValue: string = ModelType.CONNECTION;
    constructor(readonly key: string, readonly parent: Node) {
        super(key)
        this.init(parent)
        this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.instanceName ? this.instanceName : this.port}`;
        if (this.dbType == DatabaseType.SQLITE) {
            this.label = this.dbPath;
        }
        this.cacheSelf()
        if (parent.name) {
            this.name = parent.name
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true)
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        // https://www.iloveimg.com/zh-cn/resize-image/resize-svg
        if (this.dbType == DatabaseType.PG) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/pg_server.svg");
        } else if (this.dbType == DatabaseType.MSSQL) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/mssql_server.png");
        } else if (this.dbType == DatabaseType.SQLITE) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/sqlite-icon.svg");
        } else if (this.dbType == DatabaseType.MONGO_DB) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/mongodb-icon.svg");
        }
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description || '') + " closed"
            return;
        }
        const lcp = ConnectionManager.activeNode;
        if (lcp && lcp.getConnectId().includes(this.getConnectId())) {
            this.description = (this.description || '') + " Active"
        }
        try {
            this.getChildren()
        } catch (error) {
            Console.log(error)
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {


        if (this.dbType == DatabaseType.SQLITE) {
            return [new TableGroup(this), new ViewGroup(this)];
        }

        let dbNodes = DatabaseCache.getSchemaListOfConnection(this.uid);
        if (dbNodes && !isRresh) {
            // update active state.
            return dbNodes.map(dbNode => {
                if (dbNode.contextValue == ModelType.USER_GROUP) {
                    return new UserGroup(dbNode.label, this)
                } else if (dbNode.contextValue == ModelType.CATALOG) {
                    return new CatalogNode(dbNode.label, this)
                }
                return new SchemaNode(dbNode.label, this)
            });
        }

        const hasCatalog = this.dbType != DatabaseType.MYSQL && this.contextValue == ModelType.CONNECTION;
        const sql = hasCatalog ? this.dialect.showDatabases() : this.dialect.showSchemas();
        return this.execute<any[]>(sql)
            .then((databases) => {
                const includeDatabaseArray = this.includeDatabases && this.includeDatabases.toLowerCase().split(",")
                const usingInclude = this.includeDatabases && includeDatabaseArray && includeDatabaseArray.length >= 1;
                const databaseNodes = databases.filter((db) => {
                    if (usingInclude && !db.schema) {
                        return includeDatabaseArray.indexOf(db.Database.toLocaleLowerCase()) != -1;
                    }
                    return true;
                }).map<SchemaNode | CatalogNode>((database) => {
                    return hasCatalog ?
                        new CatalogNode(database.Database, this)
                        : new SchemaNode(database.schema || database.Database, this);
                });

                if (Global.getConfig("showUser") && !hasCatalog) {
                    databaseNodes.unshift(new UserGroup("USER", this));
                }
                DatabaseCache.setSchemaListOfConnection(this.uid, databaseNodes);

                return databaseNodes;
            })
    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async newQuery() {

        await FileManager.show(`${this.label}.sql`);
        let childMap = {};
        const dbNameList = (await this.getChildren()).filter((databaseNode) => (databaseNode instanceof SchemaNode || databaseNode instanceof CatalogNode)).map((databaseNode) => {
            childMap[databaseNode.uid] = databaseNode
            return this.dbType == DatabaseType.MYSQL ? databaseNode.schema : databaseNode.database;
        });
        let dbName: string;
        if (dbNameList.length == 1) {
            dbName = dbNameList[0]
        }
        if (dbNameList.length > 1) {
            dbName = await vscode.window.showQuickPick(dbNameList, { placeHolder: "active database" })
        }
        ConnectionManager.changeActive(dbName ? childMap[`${this.getConnectId()}@${dbName}`] : this)

    }

    public createDatabase() {
        vscode.window.showInputBox({ placeHolder: 'Input you want to create new database name.' }).then(async (inputContent) => {
            if (!inputContent) { return; }
            this.execute(this.dialect.createDatabase(inputContent)).then(() => {
                DatabaseCache.clearDatabaseCache(this.uid);
                DbTreeDataProvider.refresh(this);
            });
        });
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you sure you want to delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
        })

    }

    public static init() { }


}
