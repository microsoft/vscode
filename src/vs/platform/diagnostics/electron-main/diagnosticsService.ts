/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainProcessInfo, ILaunchService } from 'vs/platform/launch/electron-main/launchService';
import { listProcesses } from 'vs/base/node/ps';
import product from 'vs/platform/product/node/product';
import pkg from 'vs/platform/product/node/package';
import * as osLib from 'os';
import { virtualMachineHint } from 'vs/base/node/id';
import { repeat, pad } from 'vs/base/common/strings';
import { isWindows } from 'vs/base/common/platform';
import { app } from 'electron';
import { basename } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IMachineInfo, WorkspaceStats, SystemInfo, IRemoteDiagnosticInfo, isRemoteDiagnosticError } from 'vs/platform/diagnostics/common/diagnosticsService';
import { collectWorkspaceStats, getMachineInfo } from 'vs/platform/diagnostics/node/diagnosticsService';
import { ProcessItem } from 'vs/base/common/processes';

export const ID = 'diagnosticsService';
export const IDiagnosticsService = createDecorator<IDiagnosticsService>(ID);

export interface IDiagnosticsService {
	_serviceBrand: any;

	getPerformanceInfo(launchService: ILaunchService): Promise<PerformanceInfo>;
	getSystemInfo(launchService: ILaunchService): Promise<SystemInfo>;
	getDiagnostics(launchService: ILaunchService): Promise<string>;
}

export interface VersionInfo {
	vscodeVersion: string;
	os: string;
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
export class DiagnosticsService implements IDiagnosticsService {

	_serviceBrand: any;

	private formatMachineInfo(info: IMachineInfo): string {
		const output: string[] = [];
		output.push(`OS Version:       ${info.os}`);
		output.push(`CPUs:             ${info.cpus}`);
		output.push(`Memory (System):  ${info.memory}`);
		output.push(`VM:               ${info.vmHint}`);

		return output.join('\n');
	}

	private formatEnvironment(info: IMainProcessInfo): string {
		const MB = 1024 * 1024;
		const GB = 1024 * MB;

		const output: string[] = [];
		output.push(`Version:          ${pkg.name} ${pkg.version} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})`);
		output.push(`OS Version:       ${osLib.type()} ${osLib.arch()} ${osLib.release()}`);
		const cpus = osLib.cpus();
		if (cpus && cpus.length > 0) {
			output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
		}
		output.push(`Memory (System):  ${(osLib.totalmem() / GB).toFixed(2)}GB (${(osLib.freemem() / GB).toFixed(2)}GB free)`);
		if (!isWindows) {
			output.push(`Load (avg):       ${osLib.loadavg().map(l => Math.round(l)).join(', ')}`); // only provided on Linux/macOS
		}
		output.push(`VM:               ${Math.round((virtualMachineHint.value() * 100))}%`);
		output.push(`Screen Reader:    ${app.isAccessibilitySupportEnabled() ? 'yes' : 'no'}`);
		output.push(`Process Argv:     ${info.mainArguments.join(' ')}`);
		output.push(`GPU Status:       ${this.expandGPUFeatures()}`);

		return output.join('\n');
	}

	async getPerformanceInfo(launchService: ILaunchService): Promise<PerformanceInfo> {
		const info = await launchService.getMainProcessInfo();
		return Promise.all<ProcessItem, string>([listProcesses(info.mainPID), this.formatWorkspaceMetadata(info)]).then(async result => {
			let [rootProcess, workspaceInfo] = result;
			let processInfo = this.formatProcessList(info, rootProcess);

			try {
				const remoteData = await launchService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true });
				remoteData.forEach(diagnostics => {
					if (isRemoteDiagnosticError(diagnostics)) {
						processInfo += `\n${diagnostics.errorMessage}`;
						workspaceInfo += `\n${diagnostics.errorMessage}`;
					} else {
						processInfo += `\n\nRemote: ${diagnostics.hostName}`;
						if (diagnostics.processes) {
							processInfo += `\n${this.formatProcessList(info, diagnostics.processes)}`;
						}

						if (diagnostics.workspaceMetadata) {
							workspaceInfo += `\n|  Remote: ${diagnostics.hostName}`;
							for (const folder of Object.keys(diagnostics.workspaceMetadata)) {
								const metadata = diagnostics.workspaceMetadata[folder];

								let countMessage = `${metadata.fileCount} files`;
								if (metadata.maxFilesReached) {
									countMessage = `more than ${countMessage}`;
								}

								workspaceInfo += `|    Folder (${folder}): ${countMessage}`;
								workspaceInfo += this.formatWorkspaceStats(metadata);
							}
						}
					}
				});
			} catch (e) {
				processInfo += `\nFetching remote data failed: ${e}`;
				workspaceInfo += `\nFetching remote data failed: ${e}`;
			}

			return {
				processInfo,
				workspaceInfo
			};
		});
	}

	async getSystemInfo(launchService: ILaunchService): Promise<SystemInfo> {
		const info = await launchService.getMainProcessInfo();
		const { memory, vmHint, os, cpus } = getMachineInfo();
		const systemInfo: SystemInfo = {
			os,
			memory,
			cpus,
			vmHint,
			processArgs: `${info.mainArguments.join(' ')}`,
			gpuStatus: app.getGPUFeatureStatus(),
			screenReader: `${app.isAccessibilitySupportEnabled() ? 'yes' : 'no'}`,
			remoteData: (await launchService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })).filter((x): x is IRemoteDiagnosticInfo => !(x instanceof Error))
		};


		if (!isWindows) {
			systemInfo.load = `${osLib.loadavg().map(l => Math.round(l)).join(', ')}`;
		}

		return Promise.resolve(systemInfo);
	}

	async getDiagnostics(launchService: ILaunchService): Promise<string> {
		const output: string[] = [];
		const info = await launchService.getMainProcessInfo();
		return listProcesses(info.mainPID).then(async rootProcess => {

			// Environment Info
			output.push('');
			output.push(this.formatEnvironment(info));

			// Process List
			output.push('');
			output.push(this.formatProcessList(info, rootProcess));

			// Workspace Stats
			if (info.windows.some(window => window.folderURIs && window.folderURIs.length > 0 && !window.remoteAuthority)) {
				output.push('');
				output.push('Workspace Stats: ');
				output.push(await this.formatWorkspaceMetadata(info));
			}

			try {
				const data = await launchService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true });
				data.forEach(diagnostics => {
					if (isRemoteDiagnosticError(diagnostics)) {
						output.push(`\n${diagnostics.errorMessage}`);
					} else {
						output.push('\n\n');
						output.push(`Remote:           ${diagnostics.hostName}`);
						output.push(this.formatMachineInfo(diagnostics.machineInfo));

						if (diagnostics.processes) {
							output.push(this.formatProcessList(info, diagnostics.processes));
						}

						if (diagnostics.workspaceMetadata) {
							for (const folder of Object.keys(diagnostics.workspaceMetadata)) {
								const metadata = diagnostics.workspaceMetadata[folder];

								let countMessage = `${metadata.fileCount} files`;
								if (metadata.maxFilesReached) {
									countMessage = `more than ${countMessage}`;
								}

								output.push(`Folder (${folder}): ${countMessage}`);
								output.push(this.formatWorkspaceStats(metadata));
							}
						}
					}
				});
			} catch (e) {
				output.push('\n\n');
				output.push(`Fetching status information from remotes failed: ${e.message}`);
			}

			output.push('');
			output.push('');

			return output.join('\n');
		});
	}

	private formatWorkspaceStats(workspaceStats: WorkspaceStats): string {
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

		// if (workspaceStats.launchConfigFiles.length > 0) {
		// 	let line = '|      Launch Configs:';
		// 	workspaceStats.launchConfigFiles.forEach(each => {
		// 		const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
		// 		line += item;
		// 	});
		// 	output.push(line);
		// }
		return output.join('\n');
	}

	private expandGPUFeatures(): string {
		const gpuFeatures = app.getGPUFeatureStatus();
		const longestFeatureName = Math.max(...Object.keys(gpuFeatures).map(feature => feature.length));
		// Make columns aligned by adding spaces after feature name
		return Object.keys(gpuFeatures).map(feature => `${feature}:  ${repeat(' ', longestFeatureName - feature.length)}  ${gpuFeatures[feature]}`).join('\n                  ');
	}

	private formatWorkspaceMetadata(info: IMainProcessInfo): Promise<string> {
		const output: string[] = [];
		const workspaceStatPromises: Promise<void>[] = [];

		info.windows.forEach(window => {
			if (window.folderURIs.length === 0 || !!window.remoteAuthority) {
				return;
			}

			output.push(`|  Window (${window.title})`);

			window.folderURIs.forEach(uriComponents => {
				const folderUri = URI.revive(uriComponents);
				if (folderUri.scheme === 'file') {
					const folder = folderUri.fsPath;
					workspaceStatPromises.push(collectWorkspaceStats(folder, ['node_modules', '.git']).then(stats => {
						let countMessage = `${stats.fileCount} files`;
						if (stats.maxFilesReached) {
							countMessage = `more than ${countMessage}`;
						}
						output.push(`|    Folder (${basename(folder)}): ${countMessage}`);
						output.push(this.formatWorkspaceStats(stats));

					}).catch(error => {
						output.push(`|      Error: Unable to collect workspace stats for folder ${folder} (${error.toString()})`);
					}));
				} else {
					output.push(`|    Folder (${folderUri.toString()}): Workspace stats not available.`);
				}
			});
		});

		return Promise.all(workspaceStatPromises)
			.then(_ => output.join('\n'))
			.catch(e => `Unable to collect workspace stats: ${e}`);
	}

	private formatProcessList(info: IMainProcessInfo, rootProcess: ProcessItem): string {
		const mapPidToWindowTitle = new Map<number, string>();
		info.windows.forEach(window => mapPidToWindowTitle.set(window.pid, window.title));

		const output: string[] = [];

		output.push('CPU %\tMem MB\t   PID\tProcess');

		if (rootProcess) {
			this.formatProcessItem(info.mainPID, mapPidToWindowTitle, output, rootProcess, 0);
		}

		return output.join('\n');
	}

	private formatProcessItem(mainPid: number, mapPidToWindowTitle: Map<number, string>, output: string[], item: ProcessItem, indent: number): void {
		const isRoot = (indent === 0);

		const MB = 1024 * 1024;

		// Format name with indent
		let name: string;
		if (isRoot) {
			name = item.pid === mainPid ? `${product.applicationName} main` : 'remote agent';
		} else {
			name = `${repeat('  ', indent)} ${item.name}`;

			if (item.name === 'window') {
				name = `${name} (${mapPidToWindowTitle.get(item.pid)})`;
			}
		}
		const memory = process.platform === 'win32' ? item.mem : (osLib.totalmem() * (item.mem / 100));
		output.push(`${pad(Number(item.load.toFixed(0)), 5, ' ')}\t${pad(Number((memory / MB).toFixed(0)), 6, ' ')}\t${pad(Number((item.pid).toFixed(0)), 6, ' ')}\t${name}`);

		// Recurse into children if any
		if (Array.isArray(item.children)) {
			item.children.forEach(child => this.formatProcessItem(mainPid, mapPidToWindowTitle, output, child, indent + 1));
		}
	}
}

// function collectLaunchConfigs(folder: string): Promise<WorkspaceStatItem[]> {
// 	const launchConfigs = new Map<string, number>();

// 	const launchConfig = join(folder, '.vscode', 'launch.json');
// 	return new Promise((resolve, reject) => {
// 		exists(launchConfig, (doesExist) => {
// 			if (doesExist) {
// 				readFile(launchConfig, (err, contents) => {
// 					if (err) {
// 						return resolve([]);
// 					}

// 					const errors: ParseError[] = [];
// 					const json = parse(contents.toString(), errors);
// 					if (errors.length) {
// 						output.push(`Unable to parse ${launchConfig}`);
// 						return resolve([]);
// 					}

// 					if (json['configurations']) {
// 						for (const each of json['configurations']) {
// 							const type = each['type'];
// 							if (type) {
// 								if (launchConfigs.has(type)) {
// 									launchConfigs.set(type, launchConfigs.get(type)! + 1);
// 								} else {
// 									launchConfigs.set(type, 1);
// 								}
// 							}
// 						}
// 					}

// 					return resolve(asSortedItems(launchConfigs));
// 				});
// 			} else {
// 				return resolve([]);
// 			}
// 		});
// 	});
// }
