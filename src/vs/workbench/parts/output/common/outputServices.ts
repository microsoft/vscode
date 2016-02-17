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
import {IOutputEvent, IOutputService, Extensions, OUTPUT_PANEL_ID, IOutputChannelRegistry} from 'vs/workbench/parts/output/common/output';
import {OutputEditorInput} from 'vs/workbench/parts/output/common/outputEditorInput';
import {OutputPanel} from 'vs/workbench/parts/output/browser/outputPanel';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

const OUTPUT_ACTIVE_CHANNEL_KEY = 'output.activechannel';

export class OutputService implements IOutputService {
	public serviceId = IOutputService;

	private static MAX_OUTPUT = 10000 /* Lines */ * 100 /* Guestimated chars per line */;
	private static OUTPUT_DELAY = 300; // delay in ms to accumulate output before emitting an event about it

	private receivedOutput: { [channel: string]: string; };

	private sendOutputEventsTimerId: number;
	private lastSentOutputEventsTime: number;
	private bufferedOutput: { [channel: string]: string; };
	private activeChannel: string;

	private _onOutput: Emitter<IOutputEvent>;
	private _onOutputChannel: Emitter<string>;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IPanelService private panelService: IPanelService
	) {
		this._onOutput = new Emitter<IOutputEvent>();
		this._onOutputChannel = new Emitter<string>();

		this.receivedOutput = Object.create(null);
		this.bufferedOutput = Object.create(null);
		this.sendOutputEventsTimerId = -1;
		this.lastSentOutputEventsTime = -1;

		const channels = (<IOutputChannelRegistry>Registry.as(Extensions.OutputChannels)).getChannels();
		this.activeChannel = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, channels && channels.length > 0 ? channels[0] : null);

		this.registerListeners();
	}

	public get onOutput(): Event<IOutputEvent> {
		return this._onOutput.event;
	}

	public get onOutputChannel(): Event<string> {
		return this._onOutputChannel.event;
	}

	private registerListeners(): void {
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	public append(channel: string, output: string): void {

		// Initialize
		if (!this.receivedOutput[channel]) {
			this.receivedOutput[channel] = '';

			this._onOutputChannel.fire(channel); // emit event that we have a new channel
		}

		// Sanitize
		output = strings.removeAnsiEscapeCodes(output);

		// Store
		if (output) {
			let curLength = this.receivedOutput[channel].length;
			let addLength = output.length;

			// Still below MAX_OUTPUT, so just add
			if (addLength + curLength <= OutputService.MAX_OUTPUT) {
				this.receivedOutput[channel] += output;
			} else {

				// New output exceeds MAX_OUTPUT, so trim beginning and use as received output
				if (addLength > OutputService.MAX_OUTPUT) {
					this.receivedOutput[channel] = '...' + output.substr(addLength - OutputService.MAX_OUTPUT);
				}

				// New output + existing output exceeds MAX_OUTPUT, so trim existing output that it fits new output
				else {
					let diff = OutputService.MAX_OUTPUT - addLength;
					this.receivedOutput[channel] = '...' + this.receivedOutput[channel].substr(curLength - diff) + output;
				}
			}

			// Buffer
			let buffer = this.bufferedOutput[channel];
			if (!buffer) {
				buffer = output;
			} else {
				buffer += output;
			}

			this.bufferedOutput[channel] = buffer;
		}

		// Schedule emit delayed to prevent spam
		this.scheduleSendOutputEvent();
	}

	private scheduleSendOutputEvent(): void {
		if (this.sendOutputEventsTimerId !== -1) {
			return; // sending model events already scheduled
		}

		let elapsed = Date.now() - this.lastSentOutputEventsTime;
		if (elapsed >= OutputService.OUTPUT_DELAY) {
			this.sendOutputEvents(); // more than 300ms have passed since last events have been sent => send events now
		} else {
			this.sendOutputEventsTimerId = setTimeout(() => {
				this.sendOutputEventsTimerId = -1;
				this.sendOutputEvents();
			}, OutputService.OUTPUT_DELAY - elapsed);
		}
	}

	private sendOutputEvents(): void {
		this.lastSentOutputEventsTime = Date.now();

		for (let channel in this.bufferedOutput) {
			this._onOutput.fire({ output: this.bufferedOutput[channel], channel });
		}

		this.bufferedOutput = Object.create(null);
	}

	public getOutput(channel: string): string {
		return this.receivedOutput[channel] || '';
	}

	public getChannels(): string[] {
		return Object.keys(this.receivedOutput);
	}

	public getActiveChannel(): string {
		return this.activeChannel;
	}

	public clearOutput(channel: string): void {
		this.receivedOutput[channel] = '';

		this._onOutput.fire({ channel: channel, output: null /* indicator to clear output */ });
	}

	public showOutput(channel: string, preserveFocus?: boolean): TPromise<IEditor> {
		this.activeChannel = channel;
		this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel, StorageScope.WORKSPACE);

		return this.panelService.openPanel(OUTPUT_PANEL_ID, !preserveFocus).then((outputPanel: OutputPanel) => {
			return outputPanel && outputPanel.setInput(OutputEditorInput.getInstance(this.instantiationService, channel), EditorOptions.create({ preserveFocus: preserveFocus })).
				then(() => outputPanel);
		});
	}

	public dispose(): void {
		if (this.sendOutputEventsTimerId !== -1) {
			clearTimeout(this.sendOutputEventsTimerId);
			this.sendOutputEventsTimerId = -1;
		}
	}
}