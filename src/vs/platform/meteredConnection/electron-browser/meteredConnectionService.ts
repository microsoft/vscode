/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../base/parts/sandbox/electron-browser/globals.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { AbstractMeteredConnectionService, getIsConnectionMetered, IMeteredConnectionService, METERED_CONNECTION_CHANGED_CHANNEL, NavigatorWithConnection } from '../common/meteredConnection.js';

/**
 * Electron-browser implementation of the metered connection service.
 * This implementation monitors navigator.connection and reports changes to the main process via IPC.
 */
export class NativeMeteredConnectionService extends AbstractMeteredConnectionService {
	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super(configurationService);

		const connection = (navigator as NavigatorWithConnection).connection;
		if (connection) {
			const onChange = () => {
				const value = getIsConnectionMetered();
				this.setIsConnectionMetered(value);
				ipcRenderer.send(METERED_CONNECTION_CHANGED_CHANNEL, value);
			};

			connection.addEventListener('change', onChange);
			this._register(toDisposable(() => connection.removeEventListener('change', onChange)));
			onChange();
		}
	}
}

registerSingleton(IMeteredConnectionService, NativeMeteredConnectionService, InstantiationType.Delayed);
