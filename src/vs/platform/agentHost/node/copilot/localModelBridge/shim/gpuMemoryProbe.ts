/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import type { LocalModelDeviceConfidence, LocalModelDeviceVendor } from '../../../../common/localModel.js';
import { containsCredential, reportDroppedStorageEntries } from '../../../../common/logRedaction.js';
import type { IAgentHostStorageService } from '../../../agentHostStorageService.js';
import { CATALOG_REFRESH_INTERVAL_MS } from './constants.js';
import { NodeProcessRunner, parseRegistryInteger, queryRegistry, type IProcessRunner, type IRegistryValue } from './processRunner.js';

/* Stage A of the visibility check: a native GPU memory probe that runs only OS tools, each with a timeout. Stage B (`--list-devices`) is authoritative whenever it can run. */

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_OUTPUT_CAP_BYTES = 64 * 1024;

/** Qualcomm PCI vendor ids (DXGI reports either form). */
const QUALCOMM_VENDOR_IDS = new Set([0x5143, 0x4D4F4351]);
/** NVIDIA's PCI vendor id. */
export const NVIDIA_VENDOR_ID = 0x10DE;
const DXGI_ADAPTER_FLAG_SOFTWARE = 2;

/** The {@link LocalModelDeviceVendor} of a PCI vendor id. Pure. */
export function toLocalModelDeviceVendor(vendorId: number): LocalModelDeviceVendor {
	if (QUALCOMM_VENDOR_IDS.has(vendorId)) {
		return 'qualcomm';
	}
	switch (vendorId) {
		case NVIDIA_VENDOR_ID: return 'nvidia';
		case 0x1002:
		case 0x1022: return 'amd';
		case 0x8086: return 'intel';
		case 0x106B: return 'apple';
		default: return 'other';
	}
}

/** One hardware adapter found by Stage A. */
export interface IGpuAdapter {
	/** Stable id `<vendor>:<device>` in lowercase hex; never per-boot values such as a LUID. */
	readonly id: string;
	readonly description: string;
	readonly vendorId: number;
	readonly driverVersion?: string;
	/** `gpuCapacityBytes` for this adapter. */
	readonly capacityBytes: number;
	/** The adapter's memory comes out of system RAM (UMA/integrated, Apple silicon, APU). */
	readonly unifiedMemory: boolean;
}

/** Stage A result (static capability). */
export interface IGpuMemoryProbeResult {
	readonly confidence: LocalModelDeviceConfidence;
	readonly source: 'dxgi' | 'registry' | 'sysctl' | 'sysfs' | 'nvidia-smi' | 'meminfo' | 'none';
	/** Largest single adapter; absent when `confidence` is `unknown`. */
	readonly adapter?: IGpuAdapter;
	/** Every hardware adapter, largest first. */
	readonly adapters: readonly IGpuAdapter[];
	readonly systemMemoryBytes: number;
	/** Device ids plus driver versions; a change clears cached Stage B capability and the selected device. */
	readonly topologyKey: string;
}

/** Topology key from adapters (ids and driver versions, order-independent). Pure. */
export function computeTopologyKey(adapters: readonly IGpuAdapter[]): string {
	return adapters.map(adapter => `${adapter.id}@${adapter.driverVersion ?? '?'}`).sort().join('|');
}

function toHex4(value: number): string {
	return value.toString(16).padStart(4, '0');
}

function unknownResult(systemMemoryBytes: number): IGpuMemoryProbeResult {
	return { confidence: 'unknown', source: 'none', adapters: [], systemMemoryBytes, topologyKey: '' };
}

function resultFromAdapters(adapters: IGpuAdapter[], confidence: LocalModelDeviceConfidence, source: IGpuMemoryProbeResult['source'], systemMemoryBytes: number): IGpuMemoryProbeResult {
	const sorted = adapters.filter(adapter => adapter.capacityBytes > 0).sort((a, b) => b.capacityBytes - a.capacityBytes);
	if (sorted.length === 0) {
		return unknownResult(systemMemoryBytes);
	}
	return { confidence, source, adapter: sorted[0], adapters: sorted, systemMemoryBytes, topologyKey: computeTopologyKey(sorted) };
}

// #region Windows: DXGI (measured) and registry (estimated)

/**
 * One-shot PowerShell helper: enumerates adapters with
 * `IDXGIFactory1::EnumAdapters1`, reads `DXGI_ADAPTER_DESC1`, the user-mode
 * driver version (`CheckInterfaceSupport(IDXGIDevice)`) and D3D12
 * `FEATURE_ARCHITECTURE.UMA`, and prints one tab-separated line per adapter:
 * `DXGI-ADAPTER, luidHigh, luidLow, vendor, device, subsys, revision,
 * dedicatedVideo, dedicatedSystem, sharedSystem, flags, driver, uma, name`.
 */
export const DXGI_PROBE_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class VscDxgiProbe {
	[StructLayout(LayoutKind.Sequential)]
	public struct LUID { public uint LowPart; public int HighPart; }
	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	public struct DXGI_ADAPTER_DESC1 {
		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
		public uint VendorId; public uint DeviceId; public uint SubSysId; public uint Revision;
		public UIntPtr DedicatedVideoMemory; public UIntPtr DedicatedSystemMemory; public UIntPtr SharedSystemMemory;
		public LUID AdapterLuid; public uint Flags;
	}
	[StructLayout(LayoutKind.Sequential)]
	public struct D3D12_FEATURE_DATA_ARCHITECTURE { public uint NodeIndex; public int TileBasedRenderer; public int UMA; public int CacheCoherentUMA; }
	[ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	interface IDXGIFactory1 {
		void SetPrivateData(); void SetPrivateDataInterface(); void GetPrivateData(); void GetParent();
		void EnumAdapters(); void MakeWindowAssociation(); void GetWindowAssociation(); void CreateSwapChain(); void CreateSoftwareAdapter();
		[PreserveSig] int EnumAdapters1(uint index, out IDXGIAdapter1 adapter);
		[PreserveSig] int IsCurrent();
	}
	[ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	interface IDXGIAdapter1 {
		void SetPrivateData(); void SetPrivateDataInterface(); void GetPrivateData(); void GetParent();
		void EnumOutputs(); void GetDesc();
		[PreserveSig] int CheckInterfaceSupport(ref Guid iid, out long umdVersion);
		[PreserveSig] int GetDesc1(out DXGI_ADAPTER_DESC1 desc);
	}
	[ComImport, Guid("189819f1-1db6-4b57-be54-1821339b85f7"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	interface ID3D12Device {
		void GetPrivateData(); void SetPrivateData(); void SetPrivateDataInterface(); void SetName();
		void GetNodeCount(); void CreateCommandQueue(); void CreateCommandAllocator(); void CreateGraphicsPipelineState(); void CreateComputePipelineState(); void CreateCommandList();
		[PreserveSig] int CheckFeatureSupport(int feature, ref D3D12_FEATURE_DATA_ARCHITECTURE data, int size);
	}
	[DllImport("dxgi.dll")]
	static extern int CreateDXGIFactory1(ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IDXGIFactory1 factory);
	[DllImport("d3d12.dll")]
	static extern int D3D12CreateDevice([MarshalAs(UnmanagedType.IUnknown)] object adapter, int minimumFeatureLevel, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object device);
	static string Uma(IDXGIAdapter1 adapter) {
		try {
			Guid deviceIid = new Guid("189819f1-1db6-4b57-be54-1821339b85f7");
			object raw;
			if (D3D12CreateDevice(adapter, 0xb000, ref deviceIid, out raw) != 0 || raw == null) { return ""; }
			try {
				var device = (ID3D12Device)raw;
				var data = new D3D12_FEATURE_DATA_ARCHITECTURE();
				if (device.CheckFeatureSupport(1, ref data, Marshal.SizeOf(typeof(D3D12_FEATURE_DATA_ARCHITECTURE))) != 0) { return ""; }
				return data.UMA != 0 ? "1" : "0";
			} finally { Marshal.ReleaseComObject(raw); }
		} catch { return ""; }
	}
	public static string Run() {
		var sb = new System.Text.StringBuilder();
		Guid factoryId = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
		IDXGIFactory1 factory;
		int hr = CreateDXGIFactory1(ref factoryId, out factory);
		if (hr != 0) { return "DXGI-ERROR\t" + hr.ToString("X8") + "\n"; }
		Guid dxgiDevice = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
		for (uint i = 0; i < 64; i++) {
			IDXGIAdapter1 adapter;
			if (factory.EnumAdapters1(i, out adapter) != 0) { break; }
			DXGI_ADAPTER_DESC1 d;
			if (adapter.GetDesc1(out d) != 0) { continue; }
			long umd;
			string driver = "";
			if (adapter.CheckInterfaceSupport(ref dxgiDevice, out umd) == 0) {
				driver = ((umd >> 48) & 0xFFFF) + "." + ((umd >> 32) & 0xFFFF) + "." + ((umd >> 16) & 0xFFFF) + "." + (umd & 0xFFFF);
			}
			string uma = (d.Flags & 2) != 0 ? "" : Uma(adapter);
			string name = (d.Description ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
			sb.Append("DXGI-ADAPTER\t").Append(d.AdapterLuid.HighPart).Append('\t').Append(d.AdapterLuid.LowPart)
				.Append('\t').Append(d.VendorId).Append('\t').Append(d.DeviceId).Append('\t').Append(d.SubSysId).Append('\t').Append(d.Revision)
				.Append('\t').Append(d.DedicatedVideoMemory.ToUInt64()).Append('\t').Append(d.DedicatedSystemMemory.ToUInt64()).Append('\t').Append(d.SharedSystemMemory.ToUInt64())
				.Append('\t').Append(d.Flags).Append('\t').Append(driver).Append('\t').Append(uma).Append('\t').Append(name).Append('\n');
			Marshal.ReleaseComObject(adapter);
		}
		Marshal.ReleaseComObject(factory);
		sb.Append("DXGI-END\n");
		return sb.ToString();
	}
}
"@
[Console]::Out.Write([VscDxgiProbe]::Run())
`;

/** One raw DXGI adapter line. */
export interface IDxgiAdapterRecord {
	readonly vendorId: number;
	readonly deviceId: number;
	readonly dedicatedVideoMemory: number;
	readonly dedicatedSystemMemory: number;
	readonly sharedSystemMemory: number;
	readonly flags: number;
	readonly driverVersion: string | undefined;
	/** D3D12 `FEATURE_ARCHITECTURE.UMA`; `undefined` when D3D12 was unavailable. */
	readonly uma: boolean | undefined;
	readonly description: string;
}

/** Parses the helper's output; `undefined` unless the terminating `DXGI-END` line is present (truncated or failed runs aren't trusted). Pure. */
export function parseDxgiProbeOutput(output: string): IDxgiAdapterRecord[] | undefined {
	const lines = output.split(/\r?\n/);
	if (!lines.some(line => line.trim() === 'DXGI-END')) {
		return undefined;
	}
	const records: IDxgiAdapterRecord[] = [];
	for (const line of lines) {
		if (!line.startsWith('DXGI-ADAPTER\t')) {
			continue;
		}
		const fields = line.split('\t');
		if (fields.length < 14) {
			continue;
		}
		const numbers = fields.slice(3, 11).map(field => Number(field));
		if (numbers.some(value => !Number.isSafeInteger(value) || value < 0)) {
			continue;
		}
		const [vendorId, deviceId, , , dedicatedVideoMemory, dedicatedSystemMemory, sharedSystemMemory, flags] = numbers;
		records.push({
			vendorId,
			deviceId,
			dedicatedVideoMemory,
			dedicatedSystemMemory,
			sharedSystemMemory,
			flags,
			driverVersion: /^\d+(\.\d+){3}$/.test(fields[11]) ? fields[11] : undefined,
			uma: fields[12] === '1' ? true : fields[12] === '0' ? false : undefined,
			description: fields.slice(13).join(' ').trim(),
		});
	}
	return records;
}

/**
 * Turns DXGI records into adapters, skipping software ones: discrete capacity is `DedicatedVideoMemory`, integrated adds
 * `SharedSystemMemory`. UMA comes from D3D12, else Qualcomm or under 512 MiB dedicated counts as integrated. Pure.
 */
export function adaptersFromDxgi(records: readonly IDxgiAdapterRecord[]): IGpuAdapter[] {
	return records
		.filter(record => (record.flags & DXGI_ADAPTER_FLAG_SOFTWARE) === 0)
		.map(record => {
			const unifiedMemory = record.uma ?? (QUALCOMM_VENDOR_IDS.has(record.vendorId) || record.dedicatedVideoMemory < 512 * MIB);
			return {
				id: `${toHex4(record.vendorId)}:${toHex4(record.deviceId)}`,
				description: record.description,
				vendorId: record.vendorId,
				...(record.driverVersion ? { driverVersion: record.driverVersion } : {}),
				capacityBytes: unifiedMemory ? record.dedicatedVideoMemory + record.sharedSystemMemory : record.dedicatedVideoMemory,
				unifiedMemory,
			};
		});
}

const DISPLAY_CLASS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';
/** `HardwareInformation.MemorySize` is a 32-bit value; at or above this it is capped and meaningless. */
const REGISTRY_MEMORY_SIZE_CAP = 0xFFF00000;

/** Registry fallback (`estimated`): dedicated memory per display adapter from `qwMemorySize` (or the 32-bit `MemorySize` below its cap); integrated GPUs end up `unknown`. Pure. */
export function adaptersFromRegistry(values: readonly IRegistryValue[]): IGpuAdapter[] {
	const byKey = new Map<string, Map<string, IRegistryValue>>();
	for (const value of values) {
		let entry = byKey.get(value.key);
		if (!entry) {
			entry = new Map();
			byKey.set(value.key, entry);
		}
		entry.set(value.name, value);
	}
	const adapters: IGpuAdapter[] = [];
	for (const [key, entry] of byKey) {
		const qw = entry.get('HardwareInformation.qwMemorySize');
		const dw = entry.get('HardwareInformation.MemorySize');
		let bytes = qw ? parseRegistryInteger(qw) : undefined;
		if (bytes === undefined && dw) {
			const value = parseRegistryInteger(dw);
			bytes = value !== undefined && value < REGISTRY_MEMORY_SIZE_CAP ? value : undefined;
		}
		if (bytes === undefined || bytes < GIB) {
			continue;
		}
		const description = entry.get('DriverDesc')?.data ?? '';
		const driverVersion = entry.get('DriverVersion')?.data;
		const match = /VEN_(?<vendor>[0-9A-F]{4})&DEV_(?<device>[0-9A-F]{4})/i.exec(entry.get('MatchingDeviceId')?.data ?? '');
		adapters.push({
			id: match?.groups ? `${match.groups.vendor.toLowerCase()}:${match.groups.device.toLowerCase()}` : `reg:${key.slice(key.lastIndexOf('\\') + 1)}`,
			description,
			vendorId: match?.groups ? Number.parseInt(match.groups.vendor, 16) : 0,
			...(driverVersion ? { driverVersion } : {}),
			capacityBytes: bytes,
			unifiedMemory: false,
		});
	}
	return adapters;
}

// #endregion

// #region macOS

/** macOS (`estimated`): arm64 uses `iogpu.wired_limit_mb` when > 0, else about 0.75 x RAM (Metal's default working set); x64 has no GPU path. Pure. */
export function computeMacGpuCapacity(arch: string, wiredLimitMb: number | undefined, totalMemoryBytes: number): IGpuMemoryProbeResult {
	if (arch !== 'arm64') {
		return unknownResult(totalMemoryBytes);
	}
	const capacityBytes = wiredLimitMb && wiredLimitMb > 0 ? Math.min(wiredLimitMb * MIB, totalMemoryBytes) : Math.round(totalMemoryBytes * 0.75);
	return resultFromAdapters([{ id: 'apple:gpu', description: 'Apple GPU', vendorId: 0x106B, capacityBytes, unifiedMemory: true }], 'estimated', 'sysctl', totalMemoryBytes);
}

/** Parses `sysctl -n iogpu.wired_limit_mb`. Pure. */
export function parseSysctlInteger(output: string): number | undefined {
	const trimmed = output.trim();
	return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

// #endregion

// #region Linux

/** One `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits` row. */
export interface INvidiaSmiRow {
	readonly name: string;
	/** `undefined` for `[N/A]` (unified-memory parts). */
	readonly memoryTotalBytes: number | undefined;
	readonly driverVersion: string | undefined;
}

/** Parses `nvidia-smi` CSV output. Pure. */
export function parseNvidiaSmiOutput(output: string): INvidiaSmiRow[] {
	const rows: INvidiaSmiRow[] = [];
	for (const line of output.split(/\r?\n/)) {
		const fields = line.split(',').map(field => field.trim());
		if (fields.length < 3 || !fields[0]) {
			continue;
		}
		const memory = /^\d+$/.test(fields[1]) ? Number(fields[1]) * MIB : undefined;
		rows.push({ name: fields[0], memoryTotalBytes: memory, driverVersion: /^[\d.]+$/.test(fields[2]) ? fields[2] : undefined });
	}
	return rows;
}

/** Parses `MemTotal` from `/proc/meminfo`. Pure. */
export function parseMemInfoTotal(meminfo: string): number | undefined {
	const match = /^MemTotal:\s+(?<kb>\d+)\s+kB/m.exec(meminfo);
	return match?.groups ? Number(match.groups.kb) * 1024 : undefined;
}

/** AMD sysfs memory of one DRM card. */
export interface IAmdSysfsCard {
	readonly card: string;
	readonly vramTotalBytes: number;
	readonly gttTotalBytes: number | undefined;
	readonly vendorId?: number;
	readonly deviceId?: number;
}

/** VRAM at or below this marks an APU whose GTT (system memory) is GPU-addressable. */
const APU_MAX_CARVEOUT_BYTES = 2 * GIB;

/** Linux (`estimated`): AMD sysfs VRAM (+ GTT for APUs), `nvidia-smi` totals, or `MemTotal` for unified-memory arm64; the largest device wins. Pure. */
export function computeLinuxGpuCapacity(input: { readonly arch: string; readonly amdCards: readonly IAmdSysfsCard[]; readonly nvidia: readonly INvidiaSmiRow[]; readonly memTotalBytes: number | undefined; readonly systemMemoryBytes: number }): IGpuMemoryProbeResult {
	const adapters: IGpuAdapter[] = [];
	for (const card of input.amdCards) {
		const apu = card.vramTotalBytes <= APU_MAX_CARVEOUT_BYTES && card.gttTotalBytes !== undefined;
		adapters.push({
			id: card.vendorId !== undefined && card.deviceId !== undefined ? `${toHex4(card.vendorId)}:${toHex4(card.deviceId)}` : `drm:${card.card}`,
			description: card.card,
			vendorId: card.vendorId ?? 0x1002,
			capacityBytes: apu ? card.vramTotalBytes + (card.gttTotalBytes ?? 0) : card.vramTotalBytes,
			unifiedMemory: apu,
		});
	}
	let unifiedNvidia = false;
	for (const [index, row] of input.nvidia.entries()) {
		if (row.memoryTotalBytes !== undefined) {
			adapters.push({ id: `10de:nvsmi${index}`, description: row.name, vendorId: 0x10DE, ...(row.driverVersion ? { driverVersion: row.driverVersion } : {}), capacityBytes: row.memoryTotalBytes, unifiedMemory: false });
		} else {
			unifiedNvidia = true;
		}
	}
	if (input.arch === 'arm64' && input.memTotalBytes !== undefined && (unifiedNvidia || adapters.length === 0)) {
		adapters.push({ id: 'unified:gpu', description: 'Unified memory GPU', vendorId: 0, capacityBytes: input.memTotalBytes, unifiedMemory: true });
	}
	const source: IGpuMemoryProbeResult['source'] = input.amdCards.length ? 'sysfs' : input.nvidia.some(row => row.memoryTotalBytes !== undefined) ? 'nvidia-smi' : 'meminfo';
	return resultFromAdapters(adapters, 'estimated', source, input.systemMemoryBytes);
}

// #endregion

// #region Probe service

/** File-system reads the Linux probe needs; injectable for tests. */
export interface IGpuProbeFileSystem {
	readdir(path: string): Promise<string[]>;
	readFile(path: string): Promise<string>;
}

const nodeProbeFileSystem: IGpuProbeFileSystem = {
	readdir: path => fs.promises.readdir(path),
	readFile: path => fs.promises.readFile(path, 'utf8'),
};

export interface IGpuMemoryProbeHost {
	readonly platform: NodeJS.Platform;
	readonly arch: string;
	readonly totalMemoryBytes: number;
	readonly env: Readonly<Record<string, string | undefined>>;
}

const STAGE_A_CACHE_KEY = 'localModel.gpuProbe';

interface ICachedStageA {
	readonly probedAt: number;
	readonly result: IGpuMemoryProbeResult;
}

export interface IGpuMemoryProbeOutcome {
	readonly result: IGpuMemoryProbeResult;
	/** The device ids or driver versions differ from the previous probe (a topology change). */
	readonly topologyChanged: boolean;
	readonly fromCache: boolean;
}

/**
 * Runs Stage A per OS and caches the static capability by topology key, reused for {@link CATALOG_REFRESH_INTERVAL_MS}
 * unless `force`. A re-probe that sees a new topology reports `topologyChanged`.
 */
export class GpuMemoryProbe {

	constructor(
		private readonly _storage: Pick<IAgentHostStorageService, 'get' | 'set'> | undefined,
		private readonly _runner: IProcessRunner = new NodeProcessRunner(),
		private readonly _host: IGpuMemoryProbeHost = { platform: process.platform, arch: process.arch, totalMemoryBytes: os.totalmem(), env: process.env },
		private readonly _fs: IGpuProbeFileSystem = nodeProbeFileSystem,
		private readonly _now: () => number = Date.now,
		private readonly _log?: { warn(message: string): void },
	) { }

	async probe(options: { readonly force?: boolean; readonly signal?: AbortSignal } = {}): Promise<IGpuMemoryProbeOutcome> {
		const cached = this._readCache();
		if (cached && !options.force && this._now() - cached.probedAt < CATALOG_REFRESH_INTERVAL_MS) {
			return { result: cached.result, topologyChanged: false, fromCache: true };
		}
		const result = await this._probeNow(options.signal);
		const topologyChanged = !!cached && cached.result.topologyKey !== result.topologyKey;
		if (result.confidence !== 'unknown') {
			const entry: ICachedStageA = { probedAt: this._now(), result };
			// Belt and braces: adapter text that holds anything credential-like is never written.
			if (containsCredential(entry)) {
				reportDroppedStorageEntries(this._log, STAGE_A_CACHE_KEY, 1);
			} else {
				this._storage?.set<ICachedStageA>(STAGE_A_CACHE_KEY, entry);
			}
		}
		return { result, topologyChanged, fromCache: false };
	}

	private _readCache(): ICachedStageA | undefined {
		const value = this._storage?.get<ICachedStageA>(STAGE_A_CACHE_KEY);
		if (!value || typeof value.probedAt !== 'number' || !value.result || typeof value.result.topologyKey !== 'string') {
			return undefined;
		}
		if (containsCredential(value)) {
			reportDroppedStorageEntries(this._log, STAGE_A_CACHE_KEY, 1);
			return undefined;
		}
		return value;
	}

	private async _probeNow(signal: AbortSignal | undefined): Promise<IGpuMemoryProbeResult> {
		const { platform, arch, totalMemoryBytes } = this._host;
		switch (platform) {
			case 'win32': return this._probeWindows(signal);
			case 'darwin': {
				const result = arch === 'arm64'
					? await this._runner.run('/usr/sbin/sysctl', ['-n', 'iogpu.wired_limit_mb'], { timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: PROBE_OUTPUT_CAP_BYTES, signal })
					: undefined;
				return computeMacGpuCapacity(arch, result?.exitCode === 0 ? parseSysctlInteger(result.stdout) : undefined, totalMemoryBytes);
			}
			case 'linux': return this._probeLinux(signal);
			default: return unknownResult(totalMemoryBytes);
		}
	}

	private async _probeWindows(signal: AbortSignal | undefined): Promise<IGpuMemoryProbeResult> {
		const { env, totalMemoryBytes } = this._host;
		const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows';
		const result = await this._runner.run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, [
			'-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(DXGI_PROBE_SCRIPT, 'utf16le').toString('base64'),
		], { timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: PROBE_OUTPUT_CAP_BYTES, signal });
		const records = result.exitCode === 0 ? parseDxgiProbeOutput(result.stdout) : undefined;
		if (records) {
			const measured = resultFromAdapters(adaptersFromDxgi(records), 'measured', 'dxgi', totalMemoryBytes);
			if (measured.confidence !== 'unknown') {
				return measured;
			}
		}
		const values: IRegistryValue[] = [];
		for (const value of ['HardwareInformation.qwMemorySize', 'HardwareInformation.MemorySize', 'DriverDesc', 'DriverVersion', 'MatchingDeviceId']) {
			values.push(...await queryRegistry(this._runner, env, DISPLAY_CLASS_KEY, { value, recursive: true, signal }));
		}
		return resultFromAdapters(adaptersFromRegistry(values), 'estimated', 'registry', totalMemoryBytes);
	}

	private async _probeLinux(signal: AbortSignal | undefined): Promise<IGpuMemoryProbeResult> {
		const { arch, totalMemoryBytes } = this._host;
		const amdCards: IAmdSysfsCard[] = [];
		let cards: string[] = [];
		try {
			cards = (await this._fs.readdir('/sys/class/drm')).filter(name => /^card\d+$/.test(name));
		} catch {
			// No DRM.
		}
		for (const card of cards) {
			const base = `/sys/class/drm/${card}/device`;
			const vram = await this._readNumber(`${base}/mem_info_vram_total`);
			if (vram === undefined) {
				continue;
			}
			const gtt = await this._readNumber(`${base}/mem_info_gtt_total`);
			const vendor = await this._readHex(`${base}/vendor`);
			const device = await this._readHex(`${base}/device`);
			amdCards.push({ card, vramTotalBytes: vram, gttTotalBytes: gtt, ...(vendor !== undefined ? { vendorId: vendor } : {}), ...(device !== undefined ? { deviceId: device } : {}) });
		}
		const smi = await this._runner.run('/usr/bin/nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { timeoutMs: PROBE_TIMEOUT_MS, maxOutputBytes: PROBE_OUTPUT_CAP_BYTES, signal });
		let memTotal: number | undefined;
		try {
			memTotal = parseMemInfoTotal(await this._fs.readFile('/proc/meminfo'));
		} catch {
			// Not Linux /proc.
		}
		return computeLinuxGpuCapacity({ arch, amdCards, nvidia: smi.exitCode === 0 ? parseNvidiaSmiOutput(smi.stdout) : [], memTotalBytes: memTotal, systemMemoryBytes: totalMemoryBytes });
	}

	private async _readNumber(path: string): Promise<number | undefined> {
		try {
			const text = (await this._fs.readFile(path)).trim();
			return /^\d+$/.test(text) ? Number(text) : undefined;
		} catch {
			return undefined;
		}
	}

	private async _readHex(path: string): Promise<number | undefined> {
		try {
			const text = (await this._fs.readFile(path)).trim();
			return /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text.slice(2), 16) : undefined;
		} catch {
			return undefined;
		}
	}
}

// #endregion
