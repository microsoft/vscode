/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelDescriptor, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, OUTPUT_SCHEME, LOG_SCHEME, CONTEXT_ACTIVE_LOG_OUTPUT, LOG_MIME, OUTPUT_MIME } from 'vs/workbench/contrib/output/common/output';
import { OutputPanel } from 'vs/workbench/contrib/output/browser/outputPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { OutputLinkProvider } from 'vs/workbench/contrib/output/common/outputLinkProvider';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { ITextModel } from 'vs/editor/common/model';
import { IPanel } from 'vs/workbench/common/panel';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IOutputChannelModel, IOutputChannelModelService } from 'vs/workbench/services/output/common/outputChannelModel';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

class OutputChannel extends Disposable implements IOutputChannel {

	scrollLock: boolean = false;
	readonly model: IOutputChannelModel;
	readonly id: string;
	readonly label: string;

	constructor(
		readonly outputChannelDescriptor: IOutputChannelDescriptor,
		@IOutputChannelModelService outputChannelModelService: IOutputChannelModelService
	) {
		super();
		this.id = outputChannelDescriptor.id;
		this.label = outputChannelDescriptor.label;
		this.model = this._register(outputChannelModelService.createOutputChannelModel(this.id, URI.from({ scheme: OUTPUT_SCHEME, path: this.id }), outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME, outputChannelDescriptor.file));
	}

	append(output: string): void {
		this.model.append(output);
	}

	update(): void {
		this.model.update();
	}

	clear(till?: number): void {
		this.model.clear(till);
	}
}

export class OutputService extends Disposable implements IOutputService, ITextModelContentProvider {

	public _serviceBrand: any;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelIdInStorage: string;
	private activeChannel?: OutputChannel;

	private readonly _onActiveOutputChannel = this._register(new Emitter<string>());
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private _outputPanel: OutputPanel | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPanelService private readonly panelService: IPanelService,
		@ITextModelService textModelResolverService: ITextModelService,
		@ILogService private readonly logService: ILogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, '');

		// Register as text model content provider for output
		textModelResolverService.registerTextModelContentProvider(OUTPUT_SCHEME, this);
		instantiationService.createInstance(OutputLinkProvider);

		// Create output channels for already registered channels
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		for (const channelIdentifier of registry.getChannels()) {
			this.onDidRegisterChannel(channelIdentifier.id);
		}
		this._register(registry.onDidRegisterChannel(this.onDidRegisterChannel, this));

		this._register(panelService.onDidPanelOpen(({ panel, focus }) => this.onDidPanelOpen(panel, !focus), this));
		this._register(panelService.onDidPanelClose(this.onDidPanelClose, this));

		// Set active channel to first channel if not set
		if (!this.activeChannel) {
			const channels = this.getChannelDescriptors();
			this.setActiveChannel(channels && channels.length > 0 ? this.getChannel(channels[0].id) : undefined);
		}

		this._register(this.lifecycleService.onShutdown(() => this.dispose()));
	}

	provideTextContent(resource: URI): Promise<ITextModel> | null {
		const channel = <OutputChannel>this.getChannel(resource.path);
		if (channel) {
			return channel.model.loadModel();
		}
		return null;
	}

	showChannel(id: string, preserveFocus?: boolean): Promise<void> {
		const channel = this.getChannel(id);
		if (!channel || this.isChannelShown(channel)) {
			if (this._outputPanel && !preserveFocus) {
				this._outputPanel.focus();
			}
			return Promise.resolve(undefined);
		}

		this.setActiveChannel(channel);
		let promise: Promise<void>;
		if (this.isPanelShown()) {
			promise = this.doShowChannel(channel, !!preserveFocus);
		} else {
			this.panelService.openPanel(OUTPUT_PANEL_ID);
			promise = this.doShowChannel(channel, !!preserveFocus);
		}
		return promise.then(() => this._onActiveOutputChannel.fire(id));
	}

	getChannel(id: string): OutputChannel | undefined {
		return this.channels.get(id);
	}

	getChannelDescriptors(): IOutputChannelDescriptor[] {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
	}

	getActiveChannel(): IOutputChannel | undefined {
		return this.activeChannel;
	}

	private onDidRegisterChannel(channelId: string): void {
		const channel = this.createChannel(channelId);
		this.channels.set(channelId, channel);
		if (!this.activeChannel || this.activeChannelIdInStorage === channelId) {
			this.setActiveChannel(channel);
			this.onDidPanelOpen(this.panelService.getActivePanel(), true)
				.then(() => this._onActiveOutputChannel.fire(channelId));
		}
	}

	private onDidPanelOpen(panel: IPanel | null, preserveFocus: boolean): Promise<void> {
		if (panel && panel.getId() === OUTPUT_PANEL_ID) {
			this._outputPanel = <OutputPanel>this.panelService.getActivePanel();
			if (this.activeChannel) {
				return this.doShowChannel(this.activeChannel, preserveFocus);
			}
		}
		return Promise.resolve(undefined);
	}

	private onDidPanelClose(panel: IPanel): void {
		if (this._outputPanel && panel.getId() === OUTPUT_PANEL_ID) {
			CONTEXT_ACTIVE_LOG_OUTPUT.bindTo(this.contextKeyService).set(false);
			this._outputPanel.clearInput();
		}
	}

	private createChannel(id: string): OutputChannel {
		const channelDisposables: IDisposable[] = [];
		const channel = this.instantiateChannel(id);
		channel.model.onDidAppendedContent(() => {
			if (!channel.scrollLock) {
				const panel = this.panelService.getActivePanel();
				if (panel && panel.getId() === OUTPUT_PANEL_ID && this.isChannelShown(channel)) {
					let outputPanel = <OutputPanel>panel;
					outputPanel.revealLastLine();
				}
			}
		}, channelDisposables);
		channel.model.onDispose(() => {
			if (this.activeChannel === channel) {
				const channels = this.getChannelDescriptors();
				const channel = channels.length ? this.getChannel(channels[0].id) : undefined;
				if (channel && this.isPanelShown()) {
					this.showChannel(channel.id, true);
				} else {
					this.setActiveChannel(channel);
					if (this.activeChannel) {
						this._onActiveOutputChannel.fire(this.activeChannel.id);
					}
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

	private doShowChannel(channel: OutputChannel, preserveFocus: boolean): Promise<void> {
		if (this._outputPanel) {
			CONTEXT_ACTIVE_LOG_OUTPUT.bindTo(this.contextKeyService).set(!!channel.outputChannelDescriptor.file && channel.outputChannelDescriptor.log);
			return this._outputPanel.setInput(this.createInput(channel), EditorOptions.create({ preserveFocus }), CancellationToken.None)
				.then(() => {
					if (!preserveFocus && this._outputPanel) {
						this._outputPanel.focus();
					}
				});
		}
		return Promise.resolve(undefined);
	}

	private isChannelShown(channel: IOutputChannel): boolean {
		return this.isPanelShown() && this.activeChannel === channel;
	}

	private isPanelShown(): boolean {
		const panel = this.panelService.getActivePanel();
		return !!panel && panel.getId() === OUTPUT_PANEL_ID;
	}

	private createInput(channel: IOutputChannel): ResourceEditorInput {
		const resource = URI.from({ scheme: OUTPUT_SCHEME, path: channel.id });
		return this.instantiationService.createInstance(ResourceEditorInput, nls.localize('output', "{0} - Output", channel.label), nls.localize('channel', "Output channel for '{0}'", channel.label), resource, undefined);
	}

	private setActiveChannel(channel: OutputChannel | undefined): void {
		this.activeChannel = channel;

		if (this.activeChannel) {
			this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE);
		}
	}
}

export class LogContentProvider {

	private channelModels: Map<string, IOutputChannelModel> = new Map<string, IOutputChannelModel>();

	constructor(
		@IOutputService private readonly outputService: IOutputService,
		@IOutputChannelModelService private readonly outputChannelModelService: IOutputChannelModelService
	) {
	}

	provideTextContent(resource: URI): Promise<ITextModel> | null {
		if (resource.scheme === LOG_SCHEME) {
			let channelModel = this.getChannelModel(resource);
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
				channelModel = this.outputChannelModelService.createOutputChannelModel(channelId, resource, outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME, outputChannelDescriptor.file);
				channelModel.onDispose(() => dispose(channelDisposables), channelDisposables);
				this.channelModels.set(channelId, channelModel);
			}
		}
		return channelModel;
	}
}
