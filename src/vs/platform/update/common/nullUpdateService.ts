/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IUpdateService, State, UpdateType } from './update.js';

/** Update service contract used by builds that do not ship product update services. */
export class NullUpdateService implements IUpdateService {
	declare readonly _serviceBrand: undefined;
	readonly onStateChange = Event.None;
	readonly state = State.Idle(UpdateType.Archive);

	async checkForUpdates(_explicit: boolean): Promise<void> { }
	async downloadUpdate(_explicit: boolean): Promise<void> { }
	async applyUpdate(): Promise<void> { }
	async quitAndInstall(): Promise<void> { }
	async isLatestVersion(): Promise<boolean | undefined> { return undefined; }
	async _applySpecificUpdate(_packagePath: string): Promise<void> { }
	async setInternalOrg(_internalOrg: string | undefined): Promise<void> { }
}
