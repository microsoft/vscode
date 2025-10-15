/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { ITextModelService, ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILifecycleService, LifecyclePhase, StartupKindToString } from '../../../services/lifecycle/common/lifecycle.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { writeTransientState } from '../../codeEditor/browser/toggleWordWrap.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ByteSize, IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import * as perf from '../../../../base/common/performance.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, getWorkbenchContribution } from '../../../common/contributions.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';

export class PerfviewContrib {

	static get() {
		return getWorkbenchContribution<PerfviewContrib>(PerfviewContrib.ID);
	}

	static readonly ID = 'workbench.contrib.perfview';

	private readonly _inputUri = URI.from({ scheme: 'perf', path: 'Startup Performance' });
	private readonly _registration: IDisposable;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		this._registration = textModelResolverService.registerTextModelContentProvider('perf', _instaService.createInstance(PerfModelContentProvider));
	}

	dispose(): void {
		this._registration.dispose();
	}

	getInputUri(): URI {
		return this._inputUri;
	}

	getEditorInput(): PerfviewInput {
		return this._instaService.createInstance(PerfviewInput);
	}
}

export class PerfviewInput extends TextResourceEditorInput {

	static readonly Id = 'PerfviewInput';

	override get typeId(): string {
		return PerfviewInput.Id;
	}

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService
	) {
		super(
			PerfviewContrib.get().getInputUri(),
			localize('name', "Startup Performance"),
			undefined,
			undefined,
			undefined,
			textModelResolverService,
			textFileService,
			editorService,
			fileService,
			labelService,
			filesConfigurationService,
			textResourceConfigurationService,
			customEditorLabelService
		);
	}
}

class PerfModelContentProvider implements ITextModelContentProvider {

	private _model: ITextModel | undefined;
	private _modelDisposables: IDisposable[] = [];

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ITimerService private readonly _timerService: ITimerService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IProductService private readonly _productService: IProductService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) { }

	provideTextContent(resource: URI): Promise<ITextModel> {

		if (!this._model || this._model.isDisposed()) {
			dispose(this._modelDisposables);
			const langId = this._languageService.createById('markdown');
			this._model = this._modelService.getModel(resource) || this._modelService.createModel('Loading...', langId, resource);

			this._modelDisposables.push(langId.onDidChange(e => {
				this._model?.setLanguage(e);
			}));
			this._modelDisposables.push(this._extensionService.onDidChangeExtensionsStatus(this._updateModel, this));

			writeTransientState(this._model, { wordWrapOverride: 'off' }, this._editorService);
		}
		this._updateModel();
		return Promise.resolve(this._model);
	}

	private _updateModel(): void {

		Promise.all([
			this._timerService.whenReady(),
			this._lifecycleService.when(LifecyclePhase.Eventually),
			this._extensionService.whenInstalledExtensionsRegistered(),
			// The terminal service never connects to the pty host on the web
			isWeb && !this._remoteAgentService.getConnection()?.remoteAuthority ? Promise.resolve() : this._terminalService.whenConnected
		]).then(() => {
			if (this._model && !this._model.isDisposed()) {

				const md = new MarkdownBuilder();
				this._addSummary(md);
				md.blank();
				this._addSummaryTable(md);
				md.blank();
				this._addExtensionsTable(md);
				md.blank();
				this._addPerfMarksTable('Terminal Stats', md, this._timerService.getPerformanceMarks().find(e => e[0] === 'renderer')?.[1].filter(e => e.name.startsWith('code/terminal/')));
				md.blank();
				this._addWorkbenchContributionsPerfMarksTable(md);
				md.blank();
				this._addRawPerfMarks(md);
				md.blank();
				this._addResourceTimingStats(md);

				this._model.setValue(md.value);
			}
		});

	}

	private _addSummary(md: MarkdownBuilder): void {
		const metrics = this._timerService.startupMetrics;
		md.heading(2, 'System Info');
		md.li(`${this._productService.nameShort}: ${this._productService.version} (${this._productService.commit || '0000000'})`);
		md.li(`OS: ${metrics.platform}(${metrics.release})`);
		if (metrics.cpus) {
			md.li(`CPUs: ${metrics.cpus.model}(${metrics.cpus.count} x ${metrics.cpus.speed})`);
		}
		if (typeof metrics.totalmem === 'number' && typeof metrics.freemem === 'number') {
			md.li(`Memory(System): ${(metrics.totalmem / (ByteSize.GB)).toFixed(2)} GB(${(metrics.freemem / (ByteSize.GB)).toFixed(2)}GB free)`);
		}
		if (metrics.meminfo) {
			md.li(`Memory(Process): ${(metrics.meminfo.workingSetSize / ByteSize.KB).toFixed(2)} MB working set(${(metrics.meminfo.privateBytes / ByteSize.KB).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / ByteSize.KB).toFixed(2)}MB shared)`);
		}
		md.li(`VM(likelihood): ${metrics.isVMLikelyhood}%`);
		md.li(`Initial Startup: ${metrics.initialStartup}`);
		md.li(`Has ${metrics.windowCount - 1} other windows`);
		md.li(`Screen Reader Active: ${metrics.hasAccessibilitySupport}`);
		md.li(`Empty Workspace: ${metrics.emptyWorkbench}`);
	}

	private _addSummaryTable(md: MarkdownBuilder): void {

		const metrics = this._timerService.startupMetrics;
		const contribTimings = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).timings;

		const table: Array<Array<string | number | undefined>> = [];
		table.push(['import(main.js)', metrics.timers.ellapsedLoadMainBundle, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['start => app.isReady', metrics.timers.ellapsedAppReady, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['nls:start => nls:end', metrics.timers.ellapsedNlsGeneration, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['run main.js', metrics.timers.ellapsedRunMainBundle, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['start crash reporter', metrics.timers.ellapsedCrashReporter, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['serve main IPC handle', metrics.timers.ellapsedMainServer, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['create window', metrics.timers.ellapsedWindowCreate, '[main]', `initial startup: ${metrics.initialStartup}, ${metrics.initialStartup ? `state: ${metrics.timers.ellapsedWindowRestoreState}ms, widget: ${metrics.timers.ellapsedBrowserWindowCreate}ms, show: ${metrics.timers.ellapsedWindowMaximize}ms` : ''}`]);
		table.push(['app.isReady => window.loadUrl()', metrics.timers.ellapsedWindowLoad, '[main]', `initial startup: ${metrics.initialStartup}`]);
		table.push(['window.loadUrl() => begin to import(workbench.desktop.main.js)', metrics.timers.ellapsedWindowLoadToRequire, '[main->renderer]', StartupKindToString(metrics.windowKind)]);
		table.push(['import(workbench.desktop.main.js)', metrics.timers.ellapsedRequire, '[renderer]', `cached data: ${(metrics.didUseCachedData ? 'YES' : 'NO')}`]);
		table.push(['wait for window config', metrics.timers.ellapsedWaitForWindowConfig, '[renderer]', undefined]);
		table.push(['init storage (global & workspace)', metrics.timers.ellapsedStorageInit, '[renderer]', undefined]);
		table.push(['init workspace service', metrics.timers.ellapsedWorkspaceServiceInit, '[renderer]', undefined]);
		if (isWeb) {
			table.push(['init settings and global state from settings sync service', metrics.timers.ellapsedRequiredUserDataInit, '[renderer]', undefined]);
			table.push(['init keybindings, snippets & extensions from settings sync service', metrics.timers.ellapsedOtherUserDataInit, '[renderer]', undefined]);
		}
		table.push(['register extensions & spawn extension host', metrics.timers.ellapsedExtensions, '[renderer]', undefined]);
		table.push(['restore primary viewlet', metrics.timers.ellapsedViewletRestore, '[renderer]', metrics.viewletId]);
		table.push(['restore secondary viewlet', metrics.timers.ellapsedAuxiliaryViewletRestore, '[renderer]', metrics.auxiliaryViewletId]);
		table.push(['restore panel', metrics.timers.ellapsedPanelRestore, '[renderer]', metrics.panelId]);
		table.push(['restore & resolve visible editors', metrics.timers.ellapsedEditorRestore, '[renderer]', `${metrics.editorIds.length}: ${metrics.editorIds.join(', ')}`]);
		table.push(['create workbench contributions', metrics.timers.ellapsedWorkbenchContributions, '[renderer]', `${(contribTimings.get(LifecyclePhase.Starting)?.length ?? 0) + (contribTimings.get(LifecyclePhase.Starting)?.length ?? 0)} blocking startup`]);
		table.push(['overall workbench load', metrics.timers.ellapsedWorkbench, '[renderer]', undefined]);
		table.push(['workbench ready', metrics.ellapsed, '[main->renderer]', undefined]);
		table.push(['renderer ready', metrics.timers.ellapsedRenderer, '[renderer]', undefined]);
		table.push(['shared process connection ready', metrics.timers.ellapsedSharedProcesConnected, '[renderer->sharedprocess]', undefined]);
		table.push(['extensions registered', metrics.timers.ellapsedExtensionsReady, '[renderer]', undefined]);

		md.heading(2, 'Performance Marks');
		md.table(['What', 'Duration', 'Process', 'Info'], table);
	}

	private _addExtensionsTable(md: MarkdownBuilder): void {

		const eager: ({ toString(): string })[][] = [];
		const normal: ({ toString(): string })[][] = [];
		const extensionsStatus = this._extensionService.getExtensionsStatus();
		for (const id in extensionsStatus) {
			const { activationTimes: times } = extensionsStatus[id];
			if (!times) {
				continue;
			}
			if (times.activationReason.startup) {
				eager.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
			} else {
				normal.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
			}
		}

		const table = eager.concat(normal);
		if (table.length > 0) {
			md.heading(2, 'Extension Activation Stats');
			md.table(
				['Extension', 'Eager', 'Load Code', 'Call Activate', 'Finish Activate', 'Event', 'By'],
				table
			);
		}
	}

	private _addPerfMarksTable(name: string | undefined, md: MarkdownBuilder, marks: readonly perf.PerformanceMark[] | undefined): void {
		if (!marks) {
			return;
		}
		const table: Array<Array<string | number | undefined>> = [];
		let lastStartTime = -1;
		let total = 0;
		for (const { name, startTime } of marks) {
			const delta = lastStartTime !== -1 ? startTime - lastStartTime : 0;
			total += delta;
			table.push([name, Math.round(startTime), Math.round(delta), Math.round(total)]);
			lastStartTime = startTime;
		}
		if (name) {
			md.heading(2, name);
		}
		md.table(['Name', 'Timestamp', 'Delta', 'Total'], table);
	}

	private _addWorkbenchContributionsPerfMarksTable(md: MarkdownBuilder): void {
		md.heading(2, 'Workbench Contributions Blocking Restore');

		const timings = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).timings;
		md.li(`Total (LifecyclePhase.Starting): ${timings.get(LifecyclePhase.Starting)?.length} (${timings.get(LifecyclePhase.Starting)?.reduce((p, c) => p + c[1], 0)}ms)`);
		md.li(`Total (LifecyclePhase.Ready): ${timings.get(LifecyclePhase.Ready)?.length} (${timings.get(LifecyclePhase.Ready)?.reduce((p, c) => p + c[1], 0)}ms)`);
		md.blank();

		const marks = this._timerService.getPerformanceMarks().find(e => e[0] === 'renderer')?.[1].filter(e =>
			e.name.startsWith('code/willCreateWorkbenchContribution/1') ||
			e.name.startsWith('code/didCreateWorkbenchContribution/1') ||
			e.name.startsWith('code/willCreateWorkbenchContribution/2') ||
			e.name.startsWith('code/didCreateWorkbenchContribution/2')
		);
		this._addPerfMarksTable(undefined, md, marks);
	}

	private _addRawPerfMarks(md: MarkdownBuilder): void {

		for (const [source, marks] of this._timerService.getPerformanceMarks()) {
			md.heading(2, `Raw Perf Marks: ${source}`);
			md.value += '```\n';
			md.value += `Name\tTimestamp\tDelta\tTotal\n`;
			let lastStartTime = -1;
			let total = 0;
			for (const { name, startTime } of marks) {
				const delta = lastStartTime !== -1 ? startTime - lastStartTime : 0;
				total += delta;
				md.value += `${name}\t${startTime}\t${delta}\t${total}\n`;
				lastStartTime = startTime;
			}
			md.value += '```\n';
		}
	}

	private _addResourceTimingStats(md: MarkdownBuilder) {
		const stats = performance.getEntriesByType('resource').map(entry => {
			return [entry.name, entry.duration];
		});
		if (!stats.length) {
			return;
		}
		md.heading(2, 'Resource Timing Stats');
		md.table(['Name', 'Duration'], stats);
	}
}

class MarkdownBuilder {

	value: string = '';

	heading(level: number, value: string): this {
		this.value += `${'#'.repeat(level)} ${value}\n\n`;
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

	table(header: string[], rows: Array<Array<{ toString(): string } | undefined>>) {
		this.value += this.toMarkdownTable(header, rows);
	}

	private toMarkdownTable(header: string[], rows: Array<Array<{ toString(): string } | undefined>>): string {
		let result = '';

		const lengths: number[] = [];
		header.forEach((cell, ci) => {
			lengths[ci] = cell.length;
		});
		rows.forEach(row => {
			row.forEach((cell, ci) => {
				if (typeof cell === 'undefined') {
					cell = row[ci] = '-';
				}
				const len = cell.toString().length;
				lengths[ci] = Math.max(len, lengths[ci]);
			});
		});

		// header
		header.forEach((cell, ci) => { result += `| ${cell + ' '.repeat(lengths[ci] - cell.toString().length)} `; });
		result += '|\n';
		header.forEach((_cell, ci) => { result += `| ${'-'.repeat(lengths[ci])} `; });
		result += '|\n';

		// cells
		rows.forEach(row => {
			row.forEach((cell, ci) => {
				if (typeof cell !== 'undefined') {
					result += `| ${cell + ' '.repeat(lengths[ci] - cell.toString().length)} `;
				}
			});
			result += '|\n';
		});

		return result;
	}
}
