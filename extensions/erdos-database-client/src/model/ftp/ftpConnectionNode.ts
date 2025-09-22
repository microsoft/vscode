import { CodeCommand, ConfigKey, Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import Client from './lib/connection';
import * as path from "path";
import * as vscode from "vscode";
import { TreeItemCollapsibleState } from "vscode";
import { CommandKey, Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { FtpBaseNode } from "./ftpBaseNode";
import { FTPFileNode } from "./ftpFileNode";

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

export class FTPConnectionNode extends FtpBaseNode {

    fullPath: string = "";
    contextValue = ModelType.FTP_CONNECTION
    constructor(readonly key: string, readonly parent: Node, private file?: FtpListingElement) {
        super(key);
        this.contextValue = this.file ? ModelType.FTP_FOLDER : ModelType.FTP_CONNECTION;
        this.init(parent)
        if (this.file) {
            this.iconPath = new vscode.ThemeIcon("folder");
        } else {
            this.iconPath = new vscode.ThemeIcon("server");
        }
        if (this.contextValue == ModelType.FTP_CONNECTION) {
            this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.port}`;
            if (parent.name) {
                this.name = parent.name
                const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true)
                preferName ? this.label = parent.name : this.description = parent.name;
            }
        } else {
            const parentPath = (parent as FTPConnectionNode).fullPath;
            this.fullPath = parentPath ? parentPath + key + "/" : key + "/"
        }

        if (this.disable) {
            this.collapsibleState = TreeItemCollapsibleState.None;
            this.description = (this.description || '') + " closed"
        }

    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you sure you want to Delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
            
            // Also update VSCode configuration to trigger contrib system refresh
            if (this.key) {
                try {
                    await vscode.commands.executeCommand('erdos.deleteConnection', this.getConnectId());
                } catch (error) {
                    console.warn('[FTPConnectionNode] Failed to update VSCode configuration for connection delete:', error);
                }
            } else {
                console.warn('[FTPConnectionNode] No connection key available for deleteConnection');
            }
        })

    }

    getChildren(): Promise<Node[]> {

        return new Promise(async (resolve, reject) => {
            try {
                const client = await this.getClient()
                
                client.list(this.fullPath || undefined, (err, list) => {
                    if (err) {
                        resolve([new InfoNode(err.message)]);
                    } else if (list.length == 0) {
                        resolve([new InfoNode("There are no files in this folder.")]);
                    } else {
                        resolve(this.build(list))
                    }
                });
            } catch (error) {
                reject(error)
            }
        })

    }




    public copyIP() {
        Util.copyToBoard(this.host)
    }

    public newFile(): any {
        vscode.window.showInputBox().then(async input => {
            if (input) {
                const client = await this.getClient()
                const tempPath = await FileManager.record("temp/" + input, "", FileModel.WRITE);
                const targetPath = this.fullPath + "/" + input;
                client.put(tempPath, targetPath, err => {
                    if (err) {
                        vscode.window.showErrorMessage(err.message)
                    } else {
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    }
                })
            }
        })
    }

    public newFolder(): any {
        vscode.window.showInputBox().then(async input => {
            if (input) {
                const client = await this.getClient()
                client.mkdir(this.fullPath + "/" + input, err => {
                    if (err) {
                        vscode.window.showErrorMessage(err.message)
                    } else {
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    }
                })
            }
        })
    }

    upload(): any {
        vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, canSelectFolders: false, openLabel: "Select Upload Path" })
            .then(async uri => {
                if (uri) {
                    const client = await this.getClient()
                    const targetPath = uri[0].fsPath;
                    const start = new Date()
                    client.put(targetPath, this.fullPath + "/" + path.basename(targetPath), err => {
                        if (err) {
                            vscode.window.showErrorMessage(err.message)
                        } else {
                            vscode.commands.executeCommand("database.refresh")
                        }
                    })
                }
            })
    }

    delete(): any {
        vscode.window.showQuickPick(["YES", "NO"], { canPickMany: false }).then(async str => {
            if (str == "YES") {
                const client = await this.getClient()
                client.rmdir(this.fullPath, (err) => {
                    if (err) {
                        vscode.window.showErrorMessage(err.message)
                    } else {
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    }
                })
            }
        })
    }



    private build(list: FtpListingElement[]): Node[] {

        const folderList: Node[] = []
        const fileList: Node[] = []
        if (!this.options?.showHidden) {
            list = list.filter(item => item.name && !item.name.startsWith("."))
        }

        for (const item of list) {
            if (!item.name) {
                continue; // Skip items without names
            }
            if (item.type == "d") {
                folderList.push(new FTPConnectionNode(item.name, this, item))
            } else if (false) {
                // fileList.push(new LinkNode(entry.filename))
            } else {
                fileList.push(new FTPFileNode(item.name, this, item))
            }
        }

        return [].concat(folderList.sort((a, b) => a.label.localeCompare(b.label)))
            .concat(fileList.sort((a, b) => a.label.localeCompare(b.label)));
    }

}