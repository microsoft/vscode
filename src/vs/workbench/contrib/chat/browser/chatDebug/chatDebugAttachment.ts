/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import * as nls from '../../../../../nls.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { formatDebugEventsForContext, getDebugEventsModelDescription } from '../../common/chatDebugEvents.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';

/**
 * Creates a debug events attachment for a chat session.
 * This can be used to attach debug logs to a chat request.
 */
export async function createDebugEventsAttachment(
	sessionResource: URI,
	chatDebugService: IChatDebugService
): Promise<IChatRequestVariableEntry> {
	chatDebugService.markDebugDataAttached(sessionResource);
	if (!chatDebugService.hasInvokedProviders(sessionResource)) {
		await chatDebugService.invokeProviders(sessionResource);
	}
	const events = chatDebugService.getEvents(sessionResource);
	const summary = events.length > 0
		? formatDebugEventsForContext(events)
		: nls.localize('debugEventsSnapshot.noEvents', "No debug events found for this conversation.");

	return {
		id: 'chatDebugEvents',
		name: nls.localize('debugEventsSnapshot.contextName', "Debug Events Snapshot"),
		icon: Codicon.output,
		kind: 'debugEvents',
		snapshotTime: Date.now(),
		sessionResource,
		value: summary,
		modelDescription: getDebugEventsModelDescription(),
	};
}
