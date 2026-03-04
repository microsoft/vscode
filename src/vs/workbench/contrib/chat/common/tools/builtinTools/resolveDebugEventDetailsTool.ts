/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../actions/chatContextKeys.js';
import { IChatDebugEvent, IChatDebugResolvedEventContent, IChatDebugService } from '../../chatDebugService.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';

export const ResolveDebugEventDetailsToolId = 'vscode_resolveDebugEventDetails_internal';

export const ResolveDebugEventDetailsToolData: IToolData = {
	id: ResolveDebugEventDetailsToolId,
	toolReferenceName: 'resolveDebugEventDetails',
	displayName: localize('resolveDebugEventDetails.displayName', "Resolve Debug Event Details"),
	when: ChatContextKeys.chatSessionHasTroubleshootData,
	canBeReferencedInPrompt: false,
	modelDescription: 'Resolves the full details for a specific chat debug event by its event ID. Use this tool to get detailed information about a debug event such as tool call input/output, model turn details, user message sections, or file lists. The event ID can be found in the debug event log summary provided in the conversation context.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			eventId: {
				type: 'string',
				description: 'The ID of the debug event to resolve details for.',
			},
		},
		required: ['eventId'],
	},
};

function formatResolvedContent(content: IChatDebugResolvedEventContent): string {
	switch (content.kind) {
		case 'text':
			return content.value;
		case 'fileList': {
			const lines: string[] = [`File list (${content.discoveryType}):`];
			if (content.sourceFolders) {
				for (const folder of content.sourceFolders) {
					lines.push(`  Source folder: ${folder.uri.toString()} (${folder.storage}, ${folder.fileCount} files${folder.exists ? '' : ', missing'})`);
				}
			}
			for (const file of content.files) {
				const status = file.status === 'loaded' ? 'loaded' : `skipped${file.skipReason ? `: ${file.skipReason}` : ''}`;
				lines.push(`  ${file.uri.toString()} [${status}]`);
			}
			return lines.join('\n');
		}
		case 'message': {
			const lines: string[] = [`${content.type === 'user' ? 'User' : 'Agent'} message: ${content.message}`];
			for (const section of content.sections) {
				lines.push(`--- ${section.name} ---`);
				lines.push(section.content);
			}
			return lines.join('\n');
		}
		case 'toolCall': {
			const lines: string[] = [`Tool call: ${content.toolName}`];
			if (content.result) {
				lines.push(`Result: ${content.result}`);
			}
			if (content.durationInMillis !== undefined) {
				lines.push(`Duration: ${content.durationInMillis}ms`);
			}
			if (content.input) {
				lines.push(`Input:\n${content.input}`);
			}
			if (content.output) {
				lines.push(`Output:\n${content.output}`);
			}
			return lines.join('\n');
		}
		case 'modelTurn': {
			const lines: string[] = [`Model turn: ${content.requestName}`];
			if (content.model) {
				lines.push(`Model: ${content.model}`);
			}
			if (content.status) {
				lines.push(`Status: ${content.status}`);
			}
			if (content.durationInMillis !== undefined) {
				lines.push(`Duration: ${content.durationInMillis}ms`);
			}
			if (content.inputTokens !== undefined || content.outputTokens !== undefined) {
				lines.push(`Tokens: input=${content.inputTokens ?? '?'}, output=${content.outputTokens ?? '?'}, cached=${content.cachedTokens ?? '?'}, total=${content.totalTokens ?? '?'}`);
			}
			if (content.errorMessage) {
				lines.push(`Error: ${content.errorMessage}`);
			}
			if (content.sections) {
				for (const section of content.sections) {
					lines.push(`--- ${section.name} ---`);
					lines.push(section.content);
				}
			}
			return lines.join('\n');
		}
		default: {
			const _: never = content;
			return JSON.stringify(_);
		}
	}
}

function truncate(text: string, maxLength = 30): string {
	if (text.length <= maxLength) {
		return text;
	}
	const lastSpace = text.lastIndexOf(' ', maxLength);
	const cutoff = lastSpace > maxLength / 2 ? lastSpace : maxLength;
	return text.substring(0, cutoff) + '\u2026';
}

function getEventLabel(event: IChatDebugEvent): string {
	switch (event.kind) {
		case 'generic': return event.name;
		case 'toolCall': return event.toolName;
		case 'modelTurn': return event.requestName ?? localize('debugEvent.modelTurn', "Model Turn");
		case 'userMessage': return localize('debugEvent.userMessage', "User Message: {0}", truncate(event.message));
		case 'agentResponse': return localize('debugEvent.agentResponse', "Agent Response: {0}", truncate(event.message));
		case 'subagentInvocation': return event.agentName;
	}
}

export class ResolveDebugEventDetailsTool implements IToolImpl {
	constructor(
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const eventId = context.parameters?.eventId;
		let eventLabel: string | undefined;
		if (typeof eventId === 'string' && context.chatSessionResource) {
			const events = this.chatDebugService.getEvents(context.chatSessionResource);
			const event = events.find(e => e.id === eventId);
			if (event) {
				eventLabel = getEventLabel(event);
			}
		}

		if (eventLabel) {
			return {
				invocationMessage: localize('resolveDebugEventDetails.invocationMessageNamed', 'Resolving details for "{0}"', eventLabel),
				pastTenseMessage: localize('resolveDebugEventDetails.pastTenseMessageNamed', 'Resolved details for "{0}"', eventLabel),
			};
		}
		return {
			invocationMessage: localize('resolveDebugEventDetails.invocationMessage', 'Resolving debug event details'),
			pastTenseMessage: localize('resolveDebugEventDetails.pastTenseMessage', 'Resolved debug event details'),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const eventId = invocation.parameters['eventId'];
		if (typeof eventId !== 'string' || !eventId) {
			return {
				content: [{ kind: 'text', value: 'Error: eventId parameter is required.' }],
			};
		}

		const sessionResource = invocation.context?.sessionResource;
		if (!sessionResource) {
			return {
				content: [{ kind: 'text', value: 'Error: no chat session context available.' }],
			};
		}

		const sessionEvents = this.chatDebugService.getEvents(sessionResource);
		if (!sessionEvents.some(e => e.id === eventId)) {
			return {
				content: [{ kind: 'text', value: `No event with ID "${eventId}" found in the current session.` }],
			};
		}

		const resolved = await this.chatDebugService.resolveEvent(eventId);
		if (!resolved) {
			return {
				content: [{ kind: 'text', value: `No details found for event ID: ${eventId}` }],
			};
		}

		return {
			content: [{ kind: 'text', value: formatResolvedContent(resolved) }],
		};
	}
}
