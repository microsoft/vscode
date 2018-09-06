/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { IOutputService, IOutputChannel, OUTPUT_PANEL_ID, Extensions, IOutputChannelRegistry } from 'vs/workbench/parts/output/common/output';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { MainThreadOutputServiceShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { UriComponents, URI } from 'vs/base/common/uri';

@extHostNamedCustomer(MainContext.MainThreadOutputService)
export class MainThreadOutputService implements MainThreadOutputServiceShape {

	private static _idPool = 1;

	private readonly _outputService: IOutputService;
	private readonly _partService: IPartService;
	private readonly _panelService: IPanelService;

	constructor(
		extHostContext: IExtHostContext,
		@IOutputService outputService: IOutputService,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService
	) {
		this._outputService = outputService;
		this._partService = partService;
		this._panelService = panelService;
	}

	public dispose(): void {
		// Leave all the existing channels intact (e.g. might help with troubleshooting)
	}

	public $register(label: string, file?: UriComponents): Thenable<string> {
		const id = 'extension-output-#' + (MainThreadOutputService._idPool++);
		Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({ id, label, file: file ? URI.revive(file) : null, log: false });
		return TPromise.as(id);
	}

	public $append(channelId: string, value: string): Thenable<void> {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.append(value);
		}
		return undefined;
	}

	public $clear(channelId: string): Thenable<void> {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.clear();
		}
		return undefined;
	}

	public $reveal(channelId: string, preserveFocus: boolean): Thenable<void> {
		const channel = this._getChannel(channelId);
		if (channel) {
			this._outputService.showChannel(channel.id, preserveFocus);
		}
		return undefined;
	}

	public $close(channelId: string): Thenable<void> {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === OUTPUT_PANEL_ID && channelId === this._outputService.getActiveChannel().id) {
			return this._partService.setPanelHidden(true);
		}

		return undefined;
	}

	public $dispose(channelId: string): Thenable<void> {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.dispose();
		}
		return undefined;
	}

	private _getChannel(channelId: string): IOutputChannel {
		return this._outputService.getChannel(channelId);
	}
}
