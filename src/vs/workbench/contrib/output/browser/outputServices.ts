/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { IOutputChannel, IOutputService, OUTPUT_VIEW_ID, OUTPUT_SCHEME, LOG_SCHEME, LOG_MIME, OUTPUT_MIME, OutputChannelUpdateMode, IOutputChannelDescriptor, Extensions, IOutputChannelRegistry, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_LOG_OUTPUT } from 'vs/workbench/services/output/common/output';
import { OutputLinkProvider } from 'vs/workbench/contrib/output/browser/outputLinkProvider';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { ITextModel } from 'vs/editor/common/model';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IOutputChannelModel } from 'vs/workbench/contrib/output/common/outputChannelModel';
import { IViewsService } from 'vs/workbench/common/views';
import { OutputViewPane } from 'vs/workbench/contrib/output/browser/outputView';
import { IOutputChannelModelService } from 'vs/workbench/contrib/output/common/outputChannelModelService';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

class OutputChannel extends Disposable implements IOutputChannel {

	scrollLock: boolean = false;
	readonly model: IOutputChannelModel;
	readonly id: string;
	readonly label: string;
	readonly uri: URI;

	constructor(
		readonly outputChannelDescriptor: IOutputChannelDescriptor,
		@IOutputChannelModelService outputChannelModelService: IOutputChannelModelService,
		@ILanguageService languageService: ILanguageService,
	) {
		super();
		this.id = outputChannelDescriptor.id;
		this.label = outputChannelDescriptor.label;
		this.uri = URI.from({ scheme: OUTPUT_SCHEME, path: this.id });
		this.model = this._register(outputChannelModelService.createOutputChannelModel(this.id, this.uri, outputChannelDescriptor.languageId ? languageService.createById(outputChannelDescriptor.languageId) : languageService.createByMimeType(outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME), outputChannelDescriptor.file));
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

export class OutputService extends Disposable implements IOutputService, ITextModelContentProvider {

	declare readonly _serviceBrand: undefined;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelIdInStorage: string;
	private activeChannel?: OutputChannel;

	private readonly _onActiveOutputChannel = this._register(new Emitter<string>());
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private readonly activeOutputChannelContext: IContextKey<string>;
	private readonly activeLogOutputChannelContext: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService textModelResolverService: ITextModelService,
		@ILogService private readonly logService: ILogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IViewsService private readonly viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, '');
		this.activeOutputChannelContext = ACTIVE_OUTPUT_CHANNEL_CONTEXT.bindTo(contextKeyService);
		this.activeOutputChannelContext.set(this.activeChannelIdInStorage);
		this._register(this.onActiveOutputChannel(channel => this.activeOutputChannelContext.set(channel)));

		this.activeLogOutputChannelContext = CONTEXT_ACTIVE_LOG_OUTPUT.bindTo(contextKeyService);

		// Register as text model content provider for output
		textModelResolverService.registerTextModelContentProvider(OUTPUT_SCHEME, this);
		instantiationService.createInstance(OutputLinkProvider);

		// Create output channels for already registered channels
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		for (const channelIdentifier of registry.getChannels()) {
			this.onDidRegisterChannel(channelIdentifier.id);
		}
		this._register(registry.onDidRegisterChannel(this.onDidRegisterChannel, this));

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

		this._register(this.lifecycleService.onDidShutdown(() => this.dispose()));
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

	private createChannel(id: string): OutputChannel {
		const channelDisposables: IDisposable[] = [];
		const channel = this.instantiateChannel(id);
		channel.model.onDispose(() => {
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
			dispose(channelDisposables);
		}, channelDisposables);

		return channel;
	}

	private instantiateChannel(id: string): OutputChannel {
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(id);
		if (!channelData) {
			this.logService.error(`Channel '${id}' is not registered yet`);
			throw new Error(`Channel '${id}' is not registered yet`);
		}
		return this.instantiationService.createInstance(OutputChannel, channelData);
	}

	private setActiveChannel(channel: OutputChannel | undefined): void {
		this.activeChannel = channel;
		this.activeLogOutputChannelContext.set(!!channel?.outputChannelDescriptor?.file && channel?.outputChannelDescriptor?.log);

		if (this.activeChannel) {
			this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE);
		}
	}
}

export class LogContentProvider {

	private channelModels: Map<string, IOutputChannelModel> = new Map<string, IOutputChannelModel>();

	constructor(
		@IOutputService private readonly outputService: IOutputService,
		@IOutputChannelModelService private readonly outputChannelModelService: IOutputChannelModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
	}

	provideTextContent(resource: URI): Promise<ITextModel> | null {
		if (resource.scheme === LOG_SCHEME) {
			const channelModel = this.getChannelModel(resource);
			if (channelModel) {
				return channelModel.loadModel();
			}
		}
		return null;
	}

	private getChannelModel(resource: URI): IOutputChannelModel | undefined {
		const channelId = resource.path;
		let channelModel = this.channelModels.get(channelId);
		if (!channelModel) {
			const channelDisposables: IDisposable[] = [];
			const outputChannelDescriptor = this.outputService.getChannelDescriptors().filter(({ id }) => id === channelId)[0];
			if (outputChannelDescriptor && outputChannelDescriptor.file) {
				channelModel = this.outputChannelModelService.createOutputChannelModel(channelId, resource, outputChannelDescriptor.languageId ? this.languageService.createById(outputChannelDescriptor.languageId) : this.languageService.createByMimeType(outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME), outputChannelDescriptor.file);
				channelModel.onDispose(() => dispose(channelDisposables), channelDisposables);
				this.channelModels.set(channelId, channelModel);
			}
		}
		return channelModel;
	}
}
