/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { IMeteredConnectionService } from '../common/meteredConnection.js';
import { METERED_CONNECTION_CHANNEL, MeteredConnectionChannelClient } from '../common/meteredConnectionIpc.js';

/**
 * Electron-browser implementation of the metered connection service.
 * The native state and user override are owned by the main process.
 */
export class NativeMeteredConnectionService extends MeteredConnectionChannelClient {
	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super(mainProcessService.getChannel(METERED_CONNECTION_CHANNEL));
	}
}

registerSingleton(IMeteredConnectionService, NativeMeteredConnectionService, InstantiationType.Delayed);
