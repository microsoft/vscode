/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL v3 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export const IOAuthMainService = createDecorator<IOAuthMainService>('oauthMainService');

export interface IOAuthResult {
	api_key?: string;
	error?: string;
	error_description?: string;
}

export interface IOAuthMainService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when OAuth authentication completes
	 */
	readonly onDidCompleteOAuth: Event<IOAuthResult>;

	/**
	 * Start OAuth flow by opening a new BrowserWindow
	 * @param authUrl The OAuth authorization URL to load
	 */
	startOAuthFlow(authUrl: string): Promise<void>;

	/**
	 * Stop OAuth flow and close any open windows
	 */
	stopOAuthFlow(): Promise<void>;
}
