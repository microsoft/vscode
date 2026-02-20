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
	readonly tooltip?: string;
	readonly isError?: boolean;
	readonly created: number;
	readonly children: FlowNode[];
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
}

export interface FlowLayout {
	readonly nodes: LayoutNode[];
	readonly edges: LayoutEdge[];
	readonly subgraphs: SubgraphRect[];
	readonly width: number;
	readonly height: number;
}

// ---- Build flow graph from debug events ----

export function buildFlowGraph(events: readonly IChatDebugEvent[]): FlowNode[] {
	// Filter out redundant events:
	// - toolCall with subagent tool names: the subagentInvocation event has richer metadata
	// - subagentInvocation with agentName matching a tool name: these are completion
	//   duplicates of the "SubAgent started" marker which has the proper descriptive name
	const subagentToolNames = new Set(['runSubagent', 'search_subagent']);
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
		return {
			id: event.id ?? `event-${events.indexOf(event)}`,
			kind: event.kind,
			label: getEventLabel(event),
			sublabel: getEventSublabel(event),
			tooltip: getEventTooltip(event),
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
