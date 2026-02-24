/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatDebugEvent } from '../../common/chatDebugService.js';

// ---- Data model ----

export interface FlowNode {
	readonly id: string;
	readonly kind: IChatDebugEvent['kind'];
	readonly label: string;
	readonly sublabel?: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly isError?: boolean;
	readonly created: number;
	readonly children: FlowNode[];
}

export interface FlowFilterOptions {
	readonly isKindVisible: (kind: string) => boolean;
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

		// For subagent invocations, enrich with description from the
		// filtered-out completion sibling, or fall back to the event's own field.
		let sublabel = getEventSublabel(event);
		let tooltip = getEventTooltip(event);
		let description: string | undefined;
		if (event.kind === 'subagentInvocation') {
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
			kind: event.kind,
			label: getEventLabel(event),
			sublabel,
			description,
			tooltip,
			isError: isErrorEvent(event),
			created: event.created.getTime(),
			children: children?.map(toFlowNode) ?? [],
		};
	}

	return mergeModelTurns(roots.map(toFlowNode));
}

/**
 * Absorbs model turn nodes into the subsequent sibling node.
 *
 * Each model turn represents an LLM call that decides what to do next
 * (call tools, respond, etc.). Rather than showing model turns as separate
 * boxes, we merge their metadata (token count, LLM latency) into the next
 * node's sublabel and tooltip so the diagram stays compact while
 * preserving the correlation.
 */
function mergeModelTurns(nodes: FlowNode[]): FlowNode[] {
	const result: FlowNode[] = [];
	let pendingModelTurn: FlowNode | undefined;

	for (const node of nodes) {
		if (node.kind === 'modelTurn') {
			pendingModelTurn = node;
			continue;
		}

		const merged = applyModelTurnInfo(node, pendingModelTurn);
		pendingModelTurn = undefined;
		result.push(merged);
	}

	// If the last node was a model turn with no successor, keep it
	if (pendingModelTurn) {
		result.push(pendingModelTurn);
	}

	return result;
}

/**
 * Enriches a node with model turn metadata and recursively
 * merges model turns within its children.
 */
function applyModelTurnInfo(node: FlowNode, modelTurn: FlowNode | undefined): FlowNode {
	const mergedChildren = node.children.length > 0 ? mergeModelTurns(node.children) : node.children;

	if (!modelTurn) {
		return mergedChildren !== node.children ? { ...node, children: mergedChildren } : node;
	}

	// Build compact annotation from model turn info (e.g. "500 tok · LLM 2.3s")
	const annotation = modelTurn.sublabel;
	const newSublabel = annotation
		? (node.sublabel ? `${node.sublabel} \u00b7 ${annotation}` : annotation)
		: node.sublabel;

	// Enrich tooltip with model turn details
	const modelTooltip = modelTurn.tooltip ?? (modelTurn.label !== 'Model Turn' ? modelTurn.label : undefined);
	const newTooltip = modelTooltip
		? (node.tooltip ? `${node.tooltip}\n\nModel: ${modelTooltip}` : `Model: ${modelTooltip}`)
		: node.tooltip;

	return {
		...node,
		sublabel: newSublabel,
		tooltip: newTooltip,
		children: mergedChildren,
	};
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

function filterByKind(nodes: FlowNode[], isKindVisible: (kind: string) => boolean): FlowNode[] {
	const result: FlowNode[] = [];
	let changed = false;
	for (const node of nodes) {
		if (!isKindVisible(node.kind)) {
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

// ---- Event helpers ----

function getEventLabel(event: IChatDebugEvent): string {
	switch (event.kind) {
		case 'userMessage': {
			const firstLine = event.message.split('\n')[0];
			return firstLine.length > 40 ? firstLine.substring(0, 37) + '...' : firstLine;
		}
		case 'modelTurn':
			return event.model ?? 'Model Turn';
		case 'toolCall':
			return event.toolName;
		case 'subagentInvocation':
			return event.agentName;
		case 'agentResponse':
			return 'Response';
		case 'generic':
			return event.name;
	}
}

function getEventSublabel(event: IChatDebugEvent): string | undefined {
	switch (event.kind) {
		case 'modelTurn': {
			const parts: string[] = [];
			if (event.totalTokens) {
				parts.push(`${event.totalTokens} tokens`);
			}
			if (event.durationInMillis) {
				parts.push(formatDuration(event.durationInMillis));
			}
			return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
		}
		case 'toolCall': {
			const parts: string[] = [];
			if (event.result) {
				parts.push(event.result);
			}
			if (event.durationInMillis) {
				parts.push(formatDuration(event.durationInMillis));
			}
			return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
		}
		case 'subagentInvocation': {
			const parts: string[] = [];
			if (event.status) {
				parts.push(event.status);
			}
			if (event.durationInMillis) {
				parts.push(formatDuration(event.durationInMillis));
			}
			return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
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
				parts.push(`Input: ${input.length > TOOLTIP_MAX_LENGTH ? input.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026' : input}`);
			}
			if (event.output) {
				const output = event.output.trim();
				parts.push(`Output: ${output.length > TOOLTIP_MAX_LENGTH ? output.substring(0, TOOLTIP_MAX_LENGTH) + '\u2026' : output}`);
			}
			if (event.result) {
				parts.push(`Result: ${event.result}`);
			}
			return parts.join('\n');
		}
		case 'subagentInvocation': {
			const parts: string[] = [event.agentName];
			if (event.description) {
				parts.push(event.description);
			}
			if (event.status) {
				parts.push(`Status: ${event.status}`);
			}
			if (event.toolCallCount !== undefined) {
				parts.push(`Tool calls: ${event.toolCallCount}`);
			}
			if (event.modelTurnCount !== undefined) {
				parts.push(`Model turns: ${event.modelTurnCount}`);
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
				parts.push(`Tokens: ${event.totalTokens}`);
			}
			if (event.inputTokens) {
				parts.push(`Input tokens: ${event.inputTokens}`);
			}
			if (event.outputTokens) {
				parts.push(`Output tokens: ${event.outputTokens}`);
			}
			if (event.durationInMillis) {
				parts.push(`Duration: ${formatDuration(event.durationInMillis)}`);
			}
			return parts.length > 0 ? parts.join('\n') : undefined;
		}
		default:
			return undefined;
	}
}
