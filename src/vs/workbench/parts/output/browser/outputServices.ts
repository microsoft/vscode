/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/platform';
import { EditorOptions } from 'vs/workbench/common/editor';
import { IOutputChannelIdentifier, OutputEditors, IOutputEvent, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, MAX_OUTPUT_LENGTH, OUTPUT_SCHEME, OUTPUT_MIME } from 'vs/workbench/parts/output/common/output';
import { OutputPanel } from 'vs/workbench/parts/output/browser/outputPanel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { OutputLinkProvider } from 'vs/workbench/parts/output/common/outputLinkProvider';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

export class OutputService implements IOutputService {

	public _serviceBrand: any;

	private receivedOutput: { [channel: string]: string; };

	private activeChannelId: string;

	private _onOutput: Emitter<IOutputEvent>;
	private _onOutputChannel: Emitter<string>;
	private _onActiveOutputChannel: Emitter<string>;

	private _outputLinkDetector: OutputLinkProvider;
	private _outputContentProvider: OutputContentProvider;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPanelService private panelService: IPanelService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IModelService modelService: IModelService,
		@ITextModelResolverService textModelResolverService: ITextModelResolverService
	) {
		this._onOutput = new Emitter<IOutputEvent>();
		this._onOutputChannel = new Emitter<string>();
		this._onActiveOutputChannel = new Emitter<string>();

		this.receivedOutput = Object.create(null);

		const channels = this.getChannels();
		this.activeChannelId = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, channels && channels.length > 0 ? channels[0].id : null);

		this._outputLinkDetector = new OutputLinkProvider(contextService, modelService);

		this._outputContentProvider = instantiationService.createInstance(OutputContentProvider, this);

		// Register as text model content provider for output
		textModelResolverService.registerTextModelContentProvider(OUTPUT_SCHEME, this._outputContentProvider);
	}

	public get onOutput(): Event<IOutputEvent> {
		return this._onOutput.event;
	}

	public get onOutputChannel(): Event<string> {
		return this._onOutputChannel.event;
	}

	public get onActiveOutputChannel(): Event<string> {
		return this._onActiveOutputChannel.event;
	}

	public getChannel(id: string): IOutputChannel {
		const channelData = this.getChannels().filter(channelData => channelData.id === id).pop();

		const self = this;
		return {
			id,
			label: channelData ? channelData.label : id,
			get output() {
				return self.getOutput(id);
			},
			get scrollLock() {
				return self._outputContentProvider.scrollLock(id);
			},
			set scrollLock(value: boolean) {
				self._outputContentProvider.setScrollLock(id, value);
			},
			append: (output: string) => this.append(id, output),
			show: (preserveFocus: boolean) => this.showOutput(id, preserveFocus),
			clear: () => this.clearOutput(id)
		};
	}

	public getChannels(): IOutputChannelIdentifier[] {
		return Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
	}

	private append(channelId: string, output: string): void {

		// Initialize
		if (!this.receivedOutput[channelId]) {
			this.receivedOutput[channelId] = '';

			this._onOutputChannel.fire(channelId); // emit event that we have a new channel
		}

		// Sanitize
		output = strings.removeAnsiEscapeCodes(output);

		// Store
		if (output) {
			this.receivedOutput[channelId] = strings.appendWithLimit(this.receivedOutput[channelId], output, MAX_OUTPUT_LENGTH);
		}

		this._onOutput.fire({ output: output, channelId: channelId });
	}

	public getActiveChannel(): IOutputChannel {
		return this.getChannel(this.activeChannelId);
	}

	private getOutput(channelId: string): string {
		return this.receivedOutput[channelId] || '';
	}

	private clearOutput(channelId: string): void {
		this.receivedOutput[channelId] = '';

		this._onOutput.fire({ channelId: channelId, output: null /* indicator to clear output */ });
	}

	private showOutput(channelId: string, preserveFocus?: boolean): TPromise<IEditor> {
		const panel = this.panelService.getActivePanel();
		if (this.activeChannelId === channelId && panel && panel.getId() === OUTPUT_PANEL_ID) {
			return TPromise.as(<OutputPanel>panel);
		}

		this.activeChannelId = channelId;
		this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannelId, StorageScope.WORKSPACE);
		this._onActiveOutputChannel.fire(channelId); // emit event that a new channel is active

		return this.panelService.openPanel(OUTPUT_PANEL_ID, !preserveFocus).then((outputPanel: OutputPanel) => {
			return outputPanel && outputPanel.setInput(OutputEditors.getInstance(this.instantiationService, this.getChannel(channelId)), EditorOptions.create({ preserveFocus: preserveFocus })).
				then(() => outputPanel);
		});
	}
}

class OutputContentProvider implements ITextModelContentProvider {

	private static OUTPUT_DELAY = 300;

	private bufferedOutput: { [channel: string]: string; };
	private appendOutputScheduler: { [channel: string]: RunOnceScheduler; };
	private channelIdsWithScrollLock: Set<string> = new Set();

	private toDispose: IDisposable[];

	constructor(
		private outputService: IOutputService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IPanelService private panelService: IPanelService
	) {
		this.bufferedOutput = Object.create(null);
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
		if (e.output) {
			this.bufferedOutput[e.channelId] = strings.appendWithLimit(this.bufferedOutput[e.channelId] || '', e.output, MAX_OUTPUT_LENGTH);
			this.scheduleOutputAppend(e.channelId);
		}

		// Clear from model
		else if (e.output === null) {
			this.bufferedOutput[e.channelId] = '';
			model.setValue('');
		}
	}

	private getModel(channel: string): IModel {
		return this.modelService.getModel(URI.from({ scheme: OUTPUT_SCHEME, path: channel }));
	}

	private scheduleOutputAppend(channel: string): void {
		if (!this.isVisible(channel)) {
			return; // only if the output channel is visible
		}

		if (!this.bufferedOutput[channel]) {
			return; // only if we have any output to show
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

		const bufferedOutput = this.bufferedOutput[channel];
		this.bufferedOutput[channel] = '';
		if (!bufferedOutput) {
			return; // return if nothing to append
		}

		// just fill in the full (trimmed) output if we exceed max length
		if (model.getValueLength() + bufferedOutput.length > MAX_OUTPUT_LENGTH) {
			model.setValue(this.outputService.getChannel(channel).output);
		}

		// otherwise append
		else {
			const lastLine = model.getLineCount();
			const lastLineMaxColumn = model.getLineMaxColumn(lastLine);

			model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), bufferedOutput)]);
		}

		if (!this.channelIdsWithScrollLock.has(channel)) {
			// reveal last line
			const panel = this.panelService.getActivePanel();
			(<OutputPanel>panel).revealLastLine(true);
		}
	}

	private isVisible(channel: string): boolean {
		const panel = this.panelService.getActivePanel();

		return panel && panel.getId() === OUTPUT_PANEL_ID && this.outputService.getActiveChannel().id === channel;
	}

	public scrollLock(channelId): boolean {
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
		const content = this.outputService.getChannel(resource.fsPath).output;

		let codeEditorModel = this.modelService.getModel(resource);
		if (!codeEditorModel) {
			codeEditorModel = this.modelService.createModel(content, this.modeService.getOrCreateMode(OUTPUT_MIME), resource);
		}

		return TPromise.as(codeEditorModel);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}