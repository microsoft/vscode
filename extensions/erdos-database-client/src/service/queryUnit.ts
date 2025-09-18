"use strict";
import * as vscode from "vscode";
import { CodeCommand, MessageType } from "../common/constants";
import { Console } from "../common/console";
import { FileManager, FileModel } from "../common/filesManager";
import { Node } from "../model/interface/node";
import { QueryPage } from "./result/query";
import { DataResponse, DMLResponse, ErrorResponse, MessageResponse, RunResponse } from "./result/queryResponse";
import { ConnectionManager } from "./connectionManager";
import { DelimiterHolder } from "../service/common/delimiterHolder";
import { ServiceManager } from "./serviceManager";
import { NodeUtil } from "../model/nodeUtil";
import { Trans } from "../common/trans";
import { IConnection } from "./connect/connection";
import { FieldInfo } from "../common/typeDef";
import { Util } from "../common/util";
import { SQLParser } from "../provider/parser/sqlParser";

export class QueryUnit {

    public static queryPromise<T>(connection: IConnection, sql: string, showError = true): Promise<QueryResult<T>> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err: Error, rows, fields, total) => {
                if (err) {
                    if (showError) {
                        Console.log(`Execute sql fail : ${sql}`);
                        Console.log(err);
                    }
                    reject(err);
                } else {
                    resolve(({ rows, fields, total }));
                }
            });
        });
    }


    public static async runQuery(sql: string, connectionNode: Node, queryOption: QueryOption = {}): Promise<void> {

        if (!connectionNode) {
            vscode.window.showErrorMessage("Not active database connection found!")
            return;
        }

        Trans.begin()
        connectionNode = NodeUtil.of(connectionNode)
        if (queryOption.split == null)
            queryOption.split = (sql == null);

        if (!sql) {
            sql = this.getSqlFromEditor(connectionNode, queryOption.runAll);
            queryOption.recordHistory = true;
        }
        if (!sql) {
            vscode.window.showErrorMessage("Not sql found!")
            return;
        }

        sql = sql.replace(/^\s*--.+/igm, '').trim();

        const parseResult = DelimiterHolder.parseBatch(sql, connectionNode.getConnectId())
        sql = parseResult.sql
        if (!sql && parseResult.replace) {
            QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE, queryOption, res: { message: `change delimiter success`, success: true } as MessageResponse });
            return;
        }

        QueryPage.send({ connection: connectionNode, type: MessageType.RUN, queryOption, res: { sql } as RunResponse });

        const executeTime = new Date().getTime();
        try {
            const connection = await ConnectionManager.getConnection(connectionNode)
            connection.query(sql, (err: Error, data, fields, total) => {
                if (err) {
                    QueryPage.send({ connection: connectionNode, type: MessageType.ERROR, queryOption, res: { sql, message: err.message } as ErrorResponse });
                    return;
                }
                const costTime = new Date().getTime() - executeTime;
                if (queryOption.recordHistory) {
                    vscode.commands.executeCommand(CodeCommand.RecordHistory, sql, costTime);
                }

                if (sql.match(/(create|drop|alter)\s+(table|prcedure|FUNCTION|VIEW)/i)) {
                    vscode.commands.executeCommand(CodeCommand.Refresh);
                }

                if (data.affectedRows) {
                    QueryPage.send({ connection: connectionNode, type: MessageType.DML, queryOption, res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                    return;
                }

                // query result
                if (Array.isArray(fields)) {
                    const isQuery = fields[0] != null && fields[0].name != undefined;
                    const isSqliteEmptyQuery = fields.length == 0 && sql.match(/\bselect\b/i);
                    const isMongoEmptyQuery = fields.length == 0 && sql.match(/\.collection\b/i);
                    if (isQuery || isSqliteEmptyQuery || isMongoEmptyQuery) {
                        QueryPage.send({ connection: connectionNode, type: MessageType.DATA, queryOption, res: { sql, costTime, data, fields, total } as DataResponse });
                        return;
                    }
                }

                if (Array.isArray(data)) {
                    // mysql procedrue call result
                    const lastEle = data[data.length - 1]
                    if (data.length > 2 && Util.is(lastEle, 'ResultSetHeader') && Util.is(data[0], 'TextRow')) {
                        data = data[data.length - 2]
                        const fieldsElement = fields[fields.length - 2];
                        fields = Array.isArray(fieldsElement) ? fieldsElement : []
                        QueryPage.send({ connection: connectionNode, type: MessageType.DATA, queryOption, res: { sql, costTime, data, fields, total } as DataResponse });
                        return;
                    }
                }

                QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE_BLOCK, queryOption, res: { sql, costTime, isInsert: sql.match(/\binsert\b/i) != null } as DMLResponse });

            });
        } catch (error) {
            console.log(error)
        }
    }
    public static runBatch(connection: IConnection, sqlList: string[]) {
        return new Promise((resolve, reject) => {
            connection.beginTransaction(async () => {
                try {
                    for (let sql of sqlList) {
                        sql = sql.trim()
                        if (!sql) { continue }
                        await this.queryPromise(connection, sql)
                    }
                    connection.commit()
                    resolve(true)
                } catch (err) {
                    connection.rollback()
                    reject(err)
                }
            })
        })

    }

    private static getSqlFromEditor(connectionNode: Node, runAll: boolean): string {
        if (!vscode.window.activeTextEditor) {
            throw new Error("No SQL file selected!");

        }
        const editor = vscode.window.activeTextEditor;
        if (runAll) {
            return editor.document.getText()
        }

        const selection = editor.selection;
        if (!selection.isEmpty) {
            return editor.document.getText(selection);
        }

        const parseResult = SQLParser.parseBlockSingle(editor.document, editor.selection.active);
        return parseResult && parseResult.sql
    }

    public static async showSQLTextDocument(node: Node, sql: string, template = "template.sql", fileMode: FileModel = FileModel.WRITE): Promise<vscode.TextEditor> {

        const document = await vscode.workspace.openTextDocument(await FileManager.record(`${node.uid}/${template}`, sql, fileMode));
        return await vscode.window.showTextDocument(document);
    }

}



export interface QueryResult<T> {
    rows: T; fields: FieldInfo[];
    total?: number;
}


export interface QueryOption {
    viewId?: any;
    split?: boolean;
    recordHistory?: boolean;
    /**
     * runAll if get sql from editor.
     */
    runAll?: boolean;
}