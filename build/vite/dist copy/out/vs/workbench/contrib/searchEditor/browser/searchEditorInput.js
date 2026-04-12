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
var SearchEditorInput_1;
import './media/searchEditor.css';
import { Emitter } from '../../../../base/common/event.js';
import { basename } from '../../../../base/common/path.js';
import { extname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { Memento } from '../../../common/memento.js';
import { SearchEditorFindMatchClass, SearchEditorInputTypeId, SearchEditorScheme, SearchEditorWorkingCopyTypeId } from './constants.js';
import { SearchEditorModel, searchEditorModelFactory } from './searchEditorModel.js';
import { defaultSearchConfig, parseSavedSearchEditor, serializeSearchConfiguration } from './searchEditorSerialization.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { bufferToReadable, VSBuffer } from '../../../../base/common/buffer.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
export const SEARCH_EDITOR_EXT = '.code-search';
const SearchEditorIcon = registerIcon('search-editor-label-icon', Codicon.search, localize('searchEditorLabelIcon', 'Icon of the search editor label.'));
let SearchEditorInput = class SearchEditorInput extends EditorInput {
    static { SearchEditorInput_1 = this; }
    static { this.ID = SearchEditorInputTypeId; }
    get typeId() {
        return SearchEditorInput_1.ID;
    }
    get editorId() {
        return this.typeId;
    }
    getIcon() {
        return SearchEditorIcon;
    }
    get capabilities() {
        let capabilities = 0 /* EditorInputCapabilities.None */;
        if (!this.backingUri) {
            capabilities |= 4 /* EditorInputCapabilities.Untitled */;
        }
        return capabilities;
    }
    get resource() {
        return this.backingUri || this.modelUri;
    }
    constructor(modelUri, backingUri, modelService, textFileService, fileDialogService, instantiationService, workingCopyService, telemetryService, pathService, storageService) {
        super();
        this.modelUri = modelUri;
        this.backingUri = backingUri;
        this.modelService = modelService;
        this.textFileService = textFileService;
        this.fileDialogService = fileDialogService;
        this.instantiationService = instantiationService;
        this.workingCopyService = workingCopyService;
        this.telemetryService = telemetryService;
        this.pathService = pathService;
        this.dirty = false;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this.oldDecorationsIDs = [];
        this.model = instantiationService.createInstance(SearchEditorModel, modelUri);
        if (this.modelUri.scheme !== SearchEditorScheme) {
            throw Error('SearchEditorInput must be invoked with a SearchEditorScheme uri');
        }
        this.memento = new Memento(SearchEditorInput_1.ID, storageService);
        this._register(storageService.onWillSaveState(() => this.memento.saveMemento()));
        const input = this;
        const workingCopyAdapter = new class {
            constructor() {
                this.typeId = SearchEditorWorkingCopyTypeId;
                this.resource = input.modelUri;
                this.capabilities = input.hasCapability(4 /* EditorInputCapabilities.Untitled */) ? 2 /* WorkingCopyCapabilities.Untitled */ : 0 /* WorkingCopyCapabilities.None */;
                this.onDidChangeDirty = input.onDidChangeDirty;
                this.onDidChangeContent = input.onDidChangeContent;
                this.onDidSave = input.onDidSave;
            }
            get name() { return input.getName(); }
            isDirty() { return input.isDirty(); }
            isModified() { return input.isDirty(); }
            backup(token) { return input.backup(token); }
            save(options) { return input.save(0, options).then(editor => !!editor); }
            revert(options) { return input.revert(0, options); }
        };
        this._register(this.workingCopyService.registerWorkingCopy(workingCopyAdapter));
    }
    async save(group, options) {
        if (((await this.resolveModels()).resultsModel).isDisposed()) {
            return;
        }
        if (this.backingUri) {
            await this.textFileService.write(this.backingUri, await this.serializeForDisk(), options);
            this.setDirty(false);
            this._onDidSave.fire({ reason: options?.reason, source: options?.source });
            return this;
        }
        else {
            return this.saveAs(group, options);
        }
    }
    tryReadConfigSync() {
        return this._cachedConfigurationModel?.config;
    }
    async serializeForDisk() {
        const { configurationModel, resultsModel } = await this.resolveModels();
        return serializeSearchConfiguration(configurationModel.config) + '\n' + resultsModel.getValue();
    }
    registerConfigChangeListeners(model) {
        this.configChangeListenerDisposable?.dispose();
        if (!this.isDisposed()) {
            this.configChangeListenerDisposable = model.onConfigDidUpdate(() => {
                if (this.lastLabel !== this.getName()) {
                    this._onDidChangeLabel.fire();
                    this.lastLabel = this.getName();
                }
                this.memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */).searchConfig = model.config;
            });
            this._register(this.configChangeListenerDisposable);
        }
    }
    async resolveModels() {
        return this.model.resolve().then(data => {
            this._cachedResultsModel = data.resultsModel;
            this._cachedConfigurationModel = data.configurationModel;
            if (this.lastLabel !== this.getName()) {
                this._onDidChangeLabel.fire();
                this.lastLabel = this.getName();
            }
            this.registerConfigChangeListeners(data.configurationModel);
            return data;
        });
    }
    async saveAs(group, options) {
        const path = await this.fileDialogService.pickFileToSave(await this.suggestFileName(), options?.availableFileSystems);
        if (path) {
            this.telemetryService.publicLog2('searchEditor/saveSearchResults');
            const toWrite = await this.serializeForDisk();
            if (await this.textFileService.create([{ resource: path, value: toWrite, options: { overwrite: true } }])) {
                this.setDirty(false);
                if (!isEqual(path, this.modelUri)) {
                    const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { fileUri: path, from: 'existingFile' });
                    input.setMatchRanges(this.getMatchRanges());
                    return input;
                }
                return this;
            }
        }
        return undefined;
    }
    getName(maxLength = 12) {
        const trimToMax = (label) => (label.length < maxLength ? label : `${label.slice(0, maxLength - 3)}...`);
        if (this.backingUri) {
            const originalURI = EditorResourceAccessor.getOriginalUri(this);
            return localize('searchTitle.withQuery', "Search: {0}", basename((originalURI ?? this.backingUri).path, SEARCH_EDITOR_EXT));
        }
        const query = this._cachedConfigurationModel?.config?.query?.trim();
        if (query) {
            return localize('searchTitle.withQuery', "Search: {0}", trimToMax(query));
        }
        return localize('searchTitle', "Search");
    }
    setDirty(dirty) {
        const wasDirty = this.dirty;
        this.dirty = dirty;
        if (wasDirty !== dirty) {
            this._onDidChangeDirty.fire();
        }
    }
    isDirty() {
        return this.dirty;
    }
    async rename(group, target) {
        if (extname(target) === SEARCH_EDITOR_EXT) {
            return {
                editor: this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'existingFile', fileUri: target })
            };
        }
        // Ignore move if editor was renamed to a different file extension
        return undefined;
    }
    dispose() {
        this.modelService.destroyModel(this.modelUri);
        super.dispose();
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        if (other instanceof SearchEditorInput_1) {
            return !!(other.modelUri.fragment && other.modelUri.fragment === this.modelUri.fragment) || !!(other.backingUri && isEqual(other.backingUri, this.backingUri));
        }
        return false;
    }
    getMatchRanges() {
        return (this._cachedResultsModel?.getAllDecorations() ?? [])
            .filter(decoration => decoration.options.className === SearchEditorFindMatchClass)
            .filter(({ range }) => !(range.startColumn === 1 && range.endColumn === 1))
            .map(({ range }) => range);
    }
    async setMatchRanges(ranges) {
        this.oldDecorationsIDs = (await this.resolveModels()).resultsModel.deltaDecorations(this.oldDecorationsIDs, ranges.map(range => ({ range, options: { description: 'search-editor-find-match', className: SearchEditorFindMatchClass, stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */ } })));
    }
    async revert(group, options) {
        if (options?.soft) {
            this.setDirty(false);
            return;
        }
        if (this.backingUri) {
            const { config, text } = await this.instantiationService.invokeFunction(parseSavedSearchEditor, this.backingUri);
            const { resultsModel, configurationModel } = await this.resolveModels();
            resultsModel.setValue(text);
            configurationModel.updateConfig(config);
        }
        else {
            (await this.resolveModels()).resultsModel.setValue('');
        }
        super.revert(group, options);
        this.setDirty(false);
    }
    async backup(token) {
        const contents = await this.serializeForDisk();
        if (token.isCancellationRequested) {
            return {};
        }
        return {
            content: bufferToReadable(VSBuffer.fromString(contents))
        };
    }
    async suggestFileName() {
        const query = (await this.resolveModels()).configurationModel.config.query;
        const searchFileName = (query.replace(/[^\w \-_]+/g, '_') || 'Search') + SEARCH_EDITOR_EXT;
        return joinPath(await this.fileDialogService.defaultFilePath(this.pathService.defaultUriScheme), searchFileName);
    }
    toUntyped() {
        if (this.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
            return undefined;
        }
        return {
            resource: this.resource,
            options: {
                override: SearchEditorInput_1.ID
            }
        };
    }
    copy() {
        // Generate a new modelUri for the split editor
        const newModelUri = URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
        const config = this._cachedConfigurationModel?.config ?? {};
        const results = this._cachedResultsModel?.getValue() ?? '';
        // Use the 'rawData' variant and pass modelUri
        return this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, 
        // eslint-disable-next-line local/code-no-any-casts
        { from: 'rawData', config, resultsContents: results, modelUri: newModelUri } // modelUri is not in the type, but we handle it below
        );
    }
};
SearchEditorInput = SearchEditorInput_1 = __decorate([
    __param(2, IModelService),
    __param(3, ITextFileService),
    __param(4, IFileDialogService),
    __param(5, IInstantiationService),
    __param(6, IWorkingCopyService),
    __param(7, ITelemetryService),
    __param(8, IPathService),
    __param(9, IStorageService)
], SearchEditorInput);
export { SearchEditorInput };
export const getOrMakeSearchEditorInput = (accessor, existingData) => {
    const storageService = accessor.get(IStorageService);
    const configurationService = accessor.get(IConfigurationService);
    const instantiationService = accessor.get(IInstantiationService);
    let modelUri;
    if (existingData.from === 'model') {
        modelUri = existingData.modelUri;
    }
    else if (existingData.from === 'rawData' && existingData.modelUri) {
        modelUri = existingData.modelUri;
    }
    else {
        modelUri = URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
    }
    if (!searchEditorModelFactory.models.has(modelUri)) {
        if (existingData.from === 'existingFile') {
            instantiationService.invokeFunction(accessor => searchEditorModelFactory.initializeModelFromExistingFile(accessor, modelUri, existingData.fileUri));
        }
        else {
            const searchEditorSettings = configurationService.getValue('search').searchEditor;
            const reuseOldSettings = searchEditorSettings.reusePriorSearchConfiguration;
            const defaultNumberOfContextLines = searchEditorSettings.defaultNumberOfContextLines;
            const priorConfig = reuseOldSettings ? new Memento(SearchEditorInput.ID, storageService).getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */).searchConfig ?? {} : {};
            const defaultConfig = defaultSearchConfig();
            const config = { ...defaultConfig, ...priorConfig, ...existingData.config };
            if (defaultNumberOfContextLines !== null && defaultNumberOfContextLines !== undefined) {
                config.contextLines = existingData?.config?.contextLines ?? defaultNumberOfContextLines;
            }
            if (existingData.from === 'rawData') {
                if (existingData.resultsContents) {
                    config.contextLines = 0;
                }
                instantiationService.invokeFunction(accessor => searchEditorModelFactory.initializeModelFromRawData(accessor, modelUri, config, existingData.resultsContents));
            }
            else {
                instantiationService.invokeFunction(accessor => searchEditorModelFactory.initializeModelFromExistingModel(accessor, modelUri, config));
            }
        }
    }
    return instantiationService.createInstance(SearchEditorInput, modelUri, existingData.from === 'existingFile'
        ? existingData.fileUri
        : existingData.from === 'model'
            ? existingData.backupOf
            : undefined);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2hFZGl0b3IvYnJvd3Nlci9zZWFyY2hFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTywwQkFBMEIsQ0FBQztBQUNsQyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdyRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBaUQsc0JBQXNCLEVBQTZELE1BQU0sMkJBQTJCLENBQUM7QUFDN0ssT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3JELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSw2QkFBNkIsRUFBdUIsTUFBTSxnQkFBZ0IsQ0FBQztBQUM3SixPQUFPLEVBQTRCLGlCQUFpQixF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