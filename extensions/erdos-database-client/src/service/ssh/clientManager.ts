import * as vscode from 'vscode';
import { Client, SFTPWrapper } from "ssh2";
import { existsSync, readFileSync } from 'fs';
import { SSHConfig } from "../../model/interface/sshConfig";

class SSH {
    client: Client;
    sftp: SFTPWrapper;
}

class SSHOption {
    withSftp: boolean = false;
}

export class ClientManager {

    private static activeClient: { [key: string]: SSH } = {};

    public static getSSH(sshConfig: SSHConfig, option: SSHOption = { withSftp: true }): Promise<SSH> {

        const key = `${sshConfig.key}_${sshConfig.host}_${sshConfig.port}_${sshConfig.username}`;
        if (this.activeClient[key]) {
            // Check if we need SFTP but the cached connection doesn't have it
            if (option.withSftp && !this.activeClient[key].sftp) {
                // Remove the cached connection without SFTP and create a new one with SFTP
                delete this.activeClient[key];
            } else {
                return Promise.resolve(this.activeClient[key]);
            }
        }
        if (sshConfig.privateKeyPath) {
            sshConfig.privateKey = readFileSync(sshConfig.privateKeyPath)
        }

        const client = new Client();
        return new Promise((resolve, reject) => {
            client.on('ready', () => {
                if (option.withSftp) {
                    client.sftp((err, sftp) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        this.activeClient[key] = { client, sftp };
                        resolve(this.activeClient[key])
                    })
                } else {
                    this.activeClient[key] = { client, sftp: null };
                    resolve(this.activeClient[key])
                }

            }).on('error', (err) => {
                this.activeClient[key] = null
                vscode.window.showErrorMessage(err.message)
                reject(err)
            }).on('end', () => {
                this.activeClient[key] = null
            }).connect({ ...sshConfig, readyTimeout: 1000 * 10 });
            // https://blog.csdn.net/a351945755/article/details/22661411
        })

    }

}