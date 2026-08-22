/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path.js';
import { Schemas } from '../../../base/common/network.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
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

/**
 * Main-process side of the virtual machines feature. All QEMU orchestration
 * happens in a dedicated utility process (the daemon) so that the Electron
 * main process never spawns or supervises hypervisor processes itself.
 */
export class VirtualMachinesMainService extends Disposable implements IVirtualMachinesService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeVirtualMachines = this._register(new Emitter<readonly IVirtualMachineInfo[]>());
	readonly onDidChangeVirtualMachines = this._onDidChangeVirtualMachines.event;

	private utilityProcess: UtilityProcess | undefined;
	private daemon: IVirtualMachinesDaemonService | undefined;
	private startingDaemon: Promise<IVirtualMachinesDaemonService> | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this.disposeDaemon()));
		this._register(this.lifecycleMainService.onWillShutdown(() => this.disposeDaemon()));
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
			agentControl: get<boolean>(VirtualMachinesConfig.AgentControl) ?? false,
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
		if (this.daemon) {
			return this.daemon;
		}
		if (!this.startingDaemon) {
			this.startingDaemon = this.startDaemon().then(daemon => {
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
		this.utilityProcess = utilityProcess;

		const started = utilityProcess.start({
			type: 'virtualMachines',
			name: 'virtual-machines-daemon',
			entryPoint: 'vs/platform/virtualMachines/node/virtualMachinesDaemonMain',
			args: [
				'--logsPath', this.environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
				'--user-data-dir', this.environmentMainService.userDataPath,
			],
			env: {
				// UtilityProcess replaces the whole environment when `env` is
				// provided; without the inherited variables (PATH, HOME, ...) the
				// daemon could never locate the QEMU binary.
				...process.env,
				GITCORTEX_VM_SETTINGS: JSON.stringify(this.readSettings()),
				GITCORTEX_VM_DATA_ROOT: dataRoot,
			}
		});
		if (!started) {
			throw new Error('The virtual machines daemon did not start.');
		}

		// If the daemon dies, forget it so the next call spawns a fresh one.
		utilityProcess.onExit(() => {
			if (this.utilityProcess === utilityProcess) {
				this.logService.warn('[virtualMachines] daemon exited unexpectedly');
				this.disposeDaemon();
			}
		});

		const port = utilityProcess.connect();
		const client = new MessagePortClient(port, 'virtualMachines');
		const daemon = ProxyChannel.toService<IVirtualMachinesDaemonService>(client.getChannel(VirtualMachinesServiceChannelName));
		daemon.onDidChangeVirtualMachines(vms => this._onDidChangeVirtualMachines.fire(vms));

		this.logService.trace('[virtualMachines] daemon started');
		return daemon;
	}

	private disposeDaemon(): void {
		this.daemon = undefined;
		this.startingDaemon = undefined;
		const utilityProcess = this.utilityProcess;
		this.utilityProcess = undefined;
		if (utilityProcess) {
			// Killing the daemon disposes the manager, which stops all VMs.
			utilityProcess.kill();
		}
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
