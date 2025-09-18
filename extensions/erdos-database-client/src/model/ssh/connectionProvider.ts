import { CodeCommand } from "../../common/constants";
import { ClientManager } from "../../service/ssh/clientManager";
import * as path from 'path';
import * as vscode from 'vscode';
import { SSHConfig } from '../interface/sshConfig';


export default class ConnectionProvider  {
    public static tempRemoteMap = new Map<string, { remote: string, sshConfig: SSHConfig }>()

    constructor() {
        vscode.workspace.onDidSaveTextDocument(e => {
            const tempPath = path.resolve(e.fileName);
            const data = ConnectionProvider.tempRemoteMap.get(tempPath)
            if (data) {
                this.saveFile(tempPath, data.remote, data.sshConfig)
            }
        })
    }

    async saveFile(tempPath: string, remotePath: string, sshConfig: SSHConfig) {
        const { sftp } = await ClientManager.getSSH(sshConfig)
        sftp.fastPut(tempPath, remotePath, async (err) => {
            if (err) {
                vscode.window.showErrorMessage(err.message)
            } else {
                vscode.commands.executeCommand(CodeCommand.Refresh)
                vscode.window.showInformationMessage("Update to remote success!")
            }
        })
    }

}