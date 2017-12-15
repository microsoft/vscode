/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import Event, { Emitter } from 'vs/base/common/event';
import { binarySearch } from 'vs/base/common/arrays';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelIdentifier, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, MAX_OUTPUT_LENGTH, OUTPUT_SCHEME, OUTPUT_MIME } from 'vs/workbench/parts/output/common/output';
import { OutputPanel } from 'vs/workbench/parts/output/browser/outputPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { OutputLinkProvider } from 'vs/workbench/parts/output/common/outputLinkProvider';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { IPanel } from 'vs/workbench/common/panel';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

export interface IOutputDelta {
	readonly value: string;
	readonly id: number;
	readonly append?: boolean;
}

export class BufferedContent {

	private data: string[] = [];
	private dataIds: number[] = [];
	private idPool = 0;
	private length = 0;

	public append(content: string): void {
		this.data.push(content);
		this.dataIds.push(++this.idPool);
		this.length += content.length;
		this.trim();
	}

	public clear(): void {
		this.data.length = 0;
		this.dataIds.length = 0;
		this.length = 0;
	}

	private trim(): void {
		if (this.length < MAX_OUTPUT_LENGTH * 1.2) {
			return;
		}

		while (this.length > MAX_OUTPUT_LENGTH) {
			this.dataIds.shift();
			const removed = this.data.shift();
			this.length -= removed.length;
		}
	}

	public getDelta(previousId?: number): IOutputDelta {
		let idx = -1;
		if (previousId !== void 0) {
			idx = binarySearch(this.dataIds, previousId, (a, b) => a - b);
		}

		const id = this.idPool;
		if (idx >= 0) {
			const value = strings.removeAnsiEscapeCodes(this.data.slice(idx + 1).join(''));
			return { value, id, append: true };
		} else {
			const value = strings.removeAnsiEscapeCodes(this.data.join(''));
			return { value, id };
		}
	}
}

abstract class OutputChannel extends Disposable implements IOutputChannel {

	protected _onDidChange: Emitter<void> = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	protected _onDidClear: Emitter<void> = new Emitter<void>();
	readonly onDidClear: Event<void> = this._onDidClear.event;

	protected _onDispose: Emitter<void> = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	scrollLock: boolean = false;

	constructor(private readonly oputChannelIdentifier: IOutputChannelIdentifier) {
		super();
	}

	get id(): string {
		return this.oputChannelIdentifier.id;
	}

	get label(): string {
		return this.oputChannelIdentifier.label;
	}

	show(): TPromise<void> { return TPromise.as(null); }
	hide(): void { }
	append(output: string) { /** noop */ }
	getOutputDelta(id?: number): TPromise<IOutputDelta> { return TPromise.as(null); }
	clear(): void { }

	dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}

}

class BufferredOutputChannel extends OutputChannel implements IOutputChannel {

	private bufferredContent: BufferedContent = new BufferedContent();

	append(output: string) {
		this.bufferredContent.append(output);
		this._onDidChange.fire();
	}

	getOutputDelta(id?: number): TPromise<IOutputDelta> {
		return TPromise.as(this.bufferredContent.getDelta(id));
	}

	clear(): void {
		this.bufferredContent.clear();
		this._onDidClear.fire();
	}
}

class FileOutputChannel extends OutputChannel implements IOutputChannel {

	private readonly file: URI;
	private disposables: IDisposable[] = [];
	private shown: boolean = false;

	private contentResolver: TPromise<string>;
	private startOffset: number;
	private endOffset: number;

	constructor(
		outputChannelIdentifier: IOutputChannelIdentifier,
		@IFileService private fileService: IFileService
	) {
		super(outputChannelIdentifier);
		this.file = outputChannelIdentifier.file;
		this.startOffset = 0;
		this.endOffset = 0;
	}

	show(): TPromise<void> {
		if (!this.shown) {
			this.shown = true;
			this.watch();
			return this.resolve()
				.then(content => {
					if (this.endOffset !== content.length) {
						this._onDidChange.fire();
					}
				});
		}
		return TPromise.as(null);
	}

	hide(): void {
		if (this.shown) {
			this.shown = false;
			this.unwatch();
		}
		this.contentResolver = null;
	}

	getOutputDelta(previousId?: number): TPromise<IOutputDelta> {
		if (!this.shown) {
			// Do not return any content when not shown
			return TPromise.as(null);
		}

		return this.resolve()
			.then(content => {
				const startOffset = previousId !== void 0 ? previousId : this.startOffset;
				this.endOffset = content.length;
				if (this.startOffset === this.endOffset) {
					// Content cleared
					return { append: false, id: this.endOffset, value: '' };
				}
				if (startOffset === this.endOffset) {
					// Content not changed
					return { append: true, id: this.endOffset, value: '' };
				}
				if (startOffset > 0 && startOffset < this.endOffset) {
					// Delta
					const value = content.substring(startOffset, this.endOffset);
					return { append: true, value, id: this.endOffset };
				}
				// Replace
				return { append: false, value: content, id: this.endOffset };
			});
	}

	clear(): void {
		this.startOffset = this.endOffset;
		this._onDidClear.fire();
	}

	private resolve(): TPromise<string> {
		if (!this.contentResolver) {
			this.contentResolver = this.fileService.resolveContent(this.file)
				.then(content => content.value);
		}
		return this.contentResolver;
	}

	private watch(): void {
		this.fileService.watchFileChanges(this.file);
		this.disposables.push(this.fileService.onFileChanges(changes => {
			if (changes.contains(this.file, FileChangeType.UPDATED)) {
				this.contentResolver = null;
				this._onDidChange.fire();
			}
		}));
	}

	private unwatch(): void {
		this.fileService.unwatchFileChanges(this.file);
		this.disposables = dispose(this.disposables);
	}

	dispose(): void {
		this.hide();
		super.dispose();
	}
}

export class OutputService implements IOutputService, ITextModelContentProvider {

	public _serviceBrand: any;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelId: string;

	private _onDidChannelContentChange: Emitter<string> = new Emitter<string>();
	readonly onDidChannelContentChange: Event<string> = this._onDidChannelContentChange.event;

	private _onActiveOutputChannel: Emitter<string> = new Emitter<string>();
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private _outputPanel: OutputPanel;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPanelService private panelService: IPanelService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
	) {
		const channels = this.getChannels();
		this.activeChannelId = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, channels && channels.length > 0 ? channels[0].id : null);

		instantiationService.createInstance(OutputLinkProvider);

		// Register as text model content provider for output
		textModelResolverService.registerTextModelContentProvider(OUTPUT_SCHEME, this);

		this.onDidPanelOpen(this.panelService.getActivePanel());
		panelService.onDidPanelOpen(this.onDidPanelOpen, this);
		panelService.onDidPanelClose(this.onDidPanelClose, this);
	}

	provideTextContent(resource: URI): TPromise<IModel> {
		const channel = <OutputChannel>this.getChannel(resource.fsPath);
		return channel.getOutputDelta()
			.then(outputDelta => this.modelService.createModel(outputDelta.value, this.modeService.getOrCreateMode(OUTPUT_MIME), resource));
	}

	showChannel(id: string, preserveFocus?: boolean): TPromise<void> {
		if (this.isChannelShown(id)) {
			return TPromise.as(null);
		}

		if (this.activeChannelId) {
			this.doHideChannel(this.activeChannelId);
		}

		this.activeChannelId = id;
		const promise: TPromise<any> = this._outputPanel ? this.doShowChannel(id, preserveFocus) : this.panelService.openPanel(OUTPUT_PANEL_ID);
		return promise.then(() => this._onActiveOutputChannel.fire(id));
	}

	showChannelInEditor(channelId: string): TPromise<void> {
		return this.editorService.openEditor(this.createInput(channelId)) as TPromise;
	}

	getChannel(id: string): IOutputChannel {
		if (!this.channels.has(id)) {
			this.channels.set(id, this.createChannel(id));
		}
		return this.channels.get(id);
	}

	getChannels(): IOutputChannelIdentifier[] {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
	}

	getActiveChannel(): IOutputChannel {
		return this.getChannel(this.activeChannelId);
	}

	private createChannel(id: string): OutputChannel {
		const channelDisposables = [];
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(id);
		const channel = channelData && channelData.file ? this.instantiationService.createInstance(FileOutputChannel, channelData) : this.instantiationService.createInstance(BufferredOutputChannel, { id: id, label: '' });
		channelDisposables.push(this.instantiationService.createInstance(ChannelModelUpdater, channel));
		channel.onDidChange(() => this._onDidChannelContentChange.fire(id), channelDisposables);
		channel.onDispose(() => {
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).removeChannel(id);
			if (this.activeChannelId === id) {
				const channels = this.getChannels();
				if (this._outputPanel && channels.length) {
					this.showChannel(channels[0].id);
				} else {
					this._onActiveOutputChannel.fire(void 0);
				}
			}
			dispose(channelDisposables);
		}, channelDisposables);

		return channel;
	}

	private isChannelShown(channelId: string): boolean {
		const panel = this.panelService.getActivePanel();
		return panel && panel.getId() === OUTPUT_PANEL_ID && this.activeChannelId === channelId;
	}

	private onDidPanelClose(panel: IPanel): void {
		if (this._outputPanel && panel.getId() === OUTPUT_PANEL_ID) {
			if (this.activeChannelId) {
				this.doHideChannel(this.activeChannelId);
			}
			this._outputPanel.clearInput();
		}
	}

	private onDidPanelOpen(panel: IPanel): void {
		if (panel && panel.getId() === OUTPUT_PANEL_ID) {
			this._outputPanel = <OutputPanel>this.panelService.getActivePanel();
			if (this.activeChannelId) {
				this.doShowChannel(this.activeChannelId, true);
			}
		}
	}

	private doShowChannel(channelId: string, preserveFocus: boolean): TPromise<void> {
		if (this._outputPanel) {
			const channel = <OutputChannel>this.getChannel(channelId);
			return channel.show()
				.then(() => {
					this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, channelId, StorageScope.WORKSPACE);
					this._outputPanel.setInput(this.createInput(channelId), EditorOptions.create({ preserveFocus: preserveFocus }));
					if (!preserveFocus) {
						this._outputPanel.focus();
					}
				});
		} else {
			return TPromise.as(null);
		}
	}

	private doHideChannel(channelId): void {
		const channel = <OutputChannel>this.getChannel(channelId);
		if (channel) {
			channel.hide();
		}
	}

	private createInput(channelId: string): ResourceEditorInput {
		const resource = URI.from({ scheme: OUTPUT_SCHEME, path: channelId });
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(channelId);
		const label = channelData ? channelData.label : channelId;
		return this.instantiationService.createInstance(ResourceEditorInput, nls.localize('output', "{0} - Output", label), nls.localize('channel', "Output channel for '{0}'", label), resource);
	}
}

class ChannelModelUpdater extends Disposable {

	private updateInProgress: boolean = false;
	private modelUpdater: RunOnceScheduler;
	private lastReadId: number;

	constructor(
		private channel: OutputChannel,
		@IModelService private modelService: IModelService,
		@IPanelService private panelService: IPanelService
	) {
		super();
		this.modelUpdater = new RunOnceScheduler(() => this.doUpdate(), 300);
		this._register(channel.onDidChange(() => this.onDidChange()));
		this._register(channel.onDidClear(() => this.onDidClear()));
		this._register(toDisposable(() => this.modelUpdater.cancel()));
	}

	private onDidChange(): void {
		if (!this.updateInProgress) {
			this.updateInProgress = true;
			this.modelUpdater.schedule();
		}
	}

	private onDidClear(): void {
		this.modelUpdater.cancel();
		this.updateInProgress = true;
		this.doUpdate();
	}

	private doUpdate(): void {
		this.channel.getOutputDelta(this.lastReadId)
			.then(delta => {
				const model = this.getModel(this.channel.id);
				if (model && !model.isDisposed()) {
					if (delta) {
						if (delta.append) {
							const lastLine = model.getLineCount();
							const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
							model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), delta.value)]);
						} else {
							model.setValue(delta.value);
						}
						this.lastReadId = delta.id;
						if (!this.channel.scrollLock) {
							(<OutputPanel>this.panelService.getActivePanel()).revealLastLine();
						}
					}
				}
				this.updateInProgress = false;
			}, () => this.updateInProgress = false);
	}

	private getModel(channel: string): IModel {
		return this.modelService.getModel(URI.from({ scheme: OUTPUT_SCHEME, path: channel }));
	}
}
