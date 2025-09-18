import { Console } from "../../common/console";
import { Util } from "../../common/util";
import { Node } from "../../model/interface/node";
import { TableNode } from "../../model/main/tableNode";
import { ViewNode } from "../../model/main/viewNode";
import { NodeUtil } from "../../model/nodeUtil";
import { DumpService } from "./dumpService";
import * as vscode from "vscode";
import { sync as commandExistsSync } from 'command-exists';

export class MysqlDumpService extends DumpService {

    public async dump(node: Node, withData: boolean) {

        /**
         * https://dev.mysql.com/doc/refman/5.7/en/mysqldump.html
         */
        if (commandExistsSync('mysqldump')) {
            const folderPath = await this.triggerSave(node);
            if (folderPath) {
                NodeUtil.of(node)
                const isTable = node instanceof TableNode || node instanceof ViewNode;
                const host = node.usingSSH ? "127.0.0.1" : node.host
                const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
                const data = withData ? '' : ' --no-data';
                const tables = isTable ? ` --skip-triggers ${node.label}` : '';
                const command = `mysqldump -h ${host} -P ${port} -u ${node.user} -p${node.password}${data} --skip-add-locks ${node.schema} ${tables}>${folderPath.fsPath}`
                // Console.log(`Executing: ${command}`);
                Util.execute(command).then(() => {
                    vscode.window.showInformationMessage(`Backup ${node.getHost()}_${node.schema} success!`, 'open').then(action => {
                        if (action == 'open') {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(folderPath.fsPath));
                        }
                    })
                }).catch(err => Console.log(err.message))
            }
            return Promise.reject("Dump canceled.");
        }

        return super.dump(node, withData);
    }

}