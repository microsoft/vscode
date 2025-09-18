import { Util } from "../../common/util";
import { readFileSync } from "fs";
import { window } from "vscode";
import { Node } from "../../model/interface/node";
import { DelimiterHolder } from "../../service/common/delimiterHolder";
import { ConnectionManager } from "../connectionManager";

export abstract class ImportService {

    public importSql(importPath: string, node: Node): void {

        let sql = readFileSync(importPath, 'utf8')
        const parseResult = DelimiterHolder.parseBatch(sql, node.getConnectId())
        sql = parseResult.sql
        Util.process(`Importing sql file ${importPath}`, async done => {
            try {
                const importSessionId = `import_${new Date().getTime()}`;
                await node.execute(sql, importSessionId)
                ConnectionManager.removeConnection(importSessionId)
                window.showInformationMessage(`Import sql file ${importPath} success!`)
            } finally {
                done()
            }
        })

    }

    public filter():any {
        return { Sql: ['sql'] };
    }

}