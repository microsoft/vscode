/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildSessionChangesetUri } from '../common/changesetUri.js';

/** Resolves implicit summary interest without duplicating an explicitly subscribed changeset. */
export function resolveChangesetSubscriptions(session: string, subscriptions: ReadonlySet<string>): ReadonlySet<string> {
	const summaryUri = buildSessionChangesetUri(session);

	return new Set([...subscriptions].map(resource => resource === session ? summaryUri : resource));
}
