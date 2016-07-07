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
import {OutputEditorInput} from 'vs/workbench/parts/output/browser/outputEditorInput';
import {OutputPanel} from 'vs/workbench/parts/output/browser/outputPanel';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

export class OutputService implements IOutputService {
	public _serviceBrand: any;

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

		const channels = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels();
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

	public getChannel(id: string): IOutputChannel {
		const channelData = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels().filter(channelData => channelData.id === id).pop();

		const self = this;
		return {
			id,
			label: channelData ? channelData.label : id,
			get output() {
				return self.getOutput(id);
			},
			append: (output: string) => this.append(id, output),
			show: (preserveFocus: boolean) => this.showOutput(id, preserveFocus),
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
			return outputPanel && outputPanel.setInput(OutputEditorInput.getInstance(this.instantiationService, this.getChannel(channelId)), EditorOptions.create({ preserveFocus: preserveFocus })).
				then(() => outputPanel);
		});
	}
}