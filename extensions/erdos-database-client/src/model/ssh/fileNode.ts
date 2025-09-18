import { CodeCommand, Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { Util } from "../../common/util";
import { ClientManager } from "../../service/ssh/clientManager";
import { createWriteStream } from 'fs';
import * as path from 'path';
import { extname } from 'path';
import { FileEntry } from "ssh2-streams";
import * as vscode from 'vscode';
import { TreeItemCollapsibleState } from "vscode";
import { Node } from '../interface/node';
import { SSHConfig } from '../interface/sshConfig';
import ConnectionProvider from './connectionProvider';
var progressStream = require('progress-stream');

const prettyBytes = require('pretty-bytes');

export class FileNode extends Node {
    contextValue = ModelType.FILE;
    fullPath: string;
    constructor(readonly sshConfig: SSHConfig, readonly file: FileEntry, readonly parentName: string) {
        super(file.filename)
        this.collapsibleState = TreeItemCollapsibleState.None
        this.description = prettyBytes(file.attrs.size)
        this.iconPath = this.getIcon(this.file.filename)
        this.fullPath = this.parentName + this.file.filename;
        this.command = {
            command: "mysql.ssh.file.open",
            arguments: [this],
            title: "Open File"
        }
    }

    public async getChildren(): Promise<Node[]> {
        return [];
    }
    delete(): any {
        Util.confirm("Are you wang to delete this file?", async () => {
            const { sftp } = await ClientManager.getSSH(this.sshConfig)
            sftp.unlink(this.fullPath, (err) => {
                if (err) {
                    vscode.window.showErrorMessage(err.message)
                } else {
                    vscode.commands.executeCommand(CodeCommand.Refresh)
                }
            })
        })
    }
    async open() {
        if (this.file.attrs.size > 10485760) {
            vscode.window.showErrorMessage("File size except 10 MB, not support open!")
            return;
        }
        const extName = path.extname(this.file.filename).toLowerCase();
        if (extName == ".gz" || extName == ".exe" || extName == ".7z" || extName == ".jar" || extName == ".bin" || extName == ".tar") {
            vscode.window.showErrorMessage(`Not support open ${extName} file!`)
            return;
        }
        const { sftp } = await ClientManager.getSSH(this.sshConfig)
        const tempPath = await FileManager.record(`temp/${this.file.filename}`, null, FileModel.WRITE);
        sftp.fastGet(this.fullPath, tempPath, async (err) => {
            if (err) {
                vscode.window.showErrorMessage(err.message)
            } else {
                ConnectionProvider.tempRemoteMap.set(path.resolve(tempPath), { remote: this.fullPath, sshConfig: this.sshConfig })
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(tempPath))
            }
        })
    }

    download(): any {

        const extNameResult = extname(this.file.filename);
        const extName = extNameResult && extNameResult.replace(".", "");
        vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(this.file.filename), filters: { "Type": [extName] }, saveLabel: "Select Download Path" })
            .then(async uri => {
                if (uri) {
                    this.downloadByPath(uri.fsPath,true)
                }
            })
    }

    public async downloadByPath(path:string,showDialog?:boolean){
        
        const { sftp } = await ClientManager.getSSH(this.sshConfig)
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Start downloading ${this.fullPath}`,
            cancellable: true
        }, (progress, token) => {
            return new Promise((resolve) => {
                const fileReadStream = sftp.createReadStream(this.fullPath)
                var str = progressStream({
                    length: this.file.attrs.size,
                    time: 100
                });
                let before = 0;
                str.on("progress", (progressData: any) => {
                    if (progressData.percentage == 100) {
                        resolve(null)
                        if(showDialog){
                            vscode.window.showInformationMessage(`Download ${this.fullPath} success, cost time: ${progressData.runtime}s`, 'Open').then(action => {
                                if (action) {
                                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path));
                                }
                            })
                        }
                        return;
                    }
                    progress.report({ increment: progressData.percentage - before, message: `remaining : ${prettyBytes(progressData.remaining)}` });
                    before = progressData.percentage
                })
                str.on("error", err => {
                    vscode.window.showErrorMessage(err.message)
                })
                const outStream = createWriteStream(path);
                fileReadStream.pipe(str).pipe(outStream);
                token.onCancellationRequested(() => {
                    fileReadStream.destroy()
                    outStream.destroy()
                });
            })
        })
    
    }

    getIcon(fileName: string): string|vscode.ThemeIcon {

        const extPath = `${Constants.RES_PATH}`;

        const ext = path.extname(fileName).replace(".", "").toLowerCase()
        let fileIcon;
        switch (ext) {
            case 'pub': case 'pem': fileIcon = "key.svg"; break;
            case 'ts': fileIcon = "typescript.svg"; break;
            case 'log': fileIcon = "log.svg"; break;
            case 'sql': fileIcon = "sql.svg"; break;
            case 'xml': fileIcon = "xml.svg"; break;
            case 'html': fileIcon = "html.svg"; break;
            case 'java': case 'class': fileIcon = "java.svg"; break;
            case 'js': case 'map': fileIcon = "javascript.svg"; break;
            case 'yml': case 'yaml': fileIcon = "yaml.svg"; break;
            case 'json': fileIcon = "json.svg"; break;
            case 'sh': fileIcon = "console.svg"; break;
            case 'cfg': case 'conf': fileIcon = "settings.svg"; break;
            case 'rar': case 'zip': case '7z': case 'gz': case 'tar': fileIcon = "zip.svg"; break;
            default: fileIcon = "file.svg"; break;

        }

        return `${extPath}/ssh/${fileIcon}`
    }


}
