/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ITextModel } from 'vs/editor/common/model';
import { ITextEditorModel } from 'vs/workbench/common/editor';
import { ILifecycleService, LifecyclePhase, StartupKindToString } from 'vs/platform/lifecycle/common/lifecycle';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITimerService, IStartupMetrics } from 'vs/workbench/services/timer/electron-browser/timerService';
import { repeat } from 'vs/base/common/strings';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import * as perf from 'vs/base/common/performance';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { writeTransientState } from 'vs/workbench/parts/codeEditor/electron-browser/toggleWordWrap';

export class PerfviewInput extends ResourceEditorInput {

	static readonly Id = 'PerfviewInput';
	static readonly Uri = URI.from({ scheme: 'perf', path: 'Startup Performance' });

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private _textModelResolverService: ITextModelService,
		@IHashService hashService: IHashService
	) {
		super(
			localize('name', "Startup Performance"),
			undefined,
			PerfviewInput.Uri,
			_textModelResolverService, hashService
		);
	}

	getTypeId(): string {
		return PerfviewInput.Id;
	}

	resolve(): Promise<ITextEditorModel> {
		if (!this._textModelResolverService.hasTextModelContentProvider(PerfviewInput.Uri.scheme)) {
			this._textModelResolverService.registerTextModelContentProvider(PerfviewInput.Uri.scheme, this._instaService.createInstance(PerfModelContentProvider));
		}
		return super.resolve();
	}
}

class PerfModelContentProvider implements ITextModelContentProvider {

	private _model: ITextModel | undefined;
	private _modelDisposables: IDisposable[] = [];

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@IModeService private readonly _modeService: IModeService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ITimerService private readonly _timerService: ITimerService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) { }

	provideTextContent(resource: URI): Promise<ITextModel> {

		if (!this._model) {
			dispose(this._modelDisposables);
			const langId = this._modeService.create('markdown');
			this._model = this._modelService.getModel(resource) || this._modelService.createModel('Loading...', langId, resource);

			this._modelDisposables.push(langId.onDidChange(e => this._model.setMode(e)));
			this._modelDisposables.push(langId);
			this._modelDisposables.push(this._extensionService.onDidChangeExtensionsStatus(this._updateModel, this));

			writeTransientState(this._model, { forceWordWrap: 'off', forceWordWrapMinified: false }, this._editorService);
		}
		this._updateModel();
		return Promise.resolve(this._model);
	}

	private _updateModel(): void {


		Promise.all([
			this._timerService.startupMetrics,
			this._lifecycleService.when(LifecyclePhase.Eventually),
			this._extensionService.whenInstalledExtensionsRegistered()
		]).then(([metrics]) => {
			if (!this._model.isDisposed()) {
				let md = new MarkdownBuilder();
				this._addSummary(md, metrics);
				md.blank();
				this._addSummaryTable(md, metrics);
				md.blank();
				this._addExtensionsTable(md);
				md.blank();
				this._addRawPerfMarks(md);
				this._model.setValue(md.value);
			}
		});

	}

	private _addSummary(md: MarkdownBuilder, metrics: IStartupMetrics): void {
		md.heading(2, 'System Info');
		md.li(`OS: ${metrics.platform}(${metrics.release})`);
		md.li(`CPUs: ${metrics.cpus.model}(${metrics.cpus.count} x ${metrics.cpus.speed})`);
		md.li(`Memory(System): ${(metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)} GB(${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free)`);
		md.li(`Memory(Process): ${(metrics.meminfo.workingSetSize / 1024).toFixed(2)} MB working set(${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared)`);
		md.li(`VM(likelyhood): ${metrics.isVMLikelyhood}%`);
		md.li(`Initial Startup: ${metrics.initialStartup}`);
		md.li(`Has ${metrics.windowCount - 1} other windows`);
		md.li(`Screen Reader Active: ${metrics.hasAccessibilitySupport}`);
		md.li(`Empty Workspace: ${metrics.emptyWorkbench}`);
	}

	private _addSummaryTable(md: MarkdownBuilder, metrics: IStartupMetrics, nodeModuleLoadTime?: number): void {

		const table: (string | number)[][] = [];
		table.push(['start => app.isReady', metrics.timers.ellapsedAppReady, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['nls:start => nls:end', metrics.timers.ellapsedNlsGeneration, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['app.isReady => window.loadUrl()', metrics.timers.ellapsedWindowLoad, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['require & init global storage', metrics.timers.ellapsedGlobalStorageInitMain, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['window.loadUrl() => begin to require(workbench.main.js)', metrics.timers.ellapsedWindowLoadToRequire, '[main->renderer]', StartupKindToString(metrics.windowKind)]);
		table.push(['require(workbench.main.js)', metrics.timers.ellapsedRequire, '[renderer]', `cached data: ${(metrics.didUseCachedData ? 'YES' : 'NO')}${nodeModuleLoadTime ? `, node_modules took ${nodeModuleLoadTime}ms` : ''}`]);
		table.push(['init global storage', metrics.timers.ellapsedGlobalStorageInitRenderer, '[renderer]', undefined]);
		table.push(['require workspace storage', metrics.timers.ellapsedWorkspaceStorageRequire, '[renderer]', undefined]);
		table.push(['require & init workspace storage', metrics.timers.ellapsedWorkspaceStorageInit, '[renderer]', undefined]);
		table.push(['init workspace service', metrics.timers.ellapsedWorkspaceServiceInit, '[renderer]', undefined]);
		table.push(['register extensions & spawn extension host', metrics.timers.ellapsedExtensions, '[renderer]', undefined]);
		table.push(['restore viewlet', metrics.timers.ellapsedViewletRestore, '[renderer]', metrics.viewletId]);
		table.push(['restore panel', metrics.timers.ellapsedPanelRestore, '[renderer]', metrics.panelId]);
		table.push(['restore editors', metrics.timers.ellapsedEditorRestore, '[renderer]', `${metrics.editorIds.length}: ${metrics.editorIds.join(', ')}`]);
		table.push(['overall workbench load', metrics.timers.ellapsedWorkbench, '[renderer]', undefined]);
		table.push(['workbench ready', metrics.ellapsed, '[main->renderer]', undefined]);
		table.push(['extensions registered', metrics.timers.ellapsedExtensionsReady, '[renderer]', undefined]);

		md.heading(2, 'Performance Marks');
		md.table(['What', 'Duration', 'Process', 'Info'], table);
	}

	private _addExtensionsTable(md: MarkdownBuilder): void {

		const table: ({ toString(): string })[][] = [];
		let extensionsStatus = this._extensionService.getExtensionsStatus();
		for (let id in extensionsStatus) {
			const { activationTimes: times } = extensionsStatus[id];
			if (!times) {
				continue;
			}
			table.push([id, times.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationEvent]);
		}
		if (table.length > 0) {
			md.heading(2, 'Extension Activation Stats');
			md.table(
				['Extension', 'Eager', 'Load Code', 'Call Activate', 'Finish Activate', 'Event'],
				table
			);
		}
	}

	private _addRawPerfMarks(md: MarkdownBuilder): void {
		md.heading(2, 'Raw Perf Marks');
		md.value += '```\n';
		for (const { name, startTime } of perf.getEntries('mark')) {
			md.value += `${name}\t${startTime}\n`;
		}
		md.value += '```\n';
	}
}

class MarkdownBuilder {

	value: string = '';

	heading(level: number, value: string): this {
		this.value += `${repeat('#', level)} ${value}\n\n`;
		return this;
	}

	blank() {
		this.value += '\n';
		return this;
	}

	li(value: string) {
		this.value += `* ${value}\n`;
		return this;
	}

	table(header: string[], rows: { toString() }[][]) {
		let lengths: number[] = [];
		header.forEach((cell, ci) => {
			lengths[ci] = cell.length;
		});
		rows.forEach(row => {
			row.forEach((cell, ci) => {
				if (!cell) {
					cell = row[ci] = '-';
				}
				const len = cell.toString().length;
				lengths[ci] = Math.max(len, lengths[ci]);
			});
		});

		// header
		header.forEach((cell, ci) => { this.value += `| ${cell + repeat(' ', lengths[ci] - cell.toString().length)} `; });
		this.value += '|\n';
		header.forEach((_cell, ci) => { this.value += `| ${repeat('-', lengths[ci])} `; });
		this.value += '|\n';

		// cells
		rows.forEach(row => {
			row.forEach((cell, ci) => {
				this.value += `| ${cell + repeat(' ', lengths[ci] - cell.toString().length)} `;
			});
			this.value += '|\n';
		});

	}
}
