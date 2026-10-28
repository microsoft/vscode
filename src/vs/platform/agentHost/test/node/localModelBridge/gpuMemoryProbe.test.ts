/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adaptersFromDxgi, adaptersFromRegistry, computeLinuxGpuCapacity, computeMacGpuCapacity, GpuMemoryProbe, parseDxgiProbeOutput, parseMemInfoTotal, parseNvidiaSmiOutput, parseSysctlInteger } from '../../../node/copilot/localModelBridge/shim/gpuMemoryProbe.js';
import { parseRegQueryOutput, type IProcessRunner, type IProcessRunOptions, type IProcessRunResult } from '../../../node/copilot/localModelBridge/shim/processRunner.js';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/** DXGI helper output captured on the N1X device (NVIDIA RTX Spark N1X + the Basic Render Driver). */
const N1X_DXGI = [
	'DXGI-ADAPTER\t0\t68283\t4318\t11779\t347739234\t161\t8508145664\t0\t101788932505\t0\t32.0.16.1662\t1\tNVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)',
	'DXGI-ADAPTER\t0\t75718\t5140\t140\t0\t0\t0\t0\t101788932505\t2\t10.0.28000.3086\t\tMicrosoft Basic Render Driver',
	'DXGI-END',
	'',
].join('\r\n');

/** `reg query ... /s /v HardwareInformation.*` and `DriverDesc` on the N1X device. */
const N1X_REG_QUERY = [
	'',
	'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000',
	'    HardwareInformation.qwMemorySize    REG_QWORD    0x1fc000000',
	'    HardwareInformation.MemorySize    REG_DWORD    0xfff00000',
	'    DriverDesc    REG_SZ    NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)',
	'    MatchingDeviceId    REG_SZ    pci\\ven_10de&dev_2e03',
	'',
	'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0001',
	'    DriverDesc    REG_SZ    NVIDIA NPU',
	'',
	'End of search: 4 match(es) found.',
].join('\r\n');

function result(stdout: string, exitCode = 0): IProcessRunResult {
	return { exitCode, signal: undefined, stdout, stderr: '', timedOut: false, truncated: false, aborted: false };
}

class FakeRunner implements IProcessRunner {
	readonly calls: { file: string; args: readonly string[]; options: IProcessRunOptions }[] = [];
	constructor(private readonly _respond: (file: string, args: readonly string[]) => IProcessRunResult) { }
	async run(file: string, args: readonly string[], options: IProcessRunOptions): Promise<IProcessRunResult> {
		this.calls.push({ file, args, options });
		return this._respond(file, args);
	}
}

function createStorage() {
	const data = new Map<string, unknown>();
	return { data, get: <T>(key: string) => data.get(key) as T | undefined, set: <T>(key: string, value: T) => { data.set(key, value); } };
}

suite('localModel gpuMemoryProbe', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('DXGI: the N1X device is unified (Dedicated + Shared); software adapters are skipped', () => {
		const discrete = 'DXGI-ADAPTER\t0\t1\t4318\t9860\t0\t161\t25390809088\t0\t68621692928\t0\t32.0.15.6094\t0\tNVIDIA GeForce RTX 4090\nDXGI-END\n';
		const qualcommNoD3d12 = 'DXGI-ADAPTER\t0\t2\t20803\t1\t0\t0\t536870912\t0\t68719476736\t0\t31.0.1.0\t\tQualcomm(R) Adreno(TM) X1-85 GPU\nDXGI-END\n';
		assert.deepStrictEqual({
			n1x: adaptersFromDxgi(parseDxgiProbeOutput(N1X_DXGI)!),
			discrete: adaptersFromDxgi(parseDxgiProbeOutput(discrete)!).map(adapter => [adapter.id, adapter.capacityBytes, adapter.unifiedMemory]),
			qualcomm: adaptersFromDxgi(parseDxgiProbeOutput(qualcommNoD3d12)!).map(adapter => [adapter.id, adapter.capacityBytes / GiB, adapter.unifiedMemory]),
			truncated: parseDxgiProbeOutput(N1X_DXGI.replace('DXGI-END', '')),
			garbled: parseDxgiProbeOutput('DXGI-ADAPTER\tnot\tnumbers\nDXGI-END'),
		}, {
			n1x: [{ id: '10de:2e03', description: 'NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)', vendorId: 0x10DE, driverVersion: '32.0.16.1662', capacityBytes: 110_297_078_169, unifiedMemory: true }],
			discrete: [['10de:2684', 25390809088, false]],
			qualcomm: [['5143:0001', 64.5, true]],
			truncated: undefined,
			garbled: [],
		});
	});

	test('registry fallback (estimated, dedicated only; the 32-bit MemorySize cap is ignored)', () => {
		assert.deepStrictEqual({
			n1x: adaptersFromRegistry(parseRegQueryOutput(N1X_REG_QUERY)),
			onlyCappedDword: adaptersFromRegistry(parseRegQueryOutput(N1X_REG_QUERY.replace('    HardwareInformation.qwMemorySize    REG_QWORD    0x1fc000000\r\n', ''))),
		}, {
			n1x: [{ id: '10de:2e03', description: 'NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU)', vendorId: 0x10DE, capacityBytes: 0x1fc000000, unifiedMemory: false }],
			onlyCappedDword: [],
		});
	});

	test('macOS: iogpu.wired_limit_mb, its 0 default, and x64', () => {
		const summary = (r: ReturnType<typeof computeMacGpuCapacity>) => ({ confidence: r.confidence, capacityGiB: r.adapter ? r.adapter.capacityBytes / GiB : undefined, unified: r.adapter?.unifiedMemory });
		assert.deepStrictEqual({
			defaultLimit128: summary(computeMacGpuCapacity('arm64', parseSysctlInteger('0\n'), 128 * GiB)),
			explicitLimit: summary(computeMacGpuCapacity('arm64', parseSysctlInteger('110000\n'), 128 * GiB)),
			mac64: summary(computeMacGpuCapacity('arm64', 0, 64 * GiB)),
			intel: summary(computeMacGpuCapacity('x64', undefined, 64 * GiB)),
			garbled: parseSysctlInteger('sysctl: unknown oid'),
		}, {
			defaultLimit128: { confidence: 'estimated', capacityGiB: 96, unified: true },
			explicitLimit: { confidence: 'estimated', capacityGiB: 110000 / 1024, unified: true },
			mac64: { confidence: 'estimated', capacityGiB: 48, unified: true },
			intel: { confidence: 'unknown', capacityGiB: undefined, unified: undefined },
			garbled: undefined,
		});
	});

	test('Linux: AMD sysfs (APU and dGPU), nvidia-smi, unified arm64 MemTotal, unknown', () => {
		const summary = (r: ReturnType<typeof computeLinuxGpuCapacity>) => ({ confidence: r.confidence, source: r.source, capacityGiB: r.adapter ? Math.round(r.adapter.capacityBytes / GiB * 10) / 10 : undefined, unified: r.adapter?.unifiedMemory });
		const memInfo = parseMemInfoTotal('MemTotal:       127535160 kB\nMemFree: 1 kB\n');
		assert.deepStrictEqual({
			apu: summary(computeLinuxGpuCapacity({ arch: 'x64', amdCards: [{ card: 'card0', vramTotalBytes: 512 * MiB, gttTotalBytes: 64 * GiB }], nvidia: [], memTotalBytes: memInfo, systemMemoryBytes: 128 * GiB })),
			dgpu: summary(computeLinuxGpuCapacity({ arch: 'x64', amdCards: [{ card: 'card1', vramTotalBytes: 24 * GiB, gttTotalBytes: 64 * GiB, vendorId: 0x1002, deviceId: 0x744c }], nvidia: [], memTotalBytes: memInfo, systemMemoryBytes: 128 * GiB })),
			nvidia: summary(computeLinuxGpuCapacity({ arch: 'x64', amdCards: [], nvidia: parseNvidiaSmiOutput('NVIDIA GeForce RTX 4090, 24564, 560.35.03\n'), memTotalBytes: memInfo, systemMemoryBytes: 128 * GiB })),
			gb10: summary(computeLinuxGpuCapacity({ arch: 'arm64', amdCards: [], nvidia: parseNvidiaSmiOutput('NVIDIA GB10, [N/A], 580.95.05\n'), memTotalBytes: memInfo, systemMemoryBytes: 128 * GiB })),
			nothing: summary(computeLinuxGpuCapacity({ arch: 'x64', amdCards: [], nvidia: parseNvidiaSmiOutput('garbage'), memTotalBytes: memInfo, systemMemoryBytes: 128 * GiB })),
		}, {
			apu: { confidence: 'estimated', source: 'sysfs', capacityGiB: 64.5, unified: true },
			dgpu: { confidence: 'estimated', source: 'sysfs', capacityGiB: 24, unified: false },
			nvidia: { confidence: 'estimated', source: 'nvidia-smi', capacityGiB: 24, unified: false },
			gb10: { confidence: 'estimated', source: 'meminfo', capacityGiB: 121.6, unified: true },
			nothing: { confidence: 'unknown', source: 'none', capacityGiB: undefined, unified: undefined },
		});
	});

	test('the Stage A cache ignores a credential-bearing entry on read and never writes one', async () => {
		const storage = createStorage();
		const warnings: string[] = [];
		storage.set('localModel.gpuProbe', { probedAt: 1_000, result: { confidence: 'measured', source: 'dxgi', adapters: [{ description: 'GPU https://acct.blob.core.windows.net/c?sig=SECRET' }], systemMemoryBytes: 1, topologyKey: 'k' } });
		const signedDescription = 'DXGI-ADAPTER\t0\t1\t4318\t9860\t0\t161\t25390809088\t0\t68621692928\t0\t32.0.15.6094\t0\tGPU sv=2024&sig=SECRET2\nDXGI-END\n';
		const runner = new FakeRunner(file => file.endsWith('powershell.exe') ? result(signedDescription) : result('', 1));
		const probe = new GpuMemoryProbe(storage, runner, { platform: 'win32', arch: 'x64', totalMemoryBytes: 64 * GiB, env: { SystemRoot: 'C:\\Windows' } }, undefined, () => 2_000, { warn: message => warnings.push(message) });
		const outcome = await probe.probe();
		assert.deepStrictEqual({ fromCache: outcome.fromCache, confidence: outcome.result.confidence, written: JSON.stringify(storage.data.get('localModel.gpuProbe')).includes('SECRET2'), warnings }, {
			fromCache: false,
			confidence: 'measured',
			written: false,
			warnings: [
				'[LocalModel] Dropped 1 invalid or credential-bearing entry from localModel.gpuProbe',
				'[LocalModel] Dropped 1 invalid or credential-bearing entry from localModel.gpuProbe',
			],
		});
	});

	test('Windows probe: DXGI helper, cache by topology, driver change, registry fallback', async () => {
		const storage = createStorage();
		let dxgi = N1X_DXGI;
		let now = 1_000;
		const runner = new FakeRunner((file, args) => {
			if (file.endsWith('powershell.exe')) {
				return dxgi ? result(dxgi) : result('', 1);
			}
			if (file.endsWith('reg.exe')) {
				const value = args[args.indexOf('/v') + 1];
				return result(N1X_REG_QUERY.split('\r\n').filter(line => !line.startsWith('    ') || line.includes(value)).join('\r\n'));
			}
			return result('', 1);
		});
		const probe = new GpuMemoryProbe(storage, runner, { platform: 'win32', arch: 'arm64', totalMemoryBytes: Math.round(118.4979 * GiB), env: { SystemRoot: 'C:\\Windows' } }, undefined, () => now);
		const summary = (outcome: Awaited<ReturnType<GpuMemoryProbe['probe']>>) => ({ fromCache: outcome.fromCache, topologyChanged: outcome.topologyChanged, source: outcome.result.source, confidence: outcome.result.confidence, capacity: outcome.result.adapter?.capacityBytes, topologyKey: outcome.result.topologyKey });

		const first = summary(await probe.probe());
		now += 60_000;
		const cached = summary(await probe.probe());
		dxgi = N1X_DXGI.replace('32.0.16.1662', '32.0.16.1700');
		const driverUpdate = summary(await probe.probe({ force: true }));
		dxgi = '';
		const fallback = summary(await probe.probe({ force: true }));
		const powershell = runner.calls.find(call => call.file.endsWith('powershell.exe'))!;
		assert.deepStrictEqual({
			first, cached, driverUpdate, fallback,
			powershellArgs: powershell.args.slice(0, 5),
			powershellPath: powershell.file,
			timeoutMs: powershell.options.timeoutMs,
		}, {
			first: { fromCache: false, topologyChanged: false, source: 'dxgi', confidence: 'measured', capacity: 110_297_078_169, topologyKey: '10de:2e03@32.0.16.1662' },
			cached: { fromCache: true, topologyChanged: false, source: 'dxgi', confidence: 'measured', capacity: 110_297_078_169, topologyKey: '10de:2e03@32.0.16.1662' },
			driverUpdate: { fromCache: false, topologyChanged: true, source: 'dxgi', confidence: 'measured', capacity: 110_297_078_169, topologyKey: '10de:2e03@32.0.16.1700' },
			fallback: { fromCache: false, topologyChanged: true, source: 'registry', confidence: 'estimated', capacity: 0x1fc000000, topologyKey: '10de:2e03@?' },
			powershellArgs: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'],
			powershellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
			timeoutMs: 15_000,
		});
	});
});
