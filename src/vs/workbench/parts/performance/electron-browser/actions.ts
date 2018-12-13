/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { ITimerService, IStartupMetrics } from 'vs/workbench/services/timer/electron-browser/timerService';
import * as os from 'os';
import { IExtensionService, ActivationTimes } from 'vs/workbench/services/extensions/common/extensions';
import { getEntries } from 'vs/base/common/performance';
import { timeout } from 'vs/base/common/async';
import { StartupKindToString } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { forEach } from 'vs/base/common/collections';
import { mergeSort } from 'vs/base/common/arrays';

class Info {

	static getTimerInfo(metrics: IStartupMetrics, nodeModuleLoadTime?: number): { [name: string]: Info } {
		const table: { [name: string]: Info } = Object.create(null);
		table['start => app.isReady'] = new Info(metrics.timers.ellapsedAppReady, '[main]', `initial startup: ${metrics.initialStartup}`);
		table['nls:start => nls:end'] = new Info(metrics.timers.ellapsedNlsGeneration, '[main]', `initial startup: ${metrics.initialStartup}`);
		table['app.isReady => window.loadUrl()'] = new Info(metrics.timers.ellapsedWindowLoad, '[main]', `initial startup: ${metrics.initialStartup}`);

		table['require & init global storage'] = new Info(metrics.timers.ellapsedGlobalStorageInitMain, '[main]', `initial startup: ${metrics.initialStartup}`);

		table['window.loadUrl() => begin to require(workbench.main.js)'] = new Info(metrics.timers.ellapsedWindowLoadToRequire, '[main->renderer]', StartupKindToString(metrics.windowKind));
		table['require(workbench.main.js)'] = new Info(metrics.timers.ellapsedRequire, '[renderer]', `cached data: ${(metrics.didUseCachedData ? 'YES' : 'NO')}${nodeModuleLoadTime ? `, node_modules took ${nodeModuleLoadTime}ms` : ''}`);

		table['init global storage'] = new Info(metrics.timers.ellapsedGlobalStorageInitRenderer, '[renderer]');
		table['require workspace storage'] = new Info(metrics.timers.ellapsedWorkspaceStorageRequire, '[renderer]');
		table['require & init workspace storage'] = new Info(metrics.timers.ellapsedWorkspaceStorageInit, '[renderer]');

		table['init workspace service'] = new Info(metrics.timers.ellapsedWorkspaceServiceInit, '[renderer]');

		table['register extensions & spawn extension host'] = new Info(metrics.timers.ellapsedExtensions, '[renderer]');
		table['restore viewlet'] = new Info(metrics.timers.ellapsedViewletRestore, '[renderer]', metrics.viewletId);
		table['restore panel'] = new Info(metrics.timers.ellapsedPanelRestore, '[renderer]', metrics.panelId);
		table['restore editors'] = new Info(metrics.timers.ellapsedEditorRestore, '[renderer]', `${metrics.editorIds.length}: ${metrics.editorIds.join(', ')}`);
		table['overall workbench load'] = new Info(metrics.timers.ellapsedWorkbench, '[renderer]');

		table['workbench ready'] = new Info(metrics.ellapsed, '[main->renderer]');
		table['extensions registered'] = new Info(metrics.timers.ellapsedExtensionsReady, '[renderer]');

		return table;
	}

	private constructor(readonly duration: number, readonly process: string, readonly info: string | boolean = '') { }
}

class LoaderStat {

	static getLoaderStats() {

		let seq = 1;
		const amdLoad = new Map<string, LoaderStat>();
		const amdInvoke = new Map<string, LoaderStat>();
		const nodeRequire = new Map<string, LoaderStat>();
		const nodeEval = new Map<string, LoaderStat>();

		function mark(map: Map<string, LoaderStat>, stat: LoaderEvent) {
			if (map.has(stat.detail)) {
				// console.warn('BAD events, DOUBLE start', stat);
				// map.delete(stat.detail);
				return;
			}
			map.set(stat.detail, new LoaderStat(-stat.timestamp, seq++));
		}

		function diff(map: Map<string, LoaderStat>, stat: LoaderEvent) {
			let obj = map.get(stat.detail);
			if (!obj) {
				// console.warn('BAD events, end WITHOUT start', stat);
				// map.delete(stat.detail);
				return;
			}
			if (obj.duration >= 0) {
				// console.warn('BAD events, DOUBLE end', stat);
				// map.delete(stat.detail);
				return;
			}
			obj.duration = (obj.duration + stat.timestamp);
		}

		const stats = mergeSort(require.getStats().slice(0), (a, b) => a.timestamp - b.timestamp);

		for (const stat of stats) {
			switch (stat.type) {
				case LoaderEventType.BeginLoadingScript:
					mark(amdLoad, stat);
					break;
				case LoaderEventType.EndLoadingScriptOK:
				case LoaderEventType.EndLoadingScriptError:
					diff(amdLoad, stat);
					break;

				case LoaderEventType.BeginInvokeFactory:
					mark(amdInvoke, stat);
					break;
				case LoaderEventType.EndInvokeFactory:
					diff(amdInvoke, stat);
					break;

				case LoaderEventType.NodeBeginNativeRequire:
					mark(nodeRequire, stat);
					break;
				case LoaderEventType.NodeEndNativeRequire:
					diff(nodeRequire, stat);
					break;

				case LoaderEventType.NodeBeginEvaluatingScript:
					mark(nodeEval, stat);
					break;
				case LoaderEventType.NodeEndEvaluatingScript:
					diff(nodeEval, stat);
					break;
			}
		}

		function toObject(map: Map<string, any>): { [name: string]: any } {
			const result = Object.create(null);
			map.forEach((value, index) => result[index] = value);
			return result;
		}

		let nodeRequireTotal = 0;
		nodeRequire.forEach(value => nodeRequireTotal += value.duration);

		return {
			amdLoad: toObject(amdLoad),
			amdInvoke: toObject(amdInvoke),
			nodeRequire: toObject(nodeRequire),
			nodeEval: toObject(nodeEval),
			nodeRequireTotal
		};
	}

	constructor(public duration: number, public seq: number) { }
}

export class ShowStartupPerformance extends Action {

	static readonly ID = 'workbench.action.appPerf';
	static readonly LABEL = nls.localize('appPerf', "Startup Performance");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@ITimerService private timerService: ITimerService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {

		// Show dev tools
		this.windowService.openDevTools();

		Promise.all([
			timeout(1000), // needed to print a table
			this.timerService.startupMetrics
		]).then(([, metrics]) => {

			console.group('Startup Performance Measurement');
			console.log(`OS: ${metrics.platform}(${metrics.release})`);
			console.log(`CPUs: ${metrics.cpus.model}(${metrics.cpus.count} x ${metrics.cpus.speed})`);
			console.log(`Memory(System): ${(metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)} GB(${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free)`);
			console.log(`Memory(Process): ${(metrics.meminfo.workingSetSize / 1024).toFixed(2)} MB working set(${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared)`);
			console.log(`VM(likelyhood): ${metrics.isVMLikelyhood}% `);

			console.log(`Initial Startup: ${metrics.initialStartup} `);
			console.log(`Has ${metrics.windowCount - 1} other windows`);
			console.log(`Screen Reader Active: ${metrics.hasAccessibilitySupport} `);
			console.log(`Empty Workspace: ${metrics.emptyWorkbench} `);


			const loaderStats = this.environmentService.performance && LoaderStat.getLoaderStats();

			console.table(Info.getTimerInfo(metrics, loaderStats && loaderStats.nodeRequireTotal));

			if (loaderStats) {
				for (const key in loaderStats) {
					console.groupCollapsed(`Loader: ${key} `);
					console.table(loaderStats[key]);
					console.groupEnd();
				}
			}

			console.groupEnd();

			console.group('Extension Activation Stats');
			let extensionsActivationTimes: { [id: string]: ActivationTimes; } = {};
			let extensionsStatus = this.extensionService.getExtensionsStatus();
			for (let id in extensionsStatus) {
				const status = extensionsStatus[id];
				if (status.activationTimes) {
					extensionsActivationTimes[id] = status.activationTimes;
				}
			}
			console.table(extensionsActivationTimes);
			console.groupEnd();

			console.group('Raw Startup Timers (CSV)');
			let value = `Name\tStart\n`;
			let entries = getEntries('mark');
			for (const entry of entries) {
				value += `${entry.name} \t${entry.startTime} \n`;
			}
			console.log(value);
			console.groupEnd();
		});

		return Promise.resolve(true);
	}
}


// NOTE: This is still used when running --prof-startup, which already opens a dialog, so the reporter is not used.
export class ReportPerformanceIssueAction extends Action {

	static readonly ID = 'workbench.action.reportPerformanceIssue';
	static readonly LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IIntegrityService private integrityService: IIntegrityService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITimerService private timerService: ITimerService
	) {
		super(id, label);
	}

	run(appendix?: string): Promise<boolean> {
		Promise.all([
			this.timerService.startupMetrics,
			this.integrityService.isPure()
		]).then(([metrics, integrity]) => {
			const issueUrl = this.generatePerformanceIssueUrl(metrics, product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, integrity.isPure, appendix);

			window.open(issueUrl);
		});

		return Promise.resolve(true);
	}

	private generatePerformanceIssueUrl(metrics: IStartupMetrics, baseUrl: string, name: string, version: string, _commit: string, _date: string, isPure: boolean, appendix?: string): string {

		if (!appendix) {
			appendix = `Additional Steps to Reproduce(if any):

	1.
2.`;
		}

		let nodeModuleLoadTime: number;
		if (this.environmentService.performance) {
			nodeModuleLoadTime = LoaderStat.getLoaderStats().nodeRequireTotal;
		}


		const osVersion = `${os.type()} ${os.arch()} ${os.release()}`;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
		const body = encodeURIComponent(
			`- VSCode Version: <code>${name} ${version} ${isPure ? '' : ' **[Unsupported]**'} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})</code>
- OS Version: <code>${ osVersion} </code>
- CPUs: <code>${ metrics.cpus.model} (${metrics.cpus.count} x ${metrics.cpus.speed})</code>
- Memory(System): <code>${ (metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)} GB(${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free) </code>
- Memory(Process): <code>${ (metrics.meminfo.workingSetSize / 1024).toFixed(2)} MB working set(${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared) </code>
- Load(avg): <code>${ metrics.loadavg.map(l => Math.round(l)).join(', ')} </code>
- VM: <code>${ metrics.isVMLikelyhood}% </code>
- Initial Startup: <code>${ metrics.initialStartup ? 'yes' : 'no'} </code>
- Screen Reader: <code>${ metrics.hasAccessibilitySupport ? 'yes' : 'no'} </code>
- Empty Workspace: <code>${ metrics.emptyWorkbench ? 'yes' : 'no'} </code>
- Timings:

${this.generatePerformanceTable(metrics, nodeModuleLoadTime)}
---

${appendix}`);

		return `${baseUrl}${queryStringPrefix}body=${body}`;
	}

	private generatePerformanceTable(metrics: IStartupMetrics, nodeModuleLoadTime?: number): string {
		let tableHeader = `| Component | Task | Duration(ms) | Info |
| ---| ---| ---| ---| `;

		let table = '';
		forEach(Info.getTimerInfo(metrics, nodeModuleLoadTime), e => {
			table += `| ${e.value.process}| ${e.key}| ${e.value.duration}| ${e.value.info}|\n`;
		});

		return `${tableHeader} \n${table} `;
	}
}

Registry
	.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(ShowStartupPerformance, ShowStartupPerformance.ID, ShowStartupPerformance.LABEL), 'Developer: Startup Performance', nls.localize('developer', "Developer"));
