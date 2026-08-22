/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../base/common/path.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isPortFree } from '../../../base/node/ports.js';
import {
	IVirtualMachineDisplay,
	IVirtualMachineEnvironmentCheck,
	IVirtualMachineInfo,
	IVirtualMachinesDaemonService,
	IVirtualMachinesSettings,
	VIRTUAL_MACHINE_DEFINITIONS,
	VirtualMachineState,
	sanitizeResources,
} from '../common/virtualMachines.js';
import { buildQemuArgs, qemuImgCreateArgs, resolveAcceleration, VNC_BASE_PORT } from './qemuLauncher.js';
import { qmpPowerDown } from './qemuQmpClient.js';
import { VncWebSocketProxy } from './vncWebSocketProxy.js';

/**
 * Host capabilities the manager relies on. The default implementation uses
 * Node.js APIs; tests can substitute their own implementation.
 */
export interface IVirtualMachineHost {
	findExecutable(name: string): Promise<string | undefined>;
	pathExists(path: string): Promise<boolean>;
	canReadWrite(path: string): Promise<boolean>;
	freeMemoryMB(): number;
	totalMemoryMB(): number;
	cpuCount(): number;
	isPortFree(port: number): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	removeFile(path: string): Promise<void>;
	createDisk(qemuImgBinary: string, diskPath: string, sizeGB: number): Promise<void>;
	spawnQemu(qemuBinary: string, args: string[], onStderr: (data: string) => void): IVirtualMachineProcessHandle;
	powerDown(qmpSocketPath: string, timeoutMs: number): Promise<boolean>;
}

export interface IVirtualMachineProcessHandle {
	readonly pid: number | undefined;
	readonly onExit: Event<number | null>;
	kill(signal: NodeJS.Signals): void;
}

export class NodeVirtualMachineHost implements IVirtualMachineHost {

	async findExecutable(name: string): Promise<string | undefined> {
		const pathEnv = process.env.PATH ?? '';
		const extensions = process.platform === 'win32' ? ['.exe', ''] : [''];
		for (const dir of pathEnv.split(path.delimiter)) {
			for (const ext of extensions) {
				const candidate = path.join(dir, name + ext);
				try {
					await fs.promises.access(candidate, fs.constants.X_OK);
					return candidate;
				} catch {
					// keep searching
				}
			}
		}
		return undefined;
	}

	async pathExists(p: string): Promise<boolean> {
		try {
			await fs.promises.access(p, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	async canReadWrite(p: string): Promise<boolean> {
		try {
			await fs.promises.access(p, fs.constants.R_OK | fs.constants.W_OK);
			return true;
		} catch {
			return false;
		}
	}

	freeMemoryMB(): number {
		return Math.floor(os.freemem() / (1024 * 1024));
	}

	totalMemoryMB(): number {
		return Math.floor(os.totalmem() / (1024 * 1024));
	}

	cpuCount(): number {
		return os.cpus().length;
	}

	isPortFree(port: number): Promise<boolean> {
		return isPortFree(port, 250);
	}

	mkdir(p: string): Promise<void> {
		return fs.promises.mkdir(p, { recursive: true }).then(() => undefined);
	}

	async removeFile(p: string): Promise<void> {
		try {
			await fs.promises.unlink(p);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw err;
			}
		}
	}

	createDisk(qemuImgBinary: string, diskPath: string, sizeGB: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn(qemuImgBinary, qemuImgCreateArgs(diskPath, sizeGB));
			let stderr = '';
			child.stderr.on('data', d => stderr += d.toString());
			child.on('error', reject);
			child.on('exit', code => code === 0 ? resolve() : reject(new Error(`qemu-img exited with code ${code}: ${stderr.slice(-512)}`)));
		});
	}

	spawnQemu(qemuBinary: string, args: string[], onStderr: (data: string) => void): IVirtualMachineProcessHandle {
		// QEMU runs as the current, unprivileged user. Never elevate here.
		const child: ChildProcess = spawn(qemuBinary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
		child.stderr?.on('data', d => onStderr(d.toString()));
		const onExitEmitter = new Emitter<number | null>();
		child.on('exit', code => {
			onExitEmitter.fire(code);
			onExitEmitter.dispose();
		});
		child.on('error', () => { /* surfaced through exit */ });
		return {
			pid: child.pid,
			onExit: onExitEmitter.event,
			kill: signal => {
				try {
					child.kill(signal);
				} catch {
					// already gone
				}
			}
		};
	}

	powerDown(qmpSocketPath: string, timeoutMs: number): Promise<boolean> {
		return qmpPowerDown(qmpSocketPath, timeoutMs);
	}
}

interface IManagedVirtualMachine {
	info: IVirtualMachineInfo;
	process?: IVirtualMachineProcessHandle;
	processExitListener?: IDisposable;
	proxy?: VncWebSocketProxy;
	qmpSocketPath: string;
	diskPath: string;
	stderrTail: string;
}

const STDERR_TAIL_LIMIT = 2048;
const VNC_START_TIMEOUT_MS = 30_000;

export class VirtualMachineManager extends Disposable implements IVirtualMachinesDaemonService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeVirtualMachines = this._register(new Emitter<readonly IVirtualMachineInfo[]>());
	readonly onDidChangeVirtualMachines = this._onDidChangeVirtualMachines.event;

	private readonly vms = new Map<string, IManagedVirtualMachine>();

	constructor(
		private settings: IVirtualMachinesSettings,
		private readonly defaultDataRoot: string,
		private readonly host: IVirtualMachineHost = new NodeVirtualMachineHost(),
		private readonly log: (message: string) => void = () => { },
	) {
		super();
		for (const definition of VIRTUAL_MACHINE_DEFINITIONS) {
			this.vms.set(definition.id, {
				info: {
					id: definition.id,
					name: definition.name,
					description: definition.description,
					state: VirtualMachineState.Stopped,
					resources: this.resourcesFor(definition.id),
				},
				qmpSocketPath: path.join(this.dataRoot, `${definition.id}.qmp`),
				diskPath: path.join(this.dataRoot, `${definition.id}.qcow2`),
				stderrTail: '',
			});
		}
		this._register(toDisposable(() => {
			for (const vm of this.vms.values()) {
				vm.processExitListener?.dispose();
				vm.proxy?.dispose();
				vm.process?.kill('SIGKILL');
			}
		}));
	}

	private get dataRoot(): string {
		return this.settings.dataRoot || this.defaultDataRoot;
	}

	private resourcesFor(id: string) {
		return sanitizeResources(this.settings.resources[id] ?? { cpus: 2, memoryMB: 2048, diskGB: 16 });
	}

	updateSettings(settings: IVirtualMachinesSettings): void {
		this.settings = settings;
		for (const [id, vm] of this.vms) {
			vm.info = { ...vm.info, resources: this.resourcesFor(id) };
		}
		this._onDidChangeVirtualMachines.fire(this.getSnapshot());
	}

	async getVirtualMachines(): Promise<readonly IVirtualMachineInfo[]> {
		return this.getSnapshot();
	}

	private getSnapshot(): readonly IVirtualMachineInfo[] {
		return [...this.vms.values()].map(vm => vm.info);
	}

	async checkEnvironment(): Promise<IVirtualMachineEnvironmentCheck> {
		const problems: string[] = [];
		if (process.platform === 'win32') {
			problems.push('Virtual machines are currently supported on Linux hosts only.');
		}
		const qemuPath = await this.resolveQemuBinary();
		if (!qemuPath) {
			problems.push('QEMU (qemu-system-x86_64) was not found. Install QEMU or set virtualMachines.qemuBinary.');
		}
		const kvmAvailable = process.platform !== 'win32' && await this.host.canReadWrite('/dev/kvm');
		const { acceleration, problems: accelProblems } = resolveAcceleration(this.settings.acceleration, kvmAvailable);
		problems.push(...accelProblems);
		return { ok: problems.length === 0, qemuPath, kvmAvailable, acceleration, problems };
	}

	private async resolveQemuBinary(): Promise<string | undefined> {
		const configured = this.settings.qemuBinary;
		if (configured) {
			return await this.host.pathExists(configured) ? configured : undefined;
		}
		return this.host.findExecutable('qemu-system-x86_64');
	}

	private resolveQemuImgBinary(qemuPath: string): string {
		// qemu-img normally lives next to qemu-system-*.
		const sibling = path.join(path.dirname(qemuPath), 'qemu-img');
		return sibling;
	}

	private setState(id: string, state: VirtualMachineState, error?: string): void {
		const vm = this.vms.get(id);
		if (!vm) {
			return;
		}
		vm.info = { ...vm.info, state, error };
		this._onDidChangeVirtualMachines.fire(this.getSnapshot());
	}

	private getVm(id: string): IManagedVirtualMachine {
		const vm = this.vms.get(id);
		if (!vm) {
			throw new Error(`Unknown virtual machine: ${id}`);
		}
		return vm;
	}

	async start(id: string): Promise<void> {
		const vm = this.getVm(id);
		if (vm.info.state === VirtualMachineState.Running || vm.info.state === VirtualMachineState.Starting) {
			return;
		}
		this.setState(id, VirtualMachineState.Starting);
		try {
			await this.doStart(id, vm);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.log(`[virtualMachines] failed to start ${id}: ${message}`);
			// Never leak a half-started QEMU process.
			vm.processExitListener?.dispose();
			vm.processExitListener = undefined;
			vm.proxy?.dispose();
			vm.proxy = undefined;
			vm.process?.kill('SIGKILL');
			vm.process = undefined;
			this.setState(id, VirtualMachineState.Error, message);
			throw err;
		}
	}

	private async doStart(id: string, vm: IManagedVirtualMachine): Promise<void> {
		const check = await this.checkEnvironment();
		if (!check.ok) {
			throw new Error(check.problems.join('\n'));
		}
		const qemuPath = check.qemuPath!;

		const resources = this.resourcesFor(id);
		if (this.host.cpuCount() < resources.cpus) {
			throw new Error(`Not enough CPUs: the VM requests ${resources.cpus} vCPU but the host only has ${this.host.cpuCount()}.`);
		}
		if (this.host.freeMemoryMB() < resources.memoryMB) {
			throw new Error(`Not enough free memory: the VM requests ${resources.memoryMB} MB but only ${this.host.freeMemoryMB()} MB are free.`);
		}

		await this.host.mkdir(this.dataRoot);

		if (!await this.host.pathExists(vm.diskPath)) {
			try {
				this.log(`[virtualMachines] creating disk ${vm.diskPath} (${resources.diskGB} GB)`);
				await this.host.createDisk(this.resolveQemuImgBinary(qemuPath), vm.diskPath, resources.diskGB);
			} catch (err) {
				throw new Error(`Could not create the virtual disk. Provide an existing disk image or check qemu-img. (${err instanceof Error ? err.message : err})`);
			}
		}

		const installIsoPath = this.settings.installIsoPaths?.[id];
		if (installIsoPath && !await this.host.pathExists(installIsoPath)) {
			throw new Error(`The configured installer ISO does not exist: ${installIsoPath}`);
		}

		const vncDisplay = await this.allocateVncDisplay();
		const args = buildQemuArgs({
			vmId: id,
			qemuBinary: qemuPath,
			acceleration: check.acceleration,
			resources,
			diskPath: vm.diskPath,
			installIsoPath,
			vncDisplay,
			qmpSocketPath: vm.qmpSocketPath,
			networkMode: this.settings.networkMode,
		});

		vm.stderrTail = '';
		const qemuProcess = this.host.spawnQemu(qemuPath, args, data => {
			vm.stderrTail = (vm.stderrTail + data).slice(-STDERR_TAIL_LIMIT);
		});
		vm.process = qemuProcess;

		vm.processExitListener?.dispose();
		const processExitListener = qemuProcess.onExit(code => {
			processExitListener.dispose();
			if (vm.processExitListener === processExitListener) {
				vm.processExitListener = undefined;
			}
			vm.proxy?.dispose();
			vm.proxy = undefined;
			vm.process = undefined;
			if (vm.info.state === VirtualMachineState.Stopping) {
				this.setState(id, VirtualMachineState.Stopped);
			} else if (vm.info.state !== VirtualMachineState.Stopped) {
				const tail = vm.stderrTail.trim();
				this.setState(id, VirtualMachineState.Error, `QEMU exited unexpectedly (code ${code}).${tail ? `\n${tail}` : ''}`);
			}
		});
		vm.processExitListener = processExitListener;

		const vncPort = VNC_BASE_PORT + vncDisplay;
		const deadline = Date.now() + VNC_START_TIMEOUT_MS;
		while (await this.host.isPortFree(vncPort)) {
			if (!vm.process) {
				throw new Error(`QEMU failed to start.${vm.stderrTail.trim() ? `\n${vm.stderrTail.trim()}` : ''}`);
			}
			if (Date.now() > deadline) {
				qemuProcess.kill('SIGKILL');
				throw new Error('Timed out waiting for the QEMU VNC server.');
			}
			await new Promise(resolve => setTimeout(resolve, 150));
		}

		vm.proxy = await VncWebSocketProxy.create(vncPort, err => this.log(`[virtualMachines] VNC proxy error for ${id}: ${err.message}`));
		this.setState(id, VirtualMachineState.Running);
		this.log(`[virtualMachines] ${id} is running (vnc :${vncDisplay}, proxy :${vm.proxy.port})`);
	}

	private async allocateVncDisplay(): Promise<number> {
		for (let display = 0; display < 16; display++) {
			if (await this.host.isPortFree(VNC_BASE_PORT + display)) {
				return display;
			}
		}
		throw new Error('No free VNC display port available (5900-5915).');
	}

	async stop(id: string): Promise<void> {
		const vm = this.getVm(id);
		if (vm.info.state === VirtualMachineState.Stopped) {
			return;
		}
		this.setState(id, VirtualMachineState.Stopping);
		const process = vm.process;
		if (process) {
			// Ask the guest to shut down cleanly first (ACPI power button).
			const graceful = await this.host.powerDown(vm.qmpSocketPath, 10_000);
			if (graceful) {
				const exited = await this.waitForExit(vm, 15_000);
				if (!exited) {
					process.kill('SIGTERM');
					if (!await this.waitForExit(vm, 5_000)) {
						process.kill('SIGKILL');
					}
				}
			} else {
				process.kill('SIGTERM');
				if (!await this.waitForExit(vm, 5_000)) {
					process.kill('SIGKILL');
				}
			}
		}
		vm.processExitListener?.dispose();
		vm.processExitListener = undefined;
		vm.proxy?.dispose();
		vm.proxy = undefined;
		vm.process = undefined;
		if (vm.info.state !== VirtualMachineState.Error) {
			this.setState(id, VirtualMachineState.Stopped);
		}
	}

	private waitForExit(vm: IManagedVirtualMachine, timeoutMs: number): Promise<boolean> {
		const process = vm.process;
		if (!process) {
			return Promise.resolve(true);
		}
		return new Promise<boolean>(resolve => {
			const timer = setTimeout(() => {
				listener.dispose();
				resolve(false);
			}, timeoutMs);
			const listener = process.onExit(() => {
				clearTimeout(timer);
				listener.dispose();
				resolve(true);
			});
		});
	}

	async restart(id: string): Promise<void> {
		await this.stop(id);
		await this.start(id);
	}

	async remove(id: string): Promise<void> {
		const vm = this.getVm(id);
		if (vm.info.state !== VirtualMachineState.Stopped && vm.info.state !== VirtualMachineState.Error) {
			throw new Error('Stop the virtual machine before deleting it.');
		}
		await this.host.removeFile(vm.diskPath);
		this.setState(id, VirtualMachineState.Stopped);
	}

	async openDisplay(id: string): Promise<IVirtualMachineDisplay> {
		const vm = this.getVm(id);
		if (vm.info.state !== VirtualMachineState.Running) {
			await this.start(id);
		}
		if (!vm.proxy) {
			throw new Error('The virtual machine display is not available.');
		}
		const token = vm.proxy.issueToken();
		return { vmId: id, webSocketUrl: `ws://127.0.0.1:${vm.proxy.port}`, token };
	}
}
