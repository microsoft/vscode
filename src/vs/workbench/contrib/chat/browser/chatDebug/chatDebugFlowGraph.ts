/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IChatDebugEvent } from '../../common/chatDebugService.js';

// ---- Data model ----

export interface FlowNode {
	readonly id: string;
	readonly kind: IChatDebugEvent['kind'];
	/** For `generic` nodes: the event category (e.g. `'discovery'`). Used to narrow filtering. */
	readonly category?: string;
	readonly label: string;
	readonly sublabel?: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly isError?: boolean;
	readonly created: number;
	readonly children: FlowNode[];
	/** Present on merged discovery nodes: the individual nodes that were merged. */
	readonly mergedNodes?: FlowNode[];
}

export interface FlowFilterOptions {
	readonly isKindVisible: (kind: string, category?: string) => boolean;
	readonly textFilter: string;
}

export interface LayoutNode {
	readonly id: string;
	readonly kind: IChatDebugEvent['kind'];
	readonly label: string;
	readonly sublabel?: string;
	readonly tooltip?: string;
	readonly isError?: boolean;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** Number of individual nodes merged into this one (for discovery merging). */
	readonly mergedCount?: number;
	/** Whether the merged node is currently expanded (individual nodes shown to the right). */
	readonly isMergedExpanded?: boolean;
}

export interface LayoutEdge {
	readonly fromX: number;
	readonly fromY: number;
	readonly toX: number;
	readonly toY: number;
}

export interface SubgraphRect {
	readonly label: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly depth: number;
	readonly nodeId: string;
	readonly collapsedChildCount?: number;
}

export interface FlowLayout {
	readonly nodes: LayoutNode[];
	readonly edges: LayoutEdge[];
	readonly subgraphs: SubgraphRect[];
	readonly width: number;
	readonly height: number;
}

export interface FlowChartRenderResult {
	readonly svg: SVGElement;
	/** Map from node/subgraph ID to its focusable SVG element. */
	readonly focusableElements: Map<string, SVGElement>;
}

// ---- Build flow graph from debug events ----

/**
 * Truncates a string to a max length, appending an ellipsis if trimmed.
 */
function truncateLabel(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength - 1) + '\u2026';
}

export function buildFlowGraph(events: readonly IChatDebugEvent[]): FlowNode[] {
	// Before filtering, extract description metadata from subagent events
	// that will be filtered out, so we can enrich the surviving sibling events.
	const subagentToolNames = new Set(['runSubagent', 'search_subagent']);

	// The extension emits two subagentInvocation events per subagent:
	// 1. "started" marker (agentName = descriptive name, status = running) — survives filtering
	// 2. completion event (agentName = "runSubagent", status = completed) — filtered out
	// The completion event carries the real description. When multiple subagents
	// run under the same parent, they share a parentEventId, so we match them
	// by order: the N-th started marker gets the N-th completion's description.
	const completionDescsByParent = new Map<string, string[]>();
	const startedCountByParent = new Map<string, number>();
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

	function getSubagentDescription(event: IChatDebugEvent): string | undefined {
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

	const idToEvent = new Map<string, IChatDebugEvent>();
	const idToChildren = new Map<string, IChatDebugEvent[]>();
	const roots: IChatDebugEvent[] = [];

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
		} else {
			roots.push(event);
		}
	}

	function toFlowNode(event: IChatDebugEvent): FlowNode {
		const children = event.id ? idToChildren.get(event.id) : undefined;

		// Remap generic events with well-known names to their proper kind
		// so they get correct styling and sublabel treatment.
		const effectiveKind = getEffectiveKind(event);

		// For subagent invocations, enrich with description from the
		// filtered-out completion sibling, or fall back to the event's own field.
		let sublabel = getEventSublabel(event, effectiveKind);
		let tooltip = getEventTooltip(event);
		let description: string | undefined;
		if (effectiveKind === 'subagentInvocation') {
			description = getSubagentDescription(event);
			if (description) {
				sublabel = truncateLabel(description, 30) + (sublabel ? ` \u00b7 ${sublabel}` : '');
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
			label: getEventLabel(event, effectiveKind),
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
export function filterFlowNodes(nodes: FlowNode[], options: FlowFilterOptions): FlowNode[] {
	let result = filterByKind(nodes, options.isKindVisible);
	if (options.textFilter) {
		result = filterByText(result, options.textFilter);
	}
	return result;
}

function filterByKind(nodes: FlowNode[], isKindVisible: (kind: string, category?: string) => boolean): FlowNode[] {
	const result: FlowNode[] = [];
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
		} else {
			result.push(node);
		}
	}
	return changed ? result : nodes;
}


function nodeMatchesText(node: FlowNode, text: string): boolean {
	return node.label.toLowerCase().includes(text) ||
		(node.sublabel?.toLowerCase().includes(text) ?? false) ||
		(node.tooltip?.toLowerCase().includes(text) ?? false);
}

function filterByText(nodes: FlowNode[], text: string): FlowNode[] {
	const result: FlowNode[] = [];
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

// ---- Node slicing (pagination) ----

export interface FlowSliceResult {
	readonly nodes: FlowNode[];
	readonly totalCount: number;
	readonly shownCount: number;
}

/**
 * Counts the total number of nodes in a tree (each node + all descendants).
 */
function countNodes(nodes: readonly FlowNode[]): number {
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
export function sliceFlowNodes(nodes: readonly FlowNode[], maxCount: number): FlowSliceResult {
	const totalCount = countNodes(nodes);
	if (totalCount <= maxCount) {
		return { nodes: nodes as FlowNode[], totalCount, shownCount: totalCount };
	}

	let remaining = maxCount;

	function sliceTree(nodeList: readonly FlowNode[]): FlowNode[] {
		const result: FlowNode[] = [];
		for (const node of nodeList) {
			if (remaining <= 0) {
				break;
			}
			remaining--; // count this node
			if (node.children.length === 0 || remaining <= 0) {
				result.push(node.children.length === 0 ? node : { ...node, children: [] });
			} else {
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

function isDiscoveryNode(node: FlowNode): boolean {
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
export function mergeDiscoveryNodes(
	nodes: readonly FlowNode[],
): FlowNode[] {
	const result: FlowNode[] = [];

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
		const run: FlowNode[] = [node];
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

function isToolCallNode(node: FlowNode): boolean {
	return node.kind === 'toolCall';
}

/**
 * Returns the tool name from a tool-call node's label.
 * Tool call labels are set to `event.toolName` (possibly with a leading
 * emoji prefix stripped), so the label itself is the canonical tool name.
 */
function getToolName(node: FlowNode): string {
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
export function mergeToolCallNodes(
	nodes: readonly FlowNode[],
): FlowNode[] {
	const result: FlowNode[] = [];

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
		const run: FlowNode[] = [node];
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
function getEffectiveKind(event: IChatDebugEvent): IChatDebugEvent['kind'] {
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

function getEventLabel(event: IChatDebugEvent, effectiveKind?: IChatDebugEvent['kind']): string {
	const kind = effectiveKind ?? event.kind;
	switch (kind) {
		case 'userMessage':
			return localize('userLabel', "User");
		case 'modelTurn':
			return event.kind === 'modelTurn' ? (event.model ?? localize('modelTurnLabel', "Model Turn")) : localize('modelTurnLabel', "Model Turn");
		case 'toolCall':
			return event.kind === 'toolCall' ? event.toolName : event.kind === 'generic' ? event.name : '';
		case 'subagentInvocation':
			return event.kind === 'subagentInvocation' ? event.agentName : '';
		case 'agentResponse': {
			if (event.kind === 'agentResponse') {
				return event.message || localize('responseLabel', "Response");
			}
			// Remapped generic event — extract model name from parenthesized suffix
			// e.g. "Agent response (claude-opus-4.5)" → "claude-opus-4.5"
			if (event.kind === 'generic') {
				const match = /\(([^)]+)\)\s*$/.exec(event.name);
				if (match) {
					return match[1];
				}
			}
			return localize('responseLabel', "Response");
		}
		case 'generic':
			return event.kind === 'generic' ? event.name : '';
	}
}

function getEventSublabel(event: IChatDebugEvent, effectiveKind?: IChatDebugEvent['kind']): string | undefined {
	const kind = effectiveKind ?? event.kind;
	switch (kind) {
		case 'modelTurn': {
			const parts: string[] = [];
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
			const parts: string[] = [];
			if (event.kind === 'toolCall' && event.result) {
				parts.push(event.result);
			}
			if (event.kind === 'toolCall' && event.durationInMillis) {
				parts.push(formatDuration(event.durationInMillis));
			}
			return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
		}
		case 'subagentInvocation': {
			const parts: string[] = [];
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
			// For proper typed events, prefer the first section's content
			// (which has the actual message text) over the `message` field
			// (which is a short summary/name). Fall back to `message` when
			// no sections are available. For remapped generic events, use
			// the details property.
			let text: string | undefined;
			if (event.kind === 'userMessage' || event.kind === 'agentResponse') {
				text = event.sections[0]?.content || event.message;
			} else if (event.kind === 'generic') {
				text = event.details;
			}
			if (!text) {
				return undefined;
			}
			// Find the first non-empty line (content may start with newlines)
			const lines = text.split('\n');
			let firstLine = '';
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed) {
					firstLine = trimmed;
					break;
				}
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

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

function isErrorEvent(event: IChatDebugEvent): boolean {
	return (event.kind === 'toolCall' && event.result === 'error') ||
		(event.kind === 'generic' && event.level === 3 /* ChatDebugLogLevel.Error */) ||
		(event.kind === 'subagentInvocation' && event.status === 'failed');
}

const TOOLTIP_MAX_LENGTH = 500;

function getEventTooltip(event: IChatDebugEvent): string | undefined {
	switch (event.kind) {
		case 'userMessage': {
			const msg = event.message.trim();
			if (msg.length > TOOLTIP_MAX_LENGTH) {
				return msg.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026';
			}
			return msg || undefined;
		}
		case 'toolCall': {
			const parts: string[] = [event.toolName];
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
			const parts: string[] = [event.agentName];
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
			const parts: string[] = [];
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
