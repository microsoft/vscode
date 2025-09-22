import tunnel = require('./tunnel-ssh')
import { Node } from "../../model/interface/node";
import { Console } from "../../common/console";
import { existsSync, readFileSync } from 'fs';
import * as portfinder from 'portfinder'
import { DatabaseType } from "../../common/constants";
import { spawn } from "child_process";

export class SSHTunnelService {

    private tunelMark: { [key: string]: { tunnel: any, tunnelPort: number } } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(node: Node, errorCallback: (error) => void): Promise<Node> {
        return new Promise(async (resolve, reject) => {
            const ssh = node.ssh
            const key = node.getConnectId();
            if (this.tunelMark[key]) {
                resolve({ ...node, host: "127.0.0.1", port: this.tunelMark[key].tunnelPort } as Node)
                return;
            }
            const port = await portfinder.getPortPromise();
            node.ssh.tunnelPort = port
            const config = {
                username: ssh.username,
                password: ssh.password,
                host: ssh.host,
                port: ssh.port,
                dstHost: node.host,
                dstPort: node.port,
                localHost: '127.0.0.1',
                localPort: port,
                algorithms: ssh.algorithms,
                passphrase: ssh.passphrase,
                privateKey: (() => {
                    if (ssh.privateKeyPath && existsSync(ssh.privateKeyPath)) {
                        return readFileSync(ssh.privateKeyPath)
                    }
                    return null
                })()
            };

            this.adapterES(node, config);

            if (ssh.type == 'native') {
                let args = ['-TnNL', `${port}:${config.dstHost}:${config.dstPort}`, config.host, '-p', `${config.port}`];
                if (ssh.privateKeyPath) {
                    args.push('-i', ssh.privateKeyPath)
                }
                const bat = spawn('ssh', args);
                const successHandler = setTimeout(() => {
                    resolve({ ...node, host: "127.0.0.1", port } as Node)
                }, ssh.watingTime);
                bat.stderr.on('data', (chunk) => {
                    if (chunk && chunk.toString().match(/^[@\s]+$/)) return;
                    delete this.tunelMark[key]
                    const chunkStr = chunk.toString();
                    errorCallback(new Error(chunkStr && chunkStr.replace(/@/g, '')))
                    clearTimeout(successHandler)
                });
                bat.on('close', (code, signal) => {
                    delete this.tunelMark[key]
                });
                return;
            }

            const localTunnel = tunnel(config, (error, server) => {
                this.tunelMark[key] = { tunnel: localTunnel, tunnelPort: port }
                if (error && errorCallback) {
                    delete this.tunelMark[key]
                    errorCallback(error)
                }
                resolve({ ...node, host: "127.0.0.1", port } as Node)
            });
            localTunnel.on('error', (err) => {
                Console.log('Ssh tunel occur error : ' + err);
                if (err && errorCallback) {
                    localTunnel.close()
                    delete this.tunelMark[key]
                    errorCallback(err)
                }
                resolve(null)
            });
        })
    }

    private adapterES(node: Node, config: any) {
        if (node.dbType == DatabaseType.ES) {
            let url = node.host;
            url = url.replace(/^(http|https):\/\//i, '')
            if (url.includes(":")) {
                const split = url.split(":");
                config.dstHost = split[0]
                const portStr = split[1] && split[1].match(/^\d+/) && split[1].match(/^\d+/)[0]
                config.dstPort = parseInt(portStr)
                if (!node.options) node.options = {};
                node.options.elasticUrl = node.host.replace(config.dstHost, '127.0.0.1').replace(config.dstPort, config.localPort)
            } else {
                config.dstHost = url.split("/")[0]
                config.dstPort = '80'
                if (!node.options) node.options = {};
                node.options.elasticUrl = node.host.replace(config.dstHost, '127.0.0.1')
            }
        }
    }

}