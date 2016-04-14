/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {Registry} from 'vs/platform/platform';
import {IOutputService, IOutputChannel, OUTPUT_PANEL_ID, Extensions, IOutputChannelRegistry} from 'vs/workbench/parts/output/common/output';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

export class ExtHostOutputChannel implements vscode.OutputChannel {

	private _proxy: MainThreadOutputService;
	private _name: string;
	private _label: string;
	private _disposed: boolean;

	constructor(name: string, proxy: MainThreadOutputService, label?: string) {
		this._name = name;
		this._label = label;
		this._proxy = proxy;
	}

	get name(): string {
		return this._name;
	}

	dispose(): void {
		if (!this._disposed) {
			this._proxy.clear(this._name).then(() => {
				this._disposed = true;
			});
		}
	}

	append(value: string): void {
		this._proxy.append(this._name, this._label, value);
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	clear(): void {
		this._proxy.clear(this._name);
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		if (typeof columnOrPreserveFocus === 'boolean') {
			preserveFocus = columnOrPreserveFocus;
		}

		this._proxy.reveal(this._name, preserveFocus);
	}

	hide(): void {
		this._proxy.close(this._name);
	}
}

export class ExtHostOutputService {

	private _proxy: MainThreadOutputService;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadOutputService);
	}

	createOutputChannel(name: string, label?: string): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			return new ExtHostOutputChannel(name, this._proxy, label);
		}
	}
}

@Remotable.MainContext('MainThreadOutputService')
export class MainThreadOutputService {

	private _outputService: IOutputService;
	private _partService: IPartService;
	private _panelService: IPanelService;

	constructor(@IOutputService outputService: IOutputService,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService
	) {
		this._outputService = outputService;
		this._partService = partService;
		this._panelService = panelService;
	}

	public append(channelId: string, label: string, value: string): TPromise<void> {
		this._getChannel(channelId, label).append(value);
		return undefined;
	}

	public clear(channelId: string): TPromise<void> {
		this._getChannel(channelId).clear();
		return undefined;
	}

	public reveal(channelId: string, preserveFocus: boolean): TPromise<void> {
		this._getChannel(channelId).show(preserveFocus);
		return undefined;
	}

	private _getChannel(channelId: string, label?: string): IOutputChannel {
		if (!Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels().some(channel => channel.id === channelId)) {
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel(channelId, label || channelId);
		}

		return this._outputService.getChannel(channelId);
	}

	public close(channelId: string): TPromise<void> {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === OUTPUT_PANEL_ID && channelId === this._outputService.getActiveChannel().id ) {
			this._partService.setPanelHidden(true);
		}

		return undefined;
	}
}
