/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../util/vs/base/common/event';
import { createServiceIdentifier } from '../../../util/common/services';

// ── Service identifier ──────────────────────────────────────────────────────────

export const ISessionSyncStateService = createServiceIdentifier<ISessionSyncStateService>('ISessionSyncStateService');

// ── Types ────────────────────────────────────────────────────────────────────────

export type SessionSyncState =
	| { kind: 'not-enabled' }
	| { kind: 'disabled-by-policy' }
	| { kind: 'on' }
	| { kind: 'syncing'; sessionCount: number }
	| { kind: 'up-to-date'; syncedCount: number }
	| { kind: 'deleting'; sessionCount: number }
	| { kind: 'error' };

// ── Service interface ────────────────────────────────────────────────────────────

export interface ISessionSyncStateService {
	readonly _serviceBrand: undefined;

	/** The current sync state. */
	readonly syncState: SessionSyncState;

	/** Fires when the sync state changes. */
	readonly onDidChangeSyncState: Event<SessionSyncState>;
}
