/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path.js';
import { Schemas } from '../../../base/common/network.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/electron-main/ipc.mp.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import {
	DEFAULT_VM_RESOURCES,
	IVirtualMachineDisplay,
	IVirtualMachineEnvironmentCheck,
	IVirtualMachineInfo,
	IVirtualMachinesService,
	IVirtualMachinesSettings,
	VirtualMachinesConfig,
	VirtualMachinesServiceChannelName,
	WellKnownVirtualMachine,
	IVirtualMachinesDaemonService,
} from '../common/virtualMachines.js';

const DAEMON_SHUTDOWN_TIMEOUT_MS = 15_000;

export class VirtualMachinesMainService extends Disposable implements IVirtualMachinesService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeVirtualMachines = this._register(new Emitter<readonly IVirtualMachineInfo[]>());
	readonly onDidChangeVirtualMachines = this._onDidChangeVirtualMachines.event;

	private utilityProcess: UtilityProcess | undefined;
	private daemon: IVirtualMachinesDaemonService | undefined;
	private daemonStore: DisposableStore | undefined;
	private startingDaemon: Promise<IVirtualMachinesDaemonService> | undefined;
	private daemonShutdown: Promise<void> | undefined;
	private shuttingDown = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			this.shuttingDown = true;
			void this.shutdownDaemon();
		}));
		this._register(this.lifecycleMainService.onWillShutdown(event => {
			this.shuttingDown = true;
			event.join('virtualMachines', this.shutdownDaemon());
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('virtualMachines')) {
				this.daemon?.updateSettings(this.readSettings());
			}
		}));
	}

	private readSettings(): IVirtualMachinesSettings {
		const get = <T>(key: string): T | undefined => this.configurationService.getValue<T>(key);
		return {
			acceleration: get<'auto' | 'kvm' | 'tcg'>(VirtualMachinesConfig.Acceleration) ?? 'auto',
			qemuBinary: get<string>(VirtualMachinesConfig.QemuBinary) || undefined,
			dataRoot: get<string>(VirtualMachinesConfig.DataRoot) || undefined,
			networkMode: get<'user' | 'restricted' | 'none'>(VirtualMachinesConfig.NetworkMode) ?? 'user',
			installIsoPaths: {
				[WellKnownVirtualMachine.UbuntuDeveloper]: get<string>(VirtualMachinesConfig.DeveloperInstallIso) || undefined,
				[WellKnownVirtualMachine.UbuntuSandbox]: get<string>(VirtualMachinesConfig.SandboxInstallIso) || undefined,
			},
			resources: {
				[WellKnownVirtualMachine.UbuntuDeveloper]: {
					cpus: get<number>(VirtualMachinesConfig.DeveloperCpus) ?? DEFAULT_VM_RESOURCES[WellKnownVirtualMachine.UbuntuDeveloper].cpus,
					memoryMB: get<number>(VirtualMachinesConfig.DeveloperMemoryMB) ?? DEFAULT_VM_RESOURCES[WellKnownVirtualMachine.UbuntuDeveloper].memoryMB,
					diskGB: get<number>(VirtualMachinesConfig.DeveloperDiskGB) ?? DEFAULT_VM_RESOURCES[WellKnownVirtualMachine.UbuntuDeveloper].diskGB,
				},
				[WellKnownVirtualMachine.UbuntuSandbox]: {
					cpus: get<number>(VirtualMachinesConfig.SandboxCpus) ?? DEFAULT_VM_RESOURCES[WellKnownVirtualMachine.UbuntuSandbox].cpus,
					memoryMB: get<number>(VirtualMachinesConfig.SandboxMemoryMB) ?? DEFAULT_VM_RESOURCES[WellKnownVirtualMachine.UbuntuSandbox].memoryMB,
					diskGB: get<number>(VirtualMachinesConfig.SandboxDiskGB) ?? DEFAULT_VM_RESOURCES[WellKnownVirtualMachine.UbuntuSandbox].diskGB,
				},
			},
		};
	}

	private async getDaemon(): Promise<IVirtualMachinesDaemonService> {
		if (this.shuttingDown) {
			throw new Error('The virtual machines daemon is shutting down.');
		}
		if (this.daemon) {
			return this.daemon;
		}
		if (!this.startingDaemon) {
			this.startingDaemon = this.startDaemon().then(daemon => {
				if (this.shuttingDown) {
					throw new Error('The virtual machines daemon is shutting down.');
				}
				this.daemon = daemon;
				return daemon;
			}, err => {
				this.startingDaemon = undefined;
				throw err;
			});
		}
		return this.startingDaemon;
	}

	private async startDaemon(): Promise<IVirtualMachinesDaemonService> {
		const dataRoot = join(this.environmentMainService.userDataPath, 'virtualMachines');
		const utilityProcess = new UtilityProcess(this.logService, NullTelemetryService, this.lifecycleMainService);
		const store = new DisposableStore();
		this.utilityProcess = utilityProcess;
		store.add(toDisposable(() => utilityProcess.dispose()));

		try {
			const started = utilityProcess.start({
				type: 'virtualMachines',
				name: 'virtual-machines-daemon',
				entryPoint: 'vs/platform/virtualMachines/node/virtualMachinesDaemonMain',
				args: [
					'--logsPath', this.environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
					'--user-data-dir', this.environmentMainService.userDataPath,
				],
				env: {
					...process.env,
					GITCORTEX_VM_SETTINGS: JSON.stringify(this.readSettings()),
					GITCORTEX_VM_DATA_ROOT: dataRoot,
				}
			});
			if (!started) {
				throw new Error('The virtual machines daemon did not start.');
			}

			const port = utilityProcess.connect();
			const client = store.add(new MessagePortClient(port, 'virtualMachines'));
			const daemon = ProxyChannel.toService<IVirtualMachinesDaemonService>(client.getChannel(VirtualMachinesServiceChannelName));
			store.add(daemon.onDidChangeVirtualMachines(vms => this._onDidChangeVirtualMachines.fire(vms)));
			store.add(utilityProcess.onExit(() => {
				if (this.utilityProcess === utilityProcess) {
					this.logService.warn('[virtualMachines] daemon exited unexpectedly');
					this.clearDaemon(utilityProcess, store);
				}
			}));

			this.daemonStore = store;
			this.logService.trace('[virtualMachines] daemon started');
			return daemon;
		} catch (error) {
			store.dispose();
			if (this.utilityProcess === utilityProcess) {
				this.utilityProcess = undefined;
			}
			throw error;
		}
	}

	private clearDaemon(utilityProcess: UtilityProcess, store: DisposableStore): void {
		if (this.daemonStore === store) {
			this.daemonStore = undefined;
		}
		if (this.utilityProcess === utilityProcess) {
			this.daemon = undefined;
			this.startingDaemon = undefined;
			this.utilityProcess = undefined;
		}
		store.dispose();
	}

	private shutdownDaemon(): Promise<void> {
		if (this.daemonShutdown) {
			return this.daemonShutdown;
		}
		this.daemonShutdown = (async () => {
			const starting = this.startingDaemon;
			if (starting) {
				await starting.catch(() => undefined);
			}

			const daemon = this.daemon;
			const utilityProcess = this.utilityProcess;
			const store = this.daemonStore;
			this.daemon = undefined;
			this.startingDaemon = undefined;
			this.utilityProcess = undefined;
			this.daemonStore = undefined;

			try {
				if (daemon) {
					await withTimeout(daemon.shutdown(), DAEMON_SHUTDOWN_TIMEOUT_MS);
				}
			} catch (error) {
				this.logService.warn(`[virtualMachines] graceful daemon shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
			} finally {
				store?.dispose();
				if (utilityProcess) {
					utilityProcess.kill();
					utilityProcess.dispose();
				}
			}
		})();
		return this.daemonShutdown;
	}

	async getVirtualMachines(): Promise<readonly IVirtualMachineInfo[]> {
		return (await this.getDaemon()).getVirtualMachines();
	}

	async checkEnvironment(): Promise<IVirtualMachineEnvironmentCheck> {
		return (await this.getDaemon()).checkEnvironment();
	}

	async start(id: string): Promise<void> {
		return (await this.getDaemon()).start(id);
	}

	async stop(id: string): Promise<void> {
		return (await this.getDaemon()).stop(id);
	}

	async restart(id: string): Promise<void> {
		return (await this.getDaemon()).restart(id);
	}

	async remove(id: string): Promise<void> {
		return (await this.getDaemon()).remove(id);
	}

	async openDisplay(id: string): Promise<IVirtualMachineDisplay> {
		return (await this.getDaemon()).openDisplay(id);
	}
}

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
		promise.then(value => {
			clearTimeout(timer);
			resolve(value);
		}, error => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
