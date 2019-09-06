/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IOutputService, IOutputChannel, OUTPUT_PANEL_ID, Extensions, IOutputChannelRegistry } from 'vs/workbench/contrib/output/common/output';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { MainThreadOutputServiceShape, MainContext, IExtHostContext, ExtHostOutputServiceShape, ExtHostContext } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { UriComponents, URI } from 'vs/base/common/uri';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';

@extHostNamedCustomer(MainContext.MainThreadOutputService)
export class MainThreadOutputService extends Disposable implements MainThreadOutputServiceShape {

	private static _idPool = 1;

	private readonly _proxy: ExtHostOutputServiceShape;
	private readonly _outputService: IOutputService;
	private readonly _layoutService: IWorkbenchLayoutService;
	private readonly _panelService: IPanelService;

	constructor(
		extHostContext: IExtHostContext,
		@IOutputService outputService: IOutputService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IPanelService panelService: IPanelService
	) {
		super();
		this._outputService = outputService;
		this._layoutService = layoutService;
		this._panelService = panelService;

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostOutputService);

		const setVisibleChannel = () => {
			const panel = this._panelService.getActivePanel();
			const visibleChannel = panel && panel.getId() === OUTPUT_PANEL_ID ? this._outputService.getActiveChannel() : undefined;
			this._proxy.$setVisibleChannel(visibleChannel ? visibleChannel.id : null);
		};
		this._register(Event.any<any>(this._outputService.onActiveOutputChannel, this._panelService.onDidPanelOpen, this._panelService.onDidPanelClose)(() => setVisibleChannel()));
		setVisibleChannel();
	}

	public $register(label: string, log: boolean, file?: UriComponents): Promise<string> {
		const id = 'extension-output-#' + (MainThreadOutputService._idPool++);
		Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({ id, label, file: file ? URI.revive(file) : undefined, log });
		this._register(toDisposable(() => this.$dispose(id)));
		return Promise.resolve(id);
	}

	public $append(channelId: string, value: string): Promise<void> | undefined {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.append(value);
		}
		return undefined;
	}

	public $update(channelId: string): Promise<void> | undefined {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.update();
		}
		return undefined;
	}

	public $clear(channelId: string, till: number): Promise<void> | undefined {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.clear(till);
		}
		return undefined;
	}

	public $reveal(channelId: string, preserveFocus: boolean): Promise<void> | undefined {
		const channel = this._getChannel(channelId);
		if (channel) {
			this._outputService.showChannel(channel.id, preserveFocus);
		}
		return undefined;
	}

	public $close(channelId: string): Promise<void> | undefined {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === OUTPUT_PANEL_ID) {
			const activeChannel = this._outputService.getActiveChannel();
			if (activeChannel && channelId === activeChannel.id) {
				this._layoutService.setPanelHidden(true);
			}
		}

		return undefined;
	}

	public $dispose(channelId: string): Promise<void> | undefined {
		const channel = this._getChannel(channelId);
		if (channel) {
			channel.dispose();
		}
		return undefined;
	}

	private _getChannel(channelId: string): IOutputChannel | undefined {
		return this._outputService.getChannel(channelId);
	}
}
