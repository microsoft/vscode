/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import * as extfs from 'vs/base/node/extfs';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelIdentifier, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, OUTPUT_SCHEME, OUTPUT_MIME, MAX_OUTPUT_LENGTH } from 'vs/workbench/parts/output/common/output';
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
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { RotatingLogger } from 'spdlog';
import { toLocalISOString } from 'vs/base/common/date';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ILogService } from 'vs/platform/log/common/log';
import { binarySearch } from 'vs/base/common/arrays';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

let watchingOutputDir = false;
let callbacks = [];
function watchOutputDirectory(outputDir: string, logService: ILogService, onChange: (eventType: string, fileName: string) => void): IDisposable {
	callbacks.push(onChange);
	if (!watchingOutputDir) {
		try {
			const watcher = extfs.watch(outputDir, (eventType, fileName) => {
				for (const callback of callbacks) {
					callback(eventType, fileName);
				}
			});
			watcher.on('error', (code: number, signal: string) => logService.error(`Error watching ${outputDir}: (${code}, ${signal})`));
			watchingOutputDir = true;
			return toDisposable(() => {
				callbacks = [];
				watcher.removeAllListeners();
				watcher.close();
			});
		} catch (error) {
			logService.error(`Error watching ${outputDir}:  (${error.toString()})`);
		}
	}
	return toDisposable(() => { });
}


interface OutputChannel extends IOutputChannel {
	readonly onDispose: Event<void>;
	loadModel(): TPromise<IModel>;
}

abstract class AbstractFileOutputChannel extends Disposable {

	scrollLock: boolean = false;

	protected _onDispose: Emitter<void> = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	protected modelUpdater: RunOnceScheduler;
	protected model: IModel;
	protected readonly file: URI;
	protected startOffset: number = 0;
	protected endOffset: number = 0;

	constructor(
		protected readonly outputChannelIdentifier: IOutputChannelIdentifier,
		protected fileService: IFileService,
		protected modelService: IModelService,
		protected modeService: IModeService,
		private panelService: IPanelService
	) {
		super();
		this.file = this.outputChannelIdentifier.file;
		this.modelUpdater = new RunOnceScheduler(() => this.updateModel(), 300);
		this._register(toDisposable(() => this.modelUpdater.cancel()));
	}

	get id(): string {
		return this.outputChannelIdentifier.id;
	}

	get label(): string {
		return this.outputChannelIdentifier.label;
	}

	clear(): void {
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
		}
		if (this.model) {
			this.model.setValue('');
		}
		this.startOffset = this.endOffset;
	}

	loadModel(): TPromise<IModel> {
		return this.fileService.resolveContent(this.file, { position: this.startOffset })
			.then(content => {
				if (this.model) {
					this.model.setValue(content.value);
				} else {
					this.model = this.createModel(content.value);
				}
				this.endOffset = this.startOffset + new Buffer(this.model.getValueLength()).byteLength;
				return this.model;
			});
	}

	resetModel(): TPromise<void> {
		this.startOffset = 0;
		this.endOffset = 0;
		if (this.model) {
			return this.loadModel() as TPromise;
		}
		return TPromise.as(null);
	}

	private createModel(content: string): IModel {
		const model = this.modelService.createModel(content, this.modeService.getOrCreateMode(OUTPUT_MIME), URI.from({ scheme: OUTPUT_SCHEME, path: this.id }));
		this.onModelCreated(model);
		const disposables: IDisposable[] = [];
		disposables.push(model.onWillDispose(() => {
			this.onModelWillDispose(model);
			this.model = null;
			dispose(disposables);
		}));
		return model;
	}

	appendToModel(content: string): void {
		if (this.model && content) {
			const lastLine = this.model.getLineCount();
			const lastLineMaxColumn = this.model.getLineMaxColumn(lastLine);
			this.model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
			this.endOffset = this.endOffset + new Buffer(content).byteLength;
			if (!this.scrollLock) {
				const panel = this.panelService.getActivePanel();
				if (panel && panel.getId() === OUTPUT_PANEL_ID) {
					(<OutputPanel>panel).revealLastLine();
				}
			}
		}
	}

	protected onModelCreated(model: IModel) { }
	protected onModelWillDispose(model: IModel) { }
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

	private outputWriter: RotatingLogger;
	private appendedMessage = '';
	private loadingFromFileInProgress: boolean = false;

	constructor(
		outputChannelIdentifier: IOutputChannelIdentifier,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IPanelService panelService: IPanelService,
		@ILogService logService: ILogService
	) {
		super(outputChannelIdentifier, fileService, modelService, modeService, panelService);

		this.outputWriter = new RotatingLogger(this.id, this.file.fsPath, 1024 * 1024 * 30, 1);
		this.outputWriter.clearFormatters();
		this._register(watchOutputDirectory(paths.dirname(this.file.fsPath), logService, (eventType, file) => this.onFileChangedInOutputDirector(eventType, file)));
	}

	append(message: string): void {
		if (this.loadingFromFileInProgress) {
			this.appendedMessage += message;
		} else {
			this.outputWriter.critical(message);
			if (this.model) {
				this.appendedMessage += message;
				if (!this.modelUpdater.isScheduled()) {
					this.modelUpdater.schedule();
				}
			}
		}
	}

	clear(): void {
		super.clear();
		this.appendedMessage = '';
	}

	loadModel(): TPromise<IModel> {
		this.startLoadingFromFile();
		return super.loadModel()
			.then(model => {
				this.finishedLoadingFromFile();
				return model;
			});
	}

	protected updateModel(): void {
		if (this.model && this.appendedMessage) {
			this.appendToModel(this.appendedMessage);
			this.appendedMessage = '';
		}
	}

	private startLoadingFromFile(): void {
		this.loadingFromFileInProgress = true;
		this.outputWriter.flush();
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
		}
		this.appendedMessage = '';
	}

	private finishedLoadingFromFile(): void {
		if (this.appendedMessage) {
			this.outputWriter.critical(this.appendedMessage);
			this.appendToModel(this.appendedMessage);
			this.appendedMessage = '';
		}
		this.loadingFromFileInProgress = false;
	}

	private onFileChangedInOutputDirector(eventType: string, fileName: string): void {
		if (paths.basename(this.file.fsPath) === fileName) {
			this.resetModel();
		}
	}
}

class OutputFileListener extends Disposable {

	private _onDidChange: Emitter<void> = new Emitter<void>();
	readonly onDidContentChange: Event<void> = this._onDidChange.event;

	private disposables: IDisposable[] = [];

	constructor(
		private readonly file: URI,
		private fileService: IFileService
	) {
		super();
	}

	watch(): void {
		this.fileService.watchFileChanges(this.file);
		this.disposables.push(this.fileService.onFileChanges(changes => {
			if (changes.contains(this.file, FileChangeType.UPDATED)) {
				this._onDidChange.fire();
			}
		}));
	}

	unwatch(): void {
		this.fileService.unwatchFileChanges(this.file);
		this.disposables = dispose(this.disposables);
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

	constructor(
		outputChannelIdentifier: IOutputChannelIdentifier,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IPanelService panelService: IPanelService
	) {
		super(outputChannelIdentifier, fileService, modelService, modeService, panelService);

		this.fileHandler = this._register(new OutputFileListener(this.file, fileService));
		this._register(this.fileHandler.onDidContentChange(() => this.onDidContentChange()));
		this._register(toDisposable(() => this.fileHandler.unwatch()));
	}

	append(message: string): void {
		throw new Error('Not supported');
	}

	protected updateModel(): void {
		if (this.model) {
			this.fileService.resolveContent(this.file, { position: this.endOffset })
				.then(content => {
					this.appendToModel(content.value);
					this.updateInProgress = false;
				}, () => this.updateInProgress = false);
		} else {
			this.updateInProgress = false;
		}
	}

	protected onModelCreated(model: IModel): void {
		this.fileHandler.watch();
	}

	protected onModelWillDispose(model: IModel): void {
		this.fileHandler.unwatch();
	}

	private onDidContentChange(): void {
		if (!this.updateInProgress) {
			this.updateInProgress = true;
			this.modelUpdater.schedule();
		}
	}
}

export class OutputService extends Disposable implements IOutputService, ITextModelContentProvider {

	public _serviceBrand: any;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelId: string;
	private readonly outputDir: string;

	private _onActiveOutputChannel: Emitter<string> = new Emitter<string>();
	readonly onActiveOutputChannel: Event<string> = this._onActiveOutputChannel.event;

	private _outputPanel: OutputPanel;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPanelService private panelService: IPanelService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITextModelService textModelResolverService: ITextModelService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWindowService windowService: IWindowService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@ILogService private logService: ILogService
	) {
		super();
		const channels = this.getChannels();
		this.activeChannelId = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, channels && channels.length > 0 ? channels[0].id : null);

		instantiationService.createInstance(OutputLinkProvider);

		// Register as text model content provider for output
		textModelResolverService.registerTextModelContentProvider(OUTPUT_SCHEME, this);

		this.onDidPanelOpen(this.panelService.getActivePanel());
		panelService.onDidPanelOpen(this.onDidPanelOpen, this);
		panelService.onDidPanelClose(this.onDidPanelClose, this);
		this.outputDir = paths.join(environmentService.logsPath, `output_${windowService.getCurrentWindowId()}_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);

	}

	provideTextContent(resource: URI): TPromise<IModel> {
		const channel = <OutputChannel>this.getChannel(resource.fsPath);
		if (channel) {
			return channel.loadModel();
		}
		return TPromise.as(null);
	}

	showChannel(id: string, preserveFocus?: boolean): TPromise<void> {
		if (this.isChannelShown(id)) {
			return TPromise.as(null);
		}

		this.activeChannelId = id;
		let promise = TPromise.as(null);
		if (this._outputPanel) {
			this.doShowChannel(id, preserveFocus);
		} else {
			promise = this.panelService.openPanel(OUTPUT_PANEL_ID) as TPromise;
		}
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
		const channel = this.instantiateChannel(id);
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

	private instantiateChannel(id: string): OutputChannel {
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(id);
		if (channelData && channelData.file) {
			return this.instantiationService.createInstance(FileOutputChannel, channelData);
		}
		const file = URI.file(paths.join(this.outputDir, `${id}.log`));
		try {
			return this.instantiationService.createInstance(OutputChannelBackedByFile, { id, label: channelData ? channelData.label : '', file });
		} catch (e) {
			this.logService.error(e);
			this.telemetryService.publicLog('output.used.bufferedChannel');
			return this.instantiationService.createInstance(BufferredOutputChannel, { id, label: channelData ? channelData.label : '' });
		}
	}

	private isChannelShown(channelId: string): boolean {
		const panel = this.panelService.getActivePanel();
		return panel && panel.getId() === OUTPUT_PANEL_ID && this.activeChannelId === channelId;
	}

	private onDidPanelClose(panel: IPanel): void {
		if (this._outputPanel && panel.getId() === OUTPUT_PANEL_ID) {
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

	private doShowChannel(channelId: string, preserveFocus: boolean): void {
		if (this._outputPanel) {
			this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, channelId, StorageScope.WORKSPACE);
			this._outputPanel.setInput(this.createInput(channelId), EditorOptions.create({ preserveFocus: preserveFocus }));
			if (!preserveFocus) {
				this._outputPanel.focus();
			}
		}
	}

	private createInput(channelId: string): ResourceEditorInput {
		const resource = URI.from({ scheme: OUTPUT_SCHEME, path: channelId });
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(channelId);
		const label = channelData ? channelData.label : channelId;
		return this.instantiationService.createInstance(ResourceEditorInput, nls.localize('output', "{0} - Output", label), nls.localize('channel', "Output channel for '{0}'", label), resource);
	}
}

// Remove this channel when there are no issues using Output channel backed by file
class BufferredOutputChannel extends Disposable implements OutputChannel {

	readonly id: string;
	readonly label: string;
	scrollLock: boolean = false;

	private _onDispose: Emitter<void> = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	private modelUpdater: RunOnceScheduler;
	private model: IModel;
	private readonly bufferredContent: BufferedContent;
	private lastReadId: number = void 0;

	constructor(
		protected readonly outputChannelIdentifier: IOutputChannelIdentifier,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IPanelService private panelService: IPanelService
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

	clear(): void {
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
		}
		if (this.model) {
			this.model.setValue('');
		}
		this.bufferredContent.clear();
		this.lastReadId = void 0;
	}

	loadModel(): TPromise<IModel> {
		const { value, id } = this.bufferredContent.getDelta(this.lastReadId);
		if (this.model) {
			this.model.setValue(value);
		} else {
			this.model = this.createModel(value);
		}
		this.lastReadId = id;
		return TPromise.as(this.model);
	}

	private createModel(content: string): IModel {
		const model = this.modelService.createModel(content, this.modeService.getOrCreateMode(OUTPUT_MIME), URI.from({ scheme: OUTPUT_SCHEME, path: this.id }));
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
			if (!this.scrollLock) {
				const panel = this.panelService.getActivePanel();
				if (panel && panel.getId() === OUTPUT_PANEL_ID) {
					(<OutputPanel>panel).revealLastLine();
				}
			}
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
		if (previousId !== void 0) {
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