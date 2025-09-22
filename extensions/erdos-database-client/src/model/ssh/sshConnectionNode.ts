import { CodeCommand, ConfigKey, Constants, ModelType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { Util } from "../../common/util";
import { ClientManager } from "../../service/ssh/clientManager";
import { ForwardService } from "../../service/ssh/forward/forwardService";
import { TerminalService } from "../../service/ssh/terminal/terminalService";
import { XtermTerminal } from "../../service/ssh/terminal/xtermTerminalService";
import { createReadStream, existsSync, mkdirSync, statSync } from "fs";
import * as path from "path";
import { FileEntry } from "ssh2-streams";
import * as vscode from "vscode";
import { CommandKey, Node } from "../interface/node";
import { SSHConfig } from "../interface/sshConfig";
import { InfoNode } from "../other/infoNode";
import { FileNode } from "./fileNode";
import { LinkNode } from "./linkNode";
import prettyBytes = require("pretty-bytes");
import { Global } from "../../common/global";
var progressStream = require('progress-stream');

export class SSHConnectionNode extends Node {

    fullPath: string;
    private terminalService: TerminalService = new XtermTerminal();

    constructor(readonly key: string, parent: Node, readonly sshConfig: SSHConfig, readonly name: string, readonly file?: FileEntry, readonly parentName?: string, iconPath?: string) {
        super(name);
        super.init(parent)
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        this.fullPath = this.parentName + this.name;
        if (!file) {
            this.contextValue = ModelType.SSH_CONNECTION;
            this.iconPath = new vscode.ThemeIcon("remote");
            this.label = `${sshConfig.username}@${sshConfig.host}`
        } else {
            this.contextValue = ModelType.FOLDER;
            this.iconPath = new vscode.ThemeIcon("folder")
        }
        if (this.contextValue == ModelType.SSH_CONNECTION && parent.name) {
            this.name = parent.name
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true)
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        if (file && file.filename.toLocaleLowerCase() == "home") {
            this.iconPath = path.join(Constants.RES_PATH, "ssh/folder-core.svg");
        } else if (iconPath) {
            this.iconPath = iconPath;
        }
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you sure you want to Delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
            await vscode.commands.executeCommand('erdos.deleteConnection', this.getConnectId());
        })

    }

    public copyIP() {
        Util.copyToBoard(this.sshConfig.host)
    }

    public startSocksProxy() {
        var exec = require('child_process').exec;
        if (this.sshConfig.privateKeyPath) {
            exec(`cmd /c start ssh -i ${this.sshConfig.privateKeyPath} -qTnN -D 127.0.0.1:1080 root@${this.sshConfig.host}`)
        } else {
            exec(`cmd /c start ssh -qTnN -D 127.0.0.1:1080 root@${this.sshConfig.host}`)
        }
    }

    private forwardService = new ForwardService()
    public fowardPort() {
        this.forwardService.createForwardView(this.sshConfig)
    }

    public newFile(): any {
        vscode.window.showInputBox().then(async input => {
            if (input) {
                const { sftp } = await ClientManager.getSSH(this.sshConfig)
                const tempPath = await FileManager.record("temp/" + input, "", FileModel.WRITE);
                const targetPath = this.fullPath + "/" + input;
                sftp.fastPut(tempPath, targetPath, err => {
                    if (err) {
                        vscode.window.showErrorMessage(err.message)
                    } else {
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    }
                })
            } else {
                vscode.window.showInformationMessage("Create File Cancel!")
            }
        })
    }

    public newFolder(): any {
        vscode.window.showInputBox().then(async input => {
            if (input) {
                const { sftp } = await ClientManager.getSSH(this.sshConfig)
                sftp.mkdir(this.fullPath + "/" + input, err => {
                    if (err) {
                        vscode.window.showErrorMessage(err.message)
                    } else {
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    }
                })
            } else {
                vscode.window.showInformationMessage("Create Folder Cancel!")
            }
        })
    }

    upload(): any {
        vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, canSelectFolders: false, openLabel: "Select Upload Path" })
            .then(async uri => {
                if (uri) {
                    const { sftp } = await ClientManager.getSSH(this.sshConfig)
                    const targetPath = uri[0].fsPath;

                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Window,
                        title: `Start uploading ${targetPath}`,
                        cancellable: true
                    }, (progress, token) => {
                        return new Promise((resolve) => {
                            const fileReadStream = createReadStream(targetPath)
                            var str = progressStream({
                                length: statSync(targetPath).size,
                                time: 100
                            });
                            let before = 0;
                            str.on("progress", (progressData: any) => {
                                if (progressData.percentage == 100) {
                                    resolve(null)
                                    vscode.window.showInformationMessage(`Upload ${targetPath} success, cost time: ${progressData.runtime}s`)
                                    return;
                                }
                                progress.report({ increment: progressData.percentage - before, message: `remaining : ${prettyBytes(progressData.remaining)}` });
                                before = progressData.percentage
                            })
                            str.on("error", err => {
                                vscode.window.showErrorMessage(err.message)
                            })
                            const outStream = sftp.createWriteStream(this.fullPath + "/" + path.basename(targetPath));
                            fileReadStream.pipe(str).pipe(outStream);
                            token.onCancellationRequested(() => {
                                fileReadStream.destroy()
                                outStream.destroy()
                            });
                        })
                    })

                    // const start = new Date()
                    // vscode.window.showInformationMessage(`Start uploading ${targetPath}.`)
                    // sftp.fastPut(targetPath, this.fullPath + "/" + path.basename(targetPath), err => {
                    //     if (err) {
                    //         vscode.window.showErrorMessage(err.message)
                    //     } else {
                    //         vscode.window.showInformationMessage(`Upload ${this.fullPath} success, cost time: ${new Date().getTime() - start.getTime()}`)
                    //         vscode.commands.executeCommand(Command.REFRESH)
                    //     }
                    // })
                }
            })
    }

    download(): any {

        vscode.window.showOpenDialog({ defaultUri: vscode.Uri.file(this.file.filename), canSelectFiles: false, canSelectFolders: true, openLabel: "Select Download Path" })
            .then(async (uris) => {
                const uri = uris[0]
                if (uri) {
                    this.downloadByPath(uri.fsPath)
                }
            })
    }

    public async downloadByPath(path: string) {
        const childs = await this.getChildren()
        for (const child of childs) {
            const childPath = path + "/" + child.label;
            if (child instanceof FileNode) {
                child.downloadByPath(childPath)
            } else if (child instanceof SSHConnectionNode) {
                if (!existsSync(childPath)) {
                    mkdirSync(childPath)
                }
                child.downloadByPath(childPath)
            }
        }
    }

    delete(): any {
        Util.confirm("Are you wang to delete this folder?", async () => {
            const { sftp } = await ClientManager.getSSH(this.sshConfig)
            sftp.rmdir(this.fullPath, (err) => {
                if (err) {
                    vscode.window.showErrorMessage(err.message)
                } else {
                    vscode.commands.executeCommand(CodeCommand.Refresh)
                }
            })
        })
    }

    openTerminal(): any {
        this.terminalService.openMethod(this.sshConfig)
    }

    openInTeriminal(): any {
        this.terminalService.openPath(this.sshConfig, this.fullPath)
    }

    async getChildren(): Promise<Node[]> {

        return new Promise(async (resolve) => {
            try {
                const ssh = await ClientManager.getSSH(this.sshConfig)
                if (!ssh || !ssh.sftp) {
                    resolve([new InfoNode("SSH connection or SFTP is not available. Please try reconnecting.")]);
                    return;
                }
                ssh.sftp.readdir(this.file ? this.parentName + this.name : '/', (err, fileList) => {
                    if (err) {
                        resolve([new InfoNode(err.message)]);
                    } else if (fileList.length == 0) {
                        resolve([new InfoNode("There are no files in this folder.")]);
                    } else {
                        const parent = this.file ? `${this.parentName + this.name}/` : '/';
                        resolve(this.build(fileList, parent))
                    }
                })
            } catch (err) {
                resolve([new InfoNode(err.message)])
            }
        })
    }

    build(entryList: FileEntry[], parentName: string): Node[] {

        if (!this.options?.showHidden) {
            entryList = entryList.filter(item => !item.filename.startsWith("."))
        }

        const folderList: Node[] = []
        const fileList: Node[] = []

        for (const entry of entryList) {
            if (entry.longname.startsWith("d")) {
                folderList.push(new SSHConnectionNode(this.key, this, this.sshConfig, entry.filename, entry, parentName))
            } else if (entry.longname.startsWith("l")) {
                fileList.push(new LinkNode(entry.filename))
            } else {
                fileList.push(new FileNode(this.sshConfig, entry, parentName))
            }
        }

        return [].concat(folderList.sort((a, b) => a.label.localeCompare(b.label)))
            .concat(fileList.sort((a, b) => a.label.localeCompare(b.label)));
    }





}