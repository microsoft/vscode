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

@extHostNamedCustomer(MainContext.MainThreadOutputService)
export class MainThreadOutputService implements MainThreadOutputServiceShape {

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

	public $append(channelId: string, label: string, value: string): TPromise<void> {
		this._getChannel(channelId, label).append(value);
		return undefined;
	}

	public $clear(channelId: string, label: string): TPromise<void> {
		this._getChannel(channelId, label).clear();
		return undefined;
	}

	public $reveal(channelId: string, label: string, preserveFocus: boolean): TPromise<void> {
		this._getChannel(channelId, label).show(preserveFocus);
		return undefined;
	}

	private _getChannel(channelId: string, label: string): IOutputChannel {
		if (!Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannel(channelId)) {
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel(channelId, label);
		}

		return this._outputService.getChannel(channelId);
	}

	public $close(channelId: string): TPromise<void> {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === OUTPUT_PANEL_ID && channelId === this._outputService.getActiveChannel().id) {
			return this._partService.setPanelHidden(true);
		}

		return undefined;
	}

	public $dispose(channelId: string, label: string): TPromise<void> {
		this._getChannel(channelId, label).dispose();
		return undefined;
	}
}
