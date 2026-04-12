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
var PerfviewContrib_1, PerfviewInput_1;
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ILifecycleService, StartupKindToString } from '../../../services/lifecycle/common/lifecycle.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { dispose } from '../../../../base/common/lifecycle.js';
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
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, getWorkbenchContribution } from '../../../common/contributions.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
let PerfviewContrib = class PerfviewContrib {
    static { PerfviewContrib_1 = this; }
    static get() {
        return getWorkbenchContribution(PerfviewContrib_1.ID);
    }
    static { this.ID = 'workbench.contrib.perfview'; }
    constructor(_instaService, textModelResolverService) {
        this._instaService = _instaService;
        this._inputUri = URI.from({ scheme: 'perf', path: 'Startup Performance' });
        this._registration = textModelResolverService.registerTextModelContentProvider('perf', _instaService.createInstance(PerfModelContentProvider));
    }
    dispose() {
        this._registration.dispose();
    }
    getInputUri() {
        return this._inputUri;
    }
    getEditorInput() {
        return this._instaService.createInstance(PerfviewInput);
    }
};
PerfviewContrib = PerfviewContrib_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, ITextModelService)
], PerfviewContrib);
export { PerfviewContrib };
let PerfviewInput = class PerfviewInput extends TextResourceEditorInput {
    static { PerfviewInput_1 = this; }
    static { this.Id = 'PerfviewInput'; }
    get typeId() {
        return PerfviewInput_1.Id;
    }
    constructor(textModelResolverService, textFileService, editorService, fileService, labelService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService) {
        super(PerfviewContrib.get().getInputUri(), localize('name', "Startup Performance"), undefined, undefined, undefined, textModelResolverService, textFileService, editorService, fileService, labelService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
    }
};
PerfviewInput = PerfviewInput_1 = __decorate([
    __param(0, ITextModelService),
    __param(1, ITextFileService),
    __param(2, IEditorService),
    __param(3, IFileService),
    __param(4, ILabelService),
    __param(5, IFilesConfigurationService),
    __param(6, ITextResourceConfigurationService),
    __param(7, ICustomEditorLabelService)
], PerfviewInput);
export { PerfviewInput };
let PerfModelContentProvider = class PerfModelContentProvider {
    constructor(_modelService, _languageService, _editorService, _lifecycleService, _timerService, _extensionService, _productService, _remoteAgentService, _terminalService) {
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._editorService = _editorService;
        this._lifecycleService = _lifecycleService;
        this._timerService = _timerService;
        this._extensionService = _extensionService;
        this._productService = _productService;
        this._remoteAgentService = _remoteAgentService;
        this._terminalService = _terminalService;
        this._modelDisposables = [];
    }
    provideTextContent(resource) {
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
    _updateModel() {
        Promise.all([
            this._timerService.whenReady(),
            this._lifecycleService.when(4 /* LifecyclePhase.Eventually */),
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
    _addSummary(md) {
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
    _addSummaryTable(md) {
        const metrics = this._timerService.startupMetrics;
        const contribTimings = Registry.as(WorkbenchExtensions.Workbench).timings;
        const table = [];
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
        table.push(['create workbench contributions', metrics.timers.ellapsedWorkbenchContributions, '[renderer]', `${(contribTimings.get(1 /* LifecyclePhase.Starting */)?.length ?? 0) + (contribTimings.get(2 /* LifecyclePhase.Ready */)?.length ?? 0)} blocking startup`]);
        table.push(['overall workbench load', metrics.timers.ellapsedWorkbench, '[renderer]', undefined]);
        table.push(['workbench ready', metrics.ellapsed, '[main->renderer]', undefined]);
        table.push(['renderer ready', metrics.timers.ellapsedRenderer, '[renderer]', undefined]);
        table.push(['shared process connection ready', metrics.timers.ellapsedSharedProcesConnected, '[renderer->sharedprocess]', undefined]);
        table.push(['extensions registered', metrics.timers.ellapsedExtensionsReady, '[renderer]', undefined]);
        md.heading(2, 'Performance Marks');
        md.table(['What', 'Duration', 'Process', 'Info'], table);
    }
    _addExtensionsTable(md) {
        const eager = [];
        const normal = [];
        const extensionsStatus = this._extensionService.getExtensionsStatus();
        for (const id in extensionsStatus) {
            const { activationTimes: times } = extensionsStatus[id];
            if (!times) {
                continue;
            }
            if (times.activationReason.startup) {
                eager.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
            }
            else {
                normal.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
            }
        }
        const table = eager.concat(normal);
        if (table.length > 0) {
            md.heading(2, 'Extension Activation Stats');
            md.table(['Extension', 'Eager', 'Load Code', 'Call Activate', 'Finish Activate', 'Event', 'By'], table);
        }
    }
    _addPerfMarksTable(name, md, marks) {
        if (!marks) {
            return;
        }
        const table = [];
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
    _addWorkbenchContributionsPerfMarksTable(md) {
        md.heading(2, 'Workbench Contributions Blocking Restore');
        const timings = Registry.as(WorkbenchExtensions.Workbench).timings;
        md.li(`Total (LifecyclePhase.Starting): ${timings.get(1 /* LifecyclePhase.Starting */)?.length} (${timings.get(1 /* LifecyclePhase.Starting */)?.reduce((p, c) => p + c[1], 0)}ms)`);
        md.li(`Total (LifecyclePhase.Ready): ${timings.get(2 /* LifecyclePhase.Ready */)?.length} (${timings.get(2 /* LifecyclePhase.Ready */)?.reduce((p, c) => p + c[1], 0)}ms)`);
        md.blank();
        const marks = this._timerService.getPerformanceMarks().find(e => e[0] === 'renderer')?.[1].filter(e => e.name.startsWith('code/willCreateWorkbenchContribution/1') ||
            e.name.startsWith('code/didCreateWorkbenchContribution/1') ||
            e.name.startsWith('code/willCreateWorkbenchContribution/2') ||
            e.name.startsWith('code/didCreateWorkbenchContribution/2'));
        this._addPerfMarksTable(undefined, md, marks);
    }
    _addRawPerfMarks(md) {
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
    _addResourceTimingStats(md) {
        const stats = performance.getEntriesByType('resource').map(entry => {
            return [entry.name, entry.duration];
        });
        if (!stats.length) {
            return;
        }
        md.heading(2, 'Resource Timing Stats');
        md.table(['Name', 'Duration'], stats);
    }
};
PerfModelContentProvider = __decorate([
    __param(0, IModelService),
    __param(1, ILanguageService),
    __param(2, ICodeEditorService),
    __param(3, ILifecycleService),
    __param(4, ITimerService),
    __param(5, IExtensionService),
    __param(6, IProductService),
    __param(7, IRemoteAgentService),
    __param(8, ITerminalService)
], PerfModelContentProvider);
class MarkdownBuilder {
    constructor() {
        this.value = '';
    }
    heading(level, value) {
        this.value += `${'#'.repeat(level)} ${value}\n\n`;
        return this;
    }
    blank() {
        this.value += '\n';
        return this;
    }
    li(value) {
        this.value += `* ${value}\n`;
        return this;
    }
    table(header, rows) {
        this.value += this.toMarkdownTable(header, rows);
    }
    toMarkdownTable(header, rows) {
        let result = '';
        const lengths = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyZnZpZXdFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wZXJmb3JtYW5jZS9icm93c2VyL3BlcmZ2aWV3RWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxpQkFBaUIsRUFBNkIsTUFBTSx1REFBdUQsQ0FBQztBQUVySCxPQUFPLEVBQUUsaUJBQWlCLEVBQWtCLG1CQUFtQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQWUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xGLE9B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