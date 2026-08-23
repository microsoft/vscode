/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	DEFAULT_VM_RESOURCES,
	IVirtualMachinesSettings,
	VirtualMachineState,
	WellKnownVirtualMachine,
	sanitizeResources,
} from '../../common/virtualMachines.js';
import { buildQemuArgs, qemuImgCreateArgs, resolveAcceleration } from '../../node/qemuLauncher.js';
import { IVirtualMachineHost, IVirtualMachineProcessHandle, VirtualMachineManager } from '../../node/virtualMachineManager.js';

function defaultSettings(overrides?: Partial<IVirtualMachinesSettings>): IVirtualMachinesSettings {
	return {
		acceleration: 'kvm',
			networkMode: 'user',
			resources: { ...DEFAULT_VM_RESOURCES },
		...overrides,
	};
}

suite('sanitizeResources', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps valid values', () => {
		assert.deepStrictEqual(sanitizeResources({ cpus: 4, memoryMB: 8192, diskGB: 64 }), { cpus: 4, memoryMB: 8192, diskGB: 64 });
	});

	test('clamps to safe bounds', () => {
		assert.deepStrictEqual(sanitizeResources({ cpus: 1000, memoryMB: 999999, diskGB: 100000 }), { cpus: 16, memoryMB: 32768, diskGB: 512 });
		assert.deepStrictEqual(sanitizeResources({ cpus: 0, memoryMB: 1, diskGB: 0 }), { cpus: 1, memoryMB: 512, diskGB: 4 });
	});

	test('falls back on invalid values', () => {
		assert.deepStrictEqual(sanitizeResources({ cpus: NaN, memoryMB: -Infinity, diskGB: 'x' as unknown as number }), { cpus: 2, memoryMB: 2048, diskGB: 16 });
	});
});

suite('resolveAcceleration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('kvm setting requires kvm', () => {
		assert.deepStrictEqual(resolveAcceleration('kvm', true), { acceleration: 'kvm', problems: [] });
		assert.strictEqual(resolveAcceleration('kvm', false).problems.length, 1);
	});

	test('auto uses kvm when available', () => {
		assert.deepStrictEqual(resolveAcceleration('auto', true), { acceleration: 'kvm', problems: [] });
	});

	test('auto without kvm reports a problem', () => {
		const result = resolveAcceleration('auto', false);
		assert.strictEqual(result.problems.length, 1);
	});

	test('tcg is always allowed but explicit', () => {
		assert.deepStrictEqual(resolveAcceleration('tcg', false), { acceleration: 'tcg', problems: [] });
		assert.deepStrictEqual(resolveAcceleration('tcg', true), { acceleration: 'tcg', problems: [] });
	});
});

suite('buildQemuArgs', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const base = {
		vmId: WellKnownVirtualMachine.UbuntuDeveloper,
		qemuBinary: '/usr/bin/qemu-system-x86_64',
		acceleration: 'kvm' as const,
		resources: { cpus: 2, memoryMB: 4096, diskGB: 32 },
		diskPath: '/data/ubuntu-developer.qcow2',
		vncSocketPath: '/data/ubuntu-developer.vnc',
		qmpSocketPath: '/data/ubuntu-developer.qmp',
		networkMode: 'user' as const,
	};

	test('uses kvm and host cpu', () => {
		const args = buildQemuArgs(base);
		assert.ok(args.includes('kvm'));
		assert.ok(args.includes('host'));
	});

	test('vnc uses a private Unix socket', () => {
		const args = buildQemuArgs(base);
		const index = args.indexOf('-vnc');
		assert.strictEqual(args[index + 1], 'unix:/data/ubuntu-developer.vnc');
		assert.ok(!args[index + 1].includes('127.0.0.1'));
	});

	test('never exposes a host display or monitor', () => {
		const args = buildQemuArgs(base);
		assert.strictEqual(args[args.indexOf('-display') + 1], 'none');
		assert.strictEqual(args[args.indexOf('-monitor') + 1], 'none');
	});

	test('restricted network adds restrict=on', () => {
		const args = buildQemuArgs({ ...base, networkMode: 'restricted' });
		assert.ok(args.some(a => a.includes('restrict=on')));
	});

	test('no network when none', () => {
		const args = buildQemuArgs({ ...base, networkMode: 'none' });
		assert.deepStrictEqual(args.slice(args.indexOf('-nic'), args.indexOf('-nic') + 2), ['-nic', 'none']);
	});

	test('install iso is attached once', () => {
		const args = buildQemuArgs({ ...base, installIsoPath: '/isos/ubuntu.iso' });
		assert.ok(args.includes('/isos/ubuntu.iso'));
		assert.deepStrictEqual(args.slice(args.indexOf('-boot'), args.indexOf('-boot') + 2), ['-boot', 'once=d']);
	});
});

suite('qemuImgCreateArgs', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates qcow2 with size', () => {
		assert.deepStrictEqual(qemuImgCreateArgs('/data/vm.qcow2', 32), ['create', '-f', 'qcow2', '/data/vm.qcow2', '32G']);
	});
});

class FakeProcessHandle implements IVirtualMachineProcessHandle {
	private readonly _onExit = new Emitter<number | null>();
	readonly onExit = this._onExit.event;
	readonly pid = 1234;
	killedWith: NodeJS.Signals[] = [];

	kill(signal: NodeJS.Signals): void {
		this.killedWith.push(signal);
		setTimeout(() => {
			this._onExit.fire(0);
			this._onExit.dispose();
		}, 0);
	}
}

class FakeHost implements IVirtualMachineHost {
	kvm = true;
	qemu = '/usr/bin/qemu-system-x86_64';
	freeMB = 65536;
	cpus = 8;
	disks = new Set<string>();
	sockets = new Set<string>();
	qmpHandles = new Map<string, FakeProcessHandle>();
	spawned: { args: string[]; handle: FakeProcessHandle }[] = [];
	powerDownResult = true;

	async findExecutable(name: string): Promise<string | undefined> {
		return name === 'qemu-system-x86_64' ? this.qemu : undefined;
	}
	async pathExists(p: string): Promise<boolean> {
		return p === this.qemu || p === '/usr/bin/qemu-img' || this.disks.has(p) || this.sockets.has(p) || p === '/dev/kvm';
	}
	async canReadWrite(p: string): Promise<boolean> {
		return p === '/dev/kvm' ? this.kvm : true;
	}
	freeMemoryMB(): number { return this.freeMB; }
	totalMemoryMB(): number { return 65536; }
	cpuCount(): number { return this.cpus; }
	async mkdir(): Promise<void> { }
	async chmod(): Promise<void> { }
	async removeFile(p: string): Promise<void> { this.disks.delete(p); this.sockets.delete(p); }
	async createDisk(_bin: string, diskPath: string): Promise<void> { this.disks.add(diskPath); }
	spawnQemu(_bin: string, args: string[]): IVirtualMachineProcessHandle {
		const handle = new FakeProcessHandle();
		this.spawned.push({ args, handle });
		// QEMU creates its private VNC and QMP sockets once it is up.
		const vncIndex = args.indexOf('-vnc');
		this.sockets.add(args[vncIndex + 1].slice('unix:'.length));
		const qmpIndex = args.indexOf('-qmp');
		const qmpSocketPath = args[qmpIndex + 1].split(',')[0].slice('unix:'.length);
		this.sockets.add(qmpSocketPath);
		this.qmpHandles.set(qmpSocketPath, handle);
		return handle;
	}
	async powerDown(qmpSocketPath: string): Promise<boolean> {
		if (this.powerDownResult) {
			// A graceful ACPI power-down makes the (fake) guest exit.
			const handle = this.qmpHandles.get(qmpSocketPath);
			if (handle) {
				setTimeout(() => handle.kill('SIGTERM'), 0);
			}
		}
		return this.powerDownResult;
	}
}

suite('VirtualMachineManager', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createManager(host: FakeHost, settings?: Partial<IVirtualMachinesSettings>): VirtualMachineManager {
		return new VirtualMachineManager(defaultSettings(settings), '/tmp/gitcortex-test-vms', host);
	}

	test('lists the two well-known machines', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			const vms = await manager.getVirtualMachines();
			assert.strictEqual(vms.length, 2);
			assert.deepStrictEqual(vms.map(v => v.id), [WellKnownVirtualMachine.UbuntuDeveloper, WellKnownVirtualMachine.UbuntuSandbox]);
			assert.ok(vms.every(v => v.state === VirtualMachineState.Stopped));
		} finally {
			manager.dispose();
		}
	});

	test('checkEnvironment reports missing qemu', async () => {
		const host = new FakeHost();
		host.qemu = '';
		const manager = createManager(host);
		try {
			const check = await manager.checkEnvironment();
			assert.strictEqual(check.ok, false);
			assert.ok(check.problems.some(p => p.includes('QEMU')));
		} finally {
			manager.dispose();
		}
	});

	test('checkEnvironment reports missing kvm when required', async () => {
		const host = new FakeHost();
		host.kvm = false;
		const manager = createManager(host);
		try {
			const check = await manager.checkEnvironment();
			assert.strictEqual(check.ok, false);
			assert.ok(check.problems.some(p => p.toLowerCase().includes('kvm')));
		} finally {
			manager.dispose();
		}
	});

	test('start creates the disk, spawns qemu and becomes running', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
			const [vm] = (await manager.getVirtualMachines()).filter(v => v.id === WellKnownVirtualMachine.UbuntuDeveloper);
			assert.strictEqual(vm.state, VirtualMachineState.Running);
			assert.strictEqual(host.spawned.length, 1);
			assert.ok(host.spawned[0].args.includes('-vnc'));
			assert.strictEqual(host.disks.size, 1);
		} finally {
			manager.dispose();
		}
	});

	test('start fails cleanly when memory is insufficient', async () => {
		const host = new FakeHost();
		host.freeMB = 1024;
		const manager = createManager(host);
		try {
			await assert.rejects(() => manager.start(WellKnownVirtualMachine.UbuntuDeveloper), /memory/i);
			const [vm] = (await manager.getVirtualMachines()).filter(v => v.id === WellKnownVirtualMachine.UbuntuDeveloper);
			assert.strictEqual(vm.state, VirtualMachineState.Error);
			assert.ok(vm.error?.toLowerCase().includes('memory'));
			assert.strictEqual(host.spawned.length, 0, 'qemu must not be spawned when preflight checks fail');
		} finally {
			manager.dispose();
		}
	});

	test('openDisplay starts the machine and returns a token', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			const display = await manager.openDisplay(WellKnownVirtualMachine.UbuntuSandbox);
			assert.strictEqual(display.vmId, WellKnownVirtualMachine.UbuntuSandbox);
			assert.ok(display.webSocketUrl.startsWith('ws://127.0.0.1:'));
			assert.ok(display.token.length > 10);
		} finally {
			manager.dispose();
		}
	});

	test('stop powers down through QMP and becomes stopped', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
			await manager.stop(WellKnownVirtualMachine.UbuntuDeveloper);
			const [vm] = (await manager.getVirtualMachines()).filter(v => v.id === WellKnownVirtualMachine.UbuntuDeveloper);
			assert.strictEqual(vm.state, VirtualMachineState.Stopped);
		} finally {
			manager.dispose();
		}
	});

	test('stop escalates to SIGTERM when QMP fails', async () => {
		const host = new FakeHost();
		host.powerDownResult = false;
		const manager = createManager(host);
		try {
			await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
			await manager.stop(WellKnownVirtualMachine.UbuntuDeveloper);
			assert.deepStrictEqual(host.spawned[0].handle.killedWith, ['SIGTERM']);
			const [vm] = (await manager.getVirtualMachines()).filter(v => v.id === WellKnownVirtualMachine.UbuntuDeveloper);
			assert.strictEqual(vm.state, VirtualMachineState.Stopped);
		} finally {
			manager.dispose();
		}
	});

	test('remove deletes the disk of a stopped machine', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
			await manager.stop(WellKnownVirtualMachine.UbuntuDeveloper);
			await manager.remove(WellKnownVirtualMachine.UbuntuDeveloper);
			assert.strictEqual(host.disks.size, 0);
		} finally {
			manager.dispose();
		}
	});

	test('remove refuses a running machine', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
			await assert.rejects(() => manager.remove(WellKnownVirtualMachine.UbuntuDeveloper), /Stop/);
		} finally {
			manager.dispose();
		}
	});

	test('two machines can start concurrently with distinct private endpoints', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			await Promise.all([
				manager.start(WellKnownVirtualMachine.UbuntuDeveloper),
				manager.start(WellKnownVirtualMachine.UbuntuSandbox),
			]);
			assert.strictEqual(host.spawned.length, 2);
			const endpoints = host.spawned.map(s => s.args[s.args.indexOf('-vnc') + 1]);
			assert.notStrictEqual(endpoints[0], endpoints[1]);
			assert.ok(endpoints.every(endpoint => endpoint.startsWith('unix:')));
			const vms = await manager.getVirtualMachines();
			assert.ok(vms.every(v => v.state === VirtualMachineState.Running));
		} finally {
			manager.dispose();
		}
	});

		test('updated dataRoot is used when a machine starts', async () => {
			const host = new FakeHost();
			const manager = createManager(host, { dataRoot: '/custom/gitcortex-vms' });
			try {
				await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
				const args = host.spawned[0].args;
				assert.strictEqual(args[args.indexOf('-drive') + 1], 'file=/custom/gitcortex-vms/ubuntu-developer.qcow2,format=qcow2,if=virtio,discard=unmap');
				assert.strictEqual(args[args.indexOf('-vnc') + 1], 'unix:/custom/gitcortex-vms/ubuntu-developer.vnc');
			} finally {
				manager.dispose();
			}
		});

		test('shutdown stops all running machines', async () => {
			const host = new FakeHost();
			const manager = createManager(host);
			try {
				await Promise.all([
					manager.start(WellKnownVirtualMachine.UbuntuDeveloper),
					manager.start(WellKnownVirtualMachine.UbuntuSandbox),
				]);
				await manager.shutdown();
				assert.ok((await manager.getVirtualMachines()).every(vm => vm.state === VirtualMachineState.Stopped));
			} finally {
				manager.dispose();
			}
		});

		test('unexpected qemu exit transitions to error', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			await manager.start(WellKnownVirtualMachine.UbuntuDeveloper);
			host.spawned[0].handle.kill('SIGKILL');
			await new Promise(resolve => setTimeout(resolve, 20));
			const [vm] = (await manager.getVirtualMachines()).filter(v => v.id === WellKnownVirtualMachine.UbuntuDeveloper);
			assert.strictEqual(vm.state, VirtualMachineState.Error);
		} finally {
			manager.dispose();
		}
	});

	test('updateSettings clamps applied resources', async () => {
		const host = new FakeHost();
		const manager = createManager(host);
		try {
			manager.updateSettings(defaultSettings({
				resources: {
					[WellKnownVirtualMachine.UbuntuDeveloper]: { cpus: 64, memoryMB: 1024, diskGB: 8 },
				}
			}));
			const [vm] = (await manager.getVirtualMachines()).filter(v => v.id === WellKnownVirtualMachine.UbuntuDeveloper);
			assert.deepStrictEqual(vm.resources, { cpus: 16, memoryMB: 1024, diskGB: 8 });
		} finally {
			manager.dispose();
		}
	});
});
