/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../actions/chatContextKeys.js';
import { IChatDebugEvent, IChatDebugService } from '../../chatDebugService.js';
import { formatDebugEventsForContext, debugEventKindDescriptions, filterDebugEventsByText, debugEventFilterDescription } from '../../chatDebugEvents.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';

export const ListDebugEventsToolId = 'vscode_listDebugEvents_internal';

export const ListDebugEventsToolData: IToolData = {
	id: ListDebugEventsToolId,
	toolReferenceName: 'listDebugEvents',
	displayName: localize('listDebugEvents.displayName', "List Debug Events"),
	when: ChatContextKeys.chatSessionHasDebugTools,
	canBeReferencedInPrompt: false,
	modelDescription: 'Lists debug event summaries for the current chat session. Returns a compact log of events including timestamps, event IDs, and brief descriptions. Use this tool FIRST to get an overview of what happened, then call resolveDebugEventDetails on specific event IDs to get full details.\n\n'
		+ 'Supports filtering:\n'
		+ '- kind: filter by event type (toolCall, modelTurn, generic, subagentInvocation, userMessage, agentResponse)\n'
		+ '- filter: ' + debugEventFilterDescription + '\n'
		+ '- limit: return only the N most recent matching events (default: all)\n\n'
		+ 'Event types:\n'
		+ Object.values(debugEventKindDescriptions).join('\n'),
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			kind: {
				type: 'string',
				description: 'Filter by event kind: toolCall, modelTurn, generic, subagentInvocation, userMessage, agentResponse.',
			},
			filter: {
				type: 'string',
				description: debugEventFilterDescription,
			},
			limit: {
				type: 'number',
				description: 'Return only the N most recent matching events.',
			},
		},
	},
};

export class ListDebugEventsTool implements IToolImpl {
	constructor(
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('listDebugEvents.invocationMessage', 'Listing debug events'),
			pastTenseMessage: localize('listDebugEvents.pastTenseMessage', 'Listed debug events'),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const sessionResource = invocation.context?.sessionResource;
		if (!sessionResource) {
			return {
				content: [{ kind: 'text', value: 'Error: no chat session context available.' }],
			};
		}

		// Ensure providers have been invoked so we have all events
		if (!this.chatDebugService.hasInvokedProviders(sessionResource)) {
			await this.chatDebugService.invokeProviders(sessionResource);
		}

		let events: readonly IChatDebugEvent[] = this.chatDebugService.getEvents(sessionResource);
		if (events.length === 0) {
			return {
				content: [{ kind: 'text', value: 'No debug events found for this conversation.' }],
			};
		}

		// Filter by kind
		const kindFilter = typeof invocation.parameters['kind'] === 'string' ? invocation.parameters['kind'] : undefined;
		if (kindFilter) {
			events = events.filter(e => e.kind === kindFilter);
		}

		// Filter by text search (comma-separated, ! prefix to exclude)
		const textFilter = typeof invocation.parameters['filter'] === 'string' ? invocation.parameters['filter'].toLowerCase() : undefined;
		if (textFilter) {
			events = filterDebugEventsByText(events, textFilter);
		}

		// Limit to N most recent
		const limit = typeof invocation.parameters['limit'] === 'number' ? invocation.parameters['limit'] : undefined;
		if (limit !== undefined && limit > 0 && events.length > limit) {
			events = events.slice(events.length - limit);
		}

		if (events.length === 0) {
			return {
				content: [{ kind: 'text', value: 'No debug events matched the filter criteria.' }],
			};
		}

		const summary = formatDebugEventsForContext(events);
		return {
			content: [{
				kind: 'text',
				value: 'Debug event log for this conversation. Each line is a summary — call resolveDebugEventDetails with the event ID (shown as [id=...]) to get full details.\n\n'
					+ 'IMPORTANT: Do NOT mention event IDs or tool resolution steps in your response to the user.\n\n'
					+ summary,
			}],
		};
	}
}
