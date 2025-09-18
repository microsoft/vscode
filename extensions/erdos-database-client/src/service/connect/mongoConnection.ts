import * as fs from "fs";
import { Node } from "../../model/interface/node";
import { MongoClient, MongoClientOptions, ObjectId as MObjectId } from "mongodb";
import { IConnection, queryCallback } from "./connection";

export class MongoConnection extends IConnection {
    private conneted: boolean;
    private client: MongoClient;
    private option: MongoClientOptions;
    constructor(private node: Node) {
        super()
        this.option = {
            connectTimeoutMS: this.node.connectTimeout || 5000, waitQueueTimeoutMS: this.node.requestTimeout,
            ssl: this.node.useSSL, sslValidate: false,
            sslCert: (node.clientCertPath) ? fs.readFileSync(node.clientCertPath) : null,
            sslKey: (node.clientKeyPath) ? fs.readFileSync(node.clientKeyPath) : null,
        } as MongoClientOptions;
    }

    connect(callback: (err: Error) => void): void {
        let url=this.node.connectionUrl;
        if (url) {
          this.option = { useNewUrlParser: true}
        } else {
          url = `mongodb://${this.node.host}:${this.node.port}`;
          if (this.node.user || this.node.password) {
            const escapedUser = encodeURIComponent(this.node.user)
            const escapedPassword = encodeURIComponent(this.node.password)
            url = `mongodb://${escapedUser}:${escapedPassword}@${this.node.host}:${this.node.port}`;
          }
        }
        MongoClient.connect(url, this.option, (err, client) => {
          if (!err) {
            this.client = client;
            this.conneted = true;
          }
          callback(err)
        })
      }

    run(callback: (client: MongoClient) => void) {

        callback(this.client)
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
        return this.conneted && this.client && this.client.isConnected();
    }

    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    async query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        if (sql == 'show dbs') {
            this.client.db().admin().listDatabases().then((res) => {
                callback(null, res.databases.map((db: any) => ({ Database: db.name })))
                console.log(res)
            })
        } else {
            try {
                const result = await eval('this.client.' + sql)
                if (result == null) {
                    callback(null)
                } else if (Number.isInteger(result)) {
                    callback(null, result)
                } else if (result.insertedCount != undefined) {
                    callback(null, { affectedRows: result.insertedCount })
                } else if (result.updatedCount != undefined) {
                    callback(null, { affectedRows: result.updatedCount })
                } else if (result.deletedCount != undefined) {
                    callback(null, { affectedRows: result.deletedCount })
                } else {
                    this.handleSearch(sql, result, callback)
                }
            } catch (error) {
                callback(error)
            }
        }
    }



    private async handleSearch(sql: any, data: any, callback: any) {
        let fields = null;

        let rows = data.map((document: any) => {
            if (!fields) {
                fields = [];
                for (const key in document) {
                    fields.push({ name: key, type: 'text', nullable: 'YES' });
                }
            }
            let row = {};
            for (const key in document) {
                row[key] = document[key];
                if (row[key] instanceof MObjectId) {
                    row[key] = `ObjectID('${row[key]}')`;
                } else if (row[key] instanceof Object) {
                    row[key] = JSON.stringify(row[key]);
                }
            }
            return row;
        });
        // if (!fields) {
        //     const indexName = path.split('/')[1];
        //     const indexNode = Node.nodeCache[`${this.opt.getConnectId()}_${indexName}`] as Node;
        //     fields = (await indexNode?.getChildren())?.map((node: any) => { return { name: node.label, type: node.type, nullable: 'YES' }; }) as any;
        // }
        callback(null, rows, fields || []);
    }

}

function ObjectID(objectId: string) {
    return new MObjectId(objectId)
}