/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { Registry } from 'vs/platform/platform';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditor } from 'vs/platform/editor/common/editor';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';

/**
 * Mime type used by the output editor.
 */
export const OUTPUT_MIME = 'text/x-code-output';

/**
 * Output resource scheme.
 */
export const OUTPUT_SCHEME = 'output';

/**
 * Id used by the output editor.
 */
export const OUTPUT_MODE_ID = 'Log';

/**
 * Output panel id
 */
export const OUTPUT_PANEL_ID = 'workbench.panel.output';

export const Extensions = {
	OutputChannels: 'workbench.contributions.outputChannels'
};

export const OUTPUT_SERVICE_ID = 'outputService';

export const MAX_OUTPUT_LENGTH = 10000 /* Max. number of output lines to show in output */ * 100 /* Guestimated chars per line */;

export const CONTEXT_IN_OUTPUT = new RawContextKey<boolean>('inOutput', false);

/**
 * The output event informs when new output got received.
 */
export interface IOutputEvent {
	output: string;
	channelId?: string;
}

export const IOutputService = createDecorator<IOutputService>(OUTPUT_SERVICE_ID);

/**
 * The output service to manage output from the various processes running.
 */
export interface IOutputService {
	_serviceBrand: any;

	/**
	 * Given the channel id returns the output channel instance.
	 * Channel should be first registered via OutputChannelRegistry.
	 */
	getChannel(id: string): IOutputChannel;

	/**
	 * Returns an array of all known output channels as identifiers.
	 */
	getChannels(): IOutputChannelIdentifier[];

	/**
	 * Returns the currently active channel.
	 * Only one channel can be active at a given moment.
	 */
	getActiveChannel(): IOutputChannel;

	/**
	 * Allows to register on Output events.
	 */
	onOutput: Event<IOutputEvent>;

	/**
	 * Allows to register on a new Output channel getting filled with output.
	 */
	onOutputChannel: Event<string>;

	/**
	 * Allows to register on active output channel change.
	 */
	onActiveOutputChannel: Event<string>;
}

export interface IOutputChannel {

	/**
	 * Identifier of the output channel.
	 */
	id: string;

	/**
	 * Label of the output channel to be displayed to the user.
	 */
	label: string;

	/**
	 * Returns the received output content.
	 */
	output: string;

	/**
	 * Returns the value indicating whether the channel has scroll locked.
	 */
	scrollLock: boolean;

	/**
	 * Appends output to the channel.
	 */
	append(output: string): void;

	/**
	 * Opens the output for this channel.
	 */
	show(preserveFocus?: boolean): TPromise<IEditor>;

	/**
	 * Clears all received output for this channel.
	 */
	clear(): void;
}

export interface IOutputChannelIdentifier {
	id: string;
	label: string;
}

export interface IOutputChannelRegistry {

	/**
	 * Make an output channel known to the output world.
	 */
	registerChannel(id: string, name: string): void;

	/**
	 * Returns the list of channels known to the output world.
	 */
	getChannels(): IOutputChannelIdentifier[];
}

class OutputChannelRegistry implements IOutputChannelRegistry {
	private channels: IOutputChannelIdentifier[];

	constructor() {
		this.channels = [];
	}

	public registerChannel(id: string, label: string): void {
		if (this.channels.every(channel => channel.id !== id)) {
			this.channels.push({ id, label });
		}
	}

	public getChannels(): IOutputChannelIdentifier[] {
		return this.channels;
	}
}

Registry.add(Extensions.OutputChannels, new OutputChannelRegistry());

export class OutputEditors {

	private static instances: { [channel: string]: ResourceEditorInput; } = Object.create(null);

	public static getInstance(instantiationService: IInstantiationService, channel: IOutputChannel): ResourceEditorInput {
		if (OutputEditors.instances[channel.id]) {
			return OutputEditors.instances[channel.id];
		}

		const resource = URI.from({ scheme: OUTPUT_SCHEME, path: channel.id });

		OutputEditors.instances[channel.id] = instantiationService.createInstance(ResourceEditorInput, nls.localize('output', "Output"), channel ? nls.localize('channel', "for '{0}'", channel.label) : '', resource);

		return OutputEditors.instances[channel.id];
	}
}