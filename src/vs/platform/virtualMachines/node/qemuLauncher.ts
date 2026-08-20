/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IVirtualMachineResources } from '../common/virtualMachines.js';

export const VNC_BASE_PORT = 5900;

export interface IQemuLaunchSpec {
	readonly vmId: string;
	readonly qemuBinary: string;
	readonly acceleration: 'kvm' | 'tcg';
	readonly resources: IVirtualMachineResources;
	readonly diskPath: string;
	readonly installIsoPath?: string;
	readonly vncDisplay: number;
	readonly qmpSocketPath: string;
	readonly networkMode: 'user' | 'restricted' | 'none';
}

/**
 * Build the QEMU command line for a GitCortex virtual machine.
 *
 * The VM is deliberately locked down:
 * - loopback-only VNC display (the workbench proxies it over WebSocket);
 * - no host display, no monitor/serial/parallel exposure;
 * - user-mode networking, optionally fully restricted;
 * - QMP control socket on a private unix socket for clean power-down.
 */
export function buildQemuArgs(spec: IQemuLaunchSpec): string[] {
	const args: string[] = [
		'-name', `gitcortex-${spec.vmId}`,
		'-machine', 'q35',
		'-accel', spec.acceleration === 'kvm' ? 'kvm' : 'tcg,thread=multi',
		'-cpu', spec.acceleration === 'kvm' ? 'host' : 'max',
		'-smp', String(spec.resources.cpus),
		'-m', String(spec.resources.memoryMB),
		'-drive', `file=${spec.diskPath},format=qcow2,if=virtio,discard=unmap`,
		// Graphical output goes exclusively to the loopback VNC server.
		'-display', 'none',
		'-vga', 'virtio',
		'-vnc', `127.0.0.1:${spec.vncDisplay}`,
		// QMP control channel on a private unix socket (power down, status).
		'-qmp', `unix:${spec.qmpSocketPath},server=on,wait=off`,
		'-monitor', 'none',
		'-serial', 'none',
		'-parallel', 'none',
	];

	switch (spec.networkMode) {
		case 'user':
			args.push('-nic', 'user,model=virtio-net-pci');
			break;
		case 'restricted':
			// Guest is isolated: no access to host services or other guests.
			args.push('-nic', 'user,model=virtio-net-pci,restrict=on');
			break;
		case 'none':
			args.push('-nic', 'none');
			break;
	}

	if (spec.installIsoPath) {
		args.push('-cdrom', spec.installIsoPath, '-boot', 'once=d');
	}

	return args;
}

export function qemuImgCreateArgs(diskPath: string, sizeGB: number): string[] {
	return ['create', '-f', 'qcow2', diskPath, `${sizeGB}G`];
}

/**
 * Decide the effective acceleration mode. KVM is required by default; TCG
 * (slow software emulation) must be opted into explicitly.
 */
export function resolveAcceleration(setting: 'auto' | 'kvm' | 'tcg', kvmAvailable: boolean): { acceleration: 'kvm' | 'tcg'; problems: string[] } {
	const problems: string[] = [];
	if (setting === 'tcg') {
		return { acceleration: 'tcg', problems };
	}
	if (kvmAvailable) {
		return { acceleration: 'kvm', problems };
	}
	if (setting === 'auto') {
		problems.push('KVM is not available on this host and virtualMachines.acceleration is "auto". Set it to "tcg" to fall back to (slow) software emulation, or enable KVM.');
		return { acceleration: 'tcg', problems };
	}
	problems.push('KVM is required (virtualMachines.acceleration is "kvm") but /dev/kvm is missing or not accessible. Check that virtualization is enabled and that your user is allowed to use KVM.');
	return { acceleration: 'kvm', problems };
}
