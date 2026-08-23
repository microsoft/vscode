/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const VirtualMachinesServiceChannelName = 'virtualMachines';

export const IVirtualMachinesService = createDecorator<IVirtualMachinesService>('virtualMachinesService');

/**
 * Well-known virtual machines shipped with GitCortex Studio.
 */
export const enum WellKnownVirtualMachine {
	UbuntuDeveloper = 'ubuntu-developer',
	UbuntuSandbox = 'ubuntu-sandbox'
}

export const enum VirtualMachineState {
	Stopped = 'stopped',
	Starting = 'starting',
	Running = 'running',
	Stopping = 'stopping',
	Error = 'error'
}

export interface IVirtualMachineResources {
	readonly cpus: number;
	readonly memoryMB: number;
	readonly diskGB: number;
}

export interface IVirtualMachineInfo {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly state: VirtualMachineState;
	readonly resources: IVirtualMachineResources;
	readonly error?: string;
}

/**
 * Information needed by the workbench to attach a graphical console.
 */
export interface IVirtualMachineDisplay {
	readonly vmId: string;
	/**
	 * WebSocket URL (loopback only, token authenticated) that bridges to the
	 * QEMU VNC server of the virtual machine.
	 */
	readonly webSocketUrl: string;
	/**
	 * Single-use session token the client must present (as the WebSocket
	 * subprotocol) before the proxy forwards any RFB traffic.
	 */
	readonly token: string;
}

export interface IVirtualMachineEnvironmentCheck {
	readonly ok: boolean;
	readonly qemuPath?: string;
	readonly kvmAvailable: boolean;
	readonly acceleration: 'kvm' | 'tcg';
	readonly problems: readonly string[];
}

export interface IVirtualMachinesService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired whenever the state or metadata of any virtual machine changes.
	 */
	readonly onDidChangeVirtualMachines: Event<readonly IVirtualMachineInfo[]>;

	getVirtualMachines(): Promise<readonly IVirtualMachineInfo[]>;

	/**
	 * Inspect the host and report whether virtual machines can run here.
	 * Never throws: problems are reported in the result.
	 */
	checkEnvironment(): Promise<IVirtualMachineEnvironmentCheck>;

	start(id: string): Promise<void>;
	stop(id: string): Promise<void>;
	restart(id: string): Promise<void>;

	/**
	 * Delete the virtual disk of a stopped machine. The machine is recreated
	 * from scratch on next start.
	 */
	remove(id: string): Promise<void>;

	/**
	 * Ensure the machine is running and return the display connection info
	 * used by the workbench to open the graphical console.
	 */
	openDisplay(id: string): Promise<IVirtualMachineDisplay>;
}

/**
 * Internal surface of the daemon process, exposed over its IPC channel.
 */
export interface IVirtualMachinesDaemonService extends IVirtualMachinesService {
	updateSettings(settings: IVirtualMachinesSettings): void;
	shutdown(): Promise<void>;
}

export const enum VirtualMachinesConfig {
	Acceleration = 'virtualMachines.acceleration',
	QemuBinary = 'virtualMachines.qemuBinary',
	DataRoot = 'virtualMachines.dataRoot',
	NetworkMode = 'virtualMachines.networkMode',
	DeveloperCpus = 'virtualMachines.ubuntuDeveloper.cpus',
	DeveloperMemoryMB = 'virtualMachines.ubuntuDeveloper.memoryMB',
	DeveloperDiskGB = 'virtualMachines.ubuntuDeveloper.diskGB',
	DeveloperInstallIso = 'virtualMachines.ubuntuDeveloper.installIso',
	SandboxCpus = 'virtualMachines.ubuntuSandbox.cpus',
	SandboxMemoryMB = 'virtualMachines.ubuntuSandbox.memoryMB',
	SandboxDiskGB = 'virtualMachines.ubuntuSandbox.diskGB',
	SandboxInstallIso = 'virtualMachines.ubuntuSandbox.installIso',
}

export interface IVirtualMachinesSettings {
	readonly acceleration: 'auto' | 'kvm' | 'tcg';
	readonly qemuBinary?: string;
	readonly dataRoot?: string;
	readonly networkMode: 'user' | 'restricted' | 'none';
	readonly resources: { readonly [vmId: string]: IVirtualMachineResources | undefined };
	/**
	 * Optional bootable installer ISO per machine, used when the virtual disk
	 * has to be provisioned from scratch.
	 */
	readonly installIsoPaths?: { readonly [vmId: string]: string | undefined };
}

export const DEFAULT_VM_RESOURCES: { readonly [vmId: string]: IVirtualMachineResources } = {
	[WellKnownVirtualMachine.UbuntuDeveloper]: { cpus: 2, memoryMB: 4096, diskGB: 32 },
	[WellKnownVirtualMachine.UbuntuSandbox]: { cpus: 2, memoryMB: 2048, diskGB: 16 },
};

export const VIRTUAL_MACHINE_DEFINITIONS: readonly { readonly id: string; readonly name: string; readonly description: string }[] = [
	{
		id: WellKnownVirtualMachine.UbuntuDeveloper,
		name: 'Ubuntu Developer',
		description: 'Machine destinée au développement.'
	},
	{
		id: WellKnownVirtualMachine.UbuntuSandbox,
		name: 'Ubuntu Sandbox',
		description: 'Machine destinée aux expériences, tests et exécutions isolées.'
	}
];

/**
 * Clamp user provided resources to safe bounds. Anything outside these bounds
 * is rejected to protect the host.
 */
export function sanitizeResources(resources: IVirtualMachineResources): IVirtualMachineResources {
	const clamp = (value: number, min: number, max: number, fallback: number): number =>
		typeof value === 'number' && isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
	return {
		cpus: clamp(resources.cpus, 1, 16, 2),
		memoryMB: clamp(resources.memoryMB, 512, 32768, 2048),
		diskGB: clamp(resources.diskGB, 4, 512, 16),
	};
}
