/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
// ---- Build flow graph from debug events ----
/**
 * Truncates a string to a max length, appending an ellipsis if trimmed.
 */
function truncateLabel(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 1) + '\u2026';
}
export function buildFlowGraph(events) {
    // Before filtering, extract description metadata from subagent events
    // that will be filtered out, so we can enrich the surviving sibling events.
    const subagentToolNames = new Set(['runSubagent', 'search_subagent']);
    // The extension emits two subagentInvocation events per subagent:
    // 1. "started" marker (agentName = descriptive name, status = running) — survives filtering
    // 2. completion event (agentName = "runSubagent", status = completed) — filtered out
    // The completion event carries the real description. When multiple subagents
    // run under the same parent, they share a parentEventId, so we match them
    // by order: the N-th started marker gets the N-th completion's description.
    const completionDescsByParent = new Map();
    const startedCountByParent = new Map();
    for (const e of events) {
        if (e.kind === 'subagentInvocation' && subagentToolNames.has(e.agentName) && e.description && e.parentEventId) {
            let descs = completionDescsByParent.get(e.parentEventId);
            if (!descs) {
                descs = [];
                completionDescsByParent.set(e.parentEventId, descs);
            }
            descs.push(e.description);
        }
    }
    function getSubagentDescription(event) {
        if (event.kind !== 'subagentInvocation' || !event.parentEventId) {
            return undefined;
        }
        const descs = completionDescsByParent.get(event.parentEventId);
        if (!descs || descs.length === 0) {
            return event.description && event.description !== event.agentName ? event.description : undefined;
        }
        const idx = startedCountByParent.get(event.parentEventId) ?? 0;
        startedCountByParent.set(event.parentEventId, idx + 1);
        return descs[idx] ?? descs[0];
    }
    // Filter out redundant events:
    // - toolCall with subagent tool names: the subagentInvocation event has richer metadata
    // - subagentInvocation with agentName matching a tool name: these are completion
    //   duplicates of the "SubAgent started" marker which has the proper descriptive name
    const filtered = events.filter(e => {
        if (e.kind === 'toolCall' && subagentToolNames.has(e.toolName.replace(/^\u{1F6E0}\uFE0F?\s*/u, ''))) {
            return false;
        }
        if (e.kind === 'subagentInvocation' && subagentToolNames.has(e.agentName)) {
            return false;
        }
        return true;
    });
    const idToEvent = new Map();
    const idToChildren = new Map();
    const roots = [];
    for (const event of filtered) {
        if (event.id) {
            idToEvent.set(event.id, event);
        }
    }
    for (const event of filtered) {
        if (event.parentEventId && idToEvent.has(event.parentEventId)) {
            let children = idToChildren.get(event.parentEventId);
            if (!children) {
                children = [];
                idToChildren.set(event.parentEventId, children);
            }
            children.push(event);
        }
        else {
            roots.push(event);
        }
    }
    function toFlowNode(event) {
        const children = event.id ? idToChildren.get(event.id) : undefined;
        // Remap generic events with well-known names to their proper kind
        // so they get correct styling and sublabel treatment.
        const effectiveKind = getEffectiveKind(event);
        // For subagent invocations, enrich with description from the
        // filtered-out completion sibling, or fall back to the event's own field.
        let label = getEventLabel(event, effectiveKind);
        const sublabel = getEventSublabel(event, effectiveKind);
        let tooltip = getEventTooltip(event);
        let description;
        if (effectiveKind === 'subagentInvocation') {
            description = getSubagentDescription(event);
            // Show "Subagent: <description>" as the label so users can identify
            // these nodes and see what task they perform.
            label = description
                ? localize('subagentWithDesc', "Subagent: {0}", truncateLabel(description, 30))
                : localize('subagentLabel', "Subagent");
            if (description) {
                // Ensure description appears in tooltip if not already present
                if (tooltip && !tooltip.includes(description)) {
                    const lines = tooltip.split('\n');
                    lines.splice(1, 0, description);
                    tooltip = lines.join('\n');
                }
            }
        }
        return {
            id: event.id ?? `event-${events.indexOf(event)}`,
            kind: effectiveKind,
            category: event.kind === 'generic' ? event.category : undefined,
            label,
            sublabel,
            description,
            tooltip,
            isError: isErrorEvent(event),
            created: event.created.getTime(),
            children: children?.map(toFlowNode) ?? [],
        };
    }
    return roots.map(toFlowNode);
}
// ---- Flow node filtering ----
/**
 * Filters a flow node tree by kind visibility and text search.
 * Returns a new tree — the input is not mutated.
 *
 * Kind filtering: nodes whose kind is not visible are removed.
 * For `subagentInvocation` nodes, the entire subgraph is removed.
 * For other kinds, the node is removed and its children are re-parented.
 *
 * Text filtering: only nodes whose label, sublabel, or tooltip match the
 * search term are kept, along with all their ancestors (path to root).
 * If a subagent label matches, its entire subgraph is kept.
 */
export function filterFlowNodes(nodes, options) {
    let result = filterByKind(nodes, options.isKindVisible);
    if (options.textFilter) {
        result = filterByText(result, options.textFilter);
    }
    return result;
}
function filterByKind(nodes, isKindVisible) {
    const result = [];
    let changed = false;
    for (const node of nodes) {
        if (!isKindVisible(node.kind, node.category)) {
            changed = true;
            // For subagents, drop the entire subgraph
            if (node.kind === 'subagentInvocation') {
                continue;
            }
            // For other kinds, re-parent children up
            result.push(...filterByKind(node.children, isKindVisible));
            continue;
        }
        const filteredChildren = filterByKind(node.children, isKindVisible);
        if (filteredChildren !== node.children) {
            changed = true;
            result.push({ ...node, children: filteredChildren });
        }
        else {
            result.push(node);
        }
    }
    return changed ? result : nodes;
}
function nodeMatchesText(node, text) {
    return node.label.toLowerCase().includes(text) ||
        (node.sublabel?.toLowerCase().includes(text) ?? false) ||
        (node.tooltip?.toLowerCase().includes(text) ?? false);
}
function filterByText(nodes, text) {
    const result = [];
    for (const node of nodes) {
        if (nodeMatchesText(node, text)) {
            // Node matches — keep it with all descendants
            result.push(node);
            continue;
        }
        // Check if any descendant matches
        const filteredChildren = filterByText(node.children, text);
        if (filteredChildren.length > 0) {
            // Keep this node as an ancestor of matching descendants
            result.push({ ...node, children: filteredChildren });
        }
    }
    return result;
}
/**
 * Counts the total number of nodes in a tree (each node + all descendants).
 */
function countNodes(nodes) {
    let count = 0;
    for (const node of nodes) {
        count += 1 + countNodes(node.children);
    }
    return count;
}
/**
 * Slices a flow node tree to at most `maxCount` nodes (pre-order DFS).
 *
 * When a subagent's children would exceed the remaining budget, the
 * children list is truncated. Returns the sliced tree along with total
 * and shown node counts for the "Show More" UI.
 */
export function sliceFlowNodes(nodes, maxCount) {
    const totalCount = countNodes(nodes);
    if (totalCount <= maxCount) {
        return { nodes: nodes, totalCount, shownCount: totalCount };
    }
    let remaining = maxCount;
    function sliceTree(nodeList) {
        const result = [];
        for (const node of nodeList) {
            if (remaining <= 0) {
                break;
            }
            remaining--; // count this node
            if (node.children.length === 0 || remaining <= 0) {
                result.push(node.children.length === 0 ? node : { ...node, children: [] });
            }
            else {
                const slicedChildren = sliceTree(node.children);
                result.push(slicedChildren !== node.children ? { ...node, children: slicedChildren } : node);
            }
        }
        return result;
    }
    const sliced = sliceTree(nodes);
    const shownCount = maxCount - remaining;
    return { nodes: sliced, totalCount, shownCount };
}
// ---- Discovery node merging ----
function isDiscoveryNode(node) {
    return node.kind === 'generic' && node.category === 'discovery';
}
/**
 * Merges consecutive prompt-discovery nodes (generic events with
 * `category === 'discovery'`) into a single summary node.
 *
 * The merged node always stays in the graph and carries the individual
 * nodes in `mergedNodes`.  Expansion (showing the individual nodes to the
 * right) is handled at the layout level.
 *
 * Operates recursively on children.
 */
export function mergeDiscoveryNodes(nodes) {
    const result = [];
    let i = 0;
    while (i < nodes.length) {
        const node = nodes[i];
        // Non-discovery node: recurse into children and pass through.
        if (!isDiscoveryNode(node)) {
            const mergedChildren = mergeDiscoveryNodes(node.children);
            result.push(mergedChildren !== node.children ? { ...node, children: mergedChildren } : node);
            i++;
            continue;
        }
        // Accumulate a run of consecutive discovery nodes.
        const run = [node];
        let j = i + 1;
        while (j < nodes.length && isDiscoveryNode(nodes[j])) {
            run.push(nodes[j]);
            j++;
        }
        if (run.length < 2) {
            // Single discovery node — nothing to merge.
            result.push(node);
            i = j;
            continue;
        }
        // Build a stable id from the first node so the expand state persists.
        const mergedId = `merged-discovery:${run[0].id}`;
        // Build a merged summary node.
        const labels = run.map(n => n.label);
        const uniqueLabels = [...new Set(labels)];
        const summaryLabel = uniqueLabels.length <= 2
            ? uniqueLabels.join(', ')
            : localize('discoveryMergedLabel', "{0} +{1} more", uniqueLabels[0], run.length - 1);
        result.push({
            id: mergedId,
            kind: 'generic',
            category: 'discovery',
            label: summaryLabel,
            sublabel: localize('discoveryStepsCount', "{0} discovery steps", run.length),
            tooltip: run.map(n => n.label + (n.sublabel ? `: ${n.sublabel}` : '')).join('\n'),
            created: run[0].created,
            children: [],
            mergedNodes: run,
        });
        i = j;
    }
    return result;
}
// ---- Tool call node merging ----
function isToolCallNode(node) {
    return node.kind === 'toolCall';
}
/**
 * Returns the tool name from a tool-call node's label.
 * Tool call labels are set to `event.toolName` (possibly with a leading
 * emoji prefix stripped), so the label itself is the canonical tool name.
 */
function getToolName(node) {
    return node.label;
}
/**
 * Merges consecutive tool-call nodes that invoke the same tool into a
 * single summary node.
 *
 * This mirrors `mergeDiscoveryNodes`: the merged node carries the
 * individual nodes in `mergedNodes` and expansion is handled at the
 * layout level.
 *
 * Operates recursively on children.
 */
export function mergeToolCallNodes(nodes) {
    const result = [];
    let i = 0;
    while (i < nodes.length) {
        const node = nodes[i];
        // Non-tool-call node: recurse into children and pass through.
        if (!isToolCallNode(node)) {
            const mergedChildren = mergeToolCallNodes(node.children);
            result.push(mergedChildren !== node.children ? { ...node, children: mergedChildren } : node);
            i++;
            continue;
        }
        // Accumulate a run of consecutive tool-call nodes with the same tool name.
        const toolName = getToolName(node);
        const run = [node];
        let j = i + 1;
        while (j < nodes.length && isToolCallNode(nodes[j]) && getToolName(nodes[j]) === toolName) {
            run.push(nodes[j]);
            j++;
        }
        if (run.length < 2) {
            // Single tool call — recurse into children, nothing to merge.
            const mergedChildren = mergeToolCallNodes(node.children);
            result.push(mergedChildren !== node.children ? { ...node, children: mergedChildren } : node);
            i = j;
            continue;
        }
        // Build a stable id from the first node so the expand state persists.
        const mergedId = `merged-toolCall:${run[0].id}`;
        result.push({
            id: mergedId,
            kind: 'toolCall',
            label: toolName,
            sublabel: localize('toolCallsCount', "{0} calls", run.length),
            tooltip: run.map(n => n.label + (n.sublabel ? `: ${n.sublabel}` : '')).join('\n'),
            created: run[0].created,
            children: [],
            mergedNodes: run,
        });
        i = j;
    }
    return result;
}
// ---- Event helpers ----
/**
 * Remaps generic events with well-known names (e.g. "User message",
 * "Agent response") to their proper typed kind so they receive
 * correct colors, labels, and sublabel treatment in the flow chart.
 */
function getEffectiveKind(event) {
    if (event.kind === 'generic') {
        const name = event.name.toLowerCase().replace(/[\s_-]+/g, '');
        if (name === 'usermessage' || name === 'userprompt' || name === 'user' || name.startsWith('usermessage')) {
            return 'userMessage';
        }
        if (name === 'response' || name.startsWith('agentresponse') || name.startsWith('assistantresponse') || name.startsWith('modelresponse')) {
            return 'agentResponse';
        }
        const cat = event.category?.toLowerCase();
        if (cat === 'user' || cat === 'usermessage') {
            return 'userMessage';
        }
        if (cat === 'response' || cat === 'agentresponse') {
            return 'agentResponse';
        }
    }
    return event.kind;
}
function getEventLabel(event, effectiveKind) {
    const kind = effectiveKind ?? event.kind;
    switch (kind) {
        case 'userMessage':
            return localize('userLabel', "User Message");
        case 'modelTurn':
            return event.kind === 'modelTurn' ? (event.model ?? localize('modelTurnLabel', "Model Turn")) : localize('modelTurnLabel', "Model Turn");
        case 'toolCall':
            return event.kind === 'toolCall' ? event.toolName : event.kind === 'generic' ? event.name : localize('toolCallLabel', "Tool Call");
        case 'subagentInvocation':
            return event.kind === 'subagentInvocation' ? event.agentName : localize('subagentFallback', "Subagent");
        case 'agentResponse':
            return localize('agentResponseLabel', "Agent Response");
        case 'generic':
            return event.kind === 'generic' ? event.name : localize('genericLabel', "Event");
    }
}
function getEventSublabel(event, effectiveKind) {
    const kind = effectiveKind ?? event.kind;
    switch (kind) {
        case 'modelTurn': {
            const parts = [];
            if (event.kind === 'modelTurn' && event.requestName) {
                parts.push(event.requestName);
            }
            if (event.kind === 'modelTurn' && event.totalTokens) {
                parts.push(localize('tokenCount', "{0} tokens", event.totalTokens));
            }
            if (event.kind === 'modelTurn' && event.durationInMillis) {
                parts.push(formatDuration(event.durationInMillis));
            }
            return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
        }
        case 'toolCall': {
            const parts = [];
            if (event.kind === 'toolCall' && event.result) {
                parts.push(event.result);
            }
            if (event.kind === 'toolCall' && event.durationInMillis) {
                parts.push(formatDuration(event.durationInMillis));
            }
            return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
        }
        case 'subagentInvocation': {
            const parts = [];
            if (event.kind === 'subagentInvocation' && event.status) {
                parts.push(event.status);
            }
            if (event.kind === 'subagentInvocation' && event.durationInMillis) {
                parts.push(formatDuration(event.durationInMillis));
            }
            return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
        }
        case 'userMessage':
        case 'agentResponse': {
            // Use the message summary as the sublabel. For remapped generic
            // events, use the details property.
            let text;
            if (event.kind === 'userMessage' || event.kind === 'agentResponse') {
                text = event.message;
            }
            else if (event.kind === 'generic') {
                text = event.details;
            }
            if (!text) {
                return undefined;
            }
            // Find the first meaningful line, skipping trivial lines like
            // lone brackets/braces that appear when the message is JSON.
            const lines = text.split('\n');
            let firstLine = '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && trimmed.length > 2) {
                    firstLine = trimmed;
                    break;
                }
            }
            if (!firstLine) {
                // Fall back to the full text collapsed to a single line
                firstLine = text.replace(/\s+/g, ' ').trim();
            }
            if (!firstLine) {
                return undefined;
            }
            return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
        }
        default:
            return undefined;
    }
}
function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}
function isErrorEvent(event) {
    return (event.kind === 'toolCall' && event.result === 'error') ||
        (event.kind === 'generic' && event.level === 3 /* ChatDebugLogLevel.Error */) ||
        (event.kind === 'subagentInvocation' && event.status === 'failed');
}
const TOOLTIP_MAX_LENGTH = 500;
function getEventTooltip(event) {
    switch (event.kind) {
        case 'userMessage': {
            const msg = event.message.trim();
            if (msg.length > TOOLTIP_MAX_LENGTH) {
                return msg.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026';
            }
            return msg || undefined;
        }
        case 'toolCall': {
            const parts = [event.toolName];
            if (event.input) {
                const input = event.input.trim();
                parts.push(localize('tooltipInput', "Input: {0}", input.length > TOOLTIP_MAX_LENGTH ? input.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026' : input));
            }
            if (event.output) {
                const output = event.output.trim();
                parts.push(localize('tooltipOutput', "Output: {0}", output.length > TOOLTIP_MAX_LENGTH ? output.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026' : output));
            }
            if (event.result) {
                parts.push(localize('tooltipResult', "Result: {0}", event.result));
            }
            return parts.join('\n');
        }
        case 'subagentInvocation': {
            const parts = [event.agentName];
            if (event.description) {
                parts.push(event.description);
            }
            if (event.status) {
                parts.push(localize('tooltipStatus', "Status: {0}", event.status));
            }
            if (event.toolCallCount !== undefined) {
                parts.push(localize('tooltipToolCalls', "Tool calls: {0}", event.toolCallCount));
            }
            if (event.modelTurnCount !== undefined) {
                parts.push(localize('tooltipModelTurns', "Model turns: {0}", event.modelTurnCount));
            }
            return parts.join('\n');
        }
        case 'generic': {
            if (event.details) {
                const details = event.details.trim();
                return details.length > TOOLTIP_MAX_LENGTH ? details.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026' : details;
            }
            return undefined;
        }
        case 'modelTurn': {
            const parts = [];
            if (event.model) {
                parts.push(event.model);
            }
            if (event.totalTokens) {
                parts.push(localize('tooltipTokens', "Tokens: {0}", event.totalTokens));
            }
            if (event.inputTokens) {
                parts.push(localize('tooltipInputTokens', "Input tokens: {0}", event.inputTokens));
            }
            if (event.outputTokens) {
                parts.push(localize('tooltipOutputTokens', "Output tokens: {0}", event.outputTokens));
            }
            if (event.durationInMillis) {
                parts.push(localize('tooltipDuration', "Duration: {0}", formatDuration(event.durationInMillis)));
            }
            return parts.length > 0 ? parts.join('\n') : undefined;
        }
        default:
            return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRmxvd0dyYXBoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdGbG93R3JhcGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBaUZqRCwrQ0FBK0M7QUFFL0M7O0dBRUc7QUFDSCxTQUFTLGFBQWEsQ0FBQyxJQUFZLEVBQUUsU0FBaUI7SUFDckQsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQzlCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxHQUFHLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQztBQUNwRCxDQUFDO0FBRUQsTUFBTSxVQUFVLGNBQWMsQ0FBQyxNQUFrQztJQUNoRSxzRUFBc0U7SUFDdEUsNEVBQTRFO0lBQzVFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBRXRFLGtFQUFrRTtJQUNsRSw0RkFBNEY7SUFDNUYscUZBQXFGO0lBQ3JGLDZFQUE2RTtJQUM3RSwwRUFBMEU7SUFDMUUsNEVBQTRFO0lBQzVFLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLEVBQW9CLENBQUM7SUFDNUQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUN2RCxLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxvQkFBb0IsSUFBSSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNB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