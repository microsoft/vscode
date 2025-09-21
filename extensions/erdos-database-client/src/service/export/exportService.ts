import * as vscode from "vscode";
import { FieldInfo } from "../../common/typeDef";
import * as fs from "fs";
import { Console } from "../../common/console";
import { ExportContext, ExportType } from "./exportContext";
import { ProgressLocation } from "vscode";
import { ConnectionManager } from "../connectionManager";
import { DatabaseType } from "../../common/constants";
import * as nodeXlsx from "node-xlsx";

export class ExportService {

    public export(context: ExportContext): Thenable<any> {
        const randomFileName = `${new Date().getTime()}.${context.type}`

        return vscode.window.showSaveDialog({ saveLabel: "Select export file path", defaultUri: vscode.Uri.file(randomFileName), filters: { 'file': [context.type] } }).then((filePath) => {
            return new Promise((res, rej) => {
                if (filePath) {
                    context.exportPath = filePath.fsPath;
                    if (context.withOutLimit) {
                        context.sql = context.sql.replace(/\blimit\s.+/gi, "")
                    }
                    vscode.window.withProgress({ title: `Start exporting data to ${context.type}...`, location: ProgressLocation.Window }, () => {
                        return new Promise((resolve) => {
                            context.done = resolve
                            try {
                                this.exportData(context)
                            } catch (error) {
                                resolve(null)
                            } finally {
                                res(null)
                            }
                        })
                    })
                } else {
                    res(null)
                }
            })
        })
    }


    private async exportData(context: ExportContext) {

        const sql = context.sql
        const connection = await ConnectionManager.getConnection(context.dbOption)
        connection.query(sql, (err, rows, fields?: FieldInfo[]) => {
            if (err) {
                Console.log(err)
                return;
            }
            this.delegateExport(context, rows, fields)
        })

    }

    private delegateExport(context: ExportContext, rows: any, fields: FieldInfo[]) {
        context.fields = fields;
        context.rows = rows;
        const filePath = context.exportPath;
        switch (context.type) {
            case ExportType.excel:
                this.exportByNodeXlsx(filePath, fields, rows);
                break;
            case ExportType.csv:
                this.exportToCsv(filePath, fields, rows);
                break;
            case ExportType.json:
                this.exportToJson(context);
                break;
            case ExportType.sql:
                this.exportToSql(context);
                break;
        }
        context.done()
    }

    private exportToJson(context: ExportContext) {
        fs.writeFileSync(context.exportPath, JSON.stringify(context.rows, (k, v:any) => {
            if(context.dbOption.dbType==DatabaseType.MONGO_DB && v.indexOf && v.indexOf("ObjectID")!=-1){
                return undefined;
            }
            return v === undefined ? null : v;
        }, 2));
    }

    private exportToSql(exportContext: ExportContext) {

        const { rows, exportPath } = exportContext;
        if (rows.length == 0) {
            // show waraing
            return;
        }

        let sql = ``;
        for (const row of rows) {
            let columns = "";
            let values = "";
            for (const key in row) {
                columns += `${key},`
                values += `${row[key] != null ? `'${row[key]}'` : 'null'},`
            }
            sql += `insert into ${exportContext.table}(${columns.replace(/.$/, '')}) values(${values.replace(/.$/, '')});\n`
        }
        fs.writeFileSync(exportPath, sql);


    }

    private exportByNodeXlsx(filePath: string, fields: FieldInfo[], rows: any) {
        // Using imported nodeXlsx
        fs.writeFileSync(filePath, nodeXlsx.build([{
            name: "sheet1",
            data: [
                fields.map((field) => field.name),
                ...rows.map((row) => {
                    const values = [];
                    for (const key in row) {
                        values.push(row[key]);
                    }
                    return values;
                })
            ],
            options: {}
        }]), "binary");
    }

    private exportToCsv(filePath: string, fields: FieldInfo[], rows: any) {
        let csvContent = "";
        for (const row of rows) {
            for (const key in row) {
                csvContent += `${row[key] != null ? row[key] : ''},`
            }
            csvContent = csvContent.replace(/.$/, "") + "\n"
        }
        fs.writeFileSync(filePath, csvContent, { encoding: "utf8" });
    }


}
