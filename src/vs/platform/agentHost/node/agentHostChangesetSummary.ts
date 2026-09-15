/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StaticChangesetKind } from '../common/agentHostChangesetService.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, ChangesetKind } from '../common/changesetUri.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { SessionConfigState } from '../common/state/sessionState.js';

export function getSummaryChangesetKind(configValues: SessionConfigState['values'] | undefined): StaticChangesetKind {
	return configValues?.[SessionConfigKey.Isolation] === 'worktree'
		? ChangesetKind.Branch
		: ChangesetKind.Session;
}

/** Resolves implicit summary interest without duplicating an explicitly subscribed changeset. */
export function resolveChangesetSubscriptions(session: string, subscriptions: ReadonlySet<string>, configValues: SessionConfigState['values'] | undefined): ReadonlySet<string> {
	const summaryUri = getSummaryChangesetKind(configValues) === ChangesetKind.Branch
		? buildBranchChangesetUri(session)
		: buildSessionChangesetUri(session);

	return new Set([...subscriptions].map(resource => resource === session ? summaryUri : resource));
}
