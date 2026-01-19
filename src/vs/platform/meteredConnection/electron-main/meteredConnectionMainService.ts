/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { AbstractMeteredConnectionService } from '../common/meteredConnection.js';

/**
 * Electron-main implementation of the metered connection service.
 * This implementation receives metered connection updates via IPC from the renderer process.
 */
export class MeteredConnectionMainService extends AbstractMeteredConnectionService {
	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super(configurationService);
	}
}
