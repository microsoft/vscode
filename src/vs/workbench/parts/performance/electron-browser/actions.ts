/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
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
import { StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { forEach } from 'vs/base/common/collections';

/* Copied from loader.ts */
enum LoaderEventType {
	LoaderAvailable = 1,

	BeginLoadingScript = 10,
	EndLoadingScriptOK = 11,
	EndLoadingScriptError = 12,

	BeginInvokeFactory = 21,
	EndInvokeFactory = 22,

	NodeBeginEvaluatingScript = 31,
	NodeEndEvaluatingScript = 32,

	NodeBeginNativeRequire = 33,
	NodeEndNativeRequire = 34
}

interface ILoaderEvent {
	type: LoaderEventType;
	timestamp: number;
	detail: string;
}


class Info {

	static getTimerInfo(metrics: IStartupMetrics, nodeModuleLoadTime?: number): { [name: string]: Info } {
		const table: { [name: string]: Info } = Object.create(null);
		table['start => app.isReady'] = new Info(metrics.timers.ellapsedAppReady, '[main]', metrics.initialStartup);
		table['nls:start => nls:end'] = new Info(metrics.timers.ellapsedNlsGeneration, '[main]', metrics.initialStartup);
		table['app.isReady => window.loadUrl()'] = new Info(metrics.timers.ellapsedWindowLoad, '[main]', metrics.initialStartup);

		table['window.loadUrl() => begin to require(workbench.main.js)'] = new Info(metrics.timers.ellapsedWindowLoadToRequire, '[main->renderer]', StartupKind[metrics.windowKind]);
		table['require(workbench.main.js)'] = new Info(metrics.timers.ellapsedRequire, '[renderer]', `cached data: ${(metrics.didUseCachedData ? 'YES' : 'NO')}${nodeModuleLoadTime ? `, node_modules took ${nodeModuleLoadTime}ms` : ''}`);

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

	run(): TPromise<boolean> {

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

			let nodeModuleLoadTime: number;
			if (this.environmentService.performance) {
				const nodeModuleTimes = this.analyzeNodeModulesLoadTimes();
				nodeModuleLoadTime = nodeModuleTimes.duration;
			}

			console.table(Info.getTimerInfo(metrics, nodeModuleLoadTime));

			if (this.environmentService.performance) {
				const data = this.analyzeLoaderStats();
				for (let type in data) {
					console.groupCollapsed(`Loader: ${type} `);
					console.table(data[type]);
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

		return TPromise.as(true);
	}

	private analyzeNodeModulesLoadTimes(): { table: any[], duration: number } {
		const stats = <ILoaderEvent[]>(<any>require).getStats();
		const result = [];

		let total = 0;

		for (let i = 0, len = stats.length; i < len; i++) {
			if (stats[i].type === LoaderEventType.NodeEndNativeRequire) {
				if (stats[i - 1].type === LoaderEventType.NodeBeginNativeRequire && stats[i - 1].detail === stats[i].detail) {
					const entry: any = {};
					const dur = (stats[i].timestamp - stats[i - 1].timestamp);
					entry['Event'] = 'nodeRequire ' + stats[i].detail;
					entry['Took (ms)'] = dur.toFixed(2);
					total += dur;
					entry['Start (ms)'] = '**' + stats[i - 1].timestamp.toFixed(2);
					entry['End (ms)'] = '**' + stats[i - 1].timestamp.toFixed(2);
					result.push(entry);
				}
			}
		}

		if (total > 0) {
			result.push({ Event: '------------------------------------------------------' });

			const entry: any = {};
			entry['Event'] = '[renderer] total require() node_modules';
			entry['Took (ms)'] = total.toFixed(2);
			entry['Start (ms)'] = '**';
			entry['End (ms)'] = '**';
			result.push(entry);
		}

		return { table: result, duration: Math.round(total) };
	}

	private analyzeLoaderStats(): { [type: string]: any[] } {
		const stats = <ILoaderEvent[]>(<any>require).getStats().slice(0).sort((a: ILoaderEvent, b: ILoaderEvent) => {
			if (a.detail < b.detail) {
				return -1;
			} else if (a.detail > b.detail) {
				return 1;
			} else if (a.type < b.type) {
				return -1;
			} else if (a.type > b.type) {
				return 1;
			} else {
				return 0;
			}
		});

		class Tick {

			readonly duration: number;
			readonly detail: string;

			constructor(private readonly start: ILoaderEvent, private readonly end: ILoaderEvent) {
				console.assert(start.detail === end.detail);

				this.duration = this.end.timestamp - this.start.timestamp;
				this.detail = start.detail;
			}

			toTableObject() {
				return {
					['Path']: this.start.detail,
					['Took (ms)']: this.duration.toFixed(2),
					// ['Start (ms)']: this.start.timestamp,
					// ['End (ms)']: this.end.timestamp
				};
			}

			static compareUsingStartTimestamp(a: Tick, b: Tick): number {
				if (a.start.timestamp < b.start.timestamp) {
					return -1;
				} else if (a.start.timestamp > b.start.timestamp) {
					return 1;
				} else {
					return 0;
				}
			}
		}

		const ticks: { [type: number]: Tick[] } = {
			[LoaderEventType.BeginLoadingScript]: [],
			[LoaderEventType.BeginInvokeFactory]: [],
			[LoaderEventType.NodeBeginEvaluatingScript]: [],
			[LoaderEventType.NodeBeginNativeRequire]: [],
		};

		for (let i = 1; i < stats.length - 1; i++) {
			const stat = stats[i];
			const nextStat = stats[i + 1];

			if (nextStat.type - stat.type > 2) {
				//bad?!
				break;
			}

			i += 1;
			if (ticks[stat.type]) {
				ticks[stat.type].push(new Tick(stat, nextStat));
			}
		}

		ticks[LoaderEventType.BeginInvokeFactory].sort(Tick.compareUsingStartTimestamp);
		ticks[LoaderEventType.BeginInvokeFactory].sort(Tick.compareUsingStartTimestamp);
		ticks[LoaderEventType.NodeBeginEvaluatingScript].sort(Tick.compareUsingStartTimestamp);
		ticks[LoaderEventType.NodeBeginNativeRequire].sort(Tick.compareUsingStartTimestamp);

		const ret = {
			'Load Script': ticks[LoaderEventType.BeginLoadingScript].map(t => t.toTableObject()),
			'(Node) Load Script': ticks[LoaderEventType.NodeBeginNativeRequire].map(t => t.toTableObject()),
			'Eval Script': ticks[LoaderEventType.BeginInvokeFactory].map(t => t.toTableObject()),
			'(Node) Eval Script': ticks[LoaderEventType.NodeBeginEvaluatingScript].map(t => t.toTableObject()),
		};

		function total(ticks: Tick[]): number {
			let sum = 0;
			for (const tick of ticks) {
				sum += tick.duration;
			}
			return sum;
		}

		// totals
		ret['Load Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.BeginLoadingScript]).toFixed(2)
		});
		ret['Eval Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.BeginInvokeFactory]).toFixed(2)
		});
		ret['(Node) Load Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.NodeBeginNativeRequire]).toFixed(2)
		});
		ret['(Node) Eval Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.NodeBeginEvaluatingScript]).toFixed(2)
		});

		return ret;
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

	run(appendix?: string): TPromise<boolean> {
		Promise.all([
			this.timerService.startupMetrics,
			this.integrityService.isPure()
		]).then(([metrics, integrity]) => {
			const issueUrl = this.generatePerformanceIssueUrl(metrics, product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, integrity.isPure, appendix);

			window.open(issueUrl);
		});

		return TPromise.wrap(true);
	}

	private generatePerformanceIssueUrl(metrics: IStartupMetrics, baseUrl: string, name: string, version: string, _commit: string, _date: string, isPure: boolean, appendix?: string): string {

		if (!appendix) {
			appendix = `Additional Steps to Reproduce(if any):

	1.
2.`;
		}

		let nodeModuleLoadTime: number;
		if (this.environmentService.performance) {
			nodeModuleLoadTime = this.computeNodeModulesLoadTime();
		}


		const osVersion = `${os.type()} ${os.arch()} ${os.release()} `;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
		const body = encodeURIComponent(
			`- VSCode Version: <code>${name} ${version} ${isPure ? '' : ' **[Unsupported]**'} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})</code>
	- OS Version: <code>${ osVersion} </code>
		- CPUs: <code>${ metrics.cpus.model} (${metrics.cpus.count} x ${metrics.cpus.speed})</code>
			- Memory(System): <code>${ (metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)} GB(${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free) < /code>
				- Memory(Process): <code>${ (metrics.meminfo.workingSetSize / 1024).toFixed(2)} MB working set(${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared) < /code>
					- Load(avg): <code>${ metrics.loadavg.map(l => Math.round(l)).join(', ')} </code>
						- VM: <code>${ metrics.isVMLikelyhood}% </code>
							- Initial Startup: <code>${ metrics.initialStartup ? 'yes' : 'no'} </code>
								- Screen Reader: <code>${ metrics.hasAccessibilitySupport ? 'yes' : 'no'} </code>
									- Empty Workspace: <code>${ metrics.emptyWorkbench ? 'yes' : 'no'} </code>
										- Timings:

${ this.generatePerformanceTable(metrics, nodeModuleLoadTime)}

---

	${ appendix} `
		);

		return `${baseUrl} ${queryStringPrefix} body = ${body} `;
	}

	private computeNodeModulesLoadTime(): number {
		const stats = <ILoaderEvent[]>(<any>require).getStats();
		let total = 0;

		for (let i = 0, len = stats.length; i < len; i++) {
			if (stats[i].type === LoaderEventType.NodeEndNativeRequire) {
				if (stats[i - 1].type === LoaderEventType.NodeBeginNativeRequire && stats[i - 1].detail === stats[i].detail) {
					const dur = (stats[i].timestamp - stats[i - 1].timestamp);
					total += dur;
				}
			}
		}

		return Math.round(total);
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
