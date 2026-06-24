/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions, IOutputChannelRegistry, IOutputService, IOutputChannel, OUTPUT_VIEW_ID, OutputChannelUpdateMode } from '../../services/output/common/output.js';
import { MainThreadOutputServiceShape, MainContext, ExtHostOutputServiceShape, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { UriComponents, URI } from '../../../base/common/uri.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { isNumber } from '../../../base/common/types.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../services/statusbar/browser/statusbar.js';
import { localize } from '../../../nls.js';

@extHostNamedCustomer(MainContext.MainThreadOutputService)
export class MainThreadOutputService extends Disposable implements MainThreadOutputServiceShape {

	private static _extensionIdPool = new Map<string, number>();

	private readonly _proxy: ExtHostOutputServiceShape;
	private readonly _outputService: IOutputService;
	private readonly _viewsService: IViewsService;
	private readonly _configurationService: IConfigurationService;
	private readonly _statusbarService: IStatusbarService;

	private readonly _outputStatusItem = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		extHostContext: IExtHostContext,
		@IOutputService outputService: IOutputService,
		@IViewsService viewsService: IViewsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStatusbarService statusbarService: IStatusbarService,
	) {
		super();
		this._outputService = outputService;
		this._viewsService = viewsService;
		this._configurationService = configurationService;
		this._statusbarService = statusbarService;

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostOutputService);

		const setVisibleChannel = () => {
			const visibleChannel = this._viewsService.isViewVisible(OUTPUT_VIEW_ID) ? this._outputService.getActiveChannel() : undefined;
			this._proxy.$setVisibleChannel(visibleChannel ? visibleChannel.id : null);
			this._outputStatusItem.value = undefined;
		};
		this._register(Event.any<unknown>(this._outputService.onActiveOutputChannel, Event.filter(this._viewsService.onDidChangeViewVisibility, ({ id }) => id === OUTPUT_VIEW_ID))(() => setVisibleChannel()));
		setVisibleChannel();
	}

	public async $register(label: string, file: UriComponents, languageId: string | undefined, extensionId: string): Promise<string> {
		const idCounter = (MainThreadOutputService._extensionIdPool.get(extensionId) || 0) + 1;
		MainThreadOutputService._extensionIdPool.set(extensionId, idCounter);
		const id = `extension-output-${extensionId}-#${idCounter}-${label}`;
		const resource = URI.revive(file);

		Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({ id, label, source: { resource }, log: false, languageId, extensionId });
		this._register(toDisposable(() => this.$dispose(id)));
		return id;
	}

	public async $update(channelId: string, mode: OutputChannelUpdateMode, till?: number): Promise<void> {
		const channel = this._getChannel(channelId);
		if (channel) {
			if (mode === OutputChannelUpdateMode.Append) {
				channel.update(mode);
			} else if (isNumber(till)) {
				channel.update(mode, till);
			}
		}
	}

	public async $reveal(channelId: string, preserveFocus: boolean): Promise<void> {
		const channel = this._getChannel(channelId);
		if (!channel) {
			return;
		}

		const viewsToShowQuietly = this._configurationService.getValue<Record<string, boolean> | undefined>('workbench.view.showQuietly') ?? {};
		if (!this._viewsService.isViewVisible(OUTPUT_VIEW_ID) && viewsToShowQuietly[OUTPUT_VIEW_ID]) {
			this._showChannelQuietly(channel);
			return;
		}

		this._outputService.showChannel(channel.id, preserveFocus);
	}

	// Show status bar indicator
	private _showChannelQuietly(channel: IOutputChannel) {
		const statusProperties: IStatusbarEntry = {
			name: localize('status.showOutput', "Show Output"),
			text: '$(output)',
			ariaLabel: localize('status.showOutputAria', "Show {0} Output Channel", channel.label),
			command: `workbench.action.output.show.${channel.id}`,
			tooltip: localize('status.showOutputTooltip', "Show {0} Output Channel", channel.label),
			kind: 'prominent'
		};

		if (!this._outputStatusItem.value) {
			this._outputStatusItem.value = this._statusbarService.addEntry(
				statusProperties,
				'status.view.showQuietly',
				StatusbarAlignment.RIGHT,
				{ location: { id: 'status.notifications', priority: Number.NEGATIVE_INFINITY }, alignment: StatusbarAlignment.LEFT }
			);
		} else {
			this._outputStatusItem.value.update(statusProperties);
		}
	}

	public async $close(channelId: string): Promise<void> {
		if (this._viewsService.isViewVisible(OUTPUT_VIEW_ID)) {
			const activeChannel = this._outputService.getActiveChannel();
			if (activeChannel && channelId === activeChannel.id) {
				this._viewsService.closeView(OUTPUT_VIEW_ID);
			}
		}
	}

	public async $dispose(channelId: string): Promise<void> {
		const channel = this._getChannel(channelId);
		channel?.dispose();
	}

	private _getChannel(channelId: string): IOutputChannel | undefined {
		return this._outputService.getChannel(channelId);
	}
}
