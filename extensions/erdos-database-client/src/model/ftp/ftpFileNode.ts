import { CodeCommand, Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { createWriteStream } from 'fs';
import * as path from 'path';
import { extname } from 'path';
import * as vscode from 'vscode';
import { TreeItemCollapsibleState } from "vscode";
import { Node } from '../interface/node';
import { FtpBaseNode } from './ftpBaseNode';
import { FTPConnectionNode } from './ftpConnectionNode';
import Client from './lib/connection'
var progressStream = require('progress-stream');

const prettyBytes = require('pretty-bytes');

interface FtpListingElement {
    name: string;
    type: string;
    size?: number;
    date?: Date;
    rights?: {
        user: string;
        group: string;
        other: string;
    };
    owner?: string;
    group?: string;
}

export class FTPFileNode extends FtpBaseNode {
    contextValue = ModelType.FILE;
    fullPath: string;
    constructor(readonly name: string, parent: Node, private file: FtpListingElement) {
        super(name)
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.None
        this.description = prettyBytes(file.size)
        this.iconPath = this.getIcon(this.file.name)
        this.fullPath = (parent as FTPConnectionNode).fullPath + this.file.name;
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
        vscode.window.showQuickPick(["YES", "NO"], { canPickMany: false }).then(async str => {
            if (str == "YES") {
                const client = await this.getClient()
                client.delete(this.fullPath, (err) => {
                    if (err) {
                        vscode.window.showErrorMessage(err.message)
                    } else {
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    }
                })
            }
        })
    }
    async open() {
        if (this.file.size > 10485760) {
            vscode.window.showErrorMessage("File size except 10 MB, not support open!")
            return;
        }
        const extName = path.extname(this.file.name).toLowerCase();
        if (extName == ".gz" || extName == ".exe" || extName == ".7z" || extName == ".jar" || extName == ".bin" || extName == ".tar") {
            vscode.window.showErrorMessage(`Not support open ${extName} file!`)
            return;
        }
        const client = await this.getClient()
        const tempPath = await FileManager.record(`temp/${this.file.name}`, null, FileModel.WRITE);
        client.get(this.fullPath, async (err, stream) => {
            if (err) {
                vscode.window.showErrorMessage(err.message)
            } else {
                stream.pipe(createWriteStream(tempPath)).on("close", () => {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(tempPath))
                })
            }
        })
    }

    download(): any {

        const extNameResult = extname(this.file.name);
        const extName = extNameResult && extNameResult.replace(".", "");
        vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(this.file.name), filters: { "Type": [extName] }, saveLabel: "Select Download Path" })
            .then(async uri => {
                if (uri) {
                    const client = await this.getClient()
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Start downloading ${this.fullPath}`,
                        cancellable: true
                    }, (progress, token) => {
                        return new Promise((resolve) => {
                            client.get(this.fullPath, (error, fileReadStream) => {
                                var str = progressStream({
                                    length: this.file.size,
                                    time: 100
                                });
                                let before = 0;
                                str.on("progress", (progressData: any) => {
                                    if (progressData.percentage == 100) {
                                        resolve(null)
                                        vscode.window.showInformationMessage(`Download ${this.fullPath} success, cost time: ${progressData.runtime}s`, 'Open').then(action => {
                                            if (action) {
                                                vscode.commands.executeCommand('vscode.open', uri);
                                            }
                                        })
                                        return;
                                    }
                                    progress.report({ increment: progressData.percentage - before, message: `remaining : ${prettyBytes(progressData.remaining)}` });
                                    before = progressData.percentage
                                })
                                str.on("error", err => {
                                    vscode.window.showErrorMessage(err.message)
                                })
                                const outStream = createWriteStream(uri.fsPath);
                                fileReadStream.pipe(str).pipe(outStream);
                                token.onCancellationRequested(() => {
                                    outStream.destroy()
                                });
                            })
                        })
                    })
                }
            })
    }

    getIcon(fileName: string): string {

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
