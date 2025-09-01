/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

export const IOAuthCallbackService = createDecorator<IOAuthCallbackService>('oauthCallbackService');

export interface IOAuthResult {
	api_key?: string;
	error?: string;
	error_description?: string;
}

export interface IOAuthCallbackService {
	readonly _serviceBrand: undefined;
	
	readonly onAuthenticationComplete: Event<IOAuthResult>;
	startOAuthFlow(authUrl: string): Promise<void>;
	stopOAuthFlow(): Promise<void>;
}
