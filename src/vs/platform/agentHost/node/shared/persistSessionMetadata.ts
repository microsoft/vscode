/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';

/**
 * Fire-and-forget persistence of a single session-metadata key/value pair to a
 * session's database. Opens the database, writes the value, and disposes the
 * handle; failures are logged, not thrown.
 *
 * Used for host-owned fields that must survive restart (custom titles, isRead /
 * isArchived flags, merged config values, …). Shared so callers do not each
 * re-implement the open/write/dispose dance.
 */
export function persistSessionMetadata(sessionDataService: ISessionDataService, logService: ILogService, session: string, key: string, value: string): void {
	const ref = sessionDataService.openDatabase(URI.parse(session));
	ref.object.setMetadata(key, value).catch(err => {
		logService.warn(`[AgentHost] Failed to persist session metadata '${key}'`, err);
	}).finally(() => {
		ref.dispose();
	});
}
