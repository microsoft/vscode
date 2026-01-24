/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../base/common/lifecycle.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { AbstractMeteredConnectionService, getIsConnectionMetered, IMeteredConnectionService, NavigatorWithConnection } from '../common/meteredConnection.js';
import { METERED_CONNECTION_CHANNEL, MeteredConnectionCommand } from '../common/meteredConnectionIpc.js';

/**
 * Electron-browser implementation of the metered connection service.
 * This implementation monitors navigator.connection and reports changes to the main process via IPC channel.
 */
export class NativeMeteredConnectionService extends AbstractMeteredConnectionService {
	private readonly _channel: IChannel;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super(configurationService, getIsConnectionMetered());
		this._channel = mainProcessService.getChannel(METERED_CONNECTION_CHANNEL);

		const connection = (navigator as NavigatorWithConnection).connection;
		if (connection) {
			const onChange = () => this.setConnectionState(getIsConnectionMetered());
			connection.addEventListener('change', onChange);
			this._register(toDisposable(() => connection.removeEventListener('change', onChange)));
		}
	}

	/**
	 * Notify the main process about changes to the navigator connection state.
	 */
	protected override onChangeConnectionState(): void {
		super.onChangeConnectionState();
		this._channel.call(MeteredConnectionCommand.SetNavigatorConnectionState, this.connectionState);
	}
}

registerSingleton(IMeteredConnectionService, NativeMeteredConnectionService, InstantiationType.Delayed);
