/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../actions/chatContextKeys.js';
import { ChatDebugHookResult, IChatDebugService } from '../../chatDebugService.js';
import { ToolDataSource } from '../languageModelToolsService.js';
export const ResolveDebugEventDetailsToolId = 'vscode_resolveDebugEventDetails_internal';
export const ResolveDebugEventDetailsToolData = {
    id: ResolveDebugEventDetailsToolId,
    toolReferenceName: 'resolveDebugEventDetails',
    displayName: localize('resolveDebugEventDetails.displayName', "Resolve Debug Event Details"),
    when: ChatContextKeys.chatSessionHasDebugTools,
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
function formatResolvedContent(content) {
    switch (content.kind) {
        case 'text':
            return content.value;
        case 'fileList': {
            const lines = [localize('formatResolvedContent.fileList', "File list ({0}):", content.discoveryType)];
            if (content.sourceFolders) {
                for (const folder of content.sourceFolders) {
                    lines.push(localize('formatResolvedContent.sourceFolder', "  Source folder: {0} ({1})", folder.uri.toString(), folder.storage));
                }
            }
            for (const file of content.files) {
                const status = file.status === 'loaded'
                    ? localize('formatResolvedContent.loaded', "loaded")
                    : file.skipReason
                        ? localize('formatResolvedContent.skippedWithReason', "skipped: {0}", file.skipReason)
                        : localize('formatResolvedContent.skipped', "skipped");
                lines.push(`  ${file.uri.toString()} [${status}]`);
            }
            return lines.join('\n');
        }
        case 'message': {
            const messageType = content.type === 'user'
                ? localize('formatResolvedContent.userMessage', "User message: {0}", content.message)
                : localize('formatResolvedContent.agentMessage', "Agent message: {0}", content.message);
            const lines = [messageType];
            for (const section of content.sections) {
                lines.push(`--- ${section.name} ---`);
                lines.push(section.content);
            }
            return lines.join('\n');
        }
        case 'toolCall': {
            const lines = [localize('formatResolvedContent.toolCall', "Tool call: {0}", content.toolName)];
            if (content.result) {
                lines.push(localize('formatResolvedContent.result', "Result: {0}", content.result));
            }
            if (content.durationInMillis !== undefined) {
                lines.push(localize('formatResolvedContent.duration', "Duration: {0}ms", content.durationInMillis));
            }
            if (content.input) {
                lines.push(localize('formatResolvedContent.input', "Input:") + '\n' + content.input);
            }
            if (content.output) {
                lines.push(localize('formatResolvedContent.output', "Output:") + '\n' + content.output);
            }
            return lines.join('\n');
        }
        case 'modelTurn': {
            const lines = [localize('formatResolvedContent.modelTurn', "Model turn: {0}", content.requestName)];
            if (content.model) {
                lines.push(localize('formatResolvedContent.model', "Model: {0}", content.model));
            }
            if (content.status) {
                lines.push(localize('formatResolvedContent.status', "Status: {0}", content.status));
            }
            if (content.durationInMillis !== undefined) {
                lines.push(localize('formatResolvedContent.duration', "Duration: {0}ms", content.durationInMillis));
            }
            if (content.inputTokens !== undefined || content.outputTokens !== undefined) {
                lines.push(localize('formatResolvedContent.tokens', "Tokens: input={0}, output={1}, cached={2}, total={3}", content.inputTokens ?? '?', content.outputTokens ?? '?', content.cachedTokens ?? '?', content.totalTokens ?? '?'));
            }
            if (content.errorMessage) {
                lines.push(localize('formatResolvedContent.error', "Error: {0}", content.errorMessage));
            }
            if (content.sections) {
                for (const section of content.sections) {
                    lines.push(`--- ${section.name} ---`);
                    lines.push(section.content);
                }
            }
            return lines.join('\n');
        }
        case 'hook': {
            const lines = [localize('formatResolvedContent.hook', "Hook: {0}", content.hookType)];
            if (content.command) {
                lines.push(localize('formatResolvedContent.command', "Command: {0}", content.command));
            }
            if (content.result !== undefined) {
                const resultText = content.result === ChatDebugHookResult.Success
                    ? localize('formatResolvedContent.hookResult.success', "Success")
                    : content.result === ChatDebugHookResult.Error
                        ? localize('formatResolvedContent.hookResult.error', "Error")
                        : localize('formatResolvedContent.hookResult.nonBlockingError', "Non-blocking Error");
                lines.push(localize('formatResolvedContent.result', "Result: {0}", resultText));
            }
            if (content.exitCode !== undefined) {
                lines.push(localize('formatResolvedContent.exitCode', "Exit Code: {0}", content.exitCode));
            }
            if (content.durationInMillis !== undefined) {
                lines.push(localize('formatResolvedContent.duration', "Duration: {0}ms", content.durationInMillis));
            }
            if (content.input) {
                lines.push(localize('formatResolvedContent.input', "Input:") + '\n' + content.input);
            }
            if (content.output) {
                lines.push(localize('formatResolvedContent.output', "Output:") + '\n' + content.output);
            }
            if (content.errorMessage) {
                lines.push(localize('formatResolvedContent.error', "Error: {0}", content.errorMessage));
            }
            return lines.join('\n');
        }
        default: {
            const _ = content;
            return JSON.stringify(_);
        }
    }
}
function truncate(text, maxLength = 30) {
    if (text.length <= maxLength) {
        return text;
    }
    const lastSpace = text.lastIndexOf(' ', maxLength);
    const cutoff = lastSpace > maxLength / 2 ? lastSpace : maxLength;
    return text.substring(0, cutoff) + '\u2026';
}
function getEventLabel(event) {
    switch (event.kind) {
        case 'generic': return event.name;
        case 'toolCall': return event.toolName;
        case 'modelTurn': return event.requestName ?? localize('debugEvent.modelTurn', "Model Turn");
        case 'userMessage': return localize('debugEvent.userMessage', "User Message: {0}", truncate(event.message));
        case 'agentResponse': return localize('debugEvent.agentResponse', "Agent Response: {0}", truncate(event.message));
        case 'subagentInvocation': return event.agentName;
    }
}
let ResolveDebugEventDetailsTool = class ResolveDebugEventDetailsTool {
    constructor(chatDebugService) {
        this.chatDebugService = chatDebugService;
    }
    async prepareToolInvocation(context, _token) {
        const eventId = context.parameters?.eventId;
        let eventLabel;
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
    async invoke(invocation, _countTokens, _progress, _token) {
        const eventId = invocation.parameters['eventId'];
        if (typeof eventId !== 'string' || !eventId) {
            return {
                content: [{ kind: 'text', value: localize('resolveDebugEventDetails.errorEventIdRequired', "Error: eventId parameter is required.") }],
            };
        }
        const sessionResource = invocation.context?.sessionResource;
        if (!sessionResource) {
            return {
                content: [{ kind: 'text', value: localize('resolveDebugEventDetails.errorNoSession', "Error: no chat session context available.") }],
            };
        }
        const sessionEvents = this.chatDebugService.getEvents(sessionResource);
        if (!sessionEvents.some(e => e.id === eventId)) {
            return {
                content: [{ kind: 'text', value: localize('resolveDebugEventDetails.errorEventNotFound', "No event with ID \"{0}\" found in the current session.", eventId) }],
            };
        }
        const resolved = await this.chatDebugService.resolveEvent(eventId);
        if (!resolved) {
            return {
                content: [{ kind: 'text', value: localize('resolveDebugEventDetails.errorNoDetails', "No details found for event ID: {0}", eventId) }],
            };
        }
        return {
            content: [{ kind: 'text', value: formatResolvedContent(resolved) }],
        };
    }
};
ResolveDebugEventDetailsTool = __decorate([
    __param(0, IChatDebugService)
], ResolveDebugEventDetailsTool);
export { ResolveDebugEventDetailsTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9yZXNvbHZlRGVidWdFdmVudERldGFpbHNUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkUsT0FBTyxFQUFFLG1CQUFtQixFQUFtRCxpQkFBaUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3BJLE9BQU8sRUFBdUksY0FBYyxFQUFnQixNQUFNLGlDQUFpQyxDQUFDO0FBRXBOLE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHLDBDQUEwQyxDQUFDO0FBRXpGLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFjO0lBQzFELEVBQUUsRUFBRSw4QkFBOEI7SUFDbEMsaUJBQWlCLEVBQUUsMEJBQTBCO0lBQzdDLFdBQVcsRUFBRSxRQUFRLENBQUMsc0NBQXNDLEVBQUUsNkJBQTZCLENBQUM7SUFDNUYsSUFBSSxFQUFFLGVBQWUsQ0FBQyx3QkFBd0I7SUFDOUMsdUJBQXVCLEVBQUUsS0FBSztJQUM5QixnQkFBZ0IsRUFBRSxtVUFBbVU7SUFDclYsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO0lBQy9CLFdBQVcsRUFBRTtRQUNaLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lBQ1gsT0FBTyxFQUFFO2dCQUNSLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSxtREFBbUQ7YUFDaEU7U0FDRDtRQUNELFFBQVEsRUFBRSxDQUFDLFNBQVMsQ0FBQztLQUNyQjtDQUNELENBQUM7QUFF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