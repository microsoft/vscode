/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isIChatSessionFileChange2 } from '../common/chatSessionsService.js';
import { IModifiedFileEntry } from '../common/editing/chatEditingService.js';
import { IAgentSession } from './agentSessions/agentSessionsModel.js';

export function editingEntriesContainResource(entries: readonly IModifiedFileEntry[], resourceUri: URI): boolean {
	for (const entry of entries) {
		if (isEqual(entry.modifiedURI, resourceUri) || isEqual(entry.originalURI, resourceUri)) {
			return true;
		}
	}

	return false;
}

export function agentSessionContainsResource(session: IAgentSession, resourceUri: URI): boolean {
	if (!(session.changes instanceof Array)) {
		return false;
	}

	for (const change of session.changes) {
		if (isIChatSessionFileChange2(change)) {
			if (isEqual(change.uri, resourceUri) || (change.originalUri && isEqual(change.originalUri, resourceUri)) || (change.modifiedUri && isEqual(change.modifiedUri, resourceUri))) {
				return true;
			}
		} else if (isEqual(change.modifiedUri, resourceUri) || (change.originalUri && isEqual(change.originalUri, resourceUri))) {
			return true;
		}
	}

	return false;
}
