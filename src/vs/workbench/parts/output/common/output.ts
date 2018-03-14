/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
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
 * Mime type used by the log output editor.
 */
export const LOG_MIME = 'text/x-code-log-output';

/**
 * Log resource scheme.
 */
export const LOG_SCHEME = 'log';

/**
 * Id used by the log output editor.
 */
export const LOG_MODE_ID = 'log';

/**
 * Output panel id
 */
export const OUTPUT_PANEL_ID = 'workbench.panel.output';

/**
 * Open log viewer command id
 */
export const COMMAND_OPEN_LOG_VIEWER = 'workbench.action.openLogViewer';

export const Extensions = {
	OutputChannels: 'workbench.contributions.outputChannels'
};

export const OUTPUT_SERVICE_ID = 'outputService';

export const MAX_OUTPUT_LENGTH = 10000 /* Max. number of output lines to show in output */ * 100 /* Guestimated chars per line */;

export const CONTEXT_IN_OUTPUT = new RawContextKey<boolean>('inOutput', false);

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
	 * Show the channel with the passed id.
	 */
	showChannel(id: string, preserveFocus?: boolean): TPromise<void>;

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
	 * Returns the value indicating whether the channel has scroll locked.
	 */
	scrollLock: boolean;

	/**
	 * Appends output to the channel.
	 */
	append(output: string): void;

	/**
	 * Clears all received output for this channel.
	 */
	clear(): void;

	/**
	 * Disposes the output channel.
	 */
	dispose(): void;
}

export interface IOutputChannelIdentifier {
	id: string;
	label: string;
	file?: URI;
}

export interface IOutputChannelRegistry {

	readonly onDidRegisterChannel: Event<string>;
	readonly onDidRemoveChannel: Event<string>;

	/**
	 * Make an output channel known to the output world.
	 */
	registerChannel(id: string, name: string, file?: URI): void;

	/**
	 * Returns the list of channels known to the output world.
	 */
	getChannels(): IOutputChannelIdentifier[];

	/**
	 * Returns the channel with the passed id.
	 */
	getChannel(id: string): IOutputChannelIdentifier;

	/**
	 * Remove the output channel with the passed id.
	 */
	removeChannel(id: string): void;
}

class OutputChannelRegistry implements IOutputChannelRegistry {
	private channels = new Map<string, IOutputChannelIdentifier>();

	private readonly _onDidRegisterChannel: Emitter<string> = new Emitter<string>();
	readonly onDidRegisterChannel: Event<string> = this._onDidRegisterChannel.event;

	private readonly _onDidRemoveChannel: Emitter<string> = new Emitter<string>();
	readonly onDidRemoveChannel: Event<string> = this._onDidRemoveChannel.event;

	public registerChannel(id: string, label: string, file?: URI): void {
		if (!this.channels.has(id)) {
			this.channels.set(id, { id, label, file });
			this._onDidRegisterChannel.fire(id);
		}
	}

	public getChannels(): IOutputChannelIdentifier[] {
		const result: IOutputChannelIdentifier[] = [];
		this.channels.forEach(value => result.push(value));
		return result;
	}

	public getChannel(id: string): IOutputChannelIdentifier {
		return this.channels.get(id);
	}

	public removeChannel(id: string): void {
		this.channels.delete(id);
		this._onDidRemoveChannel.fire(id);
	}
}

Registry.add(Extensions.OutputChannels, new OutputChannelRegistry());