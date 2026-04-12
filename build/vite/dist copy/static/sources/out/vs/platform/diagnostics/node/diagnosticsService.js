/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as fs from 'fs';
import * as osLib from 'os';
import { Promises } from '../../../base/common/async.js';
import { getNodeType, parse } from '../../../base/common/json.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, join } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { virtualMachineHint } from '../../../base/node/id.js';
import { Promises as pfs } from '../../../base/node/pfs.js';
import { listProcesses } from '../../../base/node/ps.js';
import { isRemoteDiagnosticError } from '../common/diagnostics.js';
import { ByteSize } from '../../files/common/files.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
const workspaceStatsCache = new Map();
export async function collectWorkspaceStats(folder, filter) {
    const cacheKey = `${folder}::${filter.join(':')}`;
    const cached = workspaceStatsCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const configFilePatterns = [
        { tag: 'grunt.js', filePattern: /^gruntfile\.js$/i },
        { tag: 'gulp.js', filePattern: /^gulpfile\.js$/i },
        { tag: 'tsconfig.json', filePattern: /^tsconfig\.json$/i },
        { tag: 'package.json', filePattern: /^package\.json$/i },
        { tag: 'jsconfig.json', filePattern: /^jsconfig\.json$/i },
        { tag: 'tslint.json', filePattern: /^tslint\.json$/i },
        { tag: 'eslint.json', filePattern: /^eslint\.json$/i },
        { tag: 'tasks.json', filePattern: /^tasks\.json$/i },
        { tag: 'launch.json', filePattern: /^launch\.json$/i },
        { tag: 'mcp.json', filePattern: /^mcp\.json$/i },
        { tag: 'settings.json', filePattern: /^settings\.json$/i },
        { tag: 'webpack.config.js', filePattern: /^webpack\.config\.js$/i },
        { tag: 'project.json', filePattern: /^project\.json$/i },
        { tag: 'makefile', filePattern: /^makefile$/i },
        { tag: 'sln', filePattern: /^.+\.sln$/i },
        { tag: 'csproj', filePattern: /^.+\.csproj$/i },
        { tag: 'cmake', filePattern: /^.+\.cmake$/i },
        { tag: 'github-actions', filePattern: /^.+\.ya?ml$/i, relativePathPattern: /^\.github(?:\/|\\)workflows$/i },
        { tag: 'devcontainer.json', filePattern: /^devcontainer\.json$/i },
        { tag: 'dockerfile', filePattern: /^(dockerfile|docker\-compose\.ya?ml)$/i },
        { tag: 'cursorrules', filePattern: /^\.cursorrules$/i },
        { tag: 'cursorrules-dir', filePattern: /\.mdc$/i, relativePathPattern: /^\.cursor[\/\\]rules$/i },
        { tag: 'github-instructions-dir', filePattern: /\.instructions\.md$/i, relativePathPattern: /^\.github[\/\\]instructions$/i },
        { tag: 'github-prompts-dir', filePattern: /\.prompt\.md$/i, relativePathPattern: /^\.github[\/\\]prompts$/i },
        { tag: 'clinerules', filePattern: /^\.clinerules$/i },
        { tag: 'clinerules-dir', filePattern: /\.md$/i, relativePathPattern: /^\.clinerules$/i },
        { tag: 'agent.md', filePattern: /^agent\.md$/i },
        { tag: 'agents.md', filePattern: /^agents\.md$/i },
        { tag: 'claude.md', filePattern: /^claude\.md$/i },
        { tag: 'claude-settings', filePattern: /^settings\.json$/i, relativePathPattern: /^\.claude$/i },
        { tag: 'claude-settings-local', filePattern: /^settings\.local\.json$/i, relativePathPattern: /^\.claude$/i },
        { tag: 'claude-mcp', filePattern: /^mcp\.json$/i, relativePathPattern: /^\.claude$/i },
        { tag: 'claude-commands-dir', filePattern: /\.md$/i, relativePathPattern: /^\.claude[\/\\]commands$/i },
        { tag: 'claude-skills-dir', filePattern: /^SKILL\.md$/i, relativePathPattern: /^\.claude[\/\\]skills[\/\\]/i },
        { tag: 'claude-rules-dir', filePattern: /\.md$/i, relativePathPattern: /^\.claude[\/\\]rules$/i },
        { tag: 'gemini.md', filePattern: /^gemini\.md$/i },
        { tag: 'copilot-instructions.md', filePattern: /^copilot\-instructions\.md$/i, relativePathPattern: /^\.github$/i },
    ];
    const fileTypes = new Map();
    const configFiles = new Map();
    const MAX_FILES = 20000;
    function collect(root, dir, filter, token) {
        const relativePath = dir.substring(root.length + 1);
        return Promises.withAsyncBody(async (resolve) => {
            let files;
            token.readdirCount++;
            try {
                files = await pfs.readdir(dir, { withFileTypes: true });
            }
            catch (error) {
                // Ignore folders that can't be read
                resolve();
                return;
            }
            if (token.count >= MAX_FILES) {
                token.count += files.length;
                token.maxReached = true;
                resolve();
                return;
            }
            let pending = files.length;
            if (pending === 0) {
                resolve();
                return;
            }
            let filesToRead = files;
            if (token.count + files.length > MAX_FILES) {
                token.maxReached = true;
                pending = MAX_FILES - token.count;
                filesToRead = files.slice(0, pending);
            }
            token.count += files.length;
            for (const file of filesToRead) {
                if (file.isDirectory()) {
                    if (!filter.includes(file.name)) {
                        await collect(root, join(dir, file.name), filter, token);
                    }
                    if (--pending === 0) {
                        resolve();
                        return;
                    }
                }
                else {
                    const index = file.name.lastIndexOf('.');
                    if (index >= 0) {
                        const fileType = file.name.substring(index + 1);
                        if (fileType) {
                            fileTypes.set(fileType, (fileTypes.get(fileType) ?? 0) + 1);
                        }
                    }
                    for (const configFile of configFilePatterns) {
                        if (configFile.relativePathPattern?.test(relativePath) !== false && configFile.filePattern.test(file.name)) {
                            configFiles.set(configFile.tag, (configFiles.get(configFile.tag) ?? 0) + 1);
                        }
                    }
                    if (--pending === 0) {
                        resolve();
                        return;
                    }
                }
            }
        });
    }
    const statsPromise = Promises.withAsyncBody(async (resolve) => {
        const token = { count: 0, maxReached: false, readdirCount: 0 };
        const sw = new StopWatch(true);
        await collect(folder, folder, filter, token);
        const launchConfigs = await collectLaunchConfigs(folder);
        resolve({
            configFiles: asSortedItems(configFiles),
            fileTypes: asSortedItems(fileTypes),
            fileCount: token.count,
            maxFilesReached: token.maxReached,
            launchConfigFiles: launchConfigs,
            totalScanTime: sw.elapsed(),
            totalReaddirCount: token.readdirCount
        });
    });
    workspaceStatsCache.set(cacheKey, statsPromise);
    return statsPromise;
}
function asSortedItems(items) {
    return Array.from(items.entries(), ([name, count]) => ({ name: name, count: count }))
        .sort((a, b) => b.count - a.count);
}
export function getMachineInfo() {
    const machineInfo = {
        os: `${osLib.type()} ${osLib.arch()} ${osLib.release()}`,
        memory: `${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`,
        vmHint: `${Math.round((virtualMachineHint.value() * 100))}%`,
    };
    const cpus = osLib.cpus();
    if (cpus && cpus.length > 0) {
        machineInfo.cpus = `${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`;
    }
    return machineInfo;
}
export async function collectLaunchConfigs(folder) {
    try {
        const launchConfigs = new Map();
        const launchConfig = join(folder, '.vscode', 'launch.json');
        const contents = await fs.promises.readFile(launchConfig);
        const errors = [];
        const json = parse(contents.toString(), errors);
        if (errors.length) {
            console.log(`Unable to parse ${launchConfig}`);
            return [];
        }
        if (getNodeType(json) === 'object' && json['configurations']) {
            for (const each of json['configurations']) {
                const type = each['type'];
                if (type) {
                    if (launchConfigs.has(type)) {
                        launchConfigs.set(type, launchConfigs.get(type) + 1);
                    }
                    else {
                        launchConfigs.set(type, 1);
                    }
                }
            }
        }
        return asSortedItems(launchConfigs);
    }
    catch (error) {
        return [];
    }
}
let DiagnosticsService = class DiagnosticsService {
    constructor(telemetryService, productService) {
        this.telemetryService = telemetryService;
        this.productService = productService;
    }
    formatMachineInfo(info) {
        const output = [];
        output.push(`OS Version:       ${info.os}`);
        output.push(`CPUs:             ${info.cpus}`);
        output.push(`Memory (System):  ${info.memory}`);
        output.push(`VM:               ${info.vmHint}`);
        return output.join('\n');
    }
    formatEnvironment(info) {
        const output = [];
        output.push(`Version:          ${this.productService.nameShort} ${this.productService.version} (${this.productService.commit || 'Commit unknown'}, ${this.productService.date || 'Date unknown'})`);
        output.push(`OS Version:       ${osLib.type()} ${osLib.arch()} ${osLib.release()}`);
        const cpus = osLib.cpus();
        if (cpus && cpus.length > 0) {
            output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
        }
        output.push(`Memory (System):  ${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`);
        if (!isWindows) {
            output.push(`Load (avg):       ${osLib.loadavg().map(l => Math.round(l)).join(', ')}`); // only provided on Linux/macOS
        }
        output.push(`VM:               ${Math.round((virtualMachineHint.value() * 100))}%`);
        output.push(`Screen Reader:    ${info.screenReader ? 'yes' : 'no'}`);
        output.push(`Process Argv:     ${info.mainArguments.join(' ')}`);
        output.push(`GPU Status:       ${this.expandGPUFeatures(info.gpuFeatureStatus)}`);
        if (info.gpuLogMessages && info.gpuLogMessages.length > 0) {
            output.push(`GPU Log Messages:`);
            info.gpuLogMessages.forEach(msg => {
                output.push(`${msg.header}: ${msg.message}`);
            });
        }
        return output.join('\n');
    }
    async getPerformanceInfo(info, remoteData) {
        return Promise.all([listProcesses(info.mainPID), this.formatWorkspaceMetadata(info)]).then(async (result) => {
            let [rootProcess, workspaceInfo] = result;
            let processInfo = this.formatProcessList(info, rootProcess);
            remoteData.forEach(diagnostics => {
                if (isRemoteDiagnosticError(diagnostics)) {
                    processInfo += `\n${diagnostics.errorMessage}`;
                    workspaceInfo += `\n${diagnostics.errorMessage}`;
                }
                else {
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
    async getSystemInfo(info, remoteData) {
        const { memory, vmHint, os, cpus } = getMachineInfo();
        const systemInfo = {
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
        if (isLinux) {
            systemInfo.linuxEnv = {
                desktopSession: process.env['DESKTOP_SESSION'],
                xdgSessionDesktop: process.env['XDG_SESSION_DESKTOP'],
                xdgCurrentDesktop: process.env['XDG_CURRENT_DESKTOP'],
                xdgSessionType: process.env['XDG_SESSION_TYPE']
            };
        }
        return Promise.resolve(systemInfo);
    }
    async getDiagnostics(info, remoteDiagnostics) {
        const output = [];
        return listProcesses(info.mainPID).then(async (rootProcess) => {
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
                }
                else {
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
    formatWorkspaceStats(workspaceStats) {
        const output = [];
        const lineLength = 60;
        let col = 0;
        const appendAndWrap = (name, count) => {
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
        const max = workspaceStats.fileTypes.length > maxShown ? maxShown : workspaceStats.fileTypes.length;
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
    expandGPUFeatures(gpuFeatures) {
        const longestFeatureName = Math.max(...Object.keys(gpuFeatures).map(feature => feature.length));
        // Make columns aligned by adding spaces after feature name
        return Object.keys(gpuFeatures).map(feature => `${feature}:  ${' '.repeat(longestFeatureName - feature.length)}  ${gpuFeatures[feature]}`).join('\n                  ');
    }
    formatWorkspaceMetadata(info) {
        const output = [];
        const workspaceStatPromises = [];
        info.windows.forEach(window => {
            if (window.folderURIs.length === 0 || !!window.remoteAuthority) {
                return;
            }
            output.push(`|  Window (${window.title})`);
            window.folderURIs.forEach(uriComponents => {
                const folderUri = URI.revive(uriComponents);
                if (folderUri.scheme === Schemas.file) {
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
                }
                else {
                    output.push(`|    Folder (${folderUri.toString()}): Workspace stats not available.`);
                }
            });
        });
        return Promise.all(workspaceStatPromises)
            .then(_ => output.join('\n'))
            .catch(e => `Unable to collect workspace stats: ${e}`);
    }
    formatProcessList(info, rootProcess) {
        const mapProcessToName = new Map();
        info.windows.forEach(window => mapProcessToName.set(window.pid, `window [${window.id}] (${window.title})`));
        info.pidToNames.forEach(({ pid, name }) => mapProcessToName.set(pid, name));
        const output = [];
        output.push('CPU %\tMem MB\t   PID\tProcess');
        if (rootProcess) {
            this.formatProcessItem(info.mainPID, mapProcessToName, output, rootProcess, 0);
        }
        return output.join('\n');
    }
    formatProcessItem(mainPid, mapProcessToName, output, item, indent) {
        const isRoot = (indent === 0);
        // Format name with indent
        let name;
        if (isRoot) {
            name = item.pid === mainPid ? this.productService.applicationName : 'remote-server';
        }
        else {
            if (mapProcessToName.has(item.pid)) {
                name = mapProcessToName.get(item.pid);
            }
            else {
                name = `${'  '.repeat(indent)} ${item.name}`;
            }
        }
        const memory = process.platform === 'win32' ? item.mem : (osLib.totalmem() * (item.mem / 100));
        output.push(`${item.load.toFixed(0).padStart(5, ' ')}\t${(memory / ByteSize.MB).toFixed(0).padStart(6, ' ')}\t${item.pid.toFixed(0).padStart(6, ' ')}\t${name}`);
        // Recurse into children if any
        if (Array.isArray(item.children)) {
            item.children.forEach(child => this.formatProcessItem(mainPid, mapProcessToName, output, child, indent + 1));
        }
    }
    async getWorkspaceFileExtensions(workspace) {
        const items = new Set();
        for (const { uri } of workspace.folders) {
            const folderUri = URI.revive(uri);
            if (folderUri.scheme !== Schemas.file) {
                continue;
            }
            const folder = folderUri.fsPath;
            try {
                const stats = await collectWorkspaceStats(folder, ['node_modules', '.git']);
                stats.fileTypes.forEach(item => items.add(item.name));
            }
            catch { }
        }
        return { extensions: [...items] };
    }
    async reportWorkspaceStats(workspace) {
        for (const { uri } of workspace.folders) {
            const folderUri = URI.revive(uri);
            if (folderUri.scheme !== Schemas.file) {
                continue;
            }
            const folder = folderUri.fsPath;
            try {
                const stats = await collectWorkspaceStats(folder, ['node_modules', '.git']);
                this.telemetryService.publicLog2('workspace.stats', {
                    'workspace.id': workspace.telemetryId,
                    rendererSessionId: workspace.rendererSessionId
                });
                stats.fileTypes.forEach(e => {
                    this.telemetryService.publicLog2('workspace.stats.file', {
                        rendererSessionId: workspace.rendererSessionId,
                        type: e.name,
                        count: e.count
                    });
                });
                stats.launchConfigFiles.forEach(e => {
                    this.telemetryService.publicLog2('workspace.stats.launchConfigFile', {
                        rendererSessionId: workspace.rendererSessionId,
                        type: e.name,
                        count: e.count
                    });
                });
                stats.configFiles.forEach(e => {
                    this.telemetryService.publicLog2('workspace.stats.configFiles', {
                        rendererSessionId: workspace.rendererSessionId,
                        type: e.name,
                        count: e.count
                    });
                });
                this.telemetryService.publicLog2('workspace.stats.metadata', { duration: stats.totalScanTime, reachedLimit: stats.maxFilesReached, fileCount: stats.fileCount, readdirCount: stats.totalReaddirCount });
            }
            catch {
                // Report nothing if collecting metadata fails.
            }
        }
    }
};
DiagnosticsService = __decorate([
    __param(0, ITelemetryService),
    __param(1, IProductService)
], DiagnosticsService);
export { DiagnosticsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhZ25vc3RpY3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZGlhZ25vc3RpY3Mvbm9kZS9kaWFnbm9zdGljc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxLQUFLLEtBQUssTUFBTSxJQUFJLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFjLE1BQU0sOEJBQThCLENBQUM7QUFDOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV0RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzlELE9BQU8sRUFBVyxRQUFRLElBQUksR0FBRyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3pELE9BQU8sRUFBNkcsdUJBQXVCLEVBQXlGLE1BQU0sMEJBQTBCLENBQUM7QUFDclEsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RSxPQUFPLEVB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