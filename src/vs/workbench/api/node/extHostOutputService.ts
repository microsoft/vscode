/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {Registry} from 'vs/platform/platform';
import {IOutputService, IOutputChannel, OUTPUT_PANEL_ID, Extensions, IOutputChannelRegistry} from 'vs/workbench/parts/output/common/output';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {MainContext} from './extHostProtocol';

export class ExtHostOutputChannel implements vscode.OutputChannel {

	private static _idPool = 1;

	private _proxy: MainThreadOutputService;
	private _name: string;
	private _id: string;
	private _disposed: boolean;

	constructor(name: string, proxy: MainThreadOutputService) {
		this._name = name;
		this._id = 'extension-output-#' + (ExtHostOutputChannel._idPool++);
		this._proxy = proxy;
	}

	get name(): string {
		return this._name;
	}

	dispose(): void {
		if (!this._disposed) {
			this._proxy.clear(this._id, this._name).then(() => {
				this._disposed = true;
			});
		}
	}

	append(value: string): void {
		this._proxy.append(this._id, this._name, value);
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}

	clear(): void {
		this._proxy.clear(this._id, this._name);
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		if (typeof columnOrPreserveFocus === 'boolean') {
			preserveFocus = columnOrPreserveFocus;
		}

		this._proxy.reveal(this._id, this._name, preserveFocus);
	}

	hide(): void {
		this._proxy.close(this._id);
	}
}

export class ExtHostOutputService {

	private _proxy: MainThreadOutputService;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadOutputService);
	}

	createOutputChannel(name: string): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			return new ExtHostOutputChannel(name, this._proxy);
		}
	}
}

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

	public clear(channelId: string, label: string): TPromise<void> {
		this._getChannel(channelId, label).clear();
		return undefined;
	}

	public reveal(channelId: string, label: string, preserveFocus: boolean): TPromise<void> {
		this._getChannel(channelId, label).show(preserveFocus);
		return undefined;
	}

	private _getChannel(channelId: string, label: string): IOutputChannel {
		if (Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels().every(channel => channel.id !== channelId)) {
			Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel(channelId, label);
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
