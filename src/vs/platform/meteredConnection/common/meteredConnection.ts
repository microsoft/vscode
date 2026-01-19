/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IMeteredConnectionService = createDecorator<IMeteredConnectionService>('meteredConnectionService');

/**
 * Service to report on metered connection status.
 */
export interface IMeteredConnectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the current network connection is metered.
	 * Always returns `false` if the `update.respectMeteredConnections` setting is disabled.
	 */
	readonly isConnectionMetered: boolean;

	/**
	 * Event that fires when the metered connection status changes.
	 */
	readonly onDidChangeIsConnectionMetered: Event<boolean>;
}

export const METERED_CONNECTION_SETTING_KEY = 'update.respectMeteredConnections';
export const METERED_CONNECTION_CHANGED_CHANNEL = 'vscode:meteredConnectionChanged';

/**
 * Network Information API
 * See https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
 */
export interface NetworkInformation {
	saveData?: boolean;
	metered?: boolean;
	effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Extended Navigator interface for Network Information API
 */
export interface NavigatorWithConnection {
	readonly connection?: NetworkInformation;
}

/**
 * Check if the current network connection is metered according to the Network Information API.
 */
export function getIsConnectionMetered() {
	const connection = (navigator as NavigatorWithConnection).connection;
	if (!connection) {
		return false;
	}

	if (connection.saveData || connection.metered) {
		return true;
	}

	const effectiveType = connection.effectiveType;
	return effectiveType === '3g' || effectiveType === '2g' || effectiveType === 'slow-2g';
}
