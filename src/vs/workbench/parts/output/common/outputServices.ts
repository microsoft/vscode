/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import Event, {Emitter} from 'vs/base/common/event';
import {IEditor} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {Registry} from 'vs/platform/platform';
import {EditorOptions} from 'vs/workbench/common/editor';
import {IOutputEvent, IOutputChannel, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry, MAX_OUTPUT_LENGTH} from 'vs/workbench/parts/output/common/output';
import {OutputEditorInput} from 'vs/workbench/parts/output/common/outputEditorInput';
import {OutputPanel} from 'vs/workbench/parts/output/browser/outputPanel';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

export class OutputService implements IOutputService {
	public serviceId = IOutputService;

	private receivedOutput: { [channel: string]: string; };

	private activeChannelId: string;

	private _onOutput: Emitter<IOutputEvent>;
	private _onOutputChannel: Emitter<string>;
	private _onActiveOutputChannel: Emitter<string>;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IPanelService private panelService: IPanelService
	) {
		this._onOutput = new Emitter<IOutputEvent>();
		this._onOutputChannel = new Emitter<string>();
		this._onActiveOutputChannel = new Emitter<string>();

		this.receivedOutput = Object.create(null);

		const channels = (<IOutputChannelRegistry>Registry.as(Extensions.OutputChannels)).getChannels();
		this.activeChannelId = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, channels && channels.length > 0 ? channels[0].id : null);
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

	public getOutputChannel(id: string): IOutputChannel {
		return {
			append: (output: string) => this.append(id, output),
			clear: () => this.clearOutput(id)
		};
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

	public getOutput(channel: string): string {
		return this.receivedOutput[channel] || '';
	}

	public getChannels(): string[] {
		return Object.keys(this.receivedOutput);
	}

	public getActiveChannel(): string {
		return this.activeChannelId;
	}

	public clearOutput(channel: string): void {
		this.receivedOutput[channel] = '';

		this._onOutput.fire({ channelId: channel, output: null /* indicator to clear output */ });
	}

	public showOutput(channel: string, preserveFocus?: boolean): TPromise<IEditor> {
		const panel = this.panelService.getActivePanel();
		if (this.activeChannelId === channel && panel && panel.getId() === OUTPUT_PANEL_ID) {
			return TPromise.as(<OutputPanel>panel);
		}

		this.activeChannelId = channel;
		this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannelId, StorageScope.WORKSPACE);
		this._onActiveOutputChannel.fire(channel); // emit event that a new channel is active

		return this.panelService.openPanel(OUTPUT_PANEL_ID, !preserveFocus).then((outputPanel: OutputPanel) => {
			return outputPanel && outputPanel.setInput(OutputEditorInput.getInstance(this.instantiationService, channel), EditorOptions.create({ preserveFocus: preserveFocus })).
				then(() => outputPanel);
		});
	}
}