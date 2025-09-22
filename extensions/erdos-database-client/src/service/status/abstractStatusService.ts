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

    public async show(node: node): Promise<void> {
        // Call the workbench command to open the DatabaseStatusEditor
        const vscode = await import('vscode');
        await vscode.commands.executeCommand(
            'erdos.database.serverInfo',
            node.getConnectId(), // connectionId
            node.name || node.host, // connectionName
            node.dbType // databaseType
        );
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
