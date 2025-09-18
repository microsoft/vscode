import { EventEmitter } from "events";
import { IConnection } from "../connection";
import { IpoolConnection, pcStatus } from "./poolConnection";

export abstract class ConnectionPool<T> extends IConnection {
    private connections: IpoolConnection<T>[] = [];
    private conneted: boolean;
    private waitQueue: Function[] = [];

    constructor() {
        super()
    }

    public async getConnection(callback?: (connection: IpoolConnection<T>) => void): Promise<IpoolConnection<T>> {
        for (let i = 0; i < this.connections.length; i++) {
            const connection = this.connections[i];
            if (connection && connection.status == pcStatus.FREE) {
                if (callback)
                    callback(connection)
                connection.status = pcStatus.BUSY
                return connection
            }
        }
        this.waitQueue.push(callback)
        this.fill()
    }


    public isAlive(): boolean {
        return this.conneted;
    }

    public async fill() {
        this.conneted = true;
        const amount = 1
        for (let i = 0; i < amount; i++) {
            if (this.connections[i]) continue;
            const poolConnection = new IpoolConnection<T>(i, pcStatus.PEENDING);
            this.connections.push(poolConnection)
            this.createConnection(poolConnection)
        }
    }
    private createConnection(poolConnection: IpoolConnection<T>): void {
        try {
            this.newConnection((err, con) => {
                if (err) {
                    this.createConnection(poolConnection)
                    return;
                }
                poolConnection.actual = con
                if (con instanceof EventEmitter) {
                    con.on("error", () => {
                        this.endConnnection(poolConnection)
                    })
                    con.on("end", () => {
                        this.endConnnection(poolConnection)
                    })
                }
                const waiter = this.waitQueue.shift()
                if (waiter) {
                    poolConnection.status = pcStatus.BUSY
                    waiter(poolConnection)
                } else {
                    poolConnection.status = pcStatus.FREE
                }
            })
        } catch (error) {
            this.createConnection(poolConnection)
        }
    }

    protected abstract newConnection(callback: (err: Error, connection: T) => void): void;
    public release(poolConnection: IpoolConnection<T>): void {
        poolConnection.status = pcStatus.FREE
        const waiter = this.waitQueue.shift()
        if (waiter) {
            poolConnection.status = pcStatus.BUSY
            waiter(poolConnection)
        }
    }
    public endConnnection(poolConnection: IpoolConnection<T>): void {
        try {
            if (poolConnection.actual && typeof (poolConnection.actual as {end?: Function}).end === "function") (poolConnection.actual as {end: Function}).end();
        } catch (error) { }
        delete this.connections[poolConnection.id];
    }
    public end() {
        for (let i = 0; i < this.connections.length; i++) {
            const con = this.connections[i];
            if (con && con.actual) {
                if (con.actual && typeof (con.actual as {end?: Function}).end === "function") (con.actual as {end: Function}).end()
            }
        }
    }
}