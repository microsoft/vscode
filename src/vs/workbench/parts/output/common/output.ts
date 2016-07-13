/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import {Registry} from 'vs/platform/platform';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IEditor} from 'vs/platform/editor/common/editor';

/**
 * Mime type used by the output editor.
 */
export const OUTPUT_MIME = 'text/x-code-output';

/**
 * Id used by the output editor.
 */
export const OUTPUT_MODE_ID = 'Log';

/**
 * Output editor input id.
 */
export const OUTPUT_EDITOR_INPUT_ID = 'vs.output';

/**
 * Output panel id
 */
export const OUTPUT_PANEL_ID = 'workbench.panel.output';

export const Extensions = {
	OutputChannels: 'workbench.contributions.outputChannels'
};

export const OUTPUT_SERVICE_ID = 'outputService';

export const MAX_OUTPUT_LENGTH = 10000 /* Max. number of output lines to show in output */ * 100 /* Guestimated chars per line */;

/**
 * The output event informs when new output got received.
 */
export interface IOutputEvent {
	output: string;
	channelId?: string;
}

export var IOutputService = createDecorator<IOutputService>(OUTPUT_SERVICE_ID);

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

export interface IOutputChannelRegistry {

	/**
	 * Make an output channel known to the output world.
	 */
	registerChannel(id: string, name: string): void;

	/**
	 * Returns the list of channels known to the output world.
	 */
	getChannels(): { id: string, label: string}[];
}

class OutputChannelRegistry implements IOutputChannelRegistry {
	private channels: { id: string, label: string }[];

	constructor() {
		this.channels = [];
	}

	public registerChannel(id: string, label: string): void {
		if (this.channels.every(channel => channel.id !== id)) {
			this.channels.push({ id, label });
		}
	}

	public getChannels(): { id: string, label: string}[] {
		return this.channels;
	}
}

Registry.add(Extensions.OutputChannels, new OutputChannelRegistry());
