/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as osLib from 'os';
import { virtualMachineHint } from 'vs/base/node/id';
import { IMachineInfo, WorkspaceStats, WorkspaceStatItem, PerformanceInfo, SystemInfo, IRemoteDiagnosticInfo, IRemoteDiagnosticError, isRemoteDiagnosticError, IWorkspaceInformation } from 'vs/platform/diagnostics/common/diagnostics';
import { readdir, stat, exists, readFile } from 'fs';
import { join, basename } from 'vs/base/common/path';
import { parse, ParseError } from 'vs/base/common/json';
import { listProcesses } from 'vs/base/node/ps';
import product from 'vs/platform/product/node/product';
import pkg from 'vs/platform/product/node/package';
import { repeat, pad } from 'vs/base/common/strings';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ProcessItem } from 'vs/base/common/processes';
import { IMainProcessInfo } from 'vs/platform/launch/common/launchService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ID = 'diagnosticsService';
export const IDiagnosticsService = createDecorator<IDiagnosticsService>(ID);

export interface IDiagnosticsService {
	_serviceBrand: any;

	getPerformanceInfo(mainProcessInfo: IMainProcessInfo, remoteInfo: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<PerformanceInfo>;
	getSystemInfo(mainProcessInfo: IMainProcessInfo, remoteInfo: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<SystemInfo>;
	getDiagnostics(mainProcessInfo: IMainProcessInfo, remoteInfo: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<string>;
	reportWorkspaceStats(workspace: IWorkspaceInformation): Promise<void>;
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

export function collectWorkspaceStats(folder: string, filter: string[]): Promise<WorkspaceStats> {
	const configFilePatterns = [
		{ 'tag': 'grunt.js', 'pattern': /^gruntfile\.js$/i },
		{ 'tag': 'gulp.js', 'pattern': /^gulpfile\.js$/i },
		{ 'tag': 'tsconfig.json', 'pattern': /^tsconfig\.json$/i },
		{ 'tag': 'package.json', 'pattern': /^package\.json$/i },
		{ 'tag': 'jsconfig.json', 'pattern': /^jsconfig\.json$/i },
		{ 'tag': 'tslint.json', 'pattern': /^tslint\.json$/i },
		{ 'tag': 'eslint.json', 'pattern': /^eslint\.json$/i },
		{ 'tag': 'tasks.json', 'pattern': /^tasks\.json$/i },
		{ 'tag': 'launch.json', 'pattern': /^launch\.json$/i },
		{ 'tag': 'settings.json', 'pattern': /^settings\.json$/i },
		{ 'tag': 'webpack.config.js', 'pattern': /^webpack\.config\.js$/i },
		{ 'tag': 'project.json', 'pattern': /^project\.json$/i },
		{ 'tag': 'makefile', 'pattern': /^makefile$/i },
		{ 'tag': 'sln', 'pattern': /^.+\.sln$/i },
		{ 'tag': 'csproj', 'pattern': /^.+\.csproj$/i },
		{ 'tag': 'cmake', 'pattern': /^.+\.cmake$/i }
	];

	const fileTypes = new Map<string, number>();
	const configFiles = new Map<string, number>();

	const MAX_FILES = 20000;

	function walk(dir: string, filter: string[], token: { count: number, maxReached: boolean }, done: (allFiles: string[]) => void): void {
		let results: string[] = [];
		readdir(dir, async (err, files) => {
			// Ignore folders that can't be read
			if (err) {
				return done(results);
			}

			let pending = files.length;
			if (pending === 0) {
				return done(results);
			}

			for (const file of files) {
				if (token.maxReached) {
					return done(results);
				}

				stat(join(dir, file), (err, stats) => {
					// Ignore files that can't be read
					if (err) {
						if (--pending === 0) {
							return done(results);
						}
					} else {
						if (stats.isDirectory()) {
							if (filter.indexOf(file) === -1) {
								walk(join(dir, file), filter, token, (res: string[]) => {
									results = results.concat(res);

									if (--pending === 0) {
										return done(results);
									}
								});
							} else {
								if (--pending === 0) {
									done(results);
								}
							}
						} else {
							if (token.count >= MAX_FILES) {
								token.maxReached = true;
							}

							token.count++;
							results.push(file);

							if (--pending === 0) {
								done(results);
							}
						}
					}
				});
			}
		});
	}

	const addFileType = (fileType: string) => {
		if (fileTypes.has(fileType)) {
			fileTypes.set(fileType, fileTypes.get(fileType)! + 1);
		}
		else {
			fileTypes.set(fileType, 1);
		}
	};

	const addConfigFiles = (fileName: string) => {
		for (const each of configFilePatterns) {
			if (each.pattern.test(fileName)) {
				if (configFiles.has(each.tag)) {
					configFiles.set(each.tag, configFiles.get(each.tag)! + 1);
				} else {
					configFiles.set(each.tag, 1);
				}
			}
		}
	};

	const acceptFile = (name: string) => {
		if (name.lastIndexOf('.') >= 0) {
			const suffix: string | undefined = name.split('.').pop();
			if (suffix) {
				addFileType(suffix);
			}
		}
		addConfigFiles(name);
	};

	const token: { count: number, maxReached: boolean } = { count: 0, maxReached: false };

	return new Promise((resolve, reject) => {
		walk(folder, filter, token, async (files) => {
			files.forEach(acceptFile);

			const launchConfigs = await collectLaunchConfigs(folder);

			resolve({
				configFiles: asSortedItems(configFiles),
				fileTypes: asSortedItems(fileTypes),
				fileCount: token.count,
				maxFilesReached: token.maxReached,
				launchConfigFiles: launchConfigs
			});
		});
	});
}

function asSortedItems(map: Map<string, number>): WorkspaceStatItem[] {
	const a: WorkspaceStatItem[] = [];
	map.forEach((value, index) => a.push({ name: index, count: value }));
	return a.sort((a, b) => b.count - a.count);
}

export function getMachineInfo(): IMachineInfo {
	const MB = 1024 * 1024;
	const GB = 1024 * MB;

	const machineInfo: IMachineInfo = {
		os: `${osLib.type()} ${osLib.arch()} ${osLib.release()}`,
		memory: `${(osLib.totalmem() / GB).toFixed(2)}GB (${(osLib.freemem() / GB).toFixed(2)}GB free)`,
		vmHint: `${Math.round((virtualMachineHint.value() * 100))}%`,
	};

	const cpus = osLib.cpus();
	if (cpus && cpus.length > 0) {
		machineInfo.cpus = `${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`;
	}

	return machineInfo;
}

export function collectLaunchConfigs(folder: string): Promise<WorkspaceStatItem[]> {
	let launchConfigs = new Map<string, number>();

	let launchConfig = join(folder, '.vscode', 'launch.json');
	return new Promise((resolve, reject) => {
		exists(launchConfig, (doesExist) => {
			if (doesExist) {
				readFile(launchConfig, (err, contents) => {
					if (err) {
						return resolve([]);
					}

					const errors: ParseError[] = [];
					const json = parse(contents.toString(), errors);
					if (errors.length) {
						console.log(`Unable to parse ${launchConfig}`);
						return resolve([]);
					}

					if (json['configurations']) {
						for (const each of json['configurations']) {
							const type = each['type'];
							if (type) {
								if (launchConfigs.has(type)) {
									launchConfigs.set(type, launchConfigs.get(type)! + 1);
								} else {
									launchConfigs.set(type, 1);
								}
							}
						}
					}

					return resolve(asSortedItems(launchConfigs));
				});
			} else {
				return resolve([]);
			}
		});
	});
}

export class DiagnosticsService implements IDiagnosticsService {

	_serviceBrand: any;

	constructor(@ITelemetryService private readonly telemetryService: ITelemetryService) { }

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
		output.push(`Screen Reader:    ${info.screenReader ? 'yes' : 'no'}`);
		output.push(`Process Argv:     ${info.mainArguments.join(' ')}`);
		output.push(`GPU Status:       ${this.expandGPUFeatures(info.gpuFeatureStatus)}`);

		return output.join('\n');
	}

	public async getPerformanceInfo(info: IMainProcessInfo, remoteData: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<PerformanceInfo> {
		return Promise.all<ProcessItem, string>([listProcesses(info.mainPID), this.formatWorkspaceMetadata(info)]).then(async result => {
			let [rootProcess, workspaceInfo] = result;
			let processInfo = this.formatProcessList(info, rootProcess);

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

			return {
				processInfo,
				workspaceInfo
			};
		});
	}

	public async getSystemInfo(info: IMainProcessInfo, remoteData: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<SystemInfo> {
		const { memory, vmHint, os, cpus } = getMachineInfo();
		const systemInfo: SystemInfo = {
			os,
			memory,
			cpus,
			vmHint,
			processArgs: `${info.mainArguments.join(' ')}`,
			gpuStatus: info.gpuFeatureStatus,
			screenReader: `${info.screenReader ? 'yes' : 'no'}`,
			remoteData
		};


		if (!isWindows) {
			systemInfo.load = `${osLib.loadavg().map(l => Math.round(l)).join(', ')}`;
		}

		return Promise.resolve(systemInfo);
	}

	public async getDiagnostics(info: IMainProcessInfo, remoteDiagnostics: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<string> {
		const output: string[] = [];
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

			remoteDiagnostics.forEach(diagnostics => {
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

		if (workspaceStats.launchConfigFiles.length > 0) {
			let line = '|      Launch Configs:';
			workspaceStats.launchConfigFiles.forEach(each => {
				const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
				line += item;
			});
			output.push(line);
		}
		return output.join('\n');
	}

	private expandGPUFeatures(gpuFeatures: any): string {
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

	public async reportWorkspaceStats(workspace: IWorkspaceInformation): Promise<void> {
		workspace.folders.forEach(folder => {
			const folderUri = URI.revive(folder.uri);
			if (folderUri.scheme === 'file') {
				const folder = folderUri.fsPath;
				collectWorkspaceStats(folder, ['node_modules', '.git']).then(stats => {
					type WorkspaceStatItemClassification = {
						name: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
						count: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
					};
					type WorkspaceStatsClassification = {
						'workspace.id': { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
						fileTypes: WorkspaceStatItemClassification;
						configTypes: WorkspaceStatItemClassification;
						launchConfigs: WorkspaceStatItemClassification;
					};
					type WorkspaceStatsEvent = {
						'workspace.id': string | undefined;
						fileTypes: WorkspaceStatItem[];
						configTypes: WorkspaceStatItem[];
						launchConfigs: WorkspaceStatItem[];
					};
					this.telemetryService.publicLog2<WorkspaceStatsEvent, WorkspaceStatsClassification>('workspace.stats', {
						'workspace.id': workspace.telemetryId,
						fileTypes: stats.fileTypes,
						configTypes: stats.configFiles,
						launchConfigs: stats.launchConfigFiles
					});
				}).catch(_ => {
					// Report nothing if collecting metadata fails.
				});
			}
		});
	}
}
