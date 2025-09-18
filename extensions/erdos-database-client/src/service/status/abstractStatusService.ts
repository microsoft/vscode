import { DatabaseType } from "../../common/constants";
import { NodeUtil } from "../../model/nodeUtil";
import { ConnectionManager } from "../connectionManager";
import { QueryUnit } from "../queryUnit";
import { Global } from "../../common/global";
import { ViewManager } from "../../common/viewManager";
import { ConnectionNode as node } from "../../model/database/connectionNode";
import { StatusService } from "./statusService";

export abstract class AbstractStatusService implements StatusService {

    protected abstract onDashBoard(connectionNode: node): DashBoardResponse | Promise<DashBoardResponse>;

    public show(node: node): void | Promise<void> {
        ViewManager.createWebviewPanel({
            path: "app",
            splitView: false, title: `Status@${node.host}`,
            iconPath: Global.getExtPath("resources", "icon", "state.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'status')
                }).on("route-status", () => {
                    handler.emit('info', NodeUtil.removeParent(node))
                }).on("processList", async () => {
                    QueryUnit.queryPromise<any>(await ConnectionManager.getConnection(node), node.dialect.processList()).then(({ rows, fields }) => {
                        handler.emit("processList", { fields, rows })
                    })
                }).on("variableList", async () => {
                    if (node.dbType == DatabaseType.MSSQL) return;
                    QueryUnit.queryPromise<any>(await ConnectionManager.getConnection(node), node.dialect.variableList()).then(({ rows, fields }) => {
                        handler.emit("variableList", { fields, rows })
                    })
                }).on("statusList", async () => {
                    if (node.dbType == DatabaseType.MSSQL) return;
                    QueryUnit.queryPromise<any>(await ConnectionManager.getConnection(node), node.dialect.statusList()).then(({ rows, fields }) => {
                        handler.emit("statusList", { fields, rows })
                    })
                }).on("dashBoard", async () => {
                    if (node.dbType != DatabaseType.MYSQL) return;
                    const dashBoard = await this.onDashBoard(node)
                    handler.emit("dashBoard", { ...dashBoard })
                })
            }
        })
    }

}

export interface DashBoardItem {
    now: any;
    type: string;
    value: number
}

export interface DashBoardResponse {
    sessions: DashBoardItem[],
    queries: DashBoardItem[],
    traffic: DashBoardItem[],
}
