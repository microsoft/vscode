/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {EventProvider} from 'vs/base/common/eventProvider';
import {EditorModel} from 'vs/workbench/common/editor';
import {LogEditorInput} from 'vs/workbench/browser/parts/editor/logEditorInput';
import {OUTPUT_EDITOR_INPUT_ID, IOutputEvent, OUTPUT_MIME, IOutputService} from 'vs/workbench/parts/output/common/output';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

/**
 * Output Editor Input
 */
export class OutputEditorInput extends LogEditorInput {

	private static instances: { [channel: string]: OutputEditorInput; } = Object.create(null);
	private static MAX_OUTPUT_LINES = 10000; // Max. number of output lines to show in output

	private outputSet: boolean;
	private channel: string;
	private toUnbind: { (): void; }[];

	public static getInstances(): OutputEditorInput[] {
		return Object.keys(OutputEditorInput.instances).map((key) => OutputEditorInput.instances[key]);
	}

	public static getInstance(instantiationService: IInstantiationService, channel: string): OutputEditorInput {
		if (OutputEditorInput.instances[channel]) {
			return OutputEditorInput.instances[channel];
		}

		OutputEditorInput.instances[channel] = instantiationService.createInstance(OutputEditorInput, channel);

		return OutputEditorInput.instances[channel];
	}

	constructor(
		channel: string,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IOutputService private outputService: IOutputService
	) {
		super(nls.localize('output', "Output"), channel ? nls.localize('outputChannel', "for '{0}'", channel) : '', '', OUTPUT_MIME, true, instantiationService, editorService);

		this.channel = channel;
		this.toUnbind = [];

		this.outputService.onOutput.add(this.onOutputReceived, this);
	}

	private onOutputReceived(e: IOutputEvent): void {
		if (this.outputSet && e.channel === this.channel) {
			if (e.output) {
				this.append(e.output);
				this.trim(OutputEditorInput.MAX_OUTPUT_LINES);
			} else if (e.output === null) {
				this.clearValue(); // special output indicates we should clear
			}
		}
	}

	public getId(): string {
		return OUTPUT_EDITOR_INPUT_ID;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		return super.resolve(refresh).then(model => {

			// Just return model if output already set
			if (this.outputSet) {
				return model;
			}

			this.setValue(this.outputService.getOutput(this.channel));
			this.outputSet = true;

			return model;
		});
	}

	public clearOutput(): void {
		if (this.outputService) {
			this.outputService.clearOutput(this.channel);
		}
	}

	public getChannel(): string {
		return this.channel;
	}

	public matches(otherInput: any): boolean {
		if (otherInput instanceof OutputEditorInput) {
			let otherOutputEditorInput = <OutputEditorInput>otherInput;
			if (otherOutputEditorInput.getChannel() === this.channel) {
				return super.matches(otherInput);
			};
		}

		return false;
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}

		this.outputService.onOutput.remove(this.onOutputReceived, this);

		super.dispose();
	}
}