/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import * as extfs from 'vs/base/node/extfs';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelDescriptor, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, OUTPUT_SCHEME, OUTPUT_MIME, LOG_SCHEME, LOG_MIME, CONTEXT_ACTIVE_LOG_OUTPUT, MAX_OUTPUT_LENGTH } from 'vs/workbench/parts/output/common/output';
import { OutputPanel } from 'vs/workbench/parts/output/browser/outputPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { OutputLinkProvider } from 'vs/workbench/parts/output/common/outputLinkProvider';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { ITextModel } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { RunOnceScheduler, ThrottledDelayer } from 'vs/base/common/async';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IFileService } from 'vs/platform/files/common/files';
import { IPanel } from 'vs/workbench/common/panel';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { toLocalISOString } from 'vs/base/common/date';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ILogService } from 'vs/platform/log/common/log';
import { binarySearch } from 'vs/base/common/arrays';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CancellationToken } from 'vs/base/common/cancellation';
import { OutputAppender } from 'vs/platform/output/node/outputAppender';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isNumber } from 'vs/base/common/types';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

let watchingOutputDir = false;
let callbacks: ((eventType: string, fileName: string) => void)[] = [];
function watchOutputDirectory(outputDir: string, logService: ILogService, onChange: (eventType: string, fileName: string) => void): IDisposable {
	callbacks.push(onChange);
	if (!watchingOutputDir) {
		const watcherDisposable = extfs.watch(outputDir, (eventType, fileName) => {
			for (const callback of callbacks) {
				callback(eventType, fileName);
			}
		}, (error: string) => {
			logService.error(error);
		});
		watchingOutputDir = true;
		return toDisposable(() => {
			callbacks = [];
			watcherDisposable.dispose();
		});
	}
	return toDisposable(() => { });
}

interface OutputChannel extends IOutputChannel {
	readonly file: URI;
	readonly onDidAppendedContent: Event<void>;
	readonly onDispose: Event<void>;
	loadModel(): Promise<ITextModel>;
}

abstract class AbstractFileOutputChannel extends Disposable implements OutputChannel {

	scrollLock: boolean = false;

	protected _onDidAppendedContent = new Emitter<void>();
	readonly onDidAppendedContent: Event<void> = this._onDidAppendedContent.event;

	protected _onDispose = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	private readonly mimeType: string;
	protected modelUpdater: RunOnceScheduler;
	protected model: ITextModel;
	readonly file: URI;

	protected startOffset: number = 0;
	protected endOffset: number = 0;

	constructor(
		readonly outputChannelDescriptor: IOutputChannelDescriptor,
		private readonly modelUri: URI,
		protected fileService: IFileService,
		protected modelService: IModelService,
		protected modeService: IModeService,
	) {
		super();
		this.mimeType = outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME;
		this.file = this.outputChannelDescriptor.file;
		this.modelUpdater = new RunOnceScheduler(() => this.updateModel(), 300);
		this._register(toDisposable(() => this.modelUpdater.cancel()));
	}

	get id(): string {
		return this.outputChannelDescriptor.id;
	}

	get label(): string {
		return this.outputChannelDescriptor.label;
	}

	clear(till?: number): void {
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
			this.onUpdateModelCancelled();
		}
		if (this.model) {
			this.model.setValue('');
		}
		this.endOffset = isNumber(till) ? till : this.endOffset;
		this.startOffset = this.endOffset;
	}

	update(): void { }

	protected createModel(content: string): ITextModel {
		if (this.model) {
			this.model.setValue(content);
		} else {
			this.model = this.modelService.createModel(content, this.modeService.create(this.mimeType), this.modelUri);
			this.onModelCreated(this.model);
			const disposables: IDisposable[] = [];
			disposables.push(this.model.onWillDispose(() => {
				this.onModelWillDispose(this.model);
				this.model = null;
				dispose(disposables);
			}));
		}
		return this.model;
	}

	appendToModel(content: string): void {
		if (this.model && content) {
			const lastLine = this.model.getLineCount();
			const lastLineMaxColumn = this.model.getLineMaxColumn(lastLine);
			this.model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
			this._onDidAppendedContent.fire();
		}
	}

	abstract loadModel(): Promise<ITextModel>;
	abstract append(message: string);

	protected onModelCreated(model: ITextModel) { }
	protected onModelWillDispose(model: ITextModel) { }
	protected onUpdateModelCancelled() { }
	protected updateModel() { }

	dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}
}

/**
 * An output channel that stores appended messages in a backup file.
 */
class OutputChannelBackedByFile extends AbstractFileOutputChannel implements OutputChannel {

	private appender: OutputAppender;
	private appendedMessage = '';
	private loadingFromFileInProgress: boolean = false;
	private resettingDelayer: ThrottledDelayer<void>;
	private readonly rotatingFilePath: string;

	constructor(
		outputChannelDescriptor: IOutputChannelDescriptor,
		outputDir: string,
		modelUri: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILogService logService: ILogService
	) {
		super({ ...outputChannelDescriptor, file: URI.file(paths.join(outputDir, `${outputChannelDescriptor.id}.log`)) }, modelUri, fileService, modelService, modeService);

		// Use one rotating file to check for main file reset
		this.appender = new OutputAppender(this.id, this.file.fsPath);
		this.rotatingFilePath = `${outputChannelDescriptor.id}.1.log`;
		this._register(watchOutputDirectory(paths.dirname(this.file.fsPath), logService, (eventType, file) => this.onFileChangedInOutputDirector(eventType, file)));

		this.resettingDelayer = new ThrottledDelayer<void>(50);
	}

	append(message: string): void {
		// update end offset always as message is read
		this.endOffset = this.endOffset + Buffer.from(message).byteLength;
		if (this.loadingFromFileInProgress) {
			this.appendedMessage += message;
		} else {
			this.write(message);
			if (this.model) {
				this.appendedMessage += message;
				if (!this.modelUpdater.isScheduled()) {
					this.modelUpdater.schedule();
				}
			}
		}
	}

	clear(till?: number): void {
		super.clear(till);
		this.appendedMessage = '';
	}

	loadModel(): Promise<ITextModel> {
		this.loadingFromFileInProgress = true;
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
		}
		this.appendedMessage = '';
		return this.loadFile()
			.then(content => {
				if (this.endOffset !== this.startOffset + Buffer.from(content).byteLength) {
					// Queue content is not written into the file
					// Flush it and load file again
					this.flush();
					return this.loadFile();
				}
				return content;
			})
			.then(content => {
				if (this.appendedMessage) {
					this.write(this.appendedMessage);
					this.appendedMessage = '';
				}
				this.loadingFromFileInProgress = false;
				return this.createModel(content);
			});
	}

	private resetModel(): Promise<void> {
		this.startOffset = 0;
		this.endOffset = 0;
		if (this.model) {
			return this.loadModel().then(() => undefined);
		}
		return Promise.resolve(undefined);
	}

	private loadFile(): Promise<string> {
		return this.fileService.resolveContent(this.file, { position: this.startOffset, encoding: 'utf8' })
			.then(content => this.appendedMessage ? content.value + this.appendedMessage : content.value);
	}

	protected updateModel(): void {
		if (this.model && this.appendedMessage) {
			this.appendToModel(this.appendedMessage);
			this.appendedMessage = '';
		}
	}

	private onFileChangedInOutputDirector(eventType: string, fileName: string): void {
		// Check if rotating file has changed. It changes only when the main file exceeds its limit.
		if (this.rotatingFilePath === fileName) {
			this.resettingDelayer.trigger(() => this.resetModel());
		}
	}

	private write(content: string): void {
		this.appender.append(content);
	}

	private flush(): void {
		this.appender.flush();
	}
}

class OutputFileListener extends Disposable {

	private readonly _onDidContentChange = new Emitter<number>();
	readonly onDidContentChange: Event<number> = this._onDidContentChange.event;

	private watching: boolean = false;
	private syncDelayer: ThrottledDelayer<void>;
	private etag: string;

	constructor(
		private readonly file: URI,
		private readonly fileService: IFileService
	) {
		super();
		this.syncDelayer = new ThrottledDelayer<void>(500);
	}

	watch(eTag: string): void {
		if (!this.watching) {
			this.etag = eTag;
			this.poll();
			this.watching = true;
		}
	}

	private poll(): void {
		const loop = () => this.doWatch().then(() => this.poll());
		this.syncDelayer.trigger(loop);
	}

	private doWatch(): Promise<void> {
		return this.fileService.resolveFile(this.file)
			.then(stat => {
				if (stat.etag !== this.etag) {
					this.etag = stat.etag;
					this._onDidContentChange.fire(stat.size);
				}
			});
	}

	unwatch(): void {
		if (this.watching) {
			this.syncDelayer.cancel();
			this.watching = false;
		}
	}

	dispose(): void {
		this.unwatch();
		super.dispose();
	}
}

/**
 * An output channel driven by a file and does not support appending messages.
 */
class FileOutputChannel extends AbstractFileOutputChannel implements OutputChannel {

	private readonly fileHandler: OutputFileListener;

	private updateInProgress: boolean = false;
	private etag: string = '';
	private loadModelPromise: Promise<ITextModel> = Promise.resolve();

	constructor(
		outputChannelDescriptor: IOutputChannelDescriptor,
		modelUri: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService
	) {
		super(outputChannelDescriptor, modelUri, fileService, modelService, modeService);

		this.fileHandler = this._register(new OutputFileListener(this.file, this.fileService));
		this._register(this.fileHandler.onDidContentChange(size => this.update(size)));
		this._register(toDisposable(() => this.fileHandler.unwatch()));
	}

	loadModel(): Promise<ITextModel> {
		this.loadModelPromise = this.fileService.resolveContent(this.file, { position: this.startOffset, encoding: 'utf8' })
			.then(content => {
				this.endOffset = this.startOffset + Buffer.from(content.value).byteLength;
				this.etag = content.etag;
				return this.createModel(content.value);
			});
		return this.loadModelPromise;
	}

	clear(till?: number): void {
		this.loadModelPromise.then(() => {
			super.clear(till);
			this.update();
		});
	}

	append(message: string): void {
		throw new Error('Not supported');
	}

	protected updateModel(): void {
		if (this.model) {
			this.fileService.resolveContent(this.file, { position: this.endOffset, encoding: 'utf8' })
				.then(content => {
					this.etag = content.etag;
					if (content.value) {
						this.endOffset = this.endOffset + Buffer.from(content.value).byteLength;
						this.appendToModel(content.value);
					}
					this.updateInProgress = false;
				}, () => this.updateInProgress = false);
		} else {
			this.updateInProgress = false;
		}
	}

	protected onModelCreated(model: ITextModel): void {
		this.fileHandler.watch(this.etag);
	}

	protected onModelWillDispose(model: ITextModel): void {
		this.fileHandler.unwatch();
	}

	protected onUpdateModelCancelled(): void {
		this.updateInProgress = false;
	}

	update(size?: number): void {
		if (!this.updateInProgress) {
			this.updateInProgress = true;
			if (isNumber(size) && this.endOffset > size) { // Reset - Content is removed
				this.startOffset = this.endOffset = 0;
				this.model.setValue('');
			}
			this.modelUpdater.schedule();
		}
	}
}

export class OutputService extends Disposable implements IOutputService, ITextModelContentProvider {

	public _serviceBrand: any;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelIdInStorage: string;
	private activeChannel: IOutputChannel;
	private readonly outputDir: string;

	private readonly _onActiveOutputChannel = new Emitter<string>();
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private _outputPanel: OutputPanel;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPanelService private readonly panelService: IPanelService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWindowService windowService: IWindowService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, null);
		this.outputDir = paths.join(environmentService.logsPath, `output_${windowService.getCurrentWindowId()}_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);

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
			this.activeChannel = channels && channels.length > 0 ? this.getChannel(channels[0].id) : null;
		}

		this._register(this.lifecycleService.onShutdown(() => this.dispose()));
		this._register(this.storageService.onWillSaveState(() => this.saveState()));
	}

	provideTextContent(resource: URI): Promise<ITextModel> {
		const channel = <OutputChannel>this.getChannel(resource.path);
		if (channel) {
			return channel.loadModel();
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

		this.activeChannel = channel;
		let promise: Promise<void>;
		if (this.isPanelShown()) {
			promise = this.doShowChannel(channel, preserveFocus);
		} else {
			this.panelService.openPanel(OUTPUT_PANEL_ID);
			promise = this.doShowChannel(this.activeChannel, preserveFocus);
		}
		return promise.then(() => this._onActiveOutputChannel.fire(id));
	}

	getChannel(id: string): IOutputChannel {
		return this.channels.get(id);
	}

	getChannelDescriptors(): IOutputChannelDescriptor[] {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
	}

	getActiveChannel(): IOutputChannel {
		return this.activeChannel;
	}

	private onDidRegisterChannel(channelId: string): void {
		const channel = this.createChannel(channelId);
		this.channels.set(channelId, channel);
		if (this.activeChannelIdInStorage === channelId) {
			this.activeChannel = channel;
			this.onDidPanelOpen(this.panelService.getActivePanel(), true)
				.then(() => this._onActiveOutputChannel.fire(channelId));
		}
	}

	private onDidPanelOpen(panel: IPanel, preserveFocus: boolean): Promise<void> {
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

	private setPrimaryCursorToLastLine(): void {
		const codeEditor = <ICodeEditor>this._outputPanel.getControl();
		const model = codeEditor.getModel();

		if (model) {
			const lastLine = model.getLineCount();
			codeEditor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
		}
	}

	private createChannel(id: string): OutputChannel {
		const channelDisposables: IDisposable[] = [];
		const channel = this.instantiateChannel(id);
		channel.onDidAppendedContent(() => {
			if (!channel.scrollLock) {
				const panel = this.panelService.getActivePanel();
				if (panel && panel.getId() === OUTPUT_PANEL_ID && this.isChannelShown(channel)) {
					let outputPanel = <OutputPanel>panel;
					outputPanel.revealLastLine(true);
				}
			}
		}, channelDisposables);
		channel.onDispose(() => {
			if (this.activeChannel === channel) {
				const channels = this.getChannelDescriptors();
				const channel = channels.length ? this.getChannel(channels[0].id) : null;
				if (channel && this.isPanelShown()) {
					this.showChannel(channel.id, true);
				} else {
					this.activeChannel = channel;
					this._onActiveOutputChannel.fire(channel ? channel.id : undefined);
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

		const uri = URI.from({ scheme: OUTPUT_SCHEME, path: id });
		if (channelData && channelData.file) {
			return this.instantiationService.createInstance(FileOutputChannel, channelData, uri);
		}
		try {
			return this.instantiationService.createInstance(OutputChannelBackedByFile, { id, label: channelData ? channelData.label : '' }, this.outputDir, uri);
		} catch (e) {
			// Do not crash if spdlog rotating logger cannot be loaded (workaround for https://github.com/Microsoft/vscode/issues/47883)
			this.logService.error(e);
			/* __GDPR__
				"output.channel.creation.error" : {}
			*/
			this.telemetryService.publicLog('output.channel.creation.error');
			return this.instantiationService.createInstance(BufferredOutputChannel, { id, label: channelData ? channelData.label : '' });
		}
	}

	private doShowChannel(channel: IOutputChannel, preserveFocus: boolean): Promise<void> {
		if (this._outputPanel) {
			CONTEXT_ACTIVE_LOG_OUTPUT.bindTo(this.contextKeyService).set(channel instanceof FileOutputChannel && channel.outputChannelDescriptor.log);
			return this._outputPanel.setInput(this.createInput(channel), EditorOptions.create({ preserveFocus }), CancellationToken.None)
				.then(() => {
					if (!preserveFocus) {
						this._outputPanel.focus();
					}
				})
				// Activate smart scroll when switching back to the output panel
				.then(() => this.setPrimaryCursorToLastLine());
		}
		return Promise.resolve(undefined);
	}

	private isChannelShown(channel: IOutputChannel): boolean {
		return this.isPanelShown() && this.activeChannel === channel;
	}

	private isPanelShown(): boolean {
		const panel = this.panelService.getActivePanel();
		return panel && panel.getId() === OUTPUT_PANEL_ID;
	}

	private createInput(channel: IOutputChannel): ResourceEditorInput {
		const resource = URI.from({ scheme: OUTPUT_SCHEME, path: channel.id });
		return this.instantiationService.createInstance(ResourceEditorInput, nls.localize('output', "{0} - Output", channel.label), nls.localize('channel', "Output channel for '{0}'", channel.label), resource);
	}

	private saveState(): void {
		if (this.activeChannel) {
			this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, StorageScope.WORKSPACE);
		}
	}
}

export class LogContentProvider {

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();

	constructor(
		@IOutputService private readonly outputService: IOutputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	provideTextContent(resource: URI): Promise<ITextModel> {
		if (resource.scheme === LOG_SCHEME) {
			let channel = this.getChannel(resource);
			if (channel) {
				return channel.loadModel();
			}
		}
		return null;
	}

	private getChannel(resource: URI): OutputChannel {
		const channelId = resource.path;
		let channel = this.channels.get(channelId);
		if (!channel) {
			const channelDisposables: IDisposable[] = [];
			const outputChannelDescriptor = this.outputService.getChannelDescriptors().filter(({ id }) => id === channelId)[0];
			if (outputChannelDescriptor && outputChannelDescriptor.file) {
				channel = this.instantiationService.createInstance(FileOutputChannel, outputChannelDescriptor, resource);
				channel.onDispose(() => dispose(channelDisposables), channelDisposables);
				this.channels.set(channelId, channel);
			}
		}
		return channel;
	}
}
// Remove this channel when https://github.com/Microsoft/vscode/issues/47883 is fixed
class BufferredOutputChannel extends Disposable implements OutputChannel {

	readonly id: string;
	readonly label: string;
	readonly file: URI | null = null;
	scrollLock: boolean = false;

	protected _onDidAppendedContent = new Emitter<void>();
	readonly onDidAppendedContent: Event<void> = this._onDidAppendedContent.event;

	private readonly _onDispose = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	private modelUpdater: RunOnceScheduler;
	private model: ITextModel;
	private readonly bufferredContent: BufferedContent;
	private lastReadId: number = undefined;

	constructor(
		protected readonly outputChannelIdentifier: IOutputChannelDescriptor,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService
	) {
		super();

		this.id = outputChannelIdentifier.id;
		this.label = outputChannelIdentifier.label;

		this.modelUpdater = new RunOnceScheduler(() => this.updateModel(), 300);
		this._register(toDisposable(() => this.modelUpdater.cancel()));

		this.bufferredContent = new BufferedContent();
		this._register(toDisposable(() => this.bufferredContent.clear()));
	}

	append(output: string) {
		this.bufferredContent.append(output);
		if (!this.modelUpdater.isScheduled()) {
			this.modelUpdater.schedule();
		}
	}

	update(): void { }

	clear(): void {
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
		}
		if (this.model) {
			this.model.setValue('');
		}
		this.bufferredContent.clear();
		this.lastReadId = undefined;
	}

	loadModel(): Promise<ITextModel> {
		const { value, id } = this.bufferredContent.getDelta(this.lastReadId);
		if (this.model) {
			this.model.setValue(value);
		} else {
			this.model = this.createModel(value);
		}
		this.lastReadId = id;
		return Promise.resolve(this.model);
	}

	private createModel(content: string): ITextModel {
		const model = this.modelService.createModel(content, this.modeService.create(OUTPUT_MIME), URI.from({ scheme: OUTPUT_SCHEME, path: this.id }));
		const disposables: IDisposable[] = [];
		disposables.push(model.onWillDispose(() => {
			this.model = null;
			dispose(disposables);
		}));
		return model;
	}

	private updateModel(): void {
		if (this.model) {
			const { value, id } = this.bufferredContent.getDelta(this.lastReadId);
			this.lastReadId = id;
			const lastLine = this.model.getLineCount();
			const lastLineMaxColumn = this.model.getLineMaxColumn(lastLine);
			this.model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), value)]);
			this._onDidAppendedContent.fire();
		}
	}

	dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}
}

class BufferedContent {

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

	public getDelta(previousId?: number): { value: string, id: number } {
		let idx = -1;
		if (previousId !== undefined) {
			idx = binarySearch(this.dataIds, previousId, (a, b) => a - b);
		}

		const id = this.idPool;
		if (idx >= 0) {
			const value = strings.removeAnsiEscapeCodes(this.data.slice(idx + 1).join(''));
			return { value, id };
		} else {
			const value = strings.removeAnsiEscapeCodes(this.data.join(''));
			return { value, id };
		}
	}
}
