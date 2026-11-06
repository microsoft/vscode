/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';

export const IChatDashboardService = createDecorator<IChatDashboardService>('chatDashboardService');

export interface IChatDashboardService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a chat status dashboard element embedded in a container div.
	 * Returns `undefined` if the dashboard is not available.
	 */
	createDashboardElement(store: DisposableStore): HTMLElement | undefined;
}

class NullChatDashboardService implements IChatDashboardService {
	readonly _serviceBrand: undefined;
	createDashboardElement(): HTMLElement | undefined { return undefined; }
}

registerSingleton(IChatDashboardService, NullChatDashboardService, InstantiationType.Delayed);
