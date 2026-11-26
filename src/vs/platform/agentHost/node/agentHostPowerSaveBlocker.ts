/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile, spawn, type ChildProcess } from 'child_process';
import { readFile, readdir } from 'fs/promises';
import { promisify } from 'util';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { join } from '../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { ILogService } from '../../log/common/log.js';

const execFileAsync = promisify(execFile);

interface IAgentHostPowerBackend {
	start(allowOnBattery: boolean): ChildProcess;
	isOnBatteryPower(): Promise<boolean>;
	readonly killOnDispose: boolean;
}

interface ILinuxPowerSupply {
	readonly type: string;
	readonly scope?: string;
	readonly online?: string;
	readonly status?: string;
}

const linePowerSupplyTypes = new Set(['Mains', 'USB', 'USB_C', 'USB_PD', 'USB_PD_DRP', 'Wireless', 'UPS']);

const nativePowerBackend: IAgentHostPowerBackend = {
	start: startNativePowerSaveBlocker,
	isOnBatteryPower: async () => !isWindows && isOnBatteryPower(),
	killOnDispose: isMacintosh,
};

/**
 * A process-lifetime power request. Helpers also release on parent death:
 * caffeinate watches our PID; the Linux and Windows helpers watch stdin EOF.
 */
export class AgentHostPowerSaveBlocker extends Disposable {
	private readonly _process = this._register(new MutableDisposable<IDisposable>());
	private readonly _poll = this._register(new RunOnceScheduler(() => void this._update(), 30_000));

	constructor(
		private readonly _allowOnBattery: boolean,
		private readonly _logService: ILogService,
		private readonly _backend: IAgentHostPowerBackend = nativePowerBackend,
	) {
		super();
		void this._update();
	}

	private async _update(): Promise<void> {
		try {
			// The Windows helper monitors its own power source, avoiding repeated PowerShell startups.
			const allowed = this._allowOnBattery || !await this._backend.isOnBatteryPower();
			if (this._store.isDisposed) {
				return;
			}
			if (!allowed) {
				this._process.clear();
			} else if (!this._process.value) {
				this._process.value = this._start();
			}
		} catch (error) {
			if (!this._store.isDisposed) {
				this._process.clear();
				this._logService.warn('[AgentHostKeepAwake] Cannot inhibit idle sleep on this host', error);
			}
		}
		if (!this._store.isDisposed) {
			this._poll.schedule();
		}
	}

	private _start(): IDisposable {
		const child = this._backend.start(this._allowOnBattery);
		let disposed = false;
		let stderr = '';
		child.stdout?.once('data', () => this._logService.trace('[AgentHostKeepAwake] Idle sleep inhibitor helper is ready'));
		child.stderr?.on('data', (data: Buffer) => stderr = (stderr + data.toString()).slice(-4096));
		child.on('error', error => {
			if (!disposed) {
				this._logService.warn('[AgentHostKeepAwake] Failed to start idle sleep inhibitor', error);
			}
		});
		child.on('close', (code, signal) => {
			if (!disposed) {
				this._logService.warn(`[AgentHostKeepAwake] Idle sleep inhibitor exited (${code ?? signal}): ${stderr}`);
				this._process.clear();
			}
		});
		child.stdin?.on('error', error => {
			if (!disposed) {
				this._logService.warn('[AgentHostKeepAwake] Idle sleep inhibitor input failed', error);
				this._process.clear();
			}
		});
		return toDisposable(() => {
			disposed = true;
			child.stdin?.end();
			// caffeinate ignores stdin. For the other helpers EOF releases native
			// resources and exits, including when this process is killed abruptly.
			if (this._backend.killOnDispose) {
				child.kill();
			}
		});
	}
}

export function startNativePowerSaveBlocker(allowOnBattery: boolean): ChildProcess {
	if (isMacintosh) {
		return spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: ['pipe', 'ignore', 'pipe'] });
	}
	if (isLinux) {
		// Piped stdin prevents polkit prompts; EOF releases the inhibitor.
		return spawn('systemd-inhibit', ['--what=idle', '--mode=block', '--who=VS Code Agent Host', '--why=An agent is working', 'cat'], { stdio: ['pipe', 'ignore', 'pipe'] });
	}
	if (isWindows) {
		const systemRoot = process.env['SystemRoot'];
		if (!systemRoot) {
			throw new Error('SystemRoot is not set');
		}
		return spawn(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
			'-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
			`${windowsPowerSaveBlockerScript}\n[AgentHostPowerSaveBlocker]::Run($${allowOnBattery})`,
		], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
	}
	throw new Error('Idle sleep inhibition is not supported on this platform');
}

async function isOnBatteryPower(): Promise<boolean> {
	if (isMacintosh) {
		const { stdout } = await execFileAsync('/usr/bin/pmset', ['-g', 'batt'], { timeout: 5000 });
		if (stdout.includes('\'Battery Power\'')) {
			return true;
		}
		if (stdout.includes('\'AC Power\'')) {
			return false;
		}
		throw new Error('pmset did not report a power source');
	}
	if (isLinux) {
		const supplies = '/sys/class/power_supply';
		const powerSupplies: ILinuxPowerSupply[] = [];
		for (const entry of await readdir(supplies)) {
			const path = join(supplies, entry);
			const type = await readOptionalFile(join(path, 'type'));
			if (!type) {
				continue;
			}
			const scope = await readOptionalFile(join(path, 'scope'));
			if (scope === 'Device') {
				continue;
			}
			if (linePowerSupplyTypes.has(type)) {
				powerSupplies.push({ type, scope, online: await readOptionalFile(join(path, 'online')) });
			} else if (type === 'Battery') {
				powerSupplies.push({ type, scope, status: await readOptionalFile(join(path, 'status')) });
			}
		}
		return isOnBatteryPowerFromLinuxSupplies(powerSupplies);
	}
	throw new Error('Power source detection is not supported on this platform');
}

async function readOptionalFile(path: string): Promise<string | undefined> {
	try {
		return (await readFile(path, 'utf8')).trim();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
}

/**
 * Determines whether the host is on battery using Linux power-supply readings.
 */
export function isOnBatteryPowerFromLinuxSupplies(supplies: readonly ILinuxPowerSupply[]): boolean {
	let hasOfflineLinePower = false;
	let hasDischargingBattery = false;
	for (const supply of supplies) {
		if (supply.scope === 'Device') {
			continue;
		}
		if (linePowerSupplyTypes.has(supply.type)) {
			if (supply.online === '1') {
				return false;
			}
			if (supply.online === '0') {
				hasOfflineLinePower = true;
			}
		} else if (supply.type === 'Battery' && supply.status === 'Discharging') {
			hasDischargingBattery = true;
		}
	}
	if (hasOfflineLinePower || hasDischargingBattery) {
		return true;
	}
	throw new Error('Power source is unknown');
}

// Keep the native call on one thread. ES_SYSTEM_REQUIRED inhibits idle system
// sleep without keeping the display on or overriding an explicit sleep request.
const windowsPowerSaveBlockerScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AgentHostPowerSaveBlocker {
	[DllImport("kernel32.dll", SetLastError = true)]
	static extern uint SetThreadExecutionState(uint flags);
	[DllImport("kernel32.dll", SetLastError = true)]
	static extern bool GetSystemPowerStatus(out PowerStatus status);
	[StructLayout(LayoutKind.Sequential)]
	struct PowerStatus {
		public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;
		public uint BatteryLifeTime, BatteryFullLifeTime;
	}
	public static void Run(bool allowOnBattery) {
		const uint continuous = 0x80000000;
		bool holding = false;
		bool ready = false;
		// Console.In can implement ReadLineAsync synchronously on Windows PowerShell.
		var input = System.Threading.Tasks.Task.Run(() => Console.OpenStandardInput().ReadByte());
		try {
			do {
				bool allowed = allowOnBattery;
				if (!allowOnBattery) {
					PowerStatus status;
					if (!GetSystemPowerStatus(out status)) {
						throw new Win32Exception(Marshal.GetLastWin32Error());
					}
					bool noBattery = status.BatteryFlag != 255 && (status.BatteryFlag & 128) != 0;
					if (status.ACLineStatus == 255 && !noBattery) {
						throw new InvalidOperationException("Unknown power source");
					}
					allowed = status.ACLineStatus == 1 || noBattery;
				}
				if (allowed != holding) {
					if (SetThreadExecutionState(continuous | (allowed ? 1u : 0u)) == 0) {
						throw new Win32Exception(Marshal.GetLastWin32Error());
					}
					holding = allowed;
				}
				if (!ready) {
					Console.WriteLine("ready");
					ready = true;
				}
			} while (!input.Wait(15000));
		} finally {
			if (holding && SetThreadExecutionState(continuous) == 0) {
				throw new Win32Exception(Marshal.GetLastWin32Error());
			}
		}
	}
}
'@
`;
