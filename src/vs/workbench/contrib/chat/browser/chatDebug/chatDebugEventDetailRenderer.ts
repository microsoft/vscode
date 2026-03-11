/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IChatDebugEvent } from '../../common/chatDebugService.js';

/**
 * Format the detail text for a debug event (used when no resolved content is available).
 */
export function formatEventDetail(event: IChatDebugEvent): string {
	switch (event.kind) {
		case 'toolCall': {
			const parts = [localize('chatDebug.detail.tool', "Tool: {0}", event.toolName)];
			if (event.toolCallId) { parts.push(localize('chatDebug.detail.callId', "Call ID: {0}", event.toolCallId)); }
			if (event.result) { parts.push(localize('chatDebug.detail.result', "Result: {0}", event.result)); }
			if (event.durationInMillis !== undefined) { parts.push(localize('chatDebug.detail.durationMs', "Duration: {0}ms", event.durationInMillis)); }
			if (event.input) { parts.push(`\n${localize('chatDebug.detail.input', "Input:")}\n${event.input}`); }
			if (event.output) { parts.push(`\n${localize('chatDebug.detail.output', "Output:")}\n${event.output}`); }
			return parts.join('\n');
		}
		case 'modelTurn': {
			const parts = [event.model ?? localize('chatDebug.detail.modelTurn', "Model Turn")];
			if (event.inputTokens !== undefined) { parts.push(localize('chatDebug.detail.inputTokens', "Input tokens: {0}", event.inputTokens)); }
			if (event.outputTokens !== undefined) { parts.push(localize('chatDebug.detail.outputTokens', "Output tokens: {0}", event.outputTokens)); }
			if (event.totalTokens !== undefined) { parts.push(localize('chatDebug.detail.totalTokens', "Total tokens: {0}", event.totalTokens)); }
			if (event.durationInMillis !== undefined) { parts.push(localize('chatDebug.detail.durationMs', "Duration: {0}ms", event.durationInMillis)); }
			return parts.join('\n');
		}
		case 'generic':
			return `${event.name}\n${event.details ?? ''}`;
		case 'subagentInvocation': {
			const parts = [localize('chatDebug.detail.agent', "Agent: {0}", event.agentName)];
			if (event.description) { parts.push(localize('chatDebug.detail.description', "Description: {0}", event.description)); }
			if (event.status) { parts.push(localize('chatDebug.detail.status', "Status: {0}", event.status)); }
			if (event.durationInMillis !== undefined) { parts.push(localize('chatDebug.detail.durationMs', "Duration: {0}ms", event.durationInMillis)); }
			if (event.toolCallCount !== undefined) { parts.push(localize('chatDebug.detail.toolCallCount', "Tool calls: {0}", event.toolCallCount)); }
			if (event.modelTurnCount !== undefined) { parts.push(localize('chatDebug.detail.modelTurnCount', "Model turns: {0}", event.modelTurnCount)); }
			return parts.join('\n');
		}
		case 'userMessage': {
			const parts = [localize('chatDebug.detail.userMessage', "User Message: {0}", event.message)];
			for (const section of event.sections) {
				parts.push(`\n--- ${section.name} ---\n${section.content}`);
			}
			return parts.join('\n');
		}
		case 'agentResponse': {
			const parts = [localize('chatDebug.detail.agentResponse', "Agent Response: {0}", event.message)];
			for (const section of event.sections) {
				parts.push(`\n--- ${section.name} ---\n${section.content}`);
			}
			return parts.join('\n');
		}
	}
}
