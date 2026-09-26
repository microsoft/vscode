/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const AGENTS_WINDOW_OPEN_COUNT_KEY = 'agentSessions.telemetry.summary.appLaunchCount';

export const ISessionsWindowUsageService = createDecorator<ISessionsWindowUsageService>('sessionsWindowUsageService');

export interface ISessionsWindowUsageService {
	readonly _serviceBrand: undefined;
	readonly hadPriorWindowOpen: boolean;
	readonly windowOpenCount: number;
}

export class SessionsWindowUsageService implements ISessionsWindowUsageService {

	declare readonly _serviceBrand: undefined;

	readonly hadPriorWindowOpen: boolean;
	readonly windowOpenCount: number;

	constructor(@IStorageService storageService: IStorageService) {
		const previousWindowOpenCount = storageService.getNumber(AGENTS_WINDOW_OPEN_COUNT_KEY, StorageScope.APPLICATION, 0);
		this.hadPriorWindowOpen = previousWindowOpenCount > 0;
		this.windowOpenCount = previousWindowOpenCount + 1;
		storageService.store(AGENTS_WINDOW_OPEN_COUNT_KEY, this.windowOpenCount, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

registerSingleton(ISessionsWindowUsageService, SessionsWindowUsageService, InstantiationType.Eager);
