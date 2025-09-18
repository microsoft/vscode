import * as vscode from "vscode";
import { Console } from "../../common/console";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { exec } from "child_process";
import { ImportService } from "./importService";
import { sync as commandExistsSync } from 'command-exists';

export class MongoImportService extends ImportService {

    public importSql(importPath: string, node: Node): void {

        if (commandExistsSync('mongoimport')) {
            NodeUtil.of(node)
            const host = node.usingSSH ? "127.0.0.1" : node.host
            const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
            const command = `mongoimport -h ${host}:${port} --db ${node.database} --jsonArray -c identitycounters --type json ${importPath}`
            Console.log(`Executing: ${command}`);
            exec(command, (err,stdout,stderr) => {
                if (err) {
                    Console.log(err);
                }else if(stderr){
                    Console.log(stderr);
                } else {
                    Console.log(`Import Success!`);
                }
            })
        } else {
            vscode.window.showErrorMessage("Command mongoimport not found!")
        }

    }

    public filter() {
        return { json: ['json'] }
    }


}