/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { StaticChangesetKind } from '../common/agentHostChangesetService.js';
import { buildBranchChangesetUri, buildSessionChangesetUri } from '../common/changesetUri.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { parseSubagentSessionUri } from '../common/state/sessionState.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/** Selects the summary source, preserving branch semantics until folder isolation is resolved. */
export function getSessionChangesSummaryKind(stateManager: AgentHostStateManager, session: string): StaticChangesetKind {
	let isolation = stateManager.getSessionState(session)?.config?.values[SessionConfigKey.Isolation];
	if (isolation === undefined) {
		const parent = parseSubagentSessionUri(session);
		if (parent) {
			isolation = stateManager.getSessionState(parent.parentSession.toString())?.config?.values[SessionConfigKey.Isolation];
		}
	}

	return isolation === 'folder' ? 'session' : 'branch';
}

/** Resolves implicit summary interest without duplicating an explicitly subscribed changeset. */
export function resolveChangesetSubscriptions(stateManager: AgentHostStateManager, session: string, subscriptions: ReadonlySet<string>): ReadonlySet<string> {
	const summaryUri = getSessionChangesSummaryKind(stateManager, session) === 'session'
		? buildSessionChangesetUri(session)
		: buildBranchChangesetUri(session);

	return new Set([...subscriptions].map(resource => resource === session ? summaryUri : resource));
}
