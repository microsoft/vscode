import { FileManager, FileModel } from "../../common/filesManager";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import * as vscode from 'vscode';
import { Node } from "../interface/node";
import { ElasticMatch } from "./provider/ElasticMatch";

export class EsUtil {

    public static async executeEsQueryFile(em: ElasticMatch, parse: boolean) {
        const node = ConnectionManager.getByActiveFile() as Node;
        if (node == null) {
            vscode.window.showErrorMessage("Not active es server found!")
            return;
        }
        if (parse) {
            QueryUnit.runQuery(`${em.Method.Text} ${em.Path.Text}\n${em.Body.Text}`, node, { split: true, recordHistory: true })
            return;
        }
        (await node.getConnection()).query(`${em.Method.Text} ${em.Path.Text}\n${em.Body.Text}`, 'dontParse', async (err, data) => {
            const response = (err && err.message) || JSON.stringify(data, null, 2);
            vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(await FileManager.record(`${node.getConnectId()}#result.json`, response, FileModel.WRITE)),
                vscode.ViewColumn.Two, true
            )
        })
    }

}