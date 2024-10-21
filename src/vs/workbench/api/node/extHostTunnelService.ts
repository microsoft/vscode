/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { ISocket, SocketCloseEventType } from '../../../base/parts/ipc/common/ipc.net.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ManagedSocket, RemoteSocketHalf, connectManagedSocket } from '../../../platform/remote/common/managedSocket.js';
import { ManagedRemoteConnection } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { ISignService } from '../../../platform/sign/common/sign.js';
import { isAllInterfaces, isLocalhost } from '../../../platform/tunnel/common/tunnel.js';
import { NodeRemoteTunnel } from '../../../platform/tunnel/node/tunnelService.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { ExtHostTunnelService } from '../common/extHostTunnelService.js';
import { CandidatePort, parseAddress } from '../../services/remote/common/tunnelModel.js';
import * as vscode from 'vscode';

export function getSockets(stdout: string): Record<string, { pid: number; socket: number }> {
	const lines = stdout.trim().split('\n');
	const mapped: { pid: number; socket: number }[] = [];
	lines.forEach(line => {
		const match = /\/proc\/(\d+)\/fd\/\d+ -> socket:\[(\d+)\]/.exec(line)!;
		if (match && match.length >= 3) {
			mapped.push({
				pid: parseInt(match[1], 10),
				socket: parseInt(match[2], 10)
			});
		}
	});
	const socketMap = mapped.reduce((m: Record<string, typeof mapped[0]>, socket) => {
		m[socket.socket] = socket;
		return m;
	}, {});
	return socketMap;
}

export function loadListeningPorts(...stdouts: string[]): { socket: number; ip: string; port: number }[] {
	const table = ([] as Record<string, string>[]).concat(...stdouts.map(loadConnectionTable));
	return [
		...new Map(
			table.filter(row => row.st === '0A')
				.map(row => {
					const address = row.local_address.split(':');
					return {
						socket: parseInt(row.inode, 10),
						ip: parseIpAddress(address[0]),
						port: parseInt(address[1], 16)
					};
				}).map(port => [port.ip + ':' + port.port, port])
		).values()
	];
}

export function parseIpAddress(hex: string): string {
	let result = '';
	if (hex.length === 8) {
		for (let i = hex.length - 2; i >= 0; i -= 2) {
			result += parseInt(hex.substr(i, 2), 16);
			if (i !== 0) {
				result += '.';
			}
		}
	} else {
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

export function loadConnectionTable(stdout: string): Record<string, string>[] {
	const lines = stdout.trim().split('\n');
	const names = lines.shift()!.trim().split(/\s+/)
		.filter(name => name !== 'rx_queue' && name !== 'tm->when');
	const table = lines.map(line => line.trim().split(/\s+/).reduce((obj: Record<string, string>, value, i) => {
		obj[names[i] || i] = value;
		return obj;
	}, {}));
	return table;
}

function knownExcludeCmdline(command: string): boolean {
	if (command.length > 500) {
		return false;
	}
	return !!command.match(/.*\.vscode-server-[a-zA-Z]+\/bin.*/)
		|| (command.indexOf('out/server-main.js') !== -1)
		|| (command.indexOf('_productName=VSCode') !== -1);
}

export function getRootProcesses(stdout: string) {
	const lines = stdout.trim().split('\n');
	const mapped: { pid: number; cmd: string; ppid: number }[] = [];
	lines.forEach(line => {
		const match = /^\d+\s+\D+\s+root\s+(\d+)\s+(\d+).+\d+\:\d+\:\d+\s+(.+)$/.exec(line)!;
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

export async function findPorts(connections: { socket: number; ip: string; port: number }[], socketMap: Record<string, { pid: number; socket: number }>, processes: { pid: number; cwd: string; cmd: string }[]): Promise<CandidatePort[]> {
	const processMap = processes.reduce((m: Record<string, typeof processes[0]>, process) => {
		m[process.pid] = process;
		return m;
	}, {});

	const ports: CandidatePort[] = [];
	connections.forEach(({ socket, ip, port }) => {
		const pid = socketMap[socket] ? socketMap[socket].pid : undefined;
		const command: string | undefined = pid ? processMap[pid]?.cmd : undefined;
		if (pid && command && !knownExcludeCmdline(command)) {
			ports.push({ host: ip, port, detail: command, pid });
		}
	});
	return ports;
}

export function tryFindRootPorts(connections: { socket: number; ip: string; port: number }[], rootProcessesStdout: string, previousPorts: Map<number, CandidatePort & { ppid: number }>): Map<number, CandidatePort & { ppid: number }> {
	const ports: Map<number, CandidatePort & { ppid: number }> = new Map();
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
			let mostChild: { pid: number; cmd: string; ppid: number } | undefined;
			do {
				mostChild = rootProcesses.find(value => value.ppid === bestMatch.pid);
				if (mostChild) {
					bestMatch = mostChild;
				}
			} while (mostChild);
			ports.set(connection.port, { host: connection.ip, port: connection.port, pid: bestMatch.pid, detail: bestMatch.cmd, ppid: bestMatch.ppid });
		} else {
			ports.set(connection.port, { host: connection.ip, port: connection.port, ppid: Number.MAX_VALUE });
		}
	}

	return ports;
}

export class NodeExtHostTunnelService extends ExtHostTunnelService {
	private _initialCandidates: CandidatePort[] | undefined = undefined;
	private _foundRootPorts: Map<number, CandidatePort & { ppid: number }> = new Map();
	private _candidateFindingEnabled: boolean = false;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService private readonly initData: IExtHostInitDataService,
		@ILogService logService: ILogService,
		@ISignService private readonly signService: ISignService,
	) {
		super(extHostRpc, initData, logService);
		if (isLinux && initData.remote.isRemote && initData.remote.authority) {
			this._proxy.$setRemoteTunnelService(process.pid);
			this.setInitialCandidates();
		}
	}

	override async $registerCandidateFinder(enable: boolean): Promise<void> {
		if (enable && this._candidateFindingEnabled) {
			// already enabled
			return;
		}

		this._candidateFindingEnabled = enable;
		let oldPorts: { host: string; port: number; detail?: string }[] | undefined = undefined;

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
			await (new Promise<void>(resolve => setTimeout(() => resolve(), delay)));
		}
	}

	private calculateDelay(movingAverage: number) {
		// Some local testing indicated that the moving average might be between 50-100 ms.
		return Math.max(movingAverage * 20, 2000);
	}

	private async setInitialCandidates(): Promise<void> {
		this._initialCandidates = await this.findCandidatePorts();
		this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) Initial candidates found: ${this._initialCandidates.map(c => c.port).join(', ')}`);
	}

	private async findCandidatePorts(): Promise<CandidatePort[]> {
		let tcp: string = '';
		let tcp6: string = '';
		try {
			tcp = await fs.promises.readFile('/proc/net/tcp', 'utf8');
			tcp6 = await fs.promises.readFile('/proc/net/tcp6', 'utf8');
		} catch (e) {
			// File reading error. No additional handling needed.
		}
		const connections: { socket: number; ip: string; port: number }[] = loadListeningPorts(tcp, tcp6);

		const procSockets: string = await (new Promise(resolve => {
			exec('ls -l /proc/[0-9]*/fd/[0-9]* | grep socket:', (error, stdout, stderr) => {
				resolve(stdout);
			});
		}));
		const socketMap = getSockets(procSockets);

		const procChildren = await pfs.Promises.readdir('/proc');
		const processes: {
			pid: number; cwd: string; cmd: string;
		}[] = [];
		for (const childName of procChildren) {
			try {
				const pid: number = Number(childName);
				const childUri = resources.joinPath(URI.file('/proc'), childName);
				const childStat = await fs.promises.stat(childUri.fsPath);
				if (childStat.isDirectory() && !isNaN(pid)) {
					const cwd = await fs.promises.readlink(resources.joinPath(childUri, 'cwd').fsPath);
					const cmd = await fs.promises.readFile(resources.joinPath(childUri, 'cmdline').fsPath, 'utf8');
					processes.push({ pid, cwd, cmd });
				}
			} catch (e) {
				//
			}
		}

		const unFoundConnections: { socket: number; ip: string; port: number }[] = [];
		const filteredConnections = connections.filter((connection => {
			const foundConnection = socketMap[connection.socket];
			if (!foundConnection) {
				unFoundConnections.push(connection);
			}
			return foundConnection;
		}));

		const foundPorts = findPorts(filteredConnections, socketMap, processes);
		let heuristicPorts: CandidatePort[] | undefined;
		this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) number of possible root ports ${unFoundConnections.length}`);
		if (unFoundConnections.length > 0) {
			const rootProcesses: string = await (new Promise(resolve => {
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
			} else {
				return foundCandidates;
			}
		});
	}

	protected override makeManagedTunnelFactory(authority: vscode.ManagedResolvedAuthority): vscode.RemoteAuthorityResolver['tunnelFactory'] {
		return async (tunnelOptions) => {
			const t = new NodeRemoteTunnel(
				{
					commit: this.initData.commit,
					quality: this.initData.quality,
					logService: this.logService,
					ipcLogger: null,
					// services and address providers have stubs since we don't need
					// the connection identification that the renderer process uses
					remoteSocketFactoryService: {
						_serviceBrand: undefined,
						async connect(_connectTo: ManagedRemoteConnection, path: string, query: string, debugLabel: string): Promise<ISocket> {
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
				},
				'localhost',
				tunnelOptions.remoteAddress.host || 'localhost',
				tunnelOptions.remoteAddress.port,
				tunnelOptions.localAddressPort,
			);

			await t.waitForReady();

			const disposeEmitter = new Emitter<void>();

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
}

class ExtHostManagedSocket extends ManagedSocket {
	public static connect(
		passing: vscode.ManagedMessagePassing,
		path: string, query: string, debugLabel: string,
	): Promise<ExtHostManagedSocket> {
		const d = new DisposableStore();
		const half: RemoteSocketHalf = {
			onClose: d.add(new Emitter()),
			onData: d.add(new Emitter()),
			onEnd: d.add(new Emitter()),
		};

		d.add(passing.onDidReceiveMessage(d => half.onData.fire(VSBuffer.wrap(d))));
		d.add(passing.onDidEnd(() => half.onEnd.fire()));
		d.add(passing.onDidClose(error => half.onClose.fire({
			type: SocketCloseEventType.NodeSocketCloseEvent,
			error,
			hadError: !!error
		})));

		const socket = new ExtHostManagedSocket(passing, debugLabel, half);
		socket._register(d);
		return connectManagedSocket(socket, path, query, debugLabel, half);
	}

	constructor(
		private readonly passing: vscode.ManagedMessagePassing,
		debugLabel: string,
		half: RemoteSocketHalf,
	) {
		super(debugLabel, half);
	}

	public override write(buffer: VSBuffer): void {
		this.passing.send(buffer.buffer);
	}
	protected override closeRemote(): void {
		this.passing.end();
	}

	public override async drain(): Promise<void> {
		await this.passing.drain?.();
	}
}
