/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPlaywrightService = createDecorator<IPlaywrightService>('playwrightService');

/**
 * A service for using Playwright to connect to and automate the integrated browser.
 */
export interface IPlaywrightService {
	readonly _serviceBrand: undefined;

	// TODO@kycutler: define a more specific API.
	initialize(): Promise<void>;
}
