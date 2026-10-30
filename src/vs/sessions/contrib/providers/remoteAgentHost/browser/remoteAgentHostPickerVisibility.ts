/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { normalizeRemoteAgentHostAddress } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

const hiddenKeyPrefix = 'remoteAgentHost.pickerHidden.';

/** Uses stable host identity, with an account namespace for user-shared environments. */
export function getRemoteAgentHostPickerKey(hostKey: string, account?: string): string {
	return JSON.stringify([normalizeRemoteAgentHostAddress(hostKey), account ?? null]);
}

/** Profile-local picker preferences, independent of connections and discovery. */
export class RemoteAgentHostPickerVisibility extends Disposable {
	private readonly changed: IObservable<void>;

	constructor(private readonly storageService: IStorageService) {
		super();
		this.changed = observableSignalFromEvent(this, Event.filter(
			storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key.startsWith(hiddenKeyPrefix),
		));
	}

	isHidden(key: string, reader?: IReader): boolean {
		this.changed.read(reader);
		return this.storageService.getBoolean(`${hiddenKeyPrefix}${key}`, StorageScope.PROFILE, false);
	}

	setHidden(key: string, hidden: boolean): void {
		if (hidden) {
			this.storageService.store(`${hiddenKeyPrefix}${key}`, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(`${hiddenKeyPrefix}${key}`, StorageScope.PROFILE);
		}
	}
}
