/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Descriptions of each debug event kind for the model. Adding a new event kind
 * to {@link IChatDebugEvent} without adding an entry here will cause a compile error.
 */
export const debugEventKindDescriptions = {
    generic: '- generic (category: "discovery"): File discovery for instructions, skills, agents, hooks. Resolving returns a fileList with full file paths, load status, skip reasons, and source folders. Always resolve these for questions about customization files.\n'
        + '- generic (other): Miscellaneous logs. Resolving returns additional text details.',
    toolCall: '- toolCall: A tool invocation. Resolving returns tool name, input, output, status, and duration.',
    modelTurn: '- modelTurn: An LLM round-trip. Resolving returns model name, token usage, timing, errors, and prompt sections.',
    subagentInvocation: '- subagentInvocation: A sub-agent spawn. Resolving returns agent name, status, duration, and counts.',
    userMessage: '- userMessage: The full prompt sent to the model. Resolving returns the complete message and all prompt sections (system prompt, instructions, context). Essential for understanding what the model received.',
    agentResponse: '- agentResponse: The model\'s response. Resolving returns the full response text and sections.',
};
/**
 * Formats debug events into a compact log-style summary for context attachment.
 */
export function formatDebugEventsForContext(events) {
    const lines = [];
    for (const event of events) {
        const ts = event.created.toISOString();
        const id = event.id ? ` [id=${event.id}]` : '';
        switch (event.kind) {
            case 'generic':
                lines.push(`[${ts}]${id} ${event.level >= 3 ? 'ERROR' : event.level >= 2 ? 'WARN' : 'INFO'}: ${event.name}${event.details ? ' - ' + event.details : ''}${event.category ? ' (category: ' + event.category + ')' : ''}`);
                break;
            case 'toolCall':
                lines.push(`[${ts}]${id} TOOL_CALL: ${event.toolName}${event.result ? ' result=' + event.result : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
                break;
            case 'modelTurn':
                lines.push(`[${ts}]${id} MODEL_TURN: ${event.requestName ?? 'unknown'}${event.model ? ' model=' + event.model : ''}${event.inputTokens !== undefined ? ' tokens(in=' + event.inputTokens + ',out=' + (event.outputTokens ?? '?') + ')' : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
                break;
            case 'subagentInvocation':
                lines.push(`[${ts}]${id} SUBAGENT: ${event.agentName}${event.status ? ' status=' + event.status : ''}${event.durationInMillis !== undefined ? ' duration=' + event.durationInMillis + 'ms' : ''}`);
                break;
            case 'userMessage':
                lines.push(`[${ts}]${id} USER_MESSAGE: ${event.message.substring(0, 200)}${event.message.length > 200 ? '...' : ''} (${event.sections.length} sections)`);
                break;
            case 'agentResponse':
                lines.push(`[${ts}]${id} AGENT_RESPONSE: ${event.message.substring(0, 200)}${event.message.length > 200 ? '...' : ''} (${event.sections.length} sections)`);
                break;
            default: {
                const _ = event;
                void _;
                break;
            }
        }
    }
    return lines.join('\n');
}
/**
 * Constructs the model description for the debug events attachment,
 * explaining to the model how to use the resolveDebugEventDetails tool.
 */
export function getDebugEventsModelDescription() {
    return 'These are the debug event logs from the current chat conversation. Analyze them to help answer the user\'s troubleshooting question.\n'
        + '\n'
        + 'CRITICAL INSTRUCTION: You MUST call the resolveDebugEventDetails tool on relevant events BEFORE answering. The log lines below are only summaries — they do NOT contain the actual data (file paths, prompt content, tool I/O, etc.). The real information is only available by resolving events. Never answer based solely on the summary lines. Always resolve first, then answer.\n'
        + '\n'
        + 'Call resolveDebugEventDetails in parallel on all events that could be relevant to the user\'s question. When in doubt, resolve more events rather than fewer.\n'
        + '\n'
        + 'IMPORTANT: Do NOT mention event IDs, tool resolution steps, or internal debug mechanics in your response. The user does not know about debug events or event IDs. Present your findings directly and naturally, as if you simply know the answer. Never say things like "I need to resolve events" or show event IDs.\n'
        + '\n'
        + 'Event types and what resolving them returns:\n'
        + Object.values(debugEventKindDescriptions).join('\n');
}
/**
 * Checks whether a debug event matches a single text search term.
 * Used by both the debug panel filter and the listDebugEvents tool.
 */
export function debugEventMatchesText(event, term) {
    if (event.kind.toLowerCase().includes(term)) {
        return true;
    }
    switch (event.kind) {
        case 'toolCall':
            return event.toolName.toLowerCase().includes(term)
                || (event.input?.toLowerCase().includes(term) ?? false)
                || (event.output?.toLowerCase().includes(term) ?? false);
        case 'modelTurn':
            return (event.model?.toLowerCase().includes(term) ?? false)
                || (event.requestName?.toLowerCase().includes(term) ?? false);
        case 'generic':
            return event.name.toLowerCase().includes(term)
                || (event.details?.toLowerCase().includes(term) ?? false)
                || (event.category?.toLowerCase().includes(term) ?? false);
        case 'subagentInvocation':
            return event.agentName.toLowerCase().includes(term)
                || (event.description?.toLowerCase().includes(term) ?? false);
        case 'userMessage':
        case 'agentResponse':
            return event.message.toLowerCase().includes(term)
                || event.sections.some(s => s.name.toLowerCase().includes(term) || s.content.toLowerCase().includes(term));
    }
}
/**
 * Regex used to match `before:` and `after:` timestamp tokens inside filter text.
 */
const timestampTokenPattern = /\b(?:before|after):\d{4}(?:-\d{2}(?:-\d{2}(?:t\d{1,2}(?::\d{2}(?::\d{2})?)?)?)?)?(\b|$)/g;
/**
 * Parse a `before:YYYY[-MM[-DD[THH[:MM[:SS]]]]]` or `after:…` token from
 * free-form filter text. Each component after the year is optional.
 *
 * For `before:`, the timestamp is rounded **up** to the end of the most
 * specific unit given (e.g. `before:2026-03` → end-of-March).
 * For `after:`, the timestamp is the **start** of the most specific unit.
 */
export function parseTimeToken(text, prefix) {
    const regex = new RegExp(`${prefix}:(\\d{4})(?:-(\\d{2})(?:-(\\d{2})(?:t(\\d{1,2})(?::(\\d{2})(?::(\\d{2}))?)?)?)?)?(?!\\w)`);
    const m = regex.exec(text);
    if (!m) {
        return undefined;
    }
    const year = parseInt(m[1], 10);
    const month = m[2] !== undefined ? parseInt(m[2], 10) - 1 : undefined;
    const day = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
    const hour = m[4] !== undefined ? parseInt(m[4], 10) : undefined;
    const minute = m[5] !== undefined ? parseInt(m[5], 10) : undefined;
    const second = m[6] !== undefined ? parseInt(m[6], 10) : undefined;
    if (prefix === 'before') {
        if (second !== undefined) {
            return new Date(year, month, day, hour, minute, second, 999).getTime();
        }
        else if (minute !== undefined) {
            return new Date(year, month, day, hour, minute, 59, 999).getTime();
        }
        else if (hour !== undefined) {
            return new Date(year, month, day, hour, 59, 59, 999).getTime();
        }
        else if (day !== undefined) {
            return new Date(year, month, day, 23, 59, 59, 999).getTime();
        }
        else if (month !== undefined) {
            return new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
        }
        else {
            return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
        }
    }
    else {
        return new Date(year, month ?? 0, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0, 0).getTime();
    }
}
/**
 * Strips `before:…` and `after:…` timestamp tokens from filter text,
 * returning only the plain text search portion.
 */
export function stripTimestampTokens(text) {
    return text.replace(timestampTokenPattern, '').trim();
}
/**
 * Filters debug events by comma-separated text terms and optional
 * `before:`/`after:` timestamp tokens.
 *
 * Terms prefixed with `!` are exclusions; all others are inclusions.
 * At least one inclusion term must match (if any are present).
 * Timestamp tokens are parsed and applied as date-range bounds, then
 * stripped before text matching.
 */
export function filterDebugEventsByText(events, filterText) {
    const beforeTimestamp = parseTimeToken(filterText, 'before');
    const afterTimestamp = parseTimeToken(filterText, 'after');
    // Strip timestamp tokens before splitting into text search terms
    const textOnly = stripTimestampTokens(filterText);
    const terms = textOnly.split(/\s*,\s*/).filter(t => t.length > 0);
    const includeTerms = terms.filter(t => !t.startsWith('!')).map(t => t.trim());
    const excludeTerms = terms.filter(t => t.startsWith('!')).map(t => t.slice(1).trim()).filter(t => t.length > 0);
    return events.filter(e => {
        // Timestamp bounds
        const time = e.created.getTime();
        if (beforeTimestamp !== undefined && time > beforeTimestamp) {
            return false;
        }
        if (afterTimestamp !== undefined && time < afterTimestamp) {
            return false;
        }
        // Text matching
        if (excludeTerms.some(term => debugEventMatchesText(e, term))) {
            return false;
        }
        if (includeTerms.length > 0) {
            return includeTerms.some(term => debugEventMatchesText(e, term));
        }
        return true;
    });
}
/**
 * Description of the text filter syntax for tool schemas and documentation.
 */
export const debugEventFilterDescription = 'Comma-separated text search terms. Prefix a term with ! to exclude it. Matches against event kind, tool names, model names, agent names, categories, event names, and message content. Also supports before:YYYY[-MM[-DD[THH[:MM[:SS]]]]] and after:YYYY[-MM[-DD[THH[:MM[:SS]]]]] to filter by timestamp.';
/**
 * Applies kind, text, and limit filters to debug events.
 * Used by the listDebugEvents tool to consolidate all filtering in one place.
 */
export function filterDebugEvents(events, options) {
    let result = events;
    if (options.kind) {
        result = result.filter(e => e.kind === options.kind);
    }
    if (options.filter) {
        result = filterDebugEventsByText(result, options.filter);
    }
    if (options.limit !== undefined && options.limit > 0 && result.length > options.limit) {
        result = result.slice(result.length - options.limit);
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRXZlbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdERlYnVnRXZlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUE0QztJQUNsRixPQUFPLEVBQUUsOFBBQThQO1VBQ3BRLG1GQUFtRjtJQUN0RixRQUFRLEVBQUUsa0dBQWtHO0lBQzVHLFNBQVMsRUFBRSxpSEFBaUg7SUFDNUgsa0JBQWtCLEVBQUUsc0dBQXNHO0lBQzFILFdBQVcsRUFBRSwrTUFBK007SUFDNU4sYUFBYSxFQUFFLGdHQUFnRztDQUMvRyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsTUFBa0M7SUFDN0UsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBQzNCLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7UUFDNUIsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUN2QyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQy9DLFFBQVEsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3BCLEtBQUssU0FBUztnQkFDYixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMs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