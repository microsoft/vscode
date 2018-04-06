/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { WorkspaceStats, collectWorkspaceStats, collectLaunchConfigs, WorkspaceStatItem } from 'vs/base/node/stats';
import { IMainProcessInfo } from 'vs/code/electron-main/launch';
import { ProcessItem, listProcesses } from 'vs/base/node/ps';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as os from 'os';
import { virtualMachineHint } from 'vs/base/node/id';
import { repeat, pad } from 'vs/base/common/strings';
import { isWindows } from 'vs/base/common/platform';
import { app } from 'electron';
import { basename } from 'path';

export interface VersionInfo {
	vscodeVersion: string;
	os: string;
}

export interface SystemInfo {
	CPUs?: string;
	'Memory (System)': string;
	'Load (avg)'?: string;
	VM: string;
	'Screen Reader': string;
	'Process Argv': string;
	'GPU Status': Electron.GPUFeatureStatus;
}

export interface ProcessInfo {
	cpu: number;
	memory: number;
	pid: number;
	name: string;
}

export interface PerformanceInfo {
	processInfo?: string;
	workspaceInfo?: string;
}

export function getPerformanceInfo(info: IMainProcessInfo): Promise<PerformanceInfo> {
	return listProcesses(info.mainPID).then(rootProcess => {
		const workspaceInfoMessages = [];

		// Workspace Stats
		if (info.windows.some(window => window.folders && window.folders.length > 0)) {
			info.windows.forEach(window => {
				if (window.folders.length === 0) {
					return;
				}

				workspaceInfoMessages.push(`|  Window (${window.title})`);

				window.folders.forEach(folder => {
					try {
						const stats = collectWorkspaceStats(folder, ['node_modules', '.git']);
						let countMessage = `${stats.fileCount} files`;
						if (stats.maxFilesReached) {
							countMessage = `more than ${countMessage}`;
						}
						workspaceInfoMessages.push(`|    Folder (${basename(folder)}): ${countMessage}`);
						workspaceInfoMessages.push(formatWorkspaceStats(stats));

						const launchConfigs = collectLaunchConfigs(folder);
						if (launchConfigs.length > 0) {
							workspaceInfoMessages.push(formatLaunchConfigs(launchConfigs));
						}
					} catch (error) {
						workspaceInfoMessages.push(`|      Error: Unable to collect workpsace stats for folder ${folder} (${error.toString()})`);
					}
				});
			});
		}

		return {
			processInfo: formatProcessList(info, rootProcess),
			workspaceInfo: workspaceInfoMessages.join('\n')
		};
	});
}

export function getSystemInfo(info: IMainProcessInfo): SystemInfo {
	const MB = 1024 * 1024;
	const GB = 1024 * MB;

	const systemInfo: SystemInfo = {
		'Memory (System)': `${(os.totalmem() / GB).toFixed(2)}GB (${(os.freemem() / GB).toFixed(2)}GB free)`,
		VM: `${Math.round((virtualMachineHint.value() * 100))}%`,
		'Screen Reader': `${app.isAccessibilitySupportEnabled() ? 'yes' : 'no'}`,
		'Process Argv': `${info.mainArguments.join(' ')}`,
		'GPU Status': app.getGPUFeatureStatus()
	};

	const cpus = os.cpus();
	if (cpus && cpus.length > 0) {
		systemInfo.CPUs = `${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`;
	}

	if (!isWindows) {
		systemInfo['Load (avg)'] = `${os.loadavg().map(l => Math.round(l)).join(', ')}`;
	}


	return systemInfo;
}

export function printDiagnostics(info: IMainProcessInfo): Promise<any> {
	return listProcesses(info.mainPID).then(rootProcess => {

		// Environment Info
		console.log('');
		console.log(formatEnvironment(info));

		// Process List
		console.log('');
		console.log(formatProcessList(info, rootProcess));

		// Workspace Stats
		if (info.windows.some(window => window.folders && window.folders.length > 0)) {
			console.log('');
			console.log('Workspace Stats: ');
			info.windows.forEach(window => {
				if (window.folders.length === 0) {
					return;
				}

				console.log(`|  Window (${window.title})`);

				window.folders.forEach(folder => {
					try {
						const stats = collectWorkspaceStats(folder, ['node_modules', '.git']);
						let countMessage = `${stats.fileCount} files`;
						if (stats.maxFilesReached) {
							countMessage = `more than ${countMessage}`;
						}
						console.log(`|    Folder (${basename(folder)}): ${countMessage}`);
						console.log(formatWorkspaceStats(stats));

						const launchConfigs = collectLaunchConfigs(folder);
						if (launchConfigs.length > 0) {
							console.log(formatLaunchConfigs(launchConfigs));
						}
					} catch (error) {
						console.log(`|      Error: Unable to collect workpsace stats for folder ${folder} (${error.toString()})`);
					}
				});
			});
		}
		console.log('');
		console.log('');
	});
}

function formatWorkspaceStats(workspaceStats: WorkspaceStats): string {
	const output: string[] = [];
	const lineLength = 60;
	let col = 0;

	const appendAndWrap = (name: string, count: number) => {
		const item = ` ${name}(${count})`;

		if (col + item.length > lineLength) {
			output.push(line);
			line = '|                 ';
			col = line.length;
		}
		else {
			col += item.length;
		}
		line += item;
	};

	// File Types
	let line = '|      File types:';
	const maxShown = 10;
	let max = workspaceStats.fileTypes.length > maxShown ? maxShown : workspaceStats.fileTypes.length;
	for (let i = 0; i < max; i++) {
		const item = workspaceStats.fileTypes[i];
		appendAndWrap(item.name, item.count);
	}
	output.push(line);

	// Conf Files
	if (workspaceStats.configFiles.length >= 0) {
		line = '|      Conf files:';
		col = 0;
		workspaceStats.configFiles.forEach((item) => {
			appendAndWrap(item.name, item.count);
		});
		output.push(line);
	}

	return output.join('\n');
}

function formatLaunchConfigs(configs: WorkspaceStatItem[]): string {
	const output: string[] = [];
	let line = '|      Launch Configs:';
	configs.forEach(each => {
		const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
		line += item;
	});
	output.push(line);
	return output.join('\n');
}

function expandGPUFeatures(): string {
	const gpuFeatures = app.getGPUFeatureStatus();
	const longestFeatureName = Math.max(...Object.keys(gpuFeatures).map(feature => feature.length));
	// Make columns aligned by adding spaces after feature name
	return Object.keys(gpuFeatures).map(feature => `${feature}:  ${repeat(' ', longestFeatureName - feature.length)}  ${gpuFeatures[feature]}`).join('\n                  ');
}

export function formatEnvironment(info: IMainProcessInfo): string {
	const MB = 1024 * 1024;
	const GB = 1024 * MB;

	const output: string[] = [];
	output.push(`Version:          ${pkg.name} ${pkg.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`);
	output.push(`OS Version:       ${os.type()} ${os.arch()} ${os.release()}`);
	const cpus = os.cpus();
	if (cpus && cpus.length > 0) {
		output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
	}
	output.push(`Memory (System):  ${(os.totalmem() / GB).toFixed(2)}GB (${(os.freemem() / GB).toFixed(2)}GB free)`);
	if (!isWindows) {
		output.push(`Load (avg):       ${os.loadavg().map(l => Math.round(l)).join(', ')}`); // only provided on Linux/macOS
	}
	output.push(`VM:               ${Math.round((virtualMachineHint.value() * 100))}%`);
	output.push(`Screen Reader:    ${app.isAccessibilitySupportEnabled() ? 'yes' : 'no'}`);
	output.push(`Process Argv:     ${info.mainArguments.join(' ')}`);
	output.push(`GPU Status:       ${expandGPUFeatures()}`);

	return output.join('\n');
}

function formatProcessList(info: IMainProcessInfo, rootProcess: ProcessItem): string {
	const mapPidToWindowTitle = new Map<number, string>();
	info.windows.forEach(window => mapPidToWindowTitle.set(window.pid, window.title));

	const output: string[] = [];

	output.push('CPU %\tMem MB\t   PID\tProcess');

	if (rootProcess) {
		formatProcessItem(mapPidToWindowTitle, output, rootProcess, 0);
	}

	return output.join('\n');
}

function formatProcessItem(mapPidToWindowTitle: Map<number, string>, output: string[], item: ProcessItem, indent: number): void {
	const isRoot = (indent === 0);

	const MB = 1024 * 1024;

	// Format name with indent
	let name: string;
	if (isRoot) {
		name = `${product.applicationName} main`;
	} else {
		name = `${repeat('  ', indent)} ${item.name}`;

		if (item.name === 'window') {
			name = `${name} (${mapPidToWindowTitle.get(item.pid)})`;
		}
	}
	const memory = process.platform === 'win32' ? item.mem : (os.totalmem() * (item.mem / 100));
	output.push(`${pad(Number(item.load.toFixed(0)), 5, ' ')}\t${pad(Number((memory / MB).toFixed(0)), 6, ' ')}\t${pad(Number((item.pid).toFixed(0)), 6, ' ')}\t${name}`);

	// Recurse into children if any
	if (Array.isArray(item.children)) {
		item.children.forEach(child => formatProcessItem(mapPidToWindowTitle, output, child, indent + 1));
	}
}
