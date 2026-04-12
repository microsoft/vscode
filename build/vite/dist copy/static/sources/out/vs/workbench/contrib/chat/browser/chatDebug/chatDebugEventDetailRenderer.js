/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
import { safeIntl } from '../../../../../base/common/date.js';
const numberFormatter = safeIntl.NumberFormat();
/**
 * Format the detail text for a debug event (used when no resolved content is available).
 */
export function formatEventDetail(event) {
    switch (event.kind) {
        case 'toolCall': {
            const parts = [localize('chatDebug.detail.tool', "Tool: {0}", event.toolName)];
            if (event.toolCallId) {
                parts.push(localize('chatDebug.detail.callId', "Call ID: {0}", event.toolCallId));
            }
            if (event.result) {
                parts.push(localize('chatDebug.detail.result', "Result: {0}", event.result));
            }
            if (event.durationInMillis !== undefined) {
                parts.push(localize('chatDebug.detail.durationMs', "Duration: {0}ms", numberFormatter.value.format(event.durationInMillis)));
            }
            if (event.input) {
                parts.push(`\n${localize('chatDebug.detail.input', "Input:")}\n${event.input}`);
            }
            if (event.output) {
                parts.push(`\n${localize('chatDebug.detail.output', "Output:")}\n${event.output}`);
            }
            return parts.join('\n');
        }
        case 'modelTurn': {
            const parts = [event.model ?? localize('chatDebug.detail.modelTurn', "Model Turn")];
            if (event.inputTokens !== undefined) {
                parts.push(localize('chatDebug.detail.inputTokens', "Input tokens: {0}", numberFormatter.value.format(event.inputTokens)));
            }
            if (event.outputTokens !== undefined) {
                parts.push(localize('chatDebug.detail.outputTokens', "Output tokens: {0}", numberFormatter.value.format(event.outputTokens)));
            }
            if (event.totalTokens !== undefined) {
                parts.push(localize('chatDebug.detail.totalTokens', "Total tokens: {0}", numberFormatter.value.format(event.totalTokens)));
            }
            if (event.durationInMillis !== undefined) {
                parts.push(localize('chatDebug.detail.durationMs', "Duration: {0}ms", numberFormatter.value.format(event.durationInMillis)));
            }
            return parts.join('\n');
        }
        case 'generic':
            return `${event.name}\n${event.details ?? ''}`;
        case 'subagentInvocation': {
            const parts = [localize('chatDebug.detail.agent', "Agent: {0}", event.agentName)];
            if (event.description) {
                parts.push(localize('chatDebug.detail.description', "Description: {0}", event.description));
            }
            if (event.status) {
                parts.push(localize('chatDebug.detail.status', "Status: {0}", event.status));
            }
            if (event.durationInMillis !== undefined) {
                parts.push(localize('chatDebug.detail.durationMs', "Duration: {0}ms", numberFormatter.value.format(event.durationInMillis)));
            }
            if (event.toolCallCount !== undefined) {
                parts.push(localize('chatDebug.detail.toolCallCount', "Tool calls: {0}", numberFormatter.value.format(event.toolCallCount)));
            }
            if (event.modelTurnCount !== undefined) {
                parts.push(localize('chatDebug.detail.modelTurnCount', "Model turns: {0}", numberFormatter.value.format(event.modelTurnCount)));
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRXZlbnREZXRhaWxSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnRXZlbnREZXRhaWxSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTlELE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUVoRDs7R0FFRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxLQUFzQjtJQUN2RCxRQUFRLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwQixLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDakIsTUFBTSxLQUFLLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQy9FLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDNUcsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQUMsQ0FBQztZQUNuRyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFBQyxLQUFLLENBQUMs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