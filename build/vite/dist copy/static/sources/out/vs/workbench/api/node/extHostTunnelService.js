/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as fs from 'fs';
import { exec } from 'child_process';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { MovingAverage } from '../../../base/common/numbers.js';
import { isLinux } from '../../../base/common/platform.js';
import * as resources from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import * as pfs from '../../../base/node/pfs.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ManagedSocket, connectManagedSocket } from '../../../platform/remote/common/managedSocket.js';
import { ManagedRemoteConnection } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { ISignService } from '../../../platform/sign/common/sign.js';
import { isAllInterfaces, isLocalhost } from '../../../platform/tunnel/common/tunnel.js';
import { NodeRemoteTunnel } from '../../../platform/tunnel/node/tunnelService.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { ExtHostTunnelService } from '../common/extHostTunnelService.js';
import { parseAddress } from '../../services/remote/common/tunnelModel.js';
import { IExtHostConfiguration } from '../common/extHostConfiguration.js';
export function getSockets(stdout) {
    const lines = stdout.trim().split('\n');
    const mapped = [];
    lines.forEach(line => {
        const match = /\/proc\/(\d+)\/fd\/\d+ -> socket:\[(\d+)\]/.exec(line);
        if (match && match.length >= 3) {
            mapped.push({
                pid: parseInt(match[1], 10),
                socket: parseInt(match[2], 10)
            });
        }
    });
    const socketMap = mapped.reduce((m, socket) => {
        m[socket.socket] = socket;
        return m;
    }, {});
    return socketMap;
}
export function loadListeningPorts(...stdouts) {
    const table = [].concat(...stdouts.map(loadConnectionTable));
    return [
        ...new Map(table.filter(row => row.st === '0A')
            .map(row => {
            const address = row.local_address.split(':');
            return {
                socket: parseInt(row.inode, 10),
                ip: parseIpAddress(address[0]),
                port: parseInt(address[1], 16)
            };
        }).map(port => [port.ip + ':' + port.port, port])).values()
    ];
}
export function parseIpAddress(hex) {
    let result = '';
    if (hex.length === 8) {
        for (let i = hex.length - 2; i >= 0; i -= 2) {
            result += parseInt(hex.substr(i, 2), 16);
            if (i !== 0) {
                result += '.';
            }
        }
    }
    else {
        // Nice explanation of host format in tcp6 file: https://serverfault.com/questions/592574/why-does-proc-net-tcp6-represents-1-as-1000
        for (let i = 0; i < hex.length; i += 8) {
            const word = hex.substring(i, i + 8);
            let subWord = '';
            for (let j = 8; j >= 2; j -= 2) {
                subWord += word.substring(j - 2, j);
                if ((j === 6) || (j === 2)) {
                    // Trim leading zeros
                    subWord = parseInt(subWord, 16).toString(16);
                    result += `${subWord}`;
                    subWord = '';
                    if (i + j !== hex.length - 6) {
                        result += ':';
                    }
                }
            }
        }
    }
    return result;
}
export function loadConnectionTable(stdout) {
    const lines = stdout.trim().split('\n');
    const names = lines.shift().trim().split(/\s+/)
        .filter(name => name !== 'rx_queue' && name !== 'tm->when');
    const table = lines.map(line => line.trim().split(/\s+/).reduce((obj, value, i) => {
        obj[names[i] || i] = value;
        return obj;
    }, {}));
    return table;
}
function knownExcludeCmdline(command) {
    if (command.length > 500) {
        return false;
    }
    return !!command.match(/.*\.vscode-server-[a-zA-Z]+\/bin.*/)
        || (command.indexOf('out/server-main.js') !== -1)
        || (command.indexOf('_productName=VSCode') !== -1);
}
export function getRootProcesses(stdout) {
    const lines = stdout.trim().split('\n');
    const mapped = [];
    lines.forEach(line => {
        const match = /^\d+\s+\D+\s+root\s+(\d+)\s+(\d+).+\d+\:\d+\:\d+\s+(.+)$/.exec(line);
        if (match && match.length >= 4) {
            mapped.push({
                pid: parseInt(match[1], 10),
                ppid: parseInt(match[2]),
                cmd: match[3]
            });
        }
    });
    return mapped;
}
export async function findPorts(connections, socketMap, processes) {
    const processMap = processes.reduce((m, process) => {
        m[process.pid] = process;
        return m;
    }, {});
    const ports = [];
    connections.forEach(({ socket, ip, port }) => {
        const pid = socketMap[socket] ? socketMap[socket].pid : undefined;
        const command = pid ? processMap[pid]?.cmd : undefined;
        if (pid && command && !knownExcludeCmdline(command)) {
            ports.push({ host: ip, port, detail: command, pid });
        }
    });
    return ports;
}
export function tryFindRootPorts(connections, rootProcessesStdout, previousPorts) {
    const ports = new Map();
    const rootProcesses = getRootProcesses(rootProcessesStdout);
    for (const connection of connections) {
        const previousPort = previousPorts.get(connection.port);
        if (previousPort) {
            ports.set(connection.port, previousPort);
            continue;
        }
        const rootProcessMatch = rootProcesses.find((value) => value.cmd.includes(`${connection.port}`));
        if (rootProcessMatch) {
            let bestMatch = rootProcessMatch;
            // There are often several processes that "look" like they could match the port.
            // The one we want is usually the child of the other. Find the most child process.
            let mostChild;
            do {
                mostChild = rootProcesses.find(value => value.ppid === bestMatch.pid);
                if (mostChild) {
                    bestMatch = mostChild;
                }
            } while (mostChild);
            ports.set(connection.port, { host: connection.ip, port: connection.port, pid: bestMatch.pid, detail: bestMatch.cmd, ppid: bestMatch.ppid });
        }
        else {
            ports.set(connection.port, { host: connection.ip, port: connection.port, ppid: Number.MAX_VALUE });
        }
    }
    return ports;
}
let NodeExtHostTunnelService = class NodeExtHostTunnelService extends ExtHostTunnelService {
    constructor(extHostRpc, initData, logService, signService, configurationService) {
        super(extHostRpc, initData, logService);
        this.initData = initData;
        this.signService = signService;
        this.configurationService = configurationService;
        this._initialCandidates = undefined;
        this._foundRootPorts = new Map();
        this._candidateFindingEnabled = false;
        if (isLinux && initData.remote.isRemote && initData.remote.authority) {
            this._proxy.$setRemoteTunnelService(process.pid);
            this.setInitialCandidates();
        }
    }
    async $registerCandidateFinder(enable) {
        if (enable && this._candidateFindingEnabled) {
            // already enabled
            return;
        }
        this._candidateFindingEnabled = enable;
        let oldPorts = undefined;
        // If we already have found initial candidates send those immediately.
        if (this._initialCandidates) {
            oldPorts = this._initialCandidates;
            await this._proxy.$onFoundNewCandidates(this._initialCandidates);
        }
        // Regularly scan to see if the candidate ports have changed.
        const movingAverage = new MovingAverage();
        let scanCount = 0;
        while (this._candidateFindingEnabled) {
            const startTime = new Date().getTime();
            const newPorts = (await this.findCandidatePorts()).filter(candidate => (isLocalhost(candidate.host) || isAllInterfaces(candidate.host)));
            this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) found candidate ports ${newPorts.map(port => port.port).join(', ')}`);
            const timeTaken = new Date().getTime() - startTime;
            this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) candidate port scan took ${timeTaken} ms.`);
            // Do not count the first few scans towards the moving average as they are likely to be slower.
            if (scanCount++ > 3) {
                movingAverage.update(timeTaken);
            }
            if (!oldPorts || (JSON.stringify(oldPorts) !== JSON.stringify(newPorts))) {
                oldPorts = newPorts;
                await this._proxy.$onFoundNewCandidates(oldPorts);
            }
            const delay = this.calculateDelay(movingAverage.value);
            this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) next candidate port scan in ${delay} ms.`);
            await (new Promise(resolve => setTimeout(() => resolve(), delay)));
        }
    }
    calculateDelay(movingAverage) {
        // Some local testing indicated that the moving average might be between 50-100 ms.
        return Math.max(movingAverage * 20, 2000);
    }
    async setInitialCandidates() {
        this._initialCandidates = await this.findCandidatePorts();
        this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) Initial candidates found: ${this._initialCandidates.map(c => c.port).join(', ')}`);
    }
    async findCandidatePorts() {
        let tcp = '';
        let tcp6 = '';
        try {
            tcp = await fs.promises.readFile('/proc/net/tcp', 'utf8');
            tcp6 = await fs.promises.readFile('/proc/net/tcp6', 'utf8');
        }
        catch (e) {
            // File reading error. No additional handling needed.
        }
        const connections = loadListeningPorts(tcp, tcp6);
        const procSockets = await (new Promise(resolve => {
            exec('ls -l /proc/[0-9]*/fd/[0-9]* | grep socket:', (error, stdout, stderr) => {
                resolve(stdout);
            });
        }));
        const socketMap = getSockets(procSockets);
        const procChildren = await pfs.Promises.readdir('/proc');
        const processes = [];
        for (const childName of procChildren) {
            try {
                const pid = Number(childName);
                const childUri = resources.joinPath(URI.file('/proc'), childName);
                const childStat = await fs.promises.stat(childUri.fsPath);
                if (childStat.isDirectory() && !isNaN(pid)) {
                    const cwd = await fs.promises.readlink(resources.joinPath(childUri, 'cwd').fsPath);
                    const cmd = await fs.promises.readFile(resources.joinPath(childUri, 'cmdline').fsPath, 'utf8');
                    processes.push({ pid, cwd, cmd });
                }
            }
            catch (e) {
                //
            }
        }
        const unFoundConnections = [];
        const filteredConnections = connections.filter((connection => {
            const foundConnection = socketMap[connection.socket];
            if (!foundConnection) {
                unFoundConnections.push(connection);
            }
            return foundConnection;
        }));
        const foundPorts = findPorts(filteredConnections, socketMap, processes);
        let heuristicPorts;
        this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) number of possible root ports ${unFoundConnections.length}`);
        if (unFoundConnections.length > 0) {
            const rootProcesses = await (new Promise(resolve => {
                exec('ps -F -A -l | grep root', (error, stdout, stderr) => {
                    resolve(stdout);
                });
            }));
            this._foundRootPorts = tryFindRootPorts(unFoundConnections, rootProcesses, this._foundRootPorts);
            heuristicPorts = Array.from(this._foundRootPorts.values());
            this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) heuristic ports ${heuristicPorts.map(heuristicPort => heuristicPort.port).join(', ')}`);
        }
        return foundPorts.then(foundCandidates => {
            if (heuristicPorts) {
                return foundCandidates.concat(heuristicPorts);
            }
            else {
                return foundCandidates;
            }
        });
    }
    async defaultTunnelHost() {
        const settingValue = (await this.configurationService.getConfigProvider()).getConfiguration('remote').get('localPortHost');
        return (!settingValue || settingValue === 'localhost') ? '127.0.0.1' : '0.0.0.0';
    }
    makeManagedTunnelFactory(authority) {
        return async (tunnelOptions) => {
            const t = new NodeRemoteTunnel({
                commit: this.initData.commit,
                quality: this.initData.quality,
                logService: this.logService,
                ipcLogger: null,
                // services and address providers have stubs since we don't need
                // the connection identification that the renderer process uses
                remoteSocketFactoryService: {
                    _serviceBrand: undefined,
                    async connect(_connectTo, path, query, debugLabel) {
                        const result = await authority.makeConnection();
                        return ExtHostManagedSocket.connect(result, path, query, debugLabel);
                    },
                    register() {
                        throw new Error('not implemented');
                    },
                },
                addressProvider: {
                    getAddress() {
                        return Promise.resolve({
                            connectTo: new ManagedRemoteConnection(0),
                            connectionToken: authority.connectionToken,
                        });
                    },
                },
                signService: this.signService,
            }, await this.defaultTunnelHost(), tunnelOptions.remoteAddress.host || 'localhost', tunnelOptions.remoteAddress.port, tunnelOptions.localAddressPort);
            await t.waitForReady();
            const disposeEmitter = new Emitter();
            return {
                localAddress: parseAddress(t.localAddress) ?? t.localAddress,
                remoteAddress: { port: t.tunnelRemotePort, host: t.tunnelRemoteHost },
                onDidDispose: disposeEmitter.event,
                dispose: () => {
                    t.dispose();
                    disposeEmitter.fire();
                    disposeEmitter.dispose();
                },
            };
        };
    }
};
NodeExtHostTunnelService = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostInitDataService),
    __param(2, ILogService),
    __param(3, ISignService),
    __param(4, IExtHostConfiguration)
], NodeExtHostTunnelService);
export { NodeExtHostTunnelService };
class ExtHostManagedSocket extends ManagedSocket {
    static connect(passing, path, query, debugLabel) {
        const d = new DisposableStore();
        const half = {
            onClose: d.add(new Emitter()),
            onData: d.add(new Emitter()),
            onEnd: d.add(new Emitter()),
        };
        d.add(passing.onDidReceiveMessage(d => half.onData.fire(VSBuffer.wrap(d))));
        d.add(passing.onDidEnd(() => half.onEnd.fire()));
        d.add(passing.onDidClose(error => half.onClose.fire({
            type: 0 /* SocketCloseEventType.NodeSocketCloseEvent */,
            error,
            hadError: !!error
        })));
        const socket = new ExtHostManagedSocket(passing, debugLabel, half);
        socket._register(d);
        return connectManagedSocket(socket, path, query, debugLabel, half);
    }
    constructor(passing, debugLabel, half) {
        super(debugLabel, half);
        this.passing = passing;
    }
    write(buffer) {
        this.passing.send(buffer.buffer);
    }
    closeRemote() {
        this.passing.end();
    }
    async drain() {
        await this.passing.drain?.();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFR1bm5lbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdFR1bm5lbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNyQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sS0FBSyxTQUFTLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sS0FBSyxHQUFHLE1BQU0sMkJBQTJCLENBQUM7QUFFakQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxhQUFhLEVBQW9CLG9CQUFvQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDekgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDckcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDekYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENB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