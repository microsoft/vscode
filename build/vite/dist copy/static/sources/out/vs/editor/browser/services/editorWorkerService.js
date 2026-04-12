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
var EditorWorkerService_1;
import { timeout } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { logOnceWebWorkerWarning } from '../../../base/common/worker/webWorker.js';
import { WebWorkerDescriptor } from '../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../platform/webWorker/browser/webWorkerService.js';
import { Range } from '../../common/core/range.js';
import { ILanguageConfigurationService } from '../../common/languages/languageConfigurationRegistry.js';
import { EditorWorker } from '../../common/services/editorWebWorker.js';
import { IModelService } from '../../common/services/model.js';
import { ITextResourceConfigurationService } from '../../common/services/textResourceConfiguration.js';
import { isNonEmptyArray } from '../../../base/common/arrays.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { canceled, onUnexpectedError } from '../../../base/common/errors.js';
import { ILanguageFeaturesService } from '../../common/services/languageFeatures.js';
import { MovedText } from '../../common/diff/linesDiffComputer.js';
import { DetailedLineRangeMapping, RangeMapping, LineRangeMapping } from '../../common/diff/rangeMapping.js';
import { LineRange } from '../../common/core/ranges/lineRange.js';
import { mainWindow } from '../../../base/browser/window.js';
import { WindowIntervalTimer } from '../../../base/browser/dom.js';
import { WorkerTextModelSyncClient } from '../../common/services/textModelSync/textModelSync.impl.js';
import { EditorWorkerHost } from '../../common/services/editorWorkerHost.js';
import { StringEdit } from '../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../common/core/ranges/offsetRange.js';
import { FileAccess } from '../../../base/common/network.js';
import { isCompletionsEnabledWithTextResourceConfig } from '../../common/services/completionsEnablement.js';
/**
 * Stop the worker if it was not needed for 5 min.
 */
const STOP_WORKER_DELTA_TIME_MS = 5 * 60 * 1000;
function canSyncModel(modelService, resource) {
    const model = modelService.getModel(resource);
    if (!model) {
        return false;
    }
    if (model.isTooLargeForSyncing()) {
        return false;
    }
    return true;
}
let EditorWorkerService = class EditorWorkerService extends Disposable {
    static { EditorWorkerService_1 = this; }
    static { this.workerDescriptor = new WebWorkerDescriptor({
        esmModuleLocation: () => FileAccess.asBrowserUri('vs/editor/common/services/editorWebWorkerMain.js'),
        esmModuleLocationBundler: () => new URL('../../common/services/editorWebWorkerMain.ts?esm', import.meta.url),
        label: 'editorWorkerService'
    }); }
    constructor(modelService, configurationService, logService, _languageConfigurationService, languageFeaturesService, _webWorkerService) {
        super();
        this._languageConfigurationService = _languageConfigurationService;
        this._webWorkerService = _webWorkerService;
        this._modelService = modelService;
        this._workerManager = this._register(new WorkerManager(EditorWorkerService_1.workerDescriptor, this._modelService, this._webWorkerService));
        this._logService = logService;
        // register default link-provider and default completions-provider
        this._register(languageFeaturesService.linkProvider.register({ language: '*', hasAccessToAllModels: true }, {
            provideLinks: async (model, token) => {
                if (!canSyncModel(this._modelService, model.uri)) {
                    return Promise.resolve({ links: [] }); // File too large
                }
                const worker = await this._workerWithResources([model.uri]);
                const links = await worker.$computeLinks(model.uri.toString());
                return links && { links };
            }
        }));
        this._register(languageFeaturesService.completionProvider.register('*', new WordBasedCompletionItemProvider(this._workerManager, configurationService, this._modelService, this._languageConfigurationService, this._logService, languageFeaturesService)));
    }
    dispose() {
        super.dispose();
    }
    canComputeUnicodeHighlights(uri) {
        return canSyncModel(this._modelService, uri);
    }
    async computedUnicodeHighlights(uri, options, range) {
        const worker = await this._workerWithResources([uri]);
        return worker.$computeUnicodeHighlights(uri.toString(), options, range);
    }
    async computeDiff(original, modified, options, algorithm) {
        const worker = await this._workerWithResources([original, modified], /* forceLargeModels */ true);
        const result = await worker.$computeDiff(original.toString(), modified.toString(), options, algorithm);
        if (!result) {
            return null;
        }
        // Convert from space efficient JSON data to rich objects.
        const diff = {
            identical: result.identical,
            quitEarly: result.quitEarly,
            changes: toLineRangeMappings(result.changes),
            moves: result.moves.map(m => new MovedText(new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])), toLineRangeMappings(m[4])))
        };
        return diff;
        function toLineRangeMappings(changes) {
            return changes.map((c) => new DetailedLineRangeMapping(new LineRange(c[0], c[1]), new LineRange(c[2], c[3]), c[4]?.map((c) => new RangeMapping(new Range(c[0], c[1], c[2], c[3]), new Range(c[4], c[5], c[6], c[7])))));
        }
    }
    canComputeDirtyDiff(original, modified) {
        return (canSyncModel(this._modelService, original) && canSyncModel(this._modelService, modified));
    }
    async computeDirtyDiff(original, modified, ignoreTrimWhitespace) {
        const worker = await this._workerWithResources([original, modified]);
        return worker.$computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
    }
    async computeMoreMinimalEdits(resource, edits, pretty = false) {
        if (isNonEmptyArray(edits)) {
            if (!canSyncModel(this._modelService, resource)) {
                return Promise.resolve(edits); // File too large
            }
            const sw = StopWatch.create();
            const result = this._workerWithResources([resource]).then(worker => worker.$computeMoreMinimalEdits(resource.toString(), edits, pretty));
            result.finally(() => this._logService.trace('FORMAT#computeMoreMinimalEdits', resource.toString(true), sw.elapsed()));
            return Promise.race([result, timeout(1000).then(() => edits)]);
        }
        else {
            return Promise.resolve(undefined);
        }
    }
    computeHumanReadableDiff(resource, edits) {
        if (isNonEmptyArray(edits)) {
            if (!canSyncModel(this._modelService, resource)) {
                return Promise.resolve(edits); // File too large
            }
            const sw = StopWatch.create();
            const opts = { ignoreTrimWhitespace: false, maxComputationTimeMs: 1000, computeMoves: false };
            const result = (this._workerWithResources([resource])
                .then(worker => worker.$computeHumanReadableDiff(resource.toString(), edits, opts))
                .catch((err) => {
                onUnexpectedError(err);
                // In case of an exception, fall back to computeMoreMinimalEdits
                return this.computeMoreMinimalEdits(resource, edits, true);
            }));
            result.finally(() => this._logService.trace('FORMAT#computeHumanReadableDiff', resource.toString(true), sw.elapsed()));
            return result;
        }
        else {
            return Promise.resolve(undefined);
        }
    }
    async computeStringEditFromDiff(original, modified, options, algorithm) {
        try {
            const worker = await this._workerWithResources([]);
            const edit = await worker.$computeStringDiff(original, modified, options, algorithm);
            return StringEdit.fromJson(edit);
        }
        catch (e) {
            onUnexpectedError(e);
            return StringEdit.replace(OffsetRange.ofLength(original.length), modified); // approximation
        }
    }
    canNavigateValueSet(resource) {
        return (canSyncModel(this._modelService, resource));
    }
    async navigateValueSet(resource, range, up) {
        const model = this._modelService.getModel(resource);
        if (!model) {
            return null;
        }
        const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
        const wordDef = wordDefRegExp.source;
        const wordDefFlags = wordDefRegExp.flags;
        const worker = await this._workerWithResources([resource]);
        return worker.$navigateValueSet(resource.toString(), range, up, wordDef, wordDefFlags);
    }
    canComputeWordRanges(resource) {
        return canSyncModel(this._modelService, resource);
    }
    async computeWordRanges(resource, range) {
        const model = this._modelService.getModel(resource);
        if (!model) {
            return Promise.resolve(null);
        }
        const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
        const wordDef = wordDefRegExp.source;
        const wordDefFlags = wordDefRegExp.flags;
        const worker = await this._workerWithResources([resource]);
        return worker.$computeWordRanges(resource.toString(), range, wordDef, wordDefFlags);
    }
    async findSectionHeaders(uri, options) {
        const worker = await this._workerWithResources([uri]);
        return worker.$findSectionHeaders(uri.toString(), options);
    }
    async computeDefaultDocumentColors(uri) {
        const worker = await this._workerWithResources([uri]);
        return worker.$computeDefaultDocumentColors(uri.toString());
    }
    async _workerWithResources(resources, forceLargeModels = false) {
        const worker = await this._workerManager.withWorker();
        return await worker.workerWithSyncedResources(resources, forceLargeModels);
    }
};
EditorWorkerService = EditorWorkerService_1 = __decorate([
    __param(0, IModelService),
    __param(1, ITextResourceConfigurationService),
    __param(2, ILogService),
    __param(3, ILanguageConfigurationService),
    __param(4, ILanguageFeaturesService),
    __param(5, IWebWorkerService)
], EditorWorkerService);
export { EditorWorkerService };
class WordBasedCompletionItemProvider {
    constructor(workerManager, configurationService, modelService, languageConfigurationService, logService, languageFeaturesService) {
        this.languageConfigurationService = languageConfigurationService;
        this.logService = logService;
        this.languageFeaturesService = languageFeaturesService;
        this._debugDisplayName = 'wordbasedCompletions';
        this._workerManager = workerManager;
        this._configurationService = configurationService;
        this._modelService = modelService;
    }
    async provideCompletionItems(model, position) {
        const config = this._configurationService.getValue(model.uri, position, 'editor');
        if (config.wordBasedSuggestions === 'off') {
            return undefined;
        }
        if (config.wordBasedSuggestions === 'offWithInlineSuggestions'
            && this.languageFeaturesService.inlineCompletionsProvider.has(model)
            && isCompletionsEnabledWithTextResourceConfig(this._configurationService, model.uri, model.getLanguageId())) {
            return undefined;
        }
        const models = [];
        if (config.wordBasedSuggestions === 'currentDocument') {
            // only current file and only if not too large
            if (canSyncModel(this._modelService, model.uri)) {
                models.push(model.uri);
            }
        }
        else {
            // either all files or files of same language
            for (const candidate of this._modelService.getModels()) {
                if (!canSyncModel(this._modelService, candidate.uri)) {
                    continue;
                }
                if (candidate === model) {
                    models.unshift(candidate.uri);
                }
                else if (config.wordBasedSuggestions === 'allDocuments' || candidate.getLanguageId() === model.getLanguageId()) {
                    models.push(candidate.uri);
                }
            }
        }
        if (models.length === 0) {
            return undefined; // File too large, no other files
        }
        const wordDefRegExp = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
        const word = model.getWordAtPosition(position);
        const replace = !word ? Range.fromPositions(position) : new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const insert = replace.setEndPosition(position.lineNumber, position.column);
        // Trace logging about the word and replace/insert ranges
        this.logService.trace('[WordBasedCompletionItemProvider]', `word: "${word?.word || ''}", wordDef: "${wordDefRegExp}", replace: [${replace.toString()}], insert: [${insert.toString()}]`);
        const client = await this._workerManager.withWorker();
        const data = await client.textualSuggest(models, word?.word, wordDefRegExp);
        if (!data) {
            return undefined;
        }
        return {
            duration: data.duration,
            suggestions: data.words.map((word) => {
                return {
                    kind: 18 /* languages.CompletionItemKind.Text */,
                    label: word,
                    insertText: word,
                    range: { insert, replace }
                };
            }),
        };
    }
}
let WorkerManager = class WorkerManager extends Disposable {
    constructor(_workerDescriptor, modelService, webWorkerService) {
        super();
        this._workerDescriptor = _workerDescriptor;
        this._modelService = modelService;
        this._webWorkerService = webWorkerService;
        this._editorWorkerClient = null;
        this._lastWorkerUsedTime = (new Date()).getTime();
        const stopWorkerInterval = this._register(new WindowIntervalTimer());
        stopWorkerInterval.cancelAndSet(() => this._checkStopIdleWorker(), Math.round(STOP_WORKER_DELTA_TIME_MS / 2), mainWindow);
        this._register(this._modelService.onModelRemoved(_ => this._checkStopEmptyWorker()));
    }
    dispose() {
        if (this._editorWorkerClient) {
            this._editorWorkerClient.dispose();
            this._editorWorkerClient = null;
        }
        super.dispose();
    }
    /**
     * Check if the model service has no more models and stop the worker if that is the case.
     */
    _checkStopEmptyWorker() {
        if (!this._editorWorkerClient) {
            return;
        }
        const models = this._modelService.getModels();
        if (models.length === 0) {
            // There are no more models => nothing possible for me to do
            this._editorWorkerClient.dispose();
            this._editorWorkerClient = null;
        }
    }
    /**
     * Check if the worker has been idle for a while and then stop it.
     */
    _checkStopIdleWorker() {
        if (!this._editorWorkerClient) {
            return;
        }
        const timeSinceLastWorkerUsedTime = (new Date()).getTime() - this._lastWorkerUsedTime;
        if (timeSinceLastWorkerUsedTime > STOP_WORKER_DELTA_TIME_MS) {
            this._editorWorkerClient.dispose();
            this._editorWorkerClient = null;
        }
    }
    withWorker() {
        this._lastWorkerUsedTime = (new Date()).getTime();
        if (!this._editorWorkerClient) {
            this._editorWorkerClient = new EditorWorkerClient(this._workerDescriptor, false, this._modelService, this._webWorkerService);
        }
        return Promise.resolve(this._editorWorkerClient);
    }
};
WorkerManager = __decorate([
    __param(1, IModelService),
    __param(2, IWebWorkerService)
], WorkerManager);
class SynchronousWorkerClient {
    constructor(instance) {
        this._instance = instance;
        this.proxy = this._instance;
    }
    dispose() {
        this._instance.dispose();
    }
    setChannel(channel, handler) {
        throw new Error(`Not supported`);
    }
    getChannel(channel) {
        throw new Error(`Not supported`);
    }
}
let EditorWorkerClient = class EditorWorkerClient extends Disposable {
    constructor(_workerDescriptorOrWorker, keepIdleModels, modelService, webWorkerService) {
        super();
        this._workerDescriptorOrWorker = _workerDescriptorOrWorker;
        this._disposed = false;
        this._modelService = modelService;
        this._webWorkerService = webWorkerService;
        this._keepIdleModels = keepIdleModels;
        this._worker = null;
        this._modelManager = null;
    }
    // foreign host request
    fhr(method, args) {
        throw new Error(`Not implemented!`);
    }
    _getOrCreateWorker() {
        if (!this._worker) {
            try {
                this._worker = this._register(this._webWorkerService.createWorkerClient(this._workerDescriptorOrWorker));
                EditorWorkerHost.setChannel(this._worker, this._createEditorWorkerHost());
            }
            catch (err) {
                logOnceWebWorkerWarning(err);
                this._worker = this._createFallbackLocalWorker();
            }
        }
        return this._worker;
    }
    async _getProxy() {
        try {
            const proxy = this._getOrCreateWorker().proxy;
            await proxy.$ping();
            return proxy;
        }
        catch (err) {
            logOnceWebWorkerWarning(err);
            this._worker = this._createFallbackLocalWorker();
            return this._worker.proxy;
        }
    }
    _createFallbackLocalWorker() {
        return new SynchronousWorkerClient(new EditorWorker(null));
    }
    _createEditorWorkerHost() {
        return {
            $fhr: (method, args) => this.fhr(method, args)
        };
    }
    _getOrCreateModelManager(proxy) {
        if (!this._modelManager) {
            this._modelManager = this._register(new WorkerTextModelSyncClient(proxy, this._modelService, this._keepIdleModels));
        }
        return this._modelManager;
    }
    async workerWithSyncedResources(resources, forceLargeModels = false) {
        if (this._disposed) {
            return Promise.reject(canceled());
        }
        const proxy = await this._getProxy();
        this._getOrCreateModelManager(proxy).ensureSyncedResources(resources, forceLargeModels);
        return proxy;
    }
    async textualSuggest(resources, leadingWord, wordDefRegExp) {
        const proxy = await this.workerWithSyncedResources(resources);
        const wordDef = wordDefRegExp.source;
        const wordDefFlags = wordDefRegExp.flags;
        return proxy.$textualSuggest(resources.map(r => r.toString()), leadingWord, wordDef, wordDefFlags);
    }
    dispose() {
        super.dispose();
        this._disposed = true;
    }
};
EditorWorkerClient = __decorate([
    __param(2, IModelService),
    __param(3, IWebWorkerService)
], EditorWorkerClient);
export { EditorWorkerClient };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yV29ya2VyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2VkaXRvcldvcmtlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFFNUUsT0FBTyxFQUFFLHVCQUF1QixFQUE2QixNQUFNLDBDQUEwQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTVGLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUczRCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFeEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU3RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUdyRixPQUFPLEVBQTZCLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzlGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTVHOztHQUVHO0FBQ0gsTUFBTSx5QkFBeUIsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztBQUVoRCxTQUFTLFlBQVksQ0FBQyxZQUEyQixFQUFFLFFBQWE7SUFDL0QsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDWixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLENBQUM7UUFDbEMsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRU0sSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVOzthQUkzQixxQkFBZ0IsR0FBRyxJQUFJLG1CQUFtQixDQUFDO1FBQ2pFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsa0RBQWtELENBQUM7UUFDcEcsd0JBQXdCLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsa0RBQWtELEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDNUcsS0FBSyxFQUFFLHFCQUFxQjtLQUM1QixDQUFDLEFBSnFDLENBSXBDO0lBTUgsWUFDZ0IsWUFBMkIsRUFDUCxvQkFBdUQsRUFDN0UsVUFBdUIsRUFDWSw2QkFBNEQsRUFDbEYsdUJBQWlELEVBQ3ZDLGlCQUFvQztRQUV4RSxLQUFLLEVBQUUsQ0FBQztRQUp3QyxrQ0FBNkIsR0FBN0IsNkJBQTZCLENBQStCO1FBRXhFLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFHeEUsSUFBSSxDQUFDLGFBQWEsR0FBRyxZQUFZLENBQUM7UUFFbEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxDQUFDLHFCQUFtQixDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUMxSSxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQztRQUU5QixrRUFBa0U7UUFDbEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxvQkFBb0IsRUFBRSxJQUFJLEVBQUUsRUFBRTtZQUMzRyxZQUFZLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDcEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNsRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtnQkFDekQsQ0FBQztnQkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUM1RCxNQUFNLEtBQUssR0FBRyxNQUFNLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRCxPQUFPLEtBQUssSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQzNCLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxJQUFJLCtCQUErQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3UCxDQUFDO0lBRWUsT0FBTztRQUN0QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVNLDJCQUEyQixDQUFDLEdBQVE7UUFDMUMsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sS0FBSyxDQUFDLHlCQUF5QixDQUFDLEdBQVEsRUFBRSxPQUFrQyxFQUFFLEtBQWM7UUFDbEcsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RELE9BQU8sTUFBTSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVNLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBYSxFQUFFLFFBQWEsRUFBRSxPQUFxQyxFQUFFLFNBQTRCO1FBQ3pILE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxFQUFFLHNCQUFzQixDQUFBLElBQUksQ0FBQyxDQUFDO1FBQ2pHLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2RyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCwwREFBMEQ7UUFDMUQsTUFBTSxJQUFJLEdBQWtCO1lBQzNCLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUztZQUMzQixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7WUFDM0IsT0FBTyxFQUFFLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFDNUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxTQUFTLENBQ3pDLElBQUksZ0JBQWdCLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUMxRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDekIsQ0FBQztTQUNGLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQztRQUVaLFNBQVMsbUJBQW1CLENBQUMsT0FBK0I7WUFDM0QsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUNqQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSx3QkFBd0IsQ0FDbEMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUN6QixJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ3pCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQ1IsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksWUFBWSxDQUN0QixJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDakMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQ2pDLENBQ0QsQ0FDRCxDQUNELENBQUM7UUFDSCxDQUFDO0lBQ0YsQ0FBQztJQUVNLG1CQUFtQixDQUFDLFFBQWEsRUFBRSxRQUFhO1FBQ3RELE9BQU8sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFFTSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBYSxFQUFFLFFBQWEsRUFBRSxvQkFBNkI7UUFDeEYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNyRSxPQUFPLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDakcsQ0FBQztJQUVNLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxRQUFhLEVBQUUsS0FBOEMsRUFBRSxTQUFrQixLQUFLO1FBQzFILElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtZQUNqRCxDQUFDO1lBQ0QsTUFBTSxFQUFFLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzlCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUN6SSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0SCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEUsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkMsQ0FBQztJQUNGLENBQUM7SUFFTSx3QkFBd0IsQ0FBQyxRQUFhLEVBQUUsS0FBOEM7UUFDNUYsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDakQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsaUJBQWlCO1lBQ2pELENBQUM7WUFDRCxNQUFNLEVBQUUsR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDOUIsTUFBTSxJQUFJLEdBQThCLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDekgsTUFBTSxNQUFNLEdBQUcsQ0FDZCxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztpQkFDbkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7aUJBQ2xGLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNkLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN2QixnRUFBZ0U7Z0JBQ2hFLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUQsQ0FBQyxDQUFDLENBQ0gsQ0FBQztZQUNGLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3ZILE9BQU8sTUFBTSxDQUFDO1FBRWYsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkMsQ0FBQztJQUNGLENBQUM7SUFFTSxLQUFLLENBQUMseUJBQXlCLENBQUMsUUFBZ0IsRUFBRSxRQUFnQixFQUFFLE9BQXlDLEVBQUUsU0FBNEI7UUFDakosSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkQsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDckYsT0FBTyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsT0FBTyxVQUFVLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCO1FBQzdGLENBQUM7SUFDRixDQUFDO0lBRU0sbUJBQW1CLENBQUMsUUFBYTtRQUN2QyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRU0sS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQWEsRUFBRSxLQUFhLEVBQUUsRUFBVztRQUN0RSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUM3SCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBQ3JDLE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzNELE9BQU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztJQUN4RixDQUFDO0lBRU0sb0JBQW9CLENBQUMsUUFBYTtRQUN4QyxPQUFPLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFTSxLQUFLLENBQUMsaUJBQWlCLENBQUMsUUFBYSxFQUFFLEtBQWE7UUFDMUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlCLENBQUM7UUFDRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUM3SCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBQ3JDLE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzNELE9BQU8sTUFBTSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3JGLENBQUM7SUFFTSxLQUFLLENBQUMsa0JBQWtCLENBQUMsR0FBUSxFQUFFLE9BQWlDO1FBQzFFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RCxPQUFPLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVNLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxHQUFRO1FBQ2pELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RCxPQUFPLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRU8sS0FBSyxDQUFDLG9CQUFvQixDQUFDLFNBQWdCLEVBQUUsbUJBQTRCLEtBQUs7UUFDckYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3RELE9BQU8sTUFBTSxNQUFNLENBQUMseUJBQXlCLENBQUMsU0FBUyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDNUUsQ0FBQzs7QUFqTVcsbUJBQW1CO0lBZTdCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsNkJBQTZCLENBQUE7SUFDN0IsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGlCQUFpQixDQUFBO0dBcEJQLG1CQUFtQixDQWtNL0I7O0FBRUQsTUFBTSwrQkFBK0I7SUFRcEMsWUFDQyxhQUE0QixFQUM1QixvQkFBdUQsRUFDdkQsWUFBMkIsRUFDViw0QkFBMkQsRUFDM0QsVUFBdUIsRUFDdkIsdUJBQWlEO1FBRmpELGlDQUE0QixHQUE1Qiw0QkFBNEIsQ0FBK0I7UUFDM0QsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUN2Qiw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBUjFELHNCQUFpQixHQUFHLHNCQUFzQixDQUFDO1FBVW5ELElBQUksQ0FBQyxjQUFjLEdBQUcsYUFBYSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQztRQUNsRCxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQztJQUNuQyxDQUFDO0lBRUQsS0FBSyxDQUFDLHNCQUFzQixDQUFDLEtBQWlCLEVBQUUsUUFBa0I7UUFJakUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBNkIsS0FBSyxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDOUcsSUFBSSxNQUFNLENBQUMsb0JBQW9CLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDM0MsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLG9CQUFvQixLQUFLLDBCQUEwQjtlQUMxRCxJQUFJLENBQUMsdUJBQXVCLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztlQUNqRSwwQ0FBMEMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzlHLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBVSxFQUFFLENBQUM7UUFDekIsSUFBSSxNQUFNLENBQUMsb0JBQW9CLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztZQUN2RCw4Q0FBOEM7WUFDOUMsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDakQsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsNkNBQTZDO1lBQzdDLEtBQUssTUFBTSxTQUFTLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO2dCQUN4RCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3RELFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLFNBQVMsS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDekIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRS9CLENBQUM7cUJBQU0sSUFBSSxNQUFNLENBQUMsb0JBQW9CLEtBQUssY0FBYyxJQUFJLFNBQVMsQ0FBQyxhQUFhLEVBQUUsS0FBSyxLQUFLLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQztvQkFDbEgsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzVCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN6QixPQUFPLFNBQVMsQ0FBQyxDQUFDLGlDQUFpQztRQUNwRCxDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDNUgsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDOUksTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU1RSx5REFBeUQ7UUFDekQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsVUFBVSxJQUFJLEVBQUUsSUFBSSxJQUFJLEVBQUUsZ0JBQWdCLGFBQWEsZ0JBQWdCLE9BQU8sQ0FBQyxRQUFRLEVBQUUsZUFBZSxNQUFNLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRXpMLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN0RCxNQUFNLElBQUksR0FBRyxNQUFNLE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU87WUFDTixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsV0FBVyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUE0QixFQUFFO2dCQUM5RCxPQUFPO29CQUNOLElBQUksNENBQW1DO29CQUN2QyxLQUFLLEVBQUUsSUFBSTtvQkFDWCxVQUFVLEVBQUUsSUFBSTtvQkFDaEIsS0FBSyxFQUFFLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRTtpQkFDMUIsQ0FBQztZQUNILENBQUMsQ0FBQztTQUNGLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxJQUFNLGFBQWEsR0FBbkIsTUFBTSxhQUFjLFNBQVEsVUFBVTtJQU9yQyxZQUNrQixpQkFBc0MsRUFDeEMsWUFBMkIsRUFDdkIsZ0JBQW1DO1FBRXRELEtBQUssRUFBRSxDQUFDO1FBSlMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFxQjtRQUt2RCxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQztRQUNsQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsZ0JBQWdCLENBQUM7UUFDMUMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUNoQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFbEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLHlCQUF5QixHQUFHLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTFILElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVlLE9BQU87UUFDdEIsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUNqQyxDQUFDO1FBQ0QsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7T0FFRztJQUNLLHFCQUFxQjtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDL0IsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzlDLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN6Qiw0REFBNEQ7WUFDNUQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNLLG9CQUFvQjtRQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDL0IsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLDJCQUEyQixHQUFHLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztRQUN0RixJQUFJLDJCQUEyQixHQUFHLHlCQUF5QixFQUFFLENBQUM7WUFDN0QsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7SUFFTSxVQUFVO1FBQ2hCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsRCxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlILENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDbEQsQ0FBQztDQUNELENBQUE7QUF0RUssYUFBYTtJQVNoQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsaUJBQWlCLENBQUE7R0FWZCxhQUFhLENBc0VsQjtBQUVELE1BQU0sdUJBQXVCO0lBSTVCLFlBQVksUUFBVztRQUN0QixJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztRQUMxQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUF1QixDQUFDO0lBQzNDLENBQUM7SUFFTSxPQUFPO1FBQ2IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRU0sVUFBVSxDQUFtQixPQUFlLEVBQUUsT0FBVTtRQUM5RCxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFTSxVQUFVLENBQW1CLE9BQWU7UUFDbEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUNsQyxDQUFDO0NBQ0Q7QUFNTSxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7SUFTakQsWUFDa0IseUJBQXlFLEVBQzFGLGNBQXVCLEVBQ1IsWUFBMkIsRUFDdkIsZ0JBQW1DO1FBRXRELEtBQUssRUFBRSxDQUFDO1FBTFMsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUFnRDtRQUhuRixjQUFTLEdBQUcsS0FBSyxDQUFDO1FBU3pCLElBQUksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQztRQUMxQyxJQUFJLENBQUMsZUFBZSxHQUFHLGNBQWMsQ0FBQztRQUN0QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztJQUMzQixDQUFDO0lBRUQsdUJBQXVCO0lBQ2hCLEdBQUcsQ0FBQyxNQUFjLEVBQUUsSUFBZTtRQUN6QyxNQUFNLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVPLGtCQUFrQjtRQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25CLElBQUksQ0FBQztnQkFDSixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFlLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZILGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLENBQUM7WUFDM0UsQ0FBQztZQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBQ2QsdUJBQXVCLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7WUFDbEQsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztJQUVTLEtBQUssQ0FBQyxTQUFTO1FBQ3hCLElBQUksQ0FBQztZQUNKLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLEtBQUssQ0FBQztZQUM5QyxNQUFNLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNwQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsdUJBQXVCLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUNqRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQzNCLENBQUM7SUFDRixDQUFDO0lBRU8sMEJBQTBCO1FBQ2pDLE9BQU8sSUFBSSx1QkFBdUIsQ0FBQyxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFTyx1QkFBdUI7UUFDOUIsT0FBTztZQUNOLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQztTQUM5QyxDQUFDO0lBQ0gsQ0FBQztJQUVPLHdCQUF3QixDQUFDLEtBQTRCO1FBQzVELElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUkseUJBQXlCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDckgsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMzQixDQUFDO0lBRU0sS0FBSyxDQUFDLHlCQUF5QixDQUFDLFNBQWdCLEVBQUUsbUJBQTRCLEtBQUs7UUFDekYsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3JDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUN4RixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTSxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQWdCLEVBQUUsV0FBK0IsRUFBRSxhQUFxQjtRQUNuRyxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM5RCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBQ3JDLE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUM7UUFDekMsT0FBTyxLQUFLLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3BHLENBQUM7SUFFUSxPQUFPO1FBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO0lBQ3ZCLENBQUM7Q0FDRCxDQUFBO0FBMUZZLGtCQUFrQjtJQVk1QixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsaUJBQWlCLENBQUE7R0FiUCxrQkFBa0IsQ0EwRjlCIn0=