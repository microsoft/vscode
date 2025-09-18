import { ConnectionNode } from "../../model/database/connectionNode";
import { AbstractStatusService, DashBoardItem, DashBoardResponse } from "./abstractStatusService";
import format = require('date-format');

interface QueryResponse {
    Variable_name: string,
    Value: string
}

export class MysqlStatusService extends AbstractStatusService {

    private responseToObj(resArray: QueryResponse[]): any {
        const response = {}
        for (const res of resArray) {
            let value: any = parseInt(res.Value)
            if (isNaN(value)) {
                value = res.Value
            }
            response[res.Variable_name] = value
        }
        return response;
    }

    protected async onDashBoard(connectionNode: ConnectionNode): Promise<DashBoardResponse> {

        const now = format('hh:mm:ss', new Date())

        const status = this.responseToObj((await connectionNode.execute("show global status ")));

        const sessions = await this.buildSession(status, now);
        const queries = await this.buildQueries(status, now);
        const traffic = await this.buildTraffic(status, now);

        return {
            sessions,
            queries,
            traffic
        };
    }

    private async buildTraffic(resposne: any, now: any): Promise<DashBoardItem[]> {
        return [
            { now, type: 'received', value: resposne.Bytes_received },
            { now, type: 'sent', value: resposne.Bytes_sent }
        ];
    }

    private async buildSession(resposne: any, now: any): Promise<DashBoardItem[]> {
        return [
            { now, type: 'count', value: resposne.Threads_connected },
            { now, type: 'running', value: resposne.Threads_running },
            { now, type: 'sleep', value: resposne.Threads_connected - resposne.Threads_running }
        ];
    }

    private async buildQueries(resposne: any, now: any): Promise<DashBoardItem[]> {
        return [
            { now, type: 'insert', value: resposne.Com_insert },
            { now, type: 'update', value: resposne.Com_update },
            { now, type: 'delete', value: resposne.Com_delete },
            { now, type: 'select', value: resposne.Com_select },
            { now, type: 'read', value: resposne.Innodb_rows_read },
        ];

    }



}




