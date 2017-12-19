/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelIdentifier, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, OUTPUT_SCHEME, OUTPUT_MIME } from 'vs/workbench/parts/output/common/output';
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
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWindowService } from 'vs/platform/windows/common/windows';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

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

interface OutputChannel extends IOutputChannel {
	readonly onDispose: Event<void>;
	createModel(): TPromise<IModel>;
}

abstract class AbstractOutputChannel extends Disposable {

	scrollLock: boolean = false;

	protected _onDispose: Emitter<void> = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	protected readonly file: URI;

	protected startOffset: number = 0;
	protected endOffset: number = 0;
	protected modelUpdater: RunOnceScheduler;

	constructor(
		protected readonly outputChannelIdentifier: IOutputChannelIdentifier,
		protected fileService: IFileService,
		protected modelService: IModelService,
		protected modeService: IModeService,
		private panelService: IPanelService
	) {
		super();
		this.file = outputChannelIdentifier.file;

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
		this.startOffset = this.endOffset;
		const model = this.getModel();
		if (model) {
			model.setValue('');
		}
	}

	createModel(): TPromise<IModel> {
		return this.fileService.resolveContent(this.file, { position: this.startOffset })
			.then(content => {
				const model = this.modelService.createModel(content.value, this.modeService.getOrCreateMode(OUTPUT_MIME), URI.from({ scheme: OUTPUT_SCHEME, path: this.id }));
				this.endOffset = this.startOffset + new Buffer(model.getValueLength()).byteLength;
				this.onModelCreated(model);
				const disposables: IDisposable[] = [];
				disposables.push(model.onWillDispose(() => {
					this.onModelWillDispose(model);
					dispose(disposables);
				}));
				return model;
			});
	}

	protected appendContent(content: string): void {
		const model = this.getModel();
		if (model && content) {
			const lastLine = model.getLineCount();
			const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
			model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
			this.endOffset = this.endOffset + new Buffer(content).byteLength;
			if (!this.scrollLock) {
				const panel = this.panelService.getActivePanel();
				if (panel && panel.getId() === OUTPUT_PANEL_ID) {
					(<OutputPanel>panel).revealLastLine();
				}
			}
		}
	}

	protected getModel(): IModel {
		const model = this.modelService.getModel(URI.from({ scheme: OUTPUT_SCHEME, path: this.id }));
		return model && !model.isDisposed() ? model : null;
	}

	protected onModelCreated(model: IModel) { }
	protected onModelWillDispose(model: IModel) { }
	protected updateModel() { }

	dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}
}

class FileOutputChannel extends AbstractOutputChannel implements OutputChannel {

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
		let model = this.getModel();
		if (model) {
			this.fileService.resolveContent(this.file, { position: this.endOffset })
				.then(content => {
					this.appendContent(content.value);
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

class AppendableFileOutputChannel extends AbstractOutputChannel implements OutputChannel {

	private outputWriter: RotatingLogger;
	private appendedMessage = '';

	constructor(
		outputChannelIdentifier: IOutputChannelIdentifier,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IPanelService panelService: IPanelService,
		@IMessageService private messageService: IMessageService
	) {
		super(outputChannelIdentifier, fileService, modelService, modeService, panelService);
		try {
			this.outputWriter = new RotatingLogger(this.id, this.file.fsPath, 1024 * 1024 * 30, 5);
			this.outputWriter.clearFormatters();
		} catch (e) {
			this.messageService.show(Severity.Error, e);
		}
	}

	append(message: string): void {
		if (this.outputWriter) {
			this.outputWriter.critical(message);
			const model = this.getModel();
			if (model) {
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

	createModel(): TPromise<IModel> {
		if (this.outputWriter) {
			this.outputWriter.flush();
			this.appendedMessage = '';
			return super.createModel();
		}
		return TPromise.as(this.modelService.createModel('', this.modeService.getOrCreateMode(OUTPUT_MIME), URI.from({ scheme: OUTPUT_SCHEME, path: this.id })));
	}

	protected updateModel(): void {
		let model = this.getModel();
		if (model) {
			if (this.appendedMessage) {
				this.appendContent(this.appendedMessage);
				this.appendedMessage = '';
			}
		}
	}
}

export class OutputService extends Disposable implements IOutputService, ITextModelContentProvider {

	public _serviceBrand: any;

	private channels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
	private activeChannelId: string;
	private readonly windowSession: string;

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
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowService private windowService: IWindowService,
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

		this.windowSession = `${this.windowService.getCurrentWindowId()}_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`;
	}

	provideTextContent(resource: URI): TPromise<IModel> {
		const channel = <OutputChannel>this.getChannel(resource.fsPath);
		return channel.createModel();
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
		const file = URI.file(paths.join(this.environmentService.logsPath, `outputs_${this.windowSession}`, `${id}.log`));
		return this.instantiationService.createInstance(AppendableFileOutputChannel, { id, label: channelData ? channelData.label : '', file });
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