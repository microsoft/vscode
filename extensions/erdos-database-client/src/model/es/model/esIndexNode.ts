import { ConfigKey, ModelType } from "../../../common/constants";
import { FileManager } from "../../../common/filesManager";
import { Global } from "../../../common/global";
import { QueryUnit } from "../../../service/queryUnit";
import { Range, ThemeIcon } from "vscode";
import { Node } from "../../interface/node";
import { EsColumnNode } from "./esColumnNode";
import { EsTemplate } from "./esTemplate";


export class ESIndexNode extends Node {

    public iconPath = new ThemeIcon("type-hierarchy");
    public contextValue: string = ModelType.ES_INDEX;
    public properties: string;
    constructor(readonly info: string, readonly parent: Node) {
        super(null)
        const [health, status, index, uuid, pri, rep, docsCount, docsDeleted, storeSize, priStoreSize] = info.split(/\s+/)
        this.label = index
        this.init(parent)
        this.cacheSelf()
        this.description = `${storeSize} Docs ${docsCount}`
        this.command = {
            command: "mysql.show.esIndex",
            title: "Show ES Index Data",
            arguments: [this, true],
        }
    }

    async getChildren(): Promise<Node[]> {

        return this.execute(`get /${this.label}/_mapping`).then(data => {
            const mappings = data[this.label] && data[this.label].mappings
            if (mappings!=null && Object.keys(mappings).length>0) {
                // since es7, mappings don't have type.
                const firstMappingKey = Object.keys(mappings)[0];
                const properties = mappings.properties || (mappings[firstMappingKey] && mappings[firstMappingKey].properties)
                this.properties = properties;
                return Object.keys(properties).map(name => {
                    const property = properties[name];
                    return new EsColumnNode(name, property, this)
                })

            }

            return []
        })

    }

    public newQuery() {
        FileManager.show(`${this.getConnectId()}/${this.label}.es`).then(async editor => {
            if (editor.document.getText().length == 0) {
                const columns = (await this.getChildren()).map(n => `"${n.label}"`).join(",")
                editor.edit(editBuilder => {
                    editBuilder.replace(new Range(0, 0, 0, 0), EsTemplate.query.replace(/myIndex/g, this.label).replace("$fields", columns))
                });
            }
        })
    }
    public async countSql() {

        QueryUnit.runQuery(`get /${this.label}/_count`, this, { recordHistory: true })

    }


    viewData() {
        QueryUnit.runQuery(`GET /${this.label}/_search
{ "from": 0, "size": ${Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT)}, "query": { "match_all": {} } }`, this, { recordHistory: true })
    }

}