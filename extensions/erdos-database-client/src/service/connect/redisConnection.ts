import { Node } from "../../model/interface/node";
import { IConnection, queryCallback } from "./connection";
import * as fs from "fs";
import IoRedis from "ioredis";

export class RedisConnection extends IConnection {
    private conneted: boolean;
    private client: IoRedis.Redis;
    constructor(node: Node) {
        super()
        let config = {
            port: node.port,
            host: node.host,
            password: node.password,
            connectTimeout: node.options?.connectTimeout || 5000,
            db: parseInt(String(node.database || "0")),
            family: 4,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxLoadingTimeout: 1000
        }as IoRedis.RedisOptions;
        if(node.ssl){
            config.tls={
                rejectUnauthorized: false,
                ca: node.ssl.ca ? fs.readFileSync(node.ssl.ca) : null,
                cert: node.ssl.cert ? fs.readFileSync(node.ssl.cert) : null,
                key: node.ssl.key ? fs.readFileSync(node.ssl.key) : null,
                minVersion: 'TLSv1'
            }
        }
        this.client = new IoRedis(config);


    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        // Handle method overloads - if values is a function, it's actually the callback
        let actualCallback = callback;
        if (typeof values === 'function' && !callback) {
            actualCallback = values;
        }
        
        const param: string[] = sql.replace(/ +/g, " ").split(' ')
        const command = param.shift()?.toLowerCase()
        
        // Wrap the callback to handle Redis response format
        const wrappedCallback = (err: any, result: any) => {
            if (actualCallback) {
                // QueryUnit expects (err, rows, fields, total) but Redis returns (err, result)
                // For Redis, we'll pass the result as rows and null for fields/total
                actualCallback(err, result, null, null);
            }
        };
        
        // Use bracket notation to call Redis commands dynamically with proper TypeScript support
        if (command && typeof this.client[command] === 'function') {
            if (param.length === 0) {
                this.client[command](wrappedCallback);
            } else {
                this.client[command](...param, wrappedCallback);
            }
        }
    }
    run(callback: (client: IoRedis.Redis) => void) {

        callback(this.client)
    }

    connect(callback: (err: Error) => void): void {
        let timeout = true;
        const timeoutHandle = setTimeout(() => {
            if (timeout) {
                timeout = false;
                callback(new Error("Connect to redis server time out."))
            }
        }, 5000);
        
        // Since we're using lazyConnect: true, we need to explicitly connect
        this.client.connect()
            .then(() => {
                if (timeout) {
                    timeout = false;
                    clearTimeout(timeoutHandle);
                    this.conneted = true;
                    callback(null);
                }
            })
            .catch((err) => {
                if (timeout) {
                    timeout = false;
                    clearTimeout(timeoutHandle);
                    callback(err);
                }
            });
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