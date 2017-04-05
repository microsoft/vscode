/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { IOutputService, IOutputChannel, OUTPUT_PANEL_ID, Extensions, IOutputChannelRegistry } from 'vs/workbench/parts/output/common/output';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { MainThreadOutputServiceShape } from './extHost.protocol';

export class MainThreadOutputService extends MainThreadOutputServiceShape {

	private _outputService: IOutputService;
	private _partService: IPartService;
	private _panelService: IPanelService;

	constructor( @IOutputService outputService: IOutputService,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService
	) {
		super();
		this._outputService = outputService;
		this._partService = partService;
		this._panelService = panelService;
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
