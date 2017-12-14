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
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelIdentifier, IOutputEvent, IOutputChannel, IOutputService, IOutputDelta, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, MAX_OUTPUT_LENGTH, OUTPUT_SCHEME, OUTPUT_MIME } from 'vs/workbench/parts/output/common/output';
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

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

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

	public getDelta(previousDelta?: IOutputDelta): IOutputDelta {
		let idx = -1;
		if (previousDelta) {
			idx = binarySearch(this.dataIds, previousDelta.id, (a, b) => a - b);
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

	protected _onDidChange: Emitter<boolean> = new Emitter<boolean>();
	readonly onDidChange: Event<boolean> = this._onDidChange.event;

	protected _onDispose: Emitter<void> = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	scrollLock: boolean = false;

	constructor(private readonly oputChannelIdentifier: IOutputChannelIdentifier, ) {
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
	getOutputDelta(previousDelta?: IOutputDelta): TPromise<IOutputDelta> { return TPromise.as(null); }
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
		this._onDidChange.fire(false);
	}

	getOutputDelta(previousDelta?: IOutputDelta): TPromise<IOutputDelta> {
		return TPromise.as(this.bufferredContent.getDelta(previousDelta));
	}

	clear(): void {
		this.bufferredContent.clear();
		this._onDidChange.fire(true);
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
		}
		return this.resolve() as TPromise;
	}

	hide(): void {
		if (this.shown) {
			this.shown = false;
			this.unwatch();
		}
		this.contentResolver = null;
	}

	getOutputDelta(previousDelta?: IOutputDelta): TPromise<IOutputDelta> {
		if (!this.shown) {
			// Do not return any content when not shown
			return TPromise.as(null);
		}

		return this.resolve()
			.then(content => {
				const startOffset = previousDelta ? previousDelta.id : this.startOffset;
				this.endOffset = content.length;
				if (startOffset === this.endOffset) {
					return { append: true, id: this.endOffset, value: '' };
				}
				if (startOffset > 0 && startOffset < this.endOffset) {
					const value = content.substring(startOffset, this.endOffset);
					return { append: true, value, id: this.endOffset };
				}
				// replace
				return { append: false, value: content, id: this.endOffset };
			});
	}

	clear(): void {
		this.startOffset = this.endOffset;
		this._onDidChange.fire(true);
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
				this._onDidChange.fire(false);
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

export class OutputService implements IOutputService {

	public _serviceBrand: any;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelId: string;

	private _onOutput: Emitter<IOutputEvent> = new Emitter<IOutputEvent>();
	readonly onOutput: Event<IOutputEvent> = this._onOutput.event;

	private _onActiveOutputChannel: Emitter<string> = new Emitter<string>();
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private _outputContentProvider: OutputContentProvider;
	private _outputPanel: OutputPanel;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPanelService private panelService: IPanelService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		const channels = this.getChannels();
		this.activeChannelId = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, channels && channels.length > 0 ? channels[0].id : null);

		instantiationService.createInstance(OutputLinkProvider);

		// Register as text model content provider for output
		this._outputContentProvider = instantiationService.createInstance(OutputContentProvider, this);
		textModelResolverService.registerTextModelContentProvider(OUTPUT_SCHEME, this._outputContentProvider);

		this.onDidPanelOpen(this.panelService.getActivePanel());
		panelService.onDidPanelOpen(this.onDidPanelOpen, this);
		panelService.onDidPanelClose(this.onDidPanelClose, this);
	}

	showChannel(id: string, preserveFocus?: boolean): TPromise<void> {
		if (this.isChannelShown(id)) {
			return TPromise.as(null);
		}

		if (this.activeChannelId) {
			this.doHideChannel(this.activeChannelId);
		}

		this.activeChannelId = id;
		return this.doShowChannel(id, preserveFocus)
			.then(() => this._onActiveOutputChannel.fire(id));
	}

	getChannel(id: string): IOutputChannel {
		if (!this.channels.has(id)) {
			const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(id);
			const channelDisposables = channelData && channelData.file ? this.instantiationService.createInstance(FileOutputChannel, channelData) : this.instantiationService.createInstance(BufferredOutputChannel, { id: id, label: '' });

			let disposables = [];
			channelDisposables.onDidChange(isClear => this._onOutput.fire({ channelId: id, isClear }), disposables);
			channelDisposables.onDispose(() => {
				Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).removeChannel(id);
				if (this.activeChannelId === id) {
					const channels = this.getChannels();
					if (this._outputPanel && channels.length) {
						this.showChannel(channels[0].id);
					} else {
						this._onActiveOutputChannel.fire(void 0);
					}
				}
				dispose(disposables);
			}, disposables);

			this.channels.set(id, channelDisposables);
		}
		return this.channels.get(id);
	}

	getChannels(): IOutputChannelIdentifier[] {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
	}

	getActiveChannel(): IOutputChannel {
		return this.getChannel(this.activeChannelId);
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
		const channel = <OutputChannel>this.getChannel(channelId);
		return channel.show()
			.then(() => {
				this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, channelId, StorageScope.WORKSPACE);
				this._outputPanel.setInput(this.createInput(this.getChannel(channelId)), EditorOptions.create({ preserveFocus: preserveFocus }));
				if (!preserveFocus) {
					this._outputPanel.focus();
				}
			});
	}

	private doHideChannel(channelId): void {
		const channel = <OutputChannel>this.getChannel(channelId);
		if (channel) {
			channel.hide();
		}
	}

	private createInput(channel: IOutputChannel): ResourceEditorInput {
		const resource = URI.from({ scheme: OUTPUT_SCHEME, path: channel.id });
		return this.instantiationService.createInstance(ResourceEditorInput, nls.localize('output', "Output"), channel ? nls.localize('channel', "for '{0}'", channel.label) : '', resource);
	}
}

class OutputContentProvider implements ITextModelContentProvider {

	private static readonly OUTPUT_DELAY = 300;

	private bufferedOutput = new Map<string, IOutputDelta>();
	private appendOutputScheduler: { [channel: string]: RunOnceScheduler; };
	private channelIdsWithScrollLock: Set<string> = new Set<string>();
	private toDispose: IDisposable[];

	constructor(
		private outputService: IOutputService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IPanelService private panelService: IPanelService
	) {
		this.appendOutputScheduler = Object.create(null);
		this.toDispose = [];

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.outputService.onOutput(e => this.onOutputReceived(e)));
		this.toDispose.push(this.outputService.onActiveOutputChannel(channel => this.scheduleOutputAppend(channel)));
		this.toDispose.push(this.panelService.onDidPanelOpen(panel => {
			if (panel.getId() === OUTPUT_PANEL_ID) {
				this.appendOutput();
			}
		}));
	}

	private onOutputReceived(e: IOutputEvent): void {
		const model = this.getModel(e.channelId);
		if (!model) {
			return; // only react if we have a known model
		}

		// Append to model
		if (e.isClear) {
			model.setValue('');
		} else {
			this.scheduleOutputAppend(e.channelId);
		}
	}

	private getModel(channel: string): IModel {
		return this.modelService.getModel(URI.from({ scheme: OUTPUT_SCHEME, path: channel }));
	}

	private scheduleOutputAppend(channel: string): void {
		if (!this.isVisible(channel)) {
			return; // only if the output channel is visible
		}

		let scheduler = this.appendOutputScheduler[channel];
		if (!scheduler) {
			scheduler = new RunOnceScheduler(() => {
				if (this.isVisible(channel)) {
					this.appendOutput(channel);
				}
			}, OutputContentProvider.OUTPUT_DELAY);

			this.appendOutputScheduler[channel] = scheduler;
			this.toDispose.push(scheduler);
		}

		if (scheduler.isScheduled()) {
			return; // only if not already scheduled
		}

		scheduler.schedule();
	}

	private appendOutput(channel?: string): void {
		if (!channel) {
			const activeChannel = this.outputService.getActiveChannel();
			channel = activeChannel && activeChannel.id;
		}

		if (!channel) {
			return; // return if we do not have a valid channel to append to
		}

		const model = this.getModel(channel);
		if (!model) {
			return; // only react if we have a known model
		}

		const bufferedOutput = this.bufferedOutput.get(channel);
		const outputChannel = <OutputChannel>this.outputService.getChannel(channel);
		outputChannel.getOutputDelta(bufferedOutput)
			.then(newOutput => {
				if (!newOutput) {
					model.setValue('');
					return;
				}
				this.bufferedOutput.set(channel, newOutput);

				// just fill in the full (trimmed) output if we exceed max length
				if (!newOutput.append) {
					model.setValue(newOutput.value);
				}

				// otherwise append
				else {
					const lastLine = model.getLineCount();
					const lastLineMaxColumn = model.getLineMaxColumn(lastLine);

					model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), newOutput.value)]);
				}

				if (!this.channelIdsWithScrollLock.has(channel)) {
					// reveal last line
					const panel = this.panelService.getActivePanel();
					(<OutputPanel>panel).revealLastLine();
				}
			});
	}

	private isVisible(channel: string): boolean {
		const panel = this.panelService.getActivePanel();

		return panel && panel.getId() === OUTPUT_PANEL_ID && this.outputService.getActiveChannel().id === channel;
	}

	public scrollLock(channelId: string): boolean {
		return this.channelIdsWithScrollLock.has(channelId);
	}

	public setScrollLock(channelId: string, value: boolean): void {
		if (value) {
			this.channelIdsWithScrollLock.add(channelId);
		} else {
			this.channelIdsWithScrollLock.delete(channelId);
		}
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		const channel = <OutputChannel>this.outputService.getChannel(resource.fsPath);
		return channel.getOutputDelta()
			.then(output => {
				const content = output ? output.value : '';
				let codeEditorModel = this.modelService.getModel(resource);
				if (!codeEditorModel) {
					codeEditorModel = this.modelService.createModel(content, this.modeService.getOrCreateMode(OUTPUT_MIME), resource);
				}
				return codeEditorModel;
			});
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
