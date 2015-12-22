/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import Event, {Emitter} from 'vs/base/common/event';
import {EditorOptions} from 'vs/workbench/common/editor';
import {StringEditor} from 'vs/workbench/browser/parts/editor/stringEditor';
import {OUTPUT_MIME, DEFAULT_OUTPUT_CHANNEL, IOutputEvent, IOutputService} from 'vs/workbench/parts/output/common/output';
import {OutputEditorInput} from 'vs/workbench/parts/output/browser/outputEditorInput';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEditor, Position} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export class OutputService implements IOutputService {
	public serviceId = IOutputService;

	private static MAX_OUTPUT = 10000 /* Lines */ * 100 /* Guestimated chars per line */;
	private static OUTPUT_DELAY = 300; // delay in ms to accumulate output before emitting an event about it

	private receivedOutput: { [channel: string]: string; };

	private sendOutputEventsTimerId: number;
	private lastSentOutputEventsTime: number;
	private bufferedOutput: { [channel: string]: string; };

	private _onOutput: Emitter<IOutputEvent>;
	private _onOutputChannel: Emitter<string>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		this._onOutput = new Emitter<IOutputEvent>();
		this._onOutputChannel = new Emitter<string>();

		this.receivedOutput = Object.create(null);

		this.bufferedOutput = Object.create(null);
		this.sendOutputEventsTimerId = -1;
		this.lastSentOutputEventsTime = -1;

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

	public append(channelOrOutput: string, output?: string): void {
		let channel: string = DEFAULT_OUTPUT_CHANNEL;
		if (output) {
			channel = channelOrOutput;
		} else {
			output = channelOrOutput;
		}

		this.doAppend(channel, output);
	}

	private doAppend(channel: string, output: string): void {

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

	public getOutput(channel = DEFAULT_OUTPUT_CHANNEL): string {
		return this.receivedOutput[channel] || '';
	}

	public getChannels(): string[] {
		return Object.keys(this.receivedOutput);
	}

	public clearOutput(channel = DEFAULT_OUTPUT_CHANNEL): void {
		this.receivedOutput[channel] = '';

		this._onOutput.fire({ channel: channel, output: null /* indicator to clear output */ });
	}

	public showOutput(channel: string = DEFAULT_OUTPUT_CHANNEL, sideBySide?: boolean | Position, preserveFocus?: boolean): TPromise<IEditor> {

		// If already opened, focus it unless we want to preserve focus
		let existingOutputEditor = this.findOutputEditor(channel);
		if (existingOutputEditor) {
			if (!preserveFocus) {
				return this.editorService.focusEditor(existingOutputEditor);
			}

			// Still reveal last line
			existingOutputEditor.revealLastLine();

			return Promise.as(existingOutputEditor);
		}

		// Otherwise open new
		return this.editorService.openEditor(OutputEditorInput.getInstance(this.instantiationService, channel), preserveFocus ? EditorOptions.create({ preserveFocus: true }) : null, <any> sideBySide);
	}

	private findOutputEditor(channel: string): StringEditor {
		let editors = this.editorService.getVisibleEditors();
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];
			if (editor.input instanceof OutputEditorInput && (<OutputEditorInput>editor.input).getChannel() === channel && (<OutputEditorInput>editor.input).getMime() === OUTPUT_MIME) {
				return <StringEditor>editor;
			}
		}

		return null;
	}

	public dispose(): void {
		if (this.sendOutputEventsTimerId !== -1) {
			clearTimeout(this.sendOutputEventsTimerId);
			this.sendOutputEventsTimerId = -1;
		}
	}
}