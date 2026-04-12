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
var LanguageDetectionService_1;
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageDetectionService, LanguageDetectionStatsId } from '../common/languageDetectionWorkerService.js';
import { FileAccess, nodeModulesAsarPath, nodeModulesPath, Schemas } from '../../../../base/common/network.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { URI } from '../../../../base/common/uri.js';
import { isWeb } from '../../../../base/common/platform.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IDiagnosticsService } from '../../../../platform/diagnostics/common/diagnostics.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { LRUCache } from '../../../../base/common/map.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { canASAR } from '../../../../amdX.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { WorkerTextModelSyncClient } from '../../../../editor/common/services/textModelSync/textModelSync.impl.js';
import { LanguageDetectionWorkerHost } from './languageDetectionWorker.protocol.js';
const TOP_LANG_COUNTS = 12;
const regexpModuleLocation = `${nodeModulesPath}/vscode-regexp-languagedetection`;
const regexpModuleLocationAsar = `${nodeModulesAsarPath}/vscode-regexp-languagedetection`;
const moduleLocation = `${nodeModulesPath}/@vscode/vscode-languagedetection`;
const moduleLocationAsar = `${nodeModulesAsarPath}/@vscode/vscode-languagedetection`;
let LanguageDetectionService = class LanguageDetectionService extends Disposable {
    static { LanguageDetectionService_1 = this; }
    static { this.enablementSettingKey = 'workbench.editor.languageDetection'; }
    static { this.historyBasedEnablementConfig = 'workbench.editor.historyBasedLanguageDetection'; }
    static { this.preferHistoryConfig = 'workbench.editor.preferHistoryBasedLanguageDetection'; }
    static { this.workspaceOpenedLanguagesStorageKey = 'workbench.editor.languageDetectionOpenedLanguages.workspace'; }
    static { this.globalOpenedLanguagesStorageKey = 'workbench.editor.languageDetectionOpenedLanguages.global'; }
    constructor(_environmentService, languageService, _configurationService, _diagnosticsService, _workspaceContextService, modelService, _editorService, telemetryService, storageService, _logService, webWorkerService) {
        super();
        this._environmentService = _environmentService;
        this._configurationService = _configurationService;
        this._diagnosticsService = _diagnosticsService;
        this._workspaceContextService = _workspaceContextService;
        this._editorService = _editorService;
        this._logService = _logService;
        this.hasResolvedWorkspaceLanguageIds = false;
        this.workspaceLanguageIds = new Set();
        this.sessionOpenedLanguageIds = new Set();
        this.historicalGlobalOpenedLanguageIds = new LRUCache(TOP_LANG_COUNTS);
        this.historicalWorkspaceOpenedLanguageIds = new LRUCache(TOP_LANG_COUNTS);
        this.dirtyBiases = true;
        this.langBiases = {};
        const useAsar = canASAR && this._environmentService.isBuilt && !isWeb;
        this._languageDetectionWorkerClient = this._register(new LanguageDetectionWorkerClient(modelService, languageService, telemetryService, webWorkerService, 
        // TODO See if it's possible to bundle vscode-languagedetection
        useAsar
            ? FileAccess.asBrowserUri(`${moduleLocationAsar}/dist/lib/index.js`).toString(true)
            : FileAccess.asBrowserUri(`${moduleLocation}/dist/lib/index.js`).toString(true), useAsar
            ? FileAccess.asBrowserUri(`${moduleLocationAsar}/model/model.json`).toString(true)
            : FileAccess.asBrowserUri(`${moduleLocation}/model/model.json`).toString(true), useAsar
            ? FileAccess.asBrowserUri(`${moduleLocationAsar}/model/group1-shard1of1.bin`).toString(true)
            : FileAccess.asBrowserUri(`${moduleLocation}/model/group1-shard1of1.bin`).toString(true), useAsar
            ? FileAccess.asBrowserUri(`${regexpModuleLocationAsar}/dist/index.js`).toString(true)
            : FileAccess.asBrowserUri(`${regexpModuleLocation}/dist/index.js`).toString(true)));
        this.initEditorOpenedListeners(storageService);
    }
    async resolveWorkspaceLanguageIds() {
        if (this.hasResolvedWorkspaceLanguageIds) {
            return;
        }
        this.hasResolvedWorkspaceLanguageIds = true;
        const fileExtensions = await this._diagnosticsService.getWorkspaceFileExtensions(this._workspaceContextService.getWorkspace());
        let count = 0;
        for (const ext of fileExtensions.extensions) {
            const langId = this._languageDetectionWorkerClient.getLanguageId(ext);
            if (langId && count < TOP_LANG_COUNTS) {
                this.workspaceLanguageIds.add(langId);
                count++;
                if (count > TOP_LANG_COUNTS) {
                    break;
                }
            }
        }
        this.dirtyBiases = true;
    }
    isEnabledForLanguage(languageId) {
        return !!languageId && this._configurationService.getValue(LanguageDetectionService_1.enablementSettingKey, { overrideIdentifier: languageId });
    }
    getLanguageBiases() {
        if (!this.dirtyBiases) {
            return this.langBiases;
        }
        const biases = {};
        // Give different weight to the biases depending on relevance of source
        this.sessionOpenedLanguageIds.forEach(lang => biases[lang] = (biases[lang] ?? 0) + 7);
        this.workspaceLanguageIds.forEach(lang => biases[lang] = (biases[lang] ?? 0) + 5);
        [...this.historicalWorkspaceOpenedLanguageIds.keys()].forEach(lang => biases[lang] = (biases[lang] ?? 0) + 3);
        [...this.historicalGlobalOpenedLanguageIds.keys()].forEach(lang => biases[lang] = (biases[lang] ?? 0) + 1);
        this._logService.trace('Session Languages:', JSON.stringify([...this.sessionOpenedLanguageIds]));
        this._logService.trace('Workspace Languages:', JSON.stringify([...this.workspaceLanguageIds]));
        this._logService.trace('Historical Workspace Opened Languages:', JSON.stringify([...this.historicalWorkspaceOpenedLanguageIds.keys()]));
        this._logService.trace('Historical Globally Opened Languages:', JSON.stringify([...this.historicalGlobalOpenedLanguageIds.keys()]));
        this._logService.trace('Computed Language Detection Biases:', JSON.stringify(biases));
        this.dirtyBiases = false;
        this.langBiases = biases;
        return biases;
    }
    async detectLanguage(resource, supportedLangs) {
        const useHistory = this._configurationService.getValue(LanguageDetectionService_1.historyBasedEnablementConfig);
        const preferHistory = this._configurationService.getValue(LanguageDetectionService_1.preferHistoryConfig);
        if (useHistory) {
            await this.resolveWorkspaceLanguageIds();
        }
        const biases = useHistory ? this.getLanguageBiases() : undefined;
        return this._languageDetectionWorkerClient.detectLanguage(resource, biases, preferHistory, supportedLangs);
    }
    // TODO: explore using the history service or something similar to provide this list of opened editors
    // so this service can support delayed instantiation. This may be tricky since it seems the IHistoryService
    // only gives history for a workspace... where this takes advantage of history at a global level as well.
    initEditorOpenedListeners(storageService) {
        try {
            const globalLangHistoryData = JSON.parse(storageService.get(LanguageDetectionService_1.globalOpenedLanguagesStorageKey, 0 /* StorageScope.PROFILE */, '[]'));
            this.historicalGlobalOpenedLanguageIds.fromJSON(globalLangHistoryData);
        }
        catch (e) {
            console.error(e);
        }
        try {
            const workspaceLangHistoryData = JSON.parse(storageService.get(LanguageDetectionService_1.workspaceOpenedLanguagesStorageKey, 1 /* StorageScope.WORKSPACE */, '[]'));
            this.historicalWorkspaceOpenedLanguageIds.fromJSON(workspaceLangHistoryData);
        }
        catch (e) {
            console.error(e);
        }
        this._register(this._editorService.onDidActiveEditorChange(() => {
            const activeLanguage = this._editorService.activeTextEditorLanguageId;
            if (activeLanguage && this._editorService.activeEditor?.resource?.scheme !== Schemas.untitled) {
                this.sessionOpenedLanguageIds.add(activeLanguage);
                this.historicalGlobalOpenedLanguageIds.set(activeLanguage, true);
                this.historicalWorkspaceOpenedLanguageIds.set(activeLanguage, true);
                storageService.store(LanguageDetectionService_1.globalOpenedLanguagesStorageKey, JSON.stringify(this.historicalGlobalOpenedLanguageIds.toJSON()), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
                storageService.store(LanguageDetectionService_1.workspaceOpenedLanguagesStorageKey, JSON.stringify(this.historicalWorkspaceOpenedLanguageIds.toJSON()), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
                this.dirtyBiases = true;
            }
        }));
    }
};
LanguageDetectionService = LanguageDetectionService_1 = __decorate([
    __param(0, IWorkbenchEnvironmentService),
    __param(1, ILanguageService),
    __param(2, IConfigurationService),
    __param(3, IDiagnosticsService),
    __param(4, IWorkspaceContextService),
    __param(5, IModelService),
    __param(6, IEditorService),
    __param(7, ITelemetryService),
    __param(8, IStorageService),
    __param(9, ILogService),
    __param(10, IWebWorkerService)
], LanguageDetectionService);
export { LanguageDetectionService };
export class LanguageDetectionWorkerClient extends Disposable {
    constructor(_modelService, _languageService, _telemetryService, _webWorkerService, _indexJsUri, _modelJsonUri, _weightsUri, _regexpModelUri) {
        super();
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._telemetryService = _telemetryService;
        this._webWorkerService = _webWorkerService;
        this._indexJsUri = _indexJsUri;
        this._modelJsonUri = _modelJsonUri;
        this._weightsUri = _weightsUri;
        this._regexpModelUri = _regexpModelUri;
    }
    _getOrCreateLanguageDetectionWorker() {
        if (!this.worker) {
            const workerClient = this._register(this._webWorkerService.createWorkerClient(new WebWorkerDescriptor({
                esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/services/languageDetection/browser/languageDetectionWebWorkerMain.js'),
                label: 'LanguageDetectionWorker'
            })));
            LanguageDetectionWorkerHost.setChannel(workerClient, {
                $getIndexJsUri: async () => this.getIndexJsUri(),
                $getLanguageId: async (languageIdOrExt) => this.getLanguageId(languageIdOrExt),
                $sendTelemetryEvent: async (languages, confidences, timeSpent) => this.sendTelemetryEvent(languages, confidences, timeSpent),
                $getRegexpModelUri: async () => this.getRegexpModelUri(),
                $getModelJsonUri: async () => this.getModelJsonUri(),
                $getWeightsUri: async () => this.getWeightsUri(),
            });
            const workerTextModelSyncClient = this._register(WorkerTextModelSyncClient.create(workerClient, this._modelService));
            this.worker = { workerClient, workerTextModelSyncClient };
        }
        return this.worker;
    }
    _guessLanguageIdByUri(uri) {
        const guess = this._languageService.guessLanguageIdByFilepathOrFirstLine(uri);
        if (guess && guess !== 'unknown') {
            return guess;
        }
        return undefined;
    }
    async getIndexJsUri() {
        return this._indexJsUri;
    }
    getLanguageId(languageIdOrExt) {
        if (!languageIdOrExt) {
            return undefined;
        }
        if (this._languageService.isRegisteredLanguageId(languageIdOrExt)) {
            return languageIdOrExt;
        }
        const guessed = this._guessLanguageIdByUri(URI.file(`file.${languageIdOrExt}`));
        if (!guessed || guessed === 'unknown') {
            return undefined;
        }
        return guessed;
    }
    async getModelJsonUri() {
        return this._modelJsonUri;
    }
    async getWeightsUri() {
        return this._weightsUri;
    }
    async getRegexpModelUri() {
        return this._regexpModelUri;
    }
    async sendTelemetryEvent(languages, confidences, timeSpent) {
        this._telemetryService.publicLog2(LanguageDetectionStatsId, {
            languages: languages.join(','),
            confidences: confidences.join(','),
            timeSpent
        });
    }
    async detectLanguage(resource, langBiases, preferHistory, supportedLangs) {
        const startTime = Date.now();
        const quickGuess = this._guessLanguageIdByUri(resource);
        if (quickGuess) {
            return quickGuess;
        }
        const { workerClient, workerTextModelSyncClient } = this._getOrCreateLanguageDetectionWorker();
        workerTextModelSyncClient.ensureSyncedResources([resource]);
        const modelId = await workerClient.proxy.$detectLanguage(resource.toString(), langBiases, preferHistory, supportedLangs);
        const languageId = this.getLanguageId(modelId);
        const LanguageDetectionStatsId = 'automaticlanguagedetection.perf';
        this._telemetryService.publicLog2(LanguageDetectionStatsId, {
            timeSpent: Date.now() - startTime,
            detection: languageId || 'unknown',
        });
        return languageId;
    }
}
// For now we use Eager until we handle keeping track of history better.
registerSingleton(ILanguageDetectionService, LanguageDetectionService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYW5ndWFnZURldGVjdGlvbi9icm93c2VyL2xhbmd1YWdlRGV0ZWN0aW9uV29ya2VyU2VydmljZUltcGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUseUJBQXlCLEVBQWlFLHdCQUF3QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDakwsT0FBTyxFQUFtQixVQUFVLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hJLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUs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