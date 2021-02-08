/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadTunnelServiceShape, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import type * as vscode from 'vscode';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { URI } from 'vs/base/common/uri';
import { exec } from 'child_process';
import * as resources from 'vs/base/common/resources';
import * as fs from 'fs';
import * as pfs from 'vs/base/node/pfs';
import { isLinux } from 'vs/base/common/platform';
import { IExtHostTunnelService, TunnelDto } from 'vs/workbench/api/common/extHostTunnelService';
import { Event, Emitter } from 'vs/base/common/event';
import { TunnelOptions, TunnelCreationOptions } from 'vs/platform/remote/common/tunnel';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { MovingAverage } from 'vs/base/common/numbers';
import { CandidatePort } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { ILogService } from 'vs/platform/log/common/log';

class ExtensionTunnel implements vscode.Tunnel {
	private _onDispose: Emitter<void> = new Emitter();
	onDidDispose: Event<void> = this._onDispose.event;

	constructor(
		public readonly remoteAddress: { port: number, host: string },
		public readonly localAddress: { port: number, host: string } | string,
		private readonly _dispose: () => Promise<void>) { }

	dispose(): Promise<void> {
		this._onDispose.fire();
		return this._dispose();
	}
}

export function getSockets(stdout: string): { pid: number, socket: number }[] {
	const lines = stdout.trim().split('\n');
	const mapped: { pid: number, socket: number }[] = [];
	lines.forEach(line => {
		const match = /\/proc\/(\d+)\/fd\/\d+ -> socket:\[(\d+)\]/.exec(line)!;
		if (match && match.length >= 3) {
			mapped.push({
				pid: parseInt(match[1], 10),
				socket: parseInt(match[2], 10)
			});
		}
	});
	return mapped;
}

export function loadListeningPorts(...stdouts: string[]): { socket: number, ip: string, port: number }[] {
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
		for (let i = hex.length - 4; i >= 0; i -= 4) {
			result += parseInt(hex.substr(i, 4), 16).toString(16);
			if (i !== 0) {
				result += ':';
			}
		}
	}
	return result;
}

export function loadConnectionTable(stdout: string): Record<string, string>[] {
	const lines = stdout.trim().split('\n');
	const names = lines.shift()!.trim().split(/\s+/)
		.filter(name => name !== 'rx_queue' && name !== 'tm->when');
	const table = lines.map(line => line.trim().split(/\s+/).reduce((obj, value, i) => {
		obj[names[i] || i] = value;
		return obj;
	}, {} as Record<string, string>));
	return table;
}

function knownExcludeCmdline(command: string): boolean {
	return !!command.match(/.*\.vscode-server-[a-zA-Z]+\/bin.*/)
		|| (command.indexOf('out/vs/server/main.js') !== -1)
		|| (command.indexOf('_productName=VSCode') !== -1);
}

export async function findPorts(tcp: string, tcp6: string, procSockets: string, processes: { pid: number, cwd: string, cmd: string }[]): Promise<CandidatePort[]> {
	const connections: { socket: number, ip: string, port: number }[] = loadListeningPorts(tcp, tcp6);
	const sockets = getSockets(procSockets);

	const socketMap = sockets.reduce((m, socket) => {
		m[socket.socket] = socket;
		return m;
	}, {} as Record<string, typeof sockets[0]>);
	const processMap = processes.reduce((m, process) => {
		m[process.pid] = process;
		return m;
	}, {} as Record<string, typeof processes[0]>);

	const ports: CandidatePort[] = [];
	connections.filter((connection => socketMap[connection.socket])).forEach(({ socket, ip, port }) => {
		const command = processMap[socketMap[socket].pid].cmd;
		if (!knownExcludeCmdline(command)) {
			ports.push({ host: ip, port, detail: processMap[socketMap[socket].pid].cmd, pid: socketMap[socket].pid });
		}
	});
	return ports;
}

export class ExtHostTunnelService extends Disposable implements IExtHostTunnelService {
	readonly _serviceBrand: undefined;
	private readonly _proxy: MainThreadTunnelServiceShape;
	private _forwardPortProvider: ((tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions) => Thenable<vscode.Tunnel> | undefined) | undefined;
	private _showCandidatePort: (host: string, port: number, detail: string) => Thenable<boolean> = () => { return Promise.resolve(true); };
	private _extensionTunnels: Map<string, Map<number, { tunnel: vscode.Tunnel, disposeListener: IDisposable }>> = new Map();
	private _onDidChangeTunnels: Emitter<void> = new Emitter<void>();
	onDidChangeTunnels: vscode.Event<void> = this._onDidChangeTunnels.event;
	private _candidateFindingEnabled: boolean = false;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadTunnelService);
		if (isLinux && initData.remote.isRemote && initData.remote.authority) {
			this._proxy.$setRemoteTunnelService(process.pid);
		}
	}

	async openTunnel(extension: IExtensionDescription, forward: TunnelOptions): Promise<vscode.Tunnel | undefined> {
		const tunnel = await this._proxy.$openTunnel(forward, extension.displayName);
		if (tunnel) {
			const disposableTunnel: vscode.Tunnel = new ExtensionTunnel(tunnel.remoteAddress, tunnel.localAddress, () => {
				return this._proxy.$closeTunnel(tunnel.remoteAddress);
			});
			this._register(disposableTunnel);
			return disposableTunnel;
		}
		return undefined;
	}

	async getTunnels(): Promise<vscode.TunnelDescription[]> {
		return this._proxy.$getTunnels();
	}

	private calculateDelay(movingAverage: number) {
		// Some local testing indicated that the moving average might be between 50-100 ms.
		return Math.max(movingAverage * 20, 2000);
	}

	async $registerCandidateFinder(enable: boolean): Promise<void> {
		if (enable && this._candidateFindingEnabled) {
			// already enabled
			return;
		}
		this._candidateFindingEnabled = enable;
		// Regularly scan to see if the candidate ports have changed.
		let movingAverage = new MovingAverage();
		let oldPorts: { host: string, port: number, detail: string }[] | undefined = undefined;
		while (this._candidateFindingEnabled) {
			const startTime = new Date().getTime();
			const newPorts = await this.findCandidatePorts();
			const timeTaken = new Date().getTime() - startTime;
			movingAverage.update(timeTaken);
			if (!oldPorts || (JSON.stringify(oldPorts) !== JSON.stringify(newPorts))) {
				oldPorts = newPorts;
				await this._proxy.$onFoundNewCandidates(oldPorts);
			}
			await (new Promise<void>(resolve => setTimeout(() => resolve(), this.calculateDelay(movingAverage.value))));
		}
	}

	async setTunnelExtensionFunctions(provider: vscode.RemoteAuthorityResolver | undefined): Promise<IDisposable> {
		if (provider) {
			if (provider.showCandidatePort) {
				this._showCandidatePort = provider.showCandidatePort;
				await this._proxy.$setCandidateFilter();
			}
			if (provider.tunnelFactory) {
				this._forwardPortProvider = provider.tunnelFactory;
				await this._proxy.$setTunnelProvider(provider.tunnelFeatures ?? {
					elevation: false,
					public: false
				});
			}
		} else {
			this._forwardPortProvider = undefined;
		}
		return toDisposable(() => {
			this._forwardPortProvider = undefined;
		});
	}

	async $closeTunnel(remote: { host: string, port: number }, silent?: boolean): Promise<void> {
		if (this._extensionTunnels.has(remote.host)) {
			const hostMap = this._extensionTunnels.get(remote.host)!;
			if (hostMap.has(remote.port)) {
				if (silent) {
					hostMap.get(remote.port)!.disposeListener.dispose();
				}
				await hostMap.get(remote.port)!.tunnel.dispose();
				hostMap.delete(remote.port);
			}
		}
	}

	async $onDidTunnelsChange(): Promise<void> {
		this._onDidChangeTunnels.fire();
	}

	async $forwardPort(tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions): Promise<TunnelDto | undefined> {
		if (this._forwardPortProvider) {
			try {
				this.logService.trace('$forwardPort: Getting tunnel from provider.');
				const providedPort = this._forwardPortProvider(tunnelOptions, tunnelCreationOptions);
				this.logService.trace('$forwardPort: Got tunnel promise from provider.');
				if (providedPort !== undefined) {
					const tunnel = await providedPort;
					this.logService.trace('$forwardPort: Successfully awaited tunnel from provider.');
					if (!this._extensionTunnels.has(tunnelOptions.remoteAddress.host)) {
						this._extensionTunnels.set(tunnelOptions.remoteAddress.host, new Map());
					}
					const disposeListener = this._register(tunnel.onDidDispose(() => this._proxy.$closeTunnel(tunnel.remoteAddress)));
					this._extensionTunnels.get(tunnelOptions.remoteAddress.host)!.set(tunnelOptions.remoteAddress.port, { tunnel, disposeListener });
					return TunnelDto.fromApiTunnel(tunnel);
				} else {
					this.logService.trace('$forwardPort: Tunnel is undefined');
				}
			} catch (e) {
				this.logService.trace('$forwardPort: tunnel provider error');
			}
		}
		return undefined;
	}

	async $applyCandidateFilter(candidates: CandidatePort[]): Promise<CandidatePort[]> {
		const filter = await Promise.all(candidates.map(candidate => this._showCandidatePort(candidate.host, candidate.port, candidate.detail)));
		return candidates.filter((candidate, index) => filter[index]);
	}

	async findCandidatePorts(): Promise<CandidatePort[]> {
		let tcp: string = '';
		let tcp6: string = '';
		try {
			tcp = await fs.promises.readFile('/proc/net/tcp', 'utf8');
			tcp6 = await fs.promises.readFile('/proc/net/tcp6', 'utf8');
		} catch (e) {
			// File reading error. No additional handling needed.
		}
		const procSockets: string = await (new Promise(resolve => {
			exec('ls -l /proc/[0-9]*/fd/[0-9]* | grep socket:', (error, stdout, stderr) => {
				resolve(stdout);
			});
		}));

		const procChildren = await pfs.readdir('/proc');
		const processes: {
			pid: number, cwd: string, cmd: string
		}[] = [];
		for (let childName of procChildren) {
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
		return findPorts(tcp, tcp6, procSockets, processes);
	}
}
