/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatPermissionSnapshot } from './chatPermissions.js';

export const IChatPermissionSnapshotService = createDecorator<IChatPermissionSnapshotService>('chatPermissionSnapshotService');

/**
 * Supplies the effective agent permission state for display.
 *
 * Implementations project what the Copilot runtime reports; they never merge or rank layers
 * themselves. The interface is intentionally narrow so the current best-effort source can be
 * replaced by the runtime's own effective-permissions projection without touching any UI.
 */
export interface IChatPermissionSnapshotService {
	readonly _serviceBrand: undefined;

	/** The current effective permission state, including its loading and unavailable states. */
	readonly snapshot: IObservable<ChatPermissionSnapshot>;

	/**
	 * Re-resolves the snapshot. Resolution can be slow (it may probe the runtime), so callers
	 * should treat this as an explicit user action rather than something to poll.
	 */
	refresh(): Promise<void>;
}
