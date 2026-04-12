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
import { Event, Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { OUTPUT_VIEW_ID, LOG_MIME, OUTPUT_MIME, Extensions, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_FILE_OUTPUT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, isSingleSourceOutputChannelDescriptor, HIDE_CATEGORY_FILTER_CONTEXT, isMultiSourceOutputChannelDescriptor } from '../../../services/output/common/output.js';
import { OutputLinkProvider } from './outputLinkProvider.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ILogService, ILoggerService, LogLevel, LogLevelToString } from '../../../../platform/log/common/log.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { DelegatedOutputChannelModel, FileOutputChannelModel, MultiFileOutputChannelModel } from '../common/outputChannelModel.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { localize } from '../../../../nls.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { telemetryLogId } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { toLocalISOString } from '../../../../base/common/date.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IDefaultLogLevelsService } from '../../../services/log/common/defaultLogLevels.js';
const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';
let OutputChannel = class OutputChannel extends Disposable {
    constructor(outputChannelDescriptor, outputLocation, outputDirPromise, languageService, instantiationService) {
        super();
        this.outputChannelDescriptor = outputChannelDescriptor;
        this.outputLocation = outputLocation;
        this.outputDirPromise = outputDirPromise;
        this.languageService = languageService;
        this.instantiationService = instantiationService;
        this.scrollLock = false;
        this.id = outputChannelDescriptor.id;
        this.label = outputChannelDescriptor.label;
        this.uri = URI.from({ scheme: Schemas.outputChannel, path: this.id });
        this.model = this._register(this.createOutputChannelModel(this.uri, outputChannelDescriptor));
    }
    createOutputChannelModel(uri, outputChannelDescriptor) {
        const language = outputChannelDescriptor.languageId ? this.languageService.createById(outputChannelDescriptor.languageId) : this.languageService.createByMimeType(outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME);
        if (isMultiSourceOutputChannelDescriptor(outputChannelDescriptor)) {
            return this.instantiationService.createInstance(MultiFileOutputChannelModel, uri, language, [...outputChannelDescriptor.source]);
        }
        if (isSingleSourceOutputChannelDescriptor(outputChannelDescriptor)) {
            return this.instantiationService.createInstance(FileOutputChannelModel, uri, language, outputChannelDescriptor.source);
        }
        return this.instantiationService.createInstance(DelegatedOutputChannelModel, this.id, uri, language, this.outputLocation, this.outputDirPromise);
    }
    getLogEntries() {
        return this.model.getLogEntries();
    }
    append(output) {
        this.model.append(output);
    }
    update(mode, till) {
        this.model.update(mode, till, true);
    }
    clear() {
        this.model.clear();
    }
    replace(value) {
        this.model.replace(value);
    }
};
OutputChannel = __decorate([
    __param(3, ILanguageService),
    __param(4, IInstantiationService)
], OutputChannel);
class OutputViewFilters extends Disposable {
    constructor(options, contextKeyService) {
        super();
        this.contextKeyService = contextKeyService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._filterText = '';
        this._includePatterns = [];
        this._excludePatterns = [];
        this._trace = SHOW_TRACE_FILTER_CONTEXT.bindTo(this.contextKeyService);
        this._trace.set(options.trace);
        this._debug = SHOW_DEBUG_FILTER_CONTEXT.bindTo(this.contextKeyService);
        this._debug.set(options.debug);
        this._info = SHOW_INFO_FILTER_CONTEXT.bindTo(this.contextKeyService);
        this._info.set(options.info);
        this._warning = SHOW_WARNING_FILTER_CONTEXT.bindTo(this.contextKeyService);
        this._warning.set(options.warning);
        this._error = SHOW_ERROR_FILTER_CONTEXT.bindTo(this.contextKeyService);
        this._error.set(options.error);
        this._categories = HIDE_CATEGORY_FILTER_CONTEXT.bindTo(this.contextKeyService);
        this._categories.set(options.sources);
        this.filterHistory = options.filterHistory;
    }
    get text() {
        return this._filterText;
    }
    set text(filterText) {
        if (this._filterText !== filterText) {
            this._filterText = filterText;
            const { includePatterns, excludePatterns } = this.parseText(filterText);
            this._includePatterns = includePatterns;
            this._excludePatterns = excludePatterns;
            this._onDidChange.fire();
        }
    }
    parseText(filterText) {
        const includePatterns = [];
        const excludePatterns = [];
        // Parse patterns respecting quoted strings
        const patterns = this.splitByCommaRespectingQuotes(filterText);
        for (const pattern of patterns) {
            const trimmed = pattern.trim();
            if (trimmed.length === 0) {
                continue;
            }
            if (trimmed.startsWith('!')) {
                // Negative filter - remove the ! prefix
                const negativePattern = trimmed.substring(1).trim();
                if (negativePattern.length > 0) {
                    excludePatterns.push(negativePattern);
                }
            }
            else {
                includePatterns.push(trimmed);
            }
        }
        return { includePatterns, excludePatterns };
    }
    get includePatterns() {
        return this._includePatterns;
    }
    get excludePatterns() {
        return this._excludePatterns;
    }
    splitByCommaRespectingQuotes(text) {
        const patterns = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (!inQuotes && (char === '"')) {
                // Start of quoted string
                inQuotes = true;
                quoteChar = char;
                current += char;
            }
            else if (inQuotes && char === quoteChar) {
                // End of quoted string
                inQuotes = false;
                current += char;
            }
            else if (!inQuotes && char === ',') {
                // Comma outside quotes - split here
                if (current.length > 0) {
                    patterns.push(current);
                }
                current = '';
            }
            else {
                current += char;
            }
        }
        // Add the last pattern
        if (current.length > 0) {
            patterns.push(current);
        }
        return patterns;
    }
    get trace() {
        return !!this._trace.get();
    }
    set trace(trace) {
        if (this._trace.get() !== trace) {
            this._trace.set(trace);
            this._onDidChange.fire();
        }
    }
    get debug() {
        return !!this._debug.get();
    }
    set debug(debug) {
        if (this._debug.get() !== debug) {
            this._debug.set(debug);
            this._onDidChange.fire();
        }
    }
    get info() {
        return !!this._info.get();
    }
    set info(info) {
        if (this._info.get() !== info) {
            this._info.set(info);
            this._onDidChange.fire();
        }
    }
    get warning() {
        return !!this._warning.get();
    }
    set warning(warning) {
        if (this._warning.get() !== warning) {
            this._warning.set(warning);
            this._onDidChange.fire();
        }
    }
    get error() {
        return !!this._error.get();
    }
    set error(error) {
        if (this._error.get() !== error) {
            this._error.set(error);
            this._onDidChange.fire();
        }
    }
    get categories() {
        return this._categories.get() || ',';
    }
    set categories(categories) {
        this._categories.set(categories);
        this._onDidChange.fire();
    }
    toggleCategory(category) {
        const categories = this.categories;
        if (this.hasCategory(category)) {
            this.categories = categories.replace(`,${category},`, ',');
        }
        else {
            this.categories = `${categories}${category},`;
        }
    }
    hasCategory(category) {
        if (category === ',') {
            return false;
        }
        return this.categories.includes(`,${category},`);
    }
}
let OutputService = class OutputService extends Disposable {
    constructor(storageService, instantiationService, textModelService, logService, loggerService, lifecycleService, viewsService, contextKeyService, defaultLogLevelsService, fileDialogService, fileService, environmentService) {
        super();
        this.storageService = storageService;
        this.instantiationService = instantiationService;
        this.textModelService = textModelService;
        this.logService = logService;
        this.loggerService = loggerService;
        this.lifecycleService = lifecycleService;
        this.viewsService = viewsService;
        this.defaultLogLevelsService = defaultLogLevelsService;
        this.fileDialogService = fileDialogService;
        this.fileService = fileService;
        this.channels = this._register(new DisposableMap());
        this._onActiveOutputChannel = this._register(new Emitter());
        this.onActiveOutputChannel = this._onActiveOutputChannel.event;
        this.outputFolderCreationPromise = null;
        this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, 1 /* StorageScope.WORKSPACE */, '');
        this.activeOutputChannelContext = ACTIVE_OUTPUT_CHANNEL_CONTEXT.bindTo(contextKeyService);
        this.activeOutputChannelContext.set(this.activeChannelIdInStorage);
        this._register(this.onActiveOutputChannel(channel => this.activeOutputChannelContext.set(channel)));
        this.activeFileOutputChannelContext = CONTEXT_ACTIVE_FILE_OUTPUT.bindTo(contextKeyService);
        this.activeLogOutputChannelContext = CONTEXT_ACTIVE_LOG_FILE_OUTPUT.bindTo(contextKeyService);
        this.activeOutputChannelLevelSettableContext = CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE.bindTo(contextKeyService);
        this.activeOutputChannelLevelContext = CONTEXT_ACTIVE_OUTPUT_LEVEL.bindTo(contextKeyService);
        this.activeOutputChannelLevelIsDefaultContext = CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.bindTo(contextKeyService);
        this.outputLocation = joinPath(environmentService.windowLogsPath, `output_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
        // Register as text model content provider for output
        this._register(textModelService.registerTextModelContentProvider(Schemas.outputChannel, this));
        this._register(instantiationService.createInstance(OutputLinkProvider));
        // Create output channels for already registered channels
        const registry = Registry.as(Extensions.OutputChannels);
        for (const channelIdentifier of registry.getChannels()) {
            this.onDidRegisterChannel(channelIdentifier.id);
        }
        this._register(registry.onDidRegisterChannel(id => this.onDidRegisterChannel(id)));
        this._register(registry.onDidUpdateChannelSources(channel => this.onDidUpdateChannelSources(channel)));
        this._register(registry.onDidRemoveChannel(channel => this.onDidRemoveChannel(channel)));
        // Set active channel to first channel if not set
        if (!this.activeChannel) {
            const channels = this.getChannelDescriptors();
            this.setActiveChannel(channels && channels.length > 0 ? this.getChannel(channels[0].id) : undefined);
        }
        this._register(Event.filter(this.viewsService.onDidChangeViewVisibility, e => e.id === OUTPUT_VIEW_ID && e.visible)(() => {
            if (this.activeChannel) {
                this.viewsService.getActiveViewWithId(OUTPUT_VIEW_ID)?.showChannel(this.activeChannel, true);
            }
        }));
        this._register(this.loggerService.onDidChangeLogLevel(() => {
            this.setLevelContext();
            this.setLevelIsDefaultContext();
        }));
        this._register(this.defaultLogLevelsService.onDidChangeDefaultLogLevels(() => {
            this.setLevelIsDefaultContext();
        }));
        this._register(this.lifecycleService.onDidShutdown(() => this.dispose()));
        this.filters = this._register(new OutputViewFilters({
            filterHistory: [],
            trace: true,
            debug: true,
            info: true,
            warning: true,
            error: true,
            sources: '',
        }, contextKeyService));
    }
    provideTextContent(resource) {
        const channel = this.getChannel(resource.path);
        if (channel) {
            return channel.model.loadModel();
        }
        return null;
    }
    async showChannel(id, preserveFocus) {
        const channel = this.getChannel(id);
        if (this.activeChannel?.id !== channel?.id) {
            this.setActiveChannel(channel);
            this._onActiveOutputChannel.fire(id);
        }
        const outputView = await this.viewsService.openView(OUTPUT_VIEW_ID, !preserveFocus);
        if (outputView && channel) {
            outputView.showChannel(channel, !!preserveFocus);
        }
    }
    getChannel(id) {
        return this.channels.get(id);
    }
    getChannelDescriptor(id) {
        return Registry.as(Extensions.OutputChannels).getChannel(id);
    }
    getChannelDescriptors() {
        return Registry.as(Extensions.OutputChannels).getChannels();
    }
    getActiveChannel() {
        return this.activeChannel;
    }
    canSetLogLevel(channel) {
        return channel.log && channel.id !== telemetryLogId;
    }
    getLogLevel(channel) {
        if (!channel.log) {
            return undefined;
        }
        const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
        if (sources.length === 0) {
            return undefined;
        }
        const logLevel = this.loggerService.getLogLevel();
        return sources.reduce((prev, curr) => Math.min(prev, this.loggerService.getLogLevel(curr.resource) ?? logLevel), LogLevel.Error);
    }
    setLogLevel(channel, logLevel) {
        if (!channel.log) {
            return;
        }
        const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
        if (sources.length === 0) {
            return;
        }
        for (const source of sources) {
            this.loggerService.setLogLevel(source.resource, logLevel);
        }
    }
    registerCompoundLogChannel(descriptors) {
        const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
        descriptors.sort((a, b) => a.label.localeCompare(b.label));
        const id = descriptors.map(r => r.id.toLowerCase()).join('-');
        if (!outputChannelRegistry.getChannel(id)) {
            outputChannelRegistry.registerChannel({
                id,
                label: descriptors.map(r => r.label).join(', '),
                log: descriptors.some(r => r.log),
                user: true,
                source: descriptors.map(descriptor => {
                    if (isSingleSourceOutputChannelDescriptor(descriptor)) {
                        return [{ resource: descriptor.source.resource, name: descriptor.source.name ?? descriptor.label }];
                    }
                    if (isMultiSourceOutputChannelDescriptor(descriptor)) {
                        return descriptor.source;
                    }
                    const channel = this.getChannel(descriptor.id);
                    if (channel) {
                        return channel.model.source;
                    }
                    return [];
                }).flat(),
            });
        }
        return id;
    }
    async saveOutputAs(outputPath, ...channels) {
        let channel;
        if (channels.length > 1) {
            const compoundChannelId = this.registerCompoundLogChannel(channels);
            channel = this.getChannel(compoundChannelId);
        }
        else {
            channel = this.getChannel(channels[0].id);
        }
        if (!channel) {
            return;
        }
        try {
            let uri = outputPath;
            if (!uri) {
                const name = channels.length > 1 ? 'output' : channels[0].label;
                uri = await this.fileDialogService.showSaveDialog({
                    title: localize('saveLog.dialogTitle', "Save Output As"),
                    availableFileSystems: [Schemas.file],
                    defaultUri: joinPath(await this.fileDialogService.defaultFilePath(), `${name}.log`),
                    filters: [{
                            name,
                            extensions: ['log']
                        }]
                });
            }
            if (!uri) {
                return;
            }
            const modelRef = await this.textModelService.createModelReference(channel.uri);
            try {
                await this.fileService.writeFile(uri, VSBuffer.fromString(modelRef.object.textEditorModel.getValue()));
            }
            finally {
                modelRef.dispose();
            }
            return;
        }
        finally {
            if (channels.length > 1) {
                Registry.as(Extensions.OutputChannels).removeChannel(channel.id);
            }
        }
    }
    async onDidRegisterChannel(channelId) {
        const channel = this.createChannel(channelId);
        this.channels.set(channelId, channel);
        if (!this.activeChannel || this.activeChannelIdInStorage === channelId) {
            this.setActiveChannel(channel);
            this._onActiveOutputChannel.fire(channelId);
            const outputView = this.viewsService.getActiveViewWithId(OUTPUT_VIEW_ID);
            outputView?.showChannel(channel, true);
        }
    }
    onDidUpdateChannelSources(channel) {
        const outputChannel = this.channels.get(channel.id);
        if (outputChannel) {
            outputChannel.model.updateChannelSources(channel.source);
        }
    }
    onDidRemoveChannel(channel) {
        if (this.activeChannel?.id === channel.id) {
            const channels = this.getChannelDescriptors();
            if (channels[0]) {
                this.showChannel(channels[0].id);
            }
        }
        this.channels.deleteAndDispose(channel.id);
    }
    createChannel(id) {
        const channel = this.instantiateChannel(id);
        this._register(Event.once(channel.model.onDispose)(() => {
            if (this.activeChannel === channel) {
                const channels = this.getChannelDescriptors();
                const channel = channels.length ? this.getChannel(channels[0].id) : undefined;
                if (channel && this.viewsService.isViewVisible(OUTPUT_VIEW_ID)) {
                    this.showChannel(channel.id);
                }
                else {
                    this.setActiveChannel(undefined);
                }
            }
            Registry.as(Extensions.OutputChannels).removeChannel(id);
        }));
        return channel;
    }
    instantiateChannel(id) {
        const channelData = Registry.as(Extensions.OutputChannels).getChannel(id);
        if (!channelData) {
            this.logService.error(`Channel '${id}' is not registered yet`);
            throw new Error(`Channel '${id}' is not registered yet`);
        }
        if (!this.outputFolderCreationPromise) {
            this.outputFolderCreationPromise = this.fileService.createFolder(this.outputLocation).then(() => undefined);
        }
        return this.instantiationService.createInstance(OutputChannel, channelData, this.outputLocation, this.outputFolderCreationPromise);
    }
    setLevelContext() {
        const descriptor = this.activeChannel?.outputChannelDescriptor;
        const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : undefined;
        this.activeOutputChannelLevelContext.set(channelLogLevel !== undefined ? LogLevelToString(channelLogLevel) : '');
    }
    async setLevelIsDefaultContext() {
        const descriptor = this.activeChannel?.outputChannelDescriptor;
        const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : undefined;
        if (channelLogLevel !== undefined) {
            const channelDefaultLogLevel = this.defaultLogLevelsService.getDefaultLogLevel(descriptor?.extensionId);
            this.activeOutputChannelLevelIsDefaultContext.set(channelDefaultLogLevel === channelLogLevel);
        }
        else {
            this.activeOutputChannelLevelIsDefaultContext.set(false);
        }
    }
    setActiveChannel(channel) {
        this.activeChannel = channel;
        const descriptor = channel?.outputChannelDescriptor;
        this.activeFileOutputChannelContext.set(!!descriptor && isSingleSourceOutputChannelDescriptor(descriptor));
        this.activeLogOutputChannelContext.set(!!descriptor?.log);
        this.activeOutputChannelLevelSettableContext.set(descriptor !== undefined && this.canSetLogLevel(descriptor));
        this.setLevelIsDefaultContext();
        this.setLevelContext();
        if (this.activeChannel) {
            this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(OUTPUT_ACTIVE_CHANNEL_KEY, 1 /* StorageScope.WORKSPACE */);
        }
    }
};
OutputService = __decorate([
    __param(0, IStorageService),
    __param(1, IInstantiationService),
    __param(2, ITextModelService),
    __param(3, ILogService),
    __param(4, ILoggerService),
    __param(5, ILifecycleService),
    __param(6, IViewsService),
    __param(7, IContextKeyService),
    __param(8, IDefaultLogLevelsService),
    __param(9, IFileDialogService),
    __param(10, IFileService),
    __param(11, IWorkbenchEnvironmentService)
], OutputService);
export { OutputService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0U2VydmljZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9vdXRwdXQvYnJvd3Nlci9vdXRwdXRTZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQWtDLGNBQWMsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFxRCxVQUFVLEVBQTBCLDZCQUE2QixFQUFFLDBCQUEwQixFQUFFLG9DQUFvQyxFQUFFLDJCQUEyQixFQUFFLHNDQUFzQyxFQUFzQix5QkFBeUIsRUFBRSx5QkFBeUIsRUFBRSx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSwyQkFBMkIsRUFBRSw4QkFBOEIsRUFBdUMscUNBQXFDLEVBQUUsNEJBQTRCLEVBQUUsb0NBQW9DLEVBQWEsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0dEIsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDN0QsT0FBTyxFQUFFLGlCQUFpQixFQUE2QixNQUFNLHVEQUF1RCxDQUFDO0FBRXJILE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FB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