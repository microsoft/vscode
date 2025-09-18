import axios, { AxiosRequestConfig } from "axios";
import { Node } from "../../model/interface/node";
import { IConnection, queryCallback } from "./connection";
import { EsIndexGroup } from "../../model/es/model/esIndexGroupNode";
import { FieldInfo } from "../../common/typeDef";

export class EsConnection extends IConnection {
    /**
     * Convert ES node children to FieldInfo array
     */
    private convertNodesToFieldInfo(nodes: any[]): FieldInfo[] {
        return nodes.map(node => ({
            catalog: '',
            db: '',
            schema: '',
            table: '',
            orgTable: '',
            name: node.label || '',
            orgName: node.label || '',
            charsetNr: 0,
            length: 0,
            flags: 0,
            decimals: 0,
            default: undefined,
            zeroFill: false,
            protocol41: true,
            type: this.mapEsTypeToMysqlType(node.type)
        }));
    }

    /**
     * Map Elasticsearch types to MySQL type enum
     */
    private mapEsTypeToMysqlType(esType: string): any {
        const typeMap: {[key: string]: number} = {
            'text': 252, 'keyword': 254, 'long': 8, 'integer': 3,
            'short': 2, 'byte': 1, 'double': 5, 'float': 4,
            'date': 10, 'boolean': 1, 'binary': 252, 'object': 252
        };
        return typeMap[esType] || 252; // default to TEXT
    }


    private url: string;
    private conneted: boolean;
    constructor(private opt: Node) {
        super()
        this.url = opt.esUrl || opt.host
        if (!this.url.match(/^(http|https):/)) {
            this.url = `${opt.scheme || "http"}://${this.url}`;
        }
    }

    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        const splitIndex = sql.indexOf('\n')
        let [type, path] = (splitIndex == -1 ? sql : sql.substring(0, splitIndex)).split(' ')
        if (path && path.charAt(0) != "/") {
            path = "/" + path
        }
        const body = splitIndex == -1 ? null : sql.substring(splitIndex + 1) + "\n"

        let config: AxiosRequestConfig = {
            method: type,
            url: `${this.url}${path}`,
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: this.opt.connectTimeout || 2000,
            responseType: 'json',
            data: body
        };

        this.bindAuth(config);

        axios(config).then(async ({ data }) => {
            if (values == "dontParse") {
                callback(null, data)
                return;
            }
            if (data.count) {
                callback(null, [{ count: data.count }], [{ name: 'count', nullable: 'YES' }])
            } else if (data.items || (data && (data.result == 'created' || data.result == 'updated' || data.result == 'deleted'))) {
                callback(null, { affectedRows: data.items ? data.items.length : 1 })
            } else if (data && data.hits && data.hits.hits) {
                this.handleSearch(path, data, callback);
            } else {
                callback(null, data)
            }
        }).catch(err => {
            const reason = (err && err.response && err.response.data && err.response.data.error && err.response.data.error.reason) || (err && err.response && err.response.data && err.response.data.error);
            if (reason) {
                callback(new Error(reason))
                return;
            }
            console.log(err)
            callback(err)
        })
    }
    bindAuth(config: AxiosRequestConfig) {
        if (this.opt.esAuth == 'account' && this.opt.user && this.opt.password) {
            config.auth = {
                username: this.opt.user,
                password: this.opt.password
            }
        } else if (this.opt.esAuth == 'token' && this.opt.esToken) {
            if (config.headers) {
                config.headers.Authorization = this.opt.esToken;
            } else {
                config.headers = {
                    Authorization: this.opt.esToken
                }
            }
        }
    }
    private async handleSearch(path: any, data: any, callback: any) {
        let fields = null;

        let rows = data.hits.hits.map((hit: any) => {
            if (!fields) {
                fields = [];
                for (const key in hit._source) {
                    fields.push({ name: key, type: 'text', nullable: 'YES' });
                }
            }
            let row = { _index: hit._index, _type: hit._type, _id: hit._id, _score: hit._score };
            for (const key in hit._source) {
                row[key] = hit._source[key];
                if (row[key] instanceof Object) {
                    row[key] = JSON.stringify(row[key]);
                }
            }
            if (hit.highlight) {
                for (const key in hit.highlight) {
                    row[key] = hit.highlight[key].map((hv: any) => (hv instanceof Object) ? JSON.stringify(hv) : hv).join(",")
                }
            }
            return row;
        });
        if (!fields) {
            const indexName = path.split('/')[1];
            const indexNode = (await new EsIndexGroup(this.opt).getChildren()).filter(node => node.label == indexName)[0]
            const children = indexNode && await indexNode.getChildren(); fields = children ? this.convertNodesToFieldInfo(children) : [];
        }
        fields.unshift({ name: "_id" }, { name: "_score" });
        callback(null, rows, fields, data.hits.total.value || data.hits.total);
    }

    connect(callback: (err: Error) => void): void {
        const config = {};
        this.bindAuth(config)
        axios.get(`${this.url}/_cluster/health`, config).then(res => {
            this.conneted = true;
            callback(null)
        }).catch(err => {
            callback(err)
        })

    }
    beginTransaction(callback: (err: Error) => void): void {
    }
    rollback(): void {
    }
    commit(): void {
    }
    end(): void {
    }
    isAlive(): boolean {
        return this.conneted;
    }

}