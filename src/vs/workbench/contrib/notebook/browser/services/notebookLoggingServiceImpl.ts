/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookLoggingService } from 'vs/workbench/contrib/notebook/common/notebookLoggingService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IOutputChannelRegistry, IOutputService, Extensions as OutputExt, IOutputChannel } from 'vs/workbench/services/output/common/output';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


export class NotebookLoggingService extends Disposable implements INotebookLoggingService {
	_serviceBrand: undefined;

	static ID: string = 'notebook';
	private _enabled: boolean = false;
	private _outputChannel: IOutputChannel | undefined = undefined;

	constructor(
		@IOutputService private readonly _outputService: IOutputService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		this._enabled = this._configurationService.getValue<boolean>('notebook.logging');

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('notebook.logging')) {
				this._enabled = this._configurationService.getValue<boolean>('notebook.logging');
			}
		}));
	}

	private _getOrCreateOutputChannel(): IOutputChannel {
		if (this._outputChannel) {
			return this._outputChannel;
		}
		const channel = this._outputService.getChannel(NotebookLoggingService.ID);

		if (channel) {
			this._outputChannel = channel;
			return channel;
		}
		const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
		outputChannelRegistry.registerChannel({ id: NotebookLoggingService.ID, label: nls.localize('notebook.log', "Notebooks"), log: false });

		this._outputChannel = this._outputService.getChannel(NotebookLoggingService.ID);
		if (!this._outputChannel) {
			throw new Error('output channel not found');
		}

		return this._outputChannel;
	}


	log(category: string, output: string): void {
		if (!this._enabled) {
			return;
		}

		const channel = this._getOrCreateOutputChannel();
		channel.append(`[${category}] ${output}\n`);
	}
}

