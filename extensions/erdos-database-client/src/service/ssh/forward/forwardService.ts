import tunnel = require('./tunnel')
import { exec } from "child_process";
import { ViewManager } from "../../../common/viewManager";
import { join } from 'path';
import { Constants } from "../../../common/constants";
import { SSHConfig } from "../../../model/interface/sshConfig";
import { Util } from "../../../common/util";
import { readFileSync } from 'fs';

export class ForwardInfo {
    id: any;
    name: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    state: boolean
}


export class ForwardService {

    private tunelMark: { [key: string]: { tunnel: any } } = {};
    private store_key = "forward_store"

    public createForwardView(sshConfig: SSHConfig) {
        ViewManager.createWebviewPanel({
            iconPath: join(Constants.RES_PATH,'ssh/forward.svg'),
            splitView: false, path: "app", title: `forward://${sshConfig.username}@${sshConfig.host}`,
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'forward')
                }).on("route-forward",()=>{
                    handler.emit("config", sshConfig)
                    handler.emit("forwardList", this.list(sshConfig))
                }).on("update", async content => {
                    if (content.id) {
                        this.remove(sshConfig, content.id)
                    }
                    try {
                        await this.forward(sshConfig, content)
                        handler.emit("success")
                    } catch (err) {
                        handler.emit("error", err.message)
                    }
                }).on("start", async content => {
                    await this.start(sshConfig, content)
                    handler.emit("success")
                }).on("stop", content => {
                    this.stop(content)
                    handler.emit("success")
                }).on("remove", content => {
                    this.remove(sshConfig, content)
                    handler.emit("success")
                }).on("load", () => {
                    handler.emit("forwardList", this.list(sshConfig))
                }).on("cmd",(content)=>{
                    exec(`cmd.exe /C start cmd /C ${content}`)
                })
            }
        })
    }

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public forward(sshConfig: SSHConfig, forwardInfo: ForwardInfo, create?: boolean): Promise<void> {
        if (create == null) create = true;

        return new Promise((resolve, reject) => {

            const id = `${sshConfig.host}_${sshConfig.port}_${forwardInfo.localHost}_${forwardInfo.localPort}_${forwardInfo.remoteHost}_${forwardInfo.remotePort}`
            if (create) {
                const forwards = this.list(sshConfig)
                for (const forward of forwards) {
                    if (forward.id == id) {
                        reject({ message: "This forward is exists!" })
                        return;
                    }
                }
            }

            const config = {
                ...sshConfig,
                localHost: forwardInfo.localHost,
                localPort: forwardInfo.localPort,
                dstHost: forwardInfo.remoteHost,
                dstPort: forwardInfo.remotePort,
                keepAlive: true,
                privateKey: (() => {
                    if (sshConfig.privateKeyPath) {
                        return readFileSync(sshConfig.privateKeyPath)
                    }
                })()
            };

            const localTunnel = tunnel(config, (error, server) => {
                this.tunelMark[id] = { tunnel: localTunnel }
                if (error) {
                    delete this.tunelMark[id]
                    reject(error)
                }
                if (create) {
                    forwardInfo.id = id
                    const forwardInfos = this.list(sshConfig)
                    forwardInfos.push(forwardInfo)
                    Util.store(`${this.store_key}_${sshConfig.host}_${sshConfig.port}`, forwardInfos)
                }
                resolve();
            });
        })

    }

    public stop(id: any): void {
        this.closeTunnel(id)
    }

    public remove(sshConfig: SSHConfig, id: any) {
        const forwardInfos = this.list(sshConfig)
        for (let i = 0; i < forwardInfos.length; i++) {
            const forwardInfo = forwardInfos[i]
            if (forwardInfo.id == id) {
                this.stop(id)
                forwardInfos.splice(i, 1)
                Util.store(`${this.store_key}_${sshConfig.host}_${sshConfig.port}`, forwardInfos)
                return;
            }
        }
    }

    public async start(sshConfig: SSHConfig, id: any) {
        for (const forwardInfo of this.list(sshConfig)) {
            if (forwardInfo.id == id) {
                await this.forward(sshConfig, forwardInfo, false)
                return;
            }
        }
    }

    public list(sshConfig: SSHConfig): ForwardInfo[] {
        const forwardInfos: ForwardInfo[] = Util.getStore(`${this.store_key}_${sshConfig.host}_${sshConfig.port}`)
        if (!forwardInfos) return [];
        for (const forwardInfo of forwardInfos) {
            if (this.tunelMark[forwardInfo.id]) {
                forwardInfo.state = true;
            } else {
                forwardInfo.state = false;
            }
        }
        return forwardInfos;
    }

}