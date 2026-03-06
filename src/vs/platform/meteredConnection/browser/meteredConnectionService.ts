/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { AbstractMeteredConnectionService, getIsBrowserConnectionMetered, IMeteredConnectionService, NavigatorWithConnection } from '../common/meteredConnection.js';

/**
 * Browser implementation of the metered connection service.
 * This implementation monitors navigator.connection for changes.
 */
export class MeteredConnectionService extends AbstractMeteredConnectionService {
	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super(configurationService, getIsBrowserConnectionMetered());

		const connection = (navigator as NavigatorWithConnection).connection;
		if (connection) {
			const onChange = () => this.setIsBrowserConnectionMetered(getIsBrowserConnectionMetered());
			connection.addEventListener('change', onChange);
			this._register(toDisposable(() => connection.removeEventListener('change', onChange)));
		}
	}
}

registerSingleton(IMeteredConnectionService, MeteredConnectionService, InstantiationType.Delayed);
