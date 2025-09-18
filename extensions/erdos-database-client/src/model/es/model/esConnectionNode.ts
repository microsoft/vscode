import { Global } from "../../../common/global";
import { Util } from "../../../common/util";
import { QueryGroup } from "../../query/queryGroup";
import { DbTreeDataProvider } from "../../../provider/treeDataProvider";
import { QueryUnit } from "../../../service/queryUnit";
import compareVersions from 'compare-versions';
import * as path from "path";
import { ExtensionContext, ThemeIcon, TreeItemCollapsibleState } from "vscode";
import { ConfigKey, Constants, ModelType } from "../../../common/constants";
import { ConnectionManager } from "../../../service/connectionManager";
import { CommandKey, Node } from "../../interface/node";
import { EsIndexGroup } from "./esIndexGroupNode";
import { EsTemplate } from "./esTemplate";
import * as extPackage from "../../../../../package.json";

/**
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
 */
export class EsConnectionNode extends Node {

    private static versionMap = {}
    public iconPath: string|ThemeIcon = path.join(Constants.RES_PATH, "icon/elasticsearch.svg");
    public contextValue: string = ModelType.ES_CONNECTION;
    constructor(readonly key: string, readonly parent: Node) {
        super(key)
        this.init(parent)
        if(compareVersions(extPackage.version,'3.6.6')===1){
            this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}`;
        }else{
            this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.port}`;
        }

        if (parent.name) {
            this.name = parent.name
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true)
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        
        this.cacheSelf()
        const lcp = ConnectionManager.activeNode;

        if (this.disable) {
            this.collapsibleState = TreeItemCollapsibleState.None;
            this.description=(this.description||'')+" closed"
            return;
        }

        if (EsConnectionNode.versionMap[this.label]) {
            this.description = EsConnectionNode.versionMap[this.label]
        } else {
            this.execute<any>('get /').then(res => {
                this.description=`version: ${res.version.number}`
                EsConnectionNode.versionMap[this.label]=this.description
                DbTreeDataProvider.refresh(this)
            }).catch(err=>{
                console.log(err)
            })
        }

        if (this.isActive(lcp)) {
            this.description = `${this.description}   Active`;
        }

    }


    newQuery() {
        QueryUnit.showSQLTextDocument(this,EsTemplate.query,`${this.host}.es`)
    }

    async getChildren(): Promise<Node[]> {

        return [new EsIndexGroup(this),new QueryGroup(this)]

    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async deleteConnection(context: ExtensionContext) {

        Util.confirm(`Are you sure you want to Delete Connection ${this.label} ? `, async () => {
            this.indent({command:CommandKey.delete})
        })

    }

}