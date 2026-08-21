/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { AbstractMeteredConnectionService, IMeteredConnectionService } from '../common/meteredConnection.js';

/**
 * Browser Network Information API properties used for metered detection.
 * See https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
 */
interface NetworkInformation {
	saveData?: boolean;
	metered?: boolean;
	effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Extends Navigator with the optional browser Network Information API.
 */
interface NavigatorWithConnection {
	readonly connection?: NetworkInformation;
}

/**
 * Returns whether the browser Network Information API indicates a metered connection.
 */
function getIsBrowserConnectionMetered(): boolean {
	const connection = (navigator as NavigatorWithConnection).connection;
	if (!connection) {
		return false;
	}

	if (connection.saveData || connection.metered) {
		return true;
	}

	const effectiveType = connection.effectiveType;
	return effectiveType === '2g' || effectiveType === 'slow-2g';
}

/**
 * Browser implementation of the metered connection service.
 * This implementation monitors navigator.connection for changes.
 */
export class MeteredConnectionService extends AbstractMeteredConnectionService {
	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super(configurationService, getIsBrowserConnectionMetered());

		const connection = (navigator as NavigatorWithConnection).connection;
		if (connection) {
			const onChange = () => this.setIsUnderlyingConnectionMetered(getIsBrowserConnectionMetered());
			connection.addEventListener('change', onChange);
			this._register(toDisposable(() => connection.removeEventListener('change', onChange)));
		}
	}
}

registerSingleton(IMeteredConnectionService, MeteredConnectionService, InstantiationType.Delayed);
