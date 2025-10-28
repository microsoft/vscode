/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IOutputChannel, IOutputService, OUTPUT_VIEW_ID, LOG_MIME, OUTPUT_MIME, OutputChannelUpdateMode, IOutputChannelDescriptor, Extensions, IOutputChannelRegistry, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_FILE_OUTPUT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, IOutputViewFilters, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, IMultiSourceOutputChannelDescriptor, isSingleSourceOutputChannelDescriptor, HIDE_CATEGORY_FILTER_CONTEXT, isMultiSourceOutputChannelDescriptor, ILogEntry } from '../../../services/output/common/output.js';
import { OutputLinkProvider } from './outputLinkProvider.js';
import { ITextModelService, ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILogService, ILoggerService, LogLevel, LogLevelToString } from '../../../../platform/log/common/log.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { DelegatedOutputChannelModel, FileOutputChannelModel, IOutputChannelModel, MultiFileOutputChannelModel } from '../common/outputChannelModel.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { OutputViewPane } from './outputView.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultLogLevelsService } from '../../logs/common/defaultLogLevels.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { localize } from '../../../../nls.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { telemetryLogId } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { toLocalISOString } from '../../../../base/common/date.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

class OutputChannel extends Disposable implements IOutputChannel {

	scrollLock: boolean = false;
	readonly model: IOutputChannelModel;
	readonly id: string;
	readonly label: string;
	readonly uri: URI;

	constructor(
		readonly outputChannelDescriptor: IOutputChannelDescriptor,
		private readonly outputLocation: URI,
		private readonly outputDirPromise: Promise<void>,
		@ILanguageService private readonly languageService: ILanguageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.id = outputChannelDescriptor.id;
		this.label = outputChannelDescriptor.label;
		this.uri = URI.from({ scheme: Schemas.outputChannel, path: this.id });
		this.model = this._register(this.createOutputChannelModel(this.uri, outputChannelDescriptor));
	}

	private createOutputChannelModel(uri: URI, outputChannelDescriptor: IOutputChannelDescriptor): IOutputChannelModel {
		const language = outputChannelDescriptor.languageId ? this.languageService.createById(outputChannelDescriptor.languageId) : this.languageService.createByMimeType(outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME);
		if (isMultiSourceOutputChannelDescriptor(outputChannelDescriptor)) {
			return this.instantiationService.createInstance(MultiFileOutputChannelModel, uri, language, [...outputChannelDescriptor.source]);
		}
		if (isSingleSourceOutputChannelDescriptor(outputChannelDescriptor)) {
			return this.instantiationService.createInstance(FileOutputChannelModel, uri, language, outputChannelDescriptor.source);
		}
		return this.instantiationService.createInstance(DelegatedOutputChannelModel, this.id, uri, language, this.outputLocation, this.outputDirPromise);
	}

	getLogEntries(): ReadonlyArray<ILogEntry> {
		return this.model.getLogEntries();
	}

	append(output: string): void {
		this.model.append(output);
	}

	update(mode: OutputChannelUpdateMode, till?: number): void {
		this.model.update(mode, till, true);
	}

	clear(): void {
		this.model.clear();
	}

	replace(value: string): void {
		this.model.replace(value);
	}
}

interface IOutputFilterOptions {
	filterHistory: string[];
	trace: boolean;
	debug: boolean;
	info: boolean;
	warning: boolean;
	error: boolean;
	sources: string;
}

class OutputViewFilters extends Disposable implements IOutputViewFilters {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		options: IOutputFilterOptions,
		private readonly contextKeyService: IContextKeyService
	) {
		super();

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

	filterHistory: string[];

	private _filterText = '';
	get text(): string {
		return this._filterText;
	}
	set text(filterText: string) {
		if (this._filterText !== filterText) {
			this._filterText = filterText;
			this._onDidChange.fire();
		}
	}

	private readonly _trace: IContextKey<boolean>;
	get trace(): boolean {
		return !!this._trace.get();
	}
	set trace(trace: boolean) {
		if (this._trace.get() !== trace) {
			this._trace.set(trace);
			this._onDidChange.fire();
		}
	}

	private readonly _debug: IContextKey<boolean>;
	get debug(): boolean {
		return !!this._debug.get();
	}
	set debug(debug: boolean) {
		if (this._debug.get() !== debug) {
			this._debug.set(debug);
			this._onDidChange.fire();
		}
	}

	private readonly _info: IContextKey<boolean>;
	get info(): boolean {
		return !!this._info.get();
	}
	set info(info: boolean) {
		if (this._info.get() !== info) {
			this._info.set(info);
			this._onDidChange.fire();
		}
	}

	private readonly _warning: IContextKey<boolean>;
	get warning(): boolean {
		return !!this._warning.get();
	}
	set warning(warning: boolean) {
		if (this._warning.get() !== warning) {
			this._warning.set(warning);
			this._onDidChange.fire();
		}
	}

	private readonly _error: IContextKey<boolean>;
	get error(): boolean {
		return !!this._error.get();
	}
	set error(error: boolean) {
		if (this._error.get() !== error) {
			this._error.set(error);
			this._onDidChange.fire();
		}
	}

	private readonly _categories: IContextKey<string>;
	get categories(): string {
		return this._categories.get() || ',';
	}
	set categories(categories: string) {
		this._categories.set(categories);
		this._onDidChange.fire();
	}

	toggleCategory(category: string): void {
		const categories = this.categories;
		if (this.hasCategory(category)) {
			this.categories = categories.replace(`,${category},`, ',');
		} else {
			this.categories = `${categories}${category},`;
		}
	}

	hasCategory(category: string): boolean {
		if (category === ',') {
			return false;
		}
		return this.categories.includes(`,${category},`);
	}
}

export class OutputService extends Disposable implements IOutputService, ITextModelContentProvider {

	declare readonly _serviceBrand: undefined;

	private readonly channels = this._register(new DisposableMap<string, OutputChannel>());
	private activeChannelIdInStorage: string;
	private activeChannel?: OutputChannel;

	private readonly _onActiveOutputChannel = this._register(new Emitter<string>());
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private readonly activeOutputChannelContext: IContextKey<string>;
	private readonly activeFileOutputChannelContext: IContextKey<boolean>;
	private readonly activeLogOutputChannelContext: IContextKey<boolean>;
	private readonly activeOutputChannelLevelSettableContext: IContextKey<boolean>;
	private readonly activeOutputChannelLevelContext: IContextKey<string>;
	private readonly activeOutputChannelLevelIsDefaultContext: IContextKey<boolean>;

	private readonly outputLocation: URI;

	readonly filters: OutputViewFilters;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILogService private readonly logService: ILogService,
		@ILoggerService private readonly loggerService: ILoggerService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDefaultLogLevelsService private readonly defaultLogLevelsService: IDefaultLogLevelsService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super();
		this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, '');
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
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
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
				this.viewsService.getActiveViewWithId<OutputViewPane>(OUTPUT_VIEW_ID)?.showChannel(this.activeChannel, true);
			}
		}));

		this._register(this.loggerService.onDidChangeLogLevel(() => {
			this.resetLogLevelFilters();
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

	provideTextContent(resource: URI): Promise<ITextModel> | null {
		const channel = <OutputChannel>this.getChannel(resource.path);
		if (channel) {
			return channel.model.loadModel();
		}
		return null;
	}

	async showChannel(id: string, preserveFocus?: boolean): Promise<void> {
		const channel = this.getChannel(id);
		if (this.activeChannel?.id !== channel?.id) {
			this.setActiveChannel(channel);
			this._onActiveOutputChannel.fire(id);
		}
		const outputView = await this.viewsService.openView<OutputViewPane>(OUTPUT_VIEW_ID, !preserveFocus);
		if (outputView && channel) {
			outputView.showChannel(channel, !!preserveFocus);
		}
	}

	getChannel(id: string): OutputChannel | undefined {
		return this.channels.get(id);
	}

	getChannelDescriptor(id: string): IOutputChannelDescriptor | undefined {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(id);
	}

	getChannelDescriptors(): IOutputChannelDescriptor[] {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
	}

	getActiveChannel(): IOutputChannel | undefined {
		return this.activeChannel;
	}

	canSetLogLevel(channel: IOutputChannelDescriptor): boolean {
		return channel.log && channel.id !== telemetryLogId;
	}

	getLogLevel(channel: IOutputChannelDescriptor): LogLevel | undefined {
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

	setLogLevel(channel: IOutputChannelDescriptor, logLevel: LogLevel): void {
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

	registerCompoundLogChannel(descriptors: IOutputChannelDescriptor[]): string {
		const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
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

	async saveOutputAs(outputPath?: URI, ...channels: IOutputChannelDescriptor[]): Promise<void> {
		let channel: IOutputChannel | undefined;
		if (channels.length > 1) {
			const compoundChannelId = this.registerCompoundLogChannel(channels);
			channel = this.getChannel(compoundChannelId);
		} else {
			channel = this.getChannel(channels[0].id);
		}

		if (!channel) {
			return;
		}

		try {
			let uri: URI | undefined = outputPath;
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
			} finally {
				modelRef.dispose();
			}
			return;
		}
		finally {
			if (channels.length > 1) {
				Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).removeChannel(channel.id);
			}
		}
	}

	private async onDidRegisterChannel(channelId: string): Promise<void> {
		const channel = this.createChannel(channelId);
		this.channels.set(channelId, channel);
		if (!this.activeChannel || this.activeChannelIdInStorage === channelId) {
			this.setActiveChannel(channel);
			this._onActiveOutputChannel.fire(channelId);
			const outputView = this.viewsService.getActiveViewWithId<OutputViewPane>(OUTPUT_VIEW_ID);
			outputView?.showChannel(channel, true);
		}
	}

	private onDidUpdateChannelSources(channel: IMultiSourceOutputChannelDescriptor): void {
		const outputChannel = this.channels.get(channel.id);
		if (outputChannel) {
			outputChannel.model.updateChannelSources(channel.source);
		}
	}

	private onDidRemoveChannel(channel: IOutputChannelDescriptor): void {
		if (this.activeChannel?.id === channel.id) {
			const channels = this.getChannelDescriptors();
			if (channels[0]) {
				this.showChannel(channels[0].id);
			}
		}
		this.channels.deleteAndDispose(channel.id);
	}

	private createChannel(id: string): OutputChannel {
		const channel = this.instantiateChannel(id);
		this._register(Event.once(channel.model.onDispose)(() => {
			if (this.activeChannel === channel) {
				const channels = this.getChannelDescriptors();
				const channel = channels.length ? this.getChannel(channels[0].id) : undefined;
				if (channel && this.viewsService.isViewVisible(OUTPUT_VIEW_ID)) {
					this.showChannel(channel.id);
				} else {
					this.setActiveChannel(undefined);
				}
			}
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).removeChannel(id);
		}));

		return channel;
	}

	private outputFolderCreationPromise: Promise<void> | null = null;
	private instantiateChannel(id: string): OutputChannel {
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(id);
		if (!channelData) {
			this.logService.error(`Channel '${id}' is not registered yet`);
			throw new Error(`Channel '${id}' is not registered yet`);
		}
		if (!this.outputFolderCreationPromise) {
			this.outputFolderCreationPromise = this.fileService.createFolder(this.outputLocation).then(() => undefined);
		}
		return this.instantiationService.createInstance(OutputChannel, channelData, this.outputLocation, this.outputFolderCreationPromise);
	}

	private resetLogLevelFilters(): void {
		const descriptor = this.activeChannel?.outputChannelDescriptor;
		const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : undefined;
		if (channelLogLevel !== undefined) {
			this.filters.error = channelLogLevel <= LogLevel.Error;
			this.filters.warning = channelLogLevel <= LogLevel.Warning;
			this.filters.info = channelLogLevel <= LogLevel.Info;
			this.filters.debug = channelLogLevel <= LogLevel.Debug;
			this.filters.trace = channelLogLevel <= LogLevel.Trace;
		}
	}

	private setLevelContext(): void {
		const descriptor = this.activeChannel?.outputChannelDescriptor;
		const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : undefined;
		this.activeOutputChannelLevelContext.set(channelLogLevel !== undefined ? LogLevelToString(channelLogLevel) : '');
	}

	private async setLevelIsDefaultContext(): Promise<void> {
		const descriptor = this.activeChannel?.outputChannelDescriptor;
		const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : undefined;
		if (channelLogLevel !== undefined) {
			const channelDefaultLogLevel = await this.defaultLogLevelsService.getDefaultLogLevel(descriptor?.extensionId);
			this.activeOutputChannelLevelIsDefaultContext.set(channelDefaultLogLevel === channelLogLevel);
		} else {
			this.activeOutputChannelLevelIsDefaultContext.set(false);
		}
	}

	private setActiveChannel(channel: OutputChannel | undefined): void {
		this.activeChannel = channel;
		const descriptor = channel?.outputChannelDescriptor;
		this.activeFileOutputChannelContext.set(!!descriptor && isSingleSourceOutputChannelDescriptor(descriptor));
		this.activeLogOutputChannelContext.set(!!descriptor?.log);
		this.activeOutputChannelLevelSettableContext.set(descriptor !== undefined && this.canSetLogLevel(descriptor));
		this.setLevelIsDefaultContext();
		this.setLevelContext();

		if (this.activeChannel) {
			this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE);
		}
	}
}
