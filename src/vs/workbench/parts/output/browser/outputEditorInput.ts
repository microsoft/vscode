/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import strings = require('vs/base/common/strings');
import {TPromise} from 'vs/base/common/winjs.base';
import {RunOnceScheduler} from 'vs/base/common/async';
import {EditorModel} from 'vs/workbench/common/editor';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {OUTPUT_EDITOR_INPUT_ID, OUTPUT_PANEL_ID, IOutputEvent, OUTPUT_MIME, IOutputService, MAX_OUTPUT_LENGTH, IOutputChannel} from 'vs/workbench/parts/output/common/output';
import {OutputPanel} from 'vs/workbench/parts/output/browser/outputPanel';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IEventService} from 'vs/platform/event/common/event';
import {EventType, CompositeEvent} from 'vs/workbench/common/events';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

/**
 * Output Editor Input
 */
export class OutputEditorInput extends StringEditorInput {

	private static OUTPUT_DELAY = 300; // delay in ms to accumulate output before emitting an event about it
	private static instances: { [channel: string]: OutputEditorInput; } = Object.create(null);

	private outputSet: boolean;
	private bufferedOutput: string;
	private toDispose: lifecycle.IDisposable[];
	private appendOutputScheduler: RunOnceScheduler;

	public static getInstances(): OutputEditorInput[] {
		return Object.keys(OutputEditorInput.instances).map((key) => OutputEditorInput.instances[key]);
	}

	public static getInstance(instantiationService: IInstantiationService, channel: IOutputChannel): OutputEditorInput {
		if (OutputEditorInput.instances[channel.id]) {
			return OutputEditorInput.instances[channel.id];
		}

		OutputEditorInput.instances[channel.id] = instantiationService.createInstance(OutputEditorInput, channel);

		return OutputEditorInput.instances[channel.id];
	}

	constructor(
		private outputChannel: IOutputChannel,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOutputService private outputService: IOutputService,
		@IPanelService private panelService: IPanelService,
		@IEventService private eventService: IEventService
	) {
		super(nls.localize('output', "Output"), outputChannel ? nls.localize('outputChannel', "for '{0}'", outputChannel.label) : '', '', OUTPUT_MIME, true, instantiationService);

		this.bufferedOutput = '';
		this.toDispose = [];
		this.toDispose.push(this.outputService.onOutput(this.onOutputReceived, this));
		this.toDispose.push(this.outputService.onActiveOutputChannel(() => this.scheduleOutputAppend()));
		this.toDispose.push(this.eventService.addListener2(EventType.COMPOSITE_OPENED, (e: CompositeEvent) => {
			if (e.compositeId === OUTPUT_PANEL_ID) {
				this.appendOutput();
			}
		}));

		this.appendOutputScheduler = new RunOnceScheduler(() => {
			if (this.isVisible()) {
				this.appendOutput();
			}
		}, OutputEditorInput.OUTPUT_DELAY);
	}

	private appendOutput(): void {
		if (this.value.length + this.bufferedOutput.length > MAX_OUTPUT_LENGTH) {
			this.setValue(this.outputChannel.output);
		} else {
			this.append(this.bufferedOutput);
		}
		this.bufferedOutput = '';

		const panel = this.panelService.getActivePanel();
		(<OutputPanel>panel).revealLastLine();
	}

	private onOutputReceived(e: IOutputEvent): void {
		if (this.outputSet && e.channelId === this.outputChannel.id) {
			if (e.output) {
				this.bufferedOutput = strings.appendWithLimit(this.bufferedOutput, e.output, MAX_OUTPUT_LENGTH);
				this.scheduleOutputAppend();
			} else if (e.output === null) {
				this.clearValue(); // special output indicates we should clear
			}
		}
	}

	private isVisible(): boolean {
		const panel = this.panelService.getActivePanel();
		return panel && panel.getId() === OUTPUT_PANEL_ID && this.outputService.getActiveChannel().id === this.outputChannel.id;
	}

	private scheduleOutputAppend(): void {
		if (this.isVisible() && this.bufferedOutput && !this.appendOutputScheduler.isScheduled()) {
			this.appendOutputScheduler.schedule();
		}
	}

	public getTypeId(): string {
		return OUTPUT_EDITOR_INPUT_ID;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		return super.resolve(refresh).then(model => {
			// Just return model if output already set
			if (this.outputSet) {
				return model;
			}

			this.setValue(this.outputChannel.output);
			this.outputSet = true;

			return model;
		});
	}

	public matches(otherInput: any): boolean {
		if (otherInput instanceof OutputEditorInput) {
			let otherOutputEditorInput = <OutputEditorInput>otherInput;
			if (otherOutputEditorInput.outputChannel.id === this.outputChannel.id) {
				return super.matches(otherInput);
			}
		}

		return false;
	}

	public dispose(): void {
		this.appendOutputScheduler.dispose();
		this.toDispose = lifecycle.dispose(this.toDispose);

		super.dispose();
	}
}
