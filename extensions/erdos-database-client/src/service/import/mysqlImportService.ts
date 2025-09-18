import { Node } from "../../model/interface/node";
import { exec } from "child_process";
import { Console } from "../../common/console";
import { NodeUtil } from "../../model/nodeUtil";
import { ImportService } from "./importService";
import { sync as commandExistsSync } from 'command-exists';

export class MysqlImportService extends ImportService {

    public importSql(importPath: string, node: Node): void {

        if (commandExistsSync('mysql')) {
            NodeUtil.of(node)
            const host = node.usingSSH ? "127.0.0.1" : node.host
            const port = node.usingSSH ? NodeUtil.getTunnelPort(node.getConnectId()) : node.port;
            const command = `mysql -h ${host} -P ${port} -u ${node.user} ${node.password ? `-p${node.password}` : ""} ${node.schema || ""} < ${importPath}`
            Console.log(`Executing: ${command.replace(/-p.+? /, "-p****** ")}`);
            const cp=exec(command, (err,stdout,stderr) => {
                Console.log(err||stdout||stderr);
            })
            cp.on("close",(code,singal)=>{
                Console.log(code===0?'Import Done.':"Import Occur Error!");
            })
        } else {
            super.importSql(importPath,node)
        }


    }

}