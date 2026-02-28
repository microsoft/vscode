/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatDebugEvent } from '../../common/chatDebugService.js';
import { FlowLayout, FlowNode, LayoutEdge, LayoutNode, SubgraphRect, FlowChartRenderResult } from './chatDebugFlowGraph.js';

// ---- Layout constants ----

const NODE_HEIGHT = 36;
const MESSAGE_NODE_HEIGHT = 52;
const NODE_MIN_WIDTH = 140;
const NODE_MAX_WIDTH = 320;
const NODE_PADDING_H = 16;
const NODE_PADDING_V = 6;
const NODE_GAP_Y = 24;
const NODE_BORDER_RADIUS = 6;
const EDGE_STROKE_WIDTH = 1.5;
const FONT_SIZE = 12;
const SUBLABEL_FONT_SIZE = 10;
const SUBGRAPH_PADDING = 12;
const CANVAS_PADDING = 24;
const PARALLEL_GAP_X = 40;
const SUBGRAPH_HEADER_HEIGHT = 22;
const GUTTER_WIDTH = 3;
const MERGED_TOGGLE_WIDTH = 36;

// ---- Layout internals ----

interface SubtreeLayout {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	subgraphs: SubgraphRect[];
	width: number;
	height: number;
	entryNode: LayoutNode;
	exitNodes: LayoutNode[];
}

interface ChildGroup {
	readonly type: 'sequential' | 'parallel';
	readonly children: FlowNode[];
}

/** Deferred expansion of a merged-discovery node, resolved in pass 2. */
interface PendingExpansion {
	/** The merged summary LayoutNode (already placed). */
	readonly mergedNode: LayoutNode;
	/** The individual FlowNodes to expand to the right. */
	readonly children: readonly FlowNode[];
}

// ---- Parallel detection ----

/** Max time gap (ms) between subagent `created` timestamps to consider them parallel. */
const PARALLEL_TIME_THRESHOLD_MS = 5_000;

/**
 * Groups a list of sibling nodes into sequential and parallel segments.
 *
 * Subagent invocations whose `created` timestamps fall within
 * {@link PARALLEL_TIME_THRESHOLD_MS} of each other are clustered as parallel.
 * Non-subagent nodes interleaved within a cluster are emitted as a sequential
 * group before the parallel fork.  When fewer than 2 subagents exist,
 * everything is sequential.
 */
function groupChildren(children: FlowNode[]): ChildGroup[] {
	const subagentIndices: number[] = [];
	for (let i = 0; i < children.length; i++) {
		if (children[i].kind === 'subagentInvocation') {
			subagentIndices.push(i);
		}
	}

	if (subagentIndices.length < 2) {
		return [{ type: 'sequential', children }];
	}

	// Cluster subagents whose created timestamps are within the threshold.
	const parallelClusters: number[][] = [];
	let cluster: number[] = [subagentIndices[0]];
	for (let k = 1; k < subagentIndices.length; k++) {
		const prevCreated = children[subagentIndices[k - 1]].created;
		const currCreated = children[subagentIndices[k]].created;
		if (Math.abs(currCreated - prevCreated) <= PARALLEL_TIME_THRESHOLD_MS) {
			cluster.push(subagentIndices[k]);
		} else {
			if (cluster.length >= 2) {
				parallelClusters.push(cluster);
			}
			cluster = [subagentIndices[k]];
		}
	}
	if (cluster.length >= 2) {
		parallelClusters.push(cluster);
	}

	if (parallelClusters.length === 0) {
		return [{ type: 'sequential', children }];
	}

	// Build groups from the timestamp-derived clusters.
	const parallelIndices = new Set<number>();
	for (const c of parallelClusters) {
		for (const idx of c) {
			parallelIndices.add(idx);
		}
	}

	const groups: ChildGroup[] = [];
	let clusterIdx = 0;
	let i = 0;
	while (i < children.length) {
		if (clusterIdx < parallelClusters.length && i === parallelClusters[clusterIdx][0]) {
			const cl = parallelClusters[clusterIdx];
			const lastIdx = cl[cl.length - 1];

			const setup: FlowNode[] = [];
			const subagents: FlowNode[] = [];
			for (let j = cl[0]; j <= lastIdx; j++) {
				if (parallelIndices.has(j)) {
					subagents.push(children[j]);
				} else {
					setup.push(children[j]);
				}
			}
			if (setup.length > 0) {
				groups.push({ type: 'sequential', children: setup });
			}
			groups.push({ type: 'parallel', children: subagents });
			i = lastIdx + 1;
			clusterIdx++;
		} else {
			const start = i;
			const nextStart = clusterIdx < parallelClusters.length ? parallelClusters[clusterIdx][0] : children.length;
			while (i < nextStart && !parallelIndices.has(i)) {
				i++;
			}
			if (i > start) {
				groups.push({ type: 'sequential', children: children.slice(start, i) });
			}
		}
	}
	return groups;
}

// ---- Layout engine ----

function isMessageKind(kind: IChatDebugEvent['kind']): boolean {
	return kind === 'userMessage' || kind === 'agentResponse';
}

function measureNodeWidth(label: string, sublabel?: string): number {
	const charWidth = 7;
	const labelWidth = label.length * charWidth + NODE_PADDING_H * 2;
	const sublabelWidth = sublabel ? sublabel.length * (charWidth - 1) + NODE_PADDING_H * 2 : 0;
	return Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, labelWidth, sublabelWidth));
}

function subgraphHeaderLabel(node: FlowNode): string {
	return node.description ? `${node.label}: ${node.description}` : node.label;
}

function measureSubgraphHeaderWidth(headerLabel: string): number {
	return headerLabel.length * 6 + SUBGRAPH_PADDING * 2 + 20; // 20 for chevron
}

function countDescendants(node: FlowNode): number {
	let count = node.children.length;
	for (const child of node.children) {
		count += countDescendants(child);
	}
	return count;
}

/**
 * Lays out grouped children (sequential or parallel) and connects edges.
 * Shared by both root-level layout and subtree-level layout.
 *
 * @returns The final exit nodes, max width, and the y position after the last node.
 */
function layoutGroups(
	groups: ChildGroup[],
	startX: number,
	startY: number,
	depth: number,
	prevExitNodes: LayoutNode[],
	result: { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] },
	collapsedIds?: ReadonlySet<string>,
	expandedMergedIds?: ReadonlySet<string>,
	pendingExpansions?: PendingExpansion[],
): { exitNodes: LayoutNode[]; maxWidth: number; endY: number } {
	let currentY = startY;
	let maxWidth = 0;
	let exitNodes = prevExitNodes;

	for (const group of groups) {
		if (group.type === 'parallel') {
			const pg = layoutParallelGroup(group.children, startX, currentY, depth, collapsedIds, expandedMergedIds, pendingExpansions);
			result.nodes.push(...pg.nodes);
			result.edges.push(...pg.edges);
			result.subgraphs.push(...pg.subgraphs);

			for (const prev of exitNodes) {
				for (const entry of pg.entryNodes) {
					result.edges.push(makeEdge(prev, entry));
				}
			}
			exitNodes = pg.exitNodes;
			maxWidth = Math.max(maxWidth, pg.width);
			currentY += pg.height + NODE_GAP_Y;
		} else {
			for (const child of group.children) {
				const sub = layoutSubtree(child, startX, currentY, depth, collapsedIds, expandedMergedIds, pendingExpansions);
				result.nodes.push(...sub.nodes);
				result.edges.push(...sub.edges);
				result.subgraphs.push(...sub.subgraphs);

				for (const prev of exitNodes) {
					result.edges.push(makeEdge(prev, sub.entryNode));
				}
				exitNodes = sub.exitNodes;
				maxWidth = Math.max(maxWidth, sub.width);
				currentY += sub.height + NODE_GAP_Y;
			}
		}
	}
	return { exitNodes, maxWidth, endY: currentY };
}

function makeEdge(from: LayoutNode, to: LayoutNode): LayoutEdge {
	return {
		fromId: from.id,
		toId: to.id,
		fromX: from.x + from.width / 2,
		fromY: from.y + from.height,
		toX: to.x + to.width / 2,
		toY: to.y,
	};
}

/**
 * Lays out a list of flow nodes in a top-down vertical flow.
 * Parallel subagent invocations are arranged side by side.
 */
export function layoutFlowGraph(roots: FlowNode[], options?: { collapsedIds?: ReadonlySet<string>; expandedMergedIds?: ReadonlySet<string> }): FlowLayout {
	if (roots.length === 0) {
		return { nodes: [], edges: [], subgraphs: [], width: 0, height: 0 };
	}

	const collapsedIds = options?.collapsedIds;
	const expandedMergedIds = options?.expandedMergedIds;
	const groups = groupChildren(roots);
	const pendingExpansions: PendingExpansion[] = [];
	const result: { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] } = {
		nodes: [],
		edges: [],
		subgraphs: [],
	};

	// Pass 1: layout the main vertical flow; expanded merged nodes only
	// place their summary node and defer children to pendingExpansions.
	const { maxWidth, endY } = layoutGroups(groups, CANVAS_PADDING, CANVAS_PADDING, 0, [], result, collapsedIds, expandedMergedIds, pendingExpansions);

	// Pass 2: resolve deferred expansions — place children to the right,
	// far enough to clear all existing nodes/subgraphs in the Y range.
	resolvePendingExpansions(pendingExpansions, result);

	let width = maxWidth + CANVAS_PADDING * 2;
	let height = endY - NODE_GAP_Y + CANVAS_PADDING;

	// Expand canvas to cover any nodes that float outside the main flow.
	for (const n of result.nodes) {
		width = Math.max(width, n.x + n.width + CANVAS_PADDING);
		height = Math.max(height, n.y + n.height + CANVAS_PADDING);
	}

	centerLayout(result as FlowLayout & { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] }, width / 2);

	return { nodes: result.nodes, edges: result.edges, subgraphs: result.subgraphs, width, height };
}

/**
 * Pass 2: For each pending expansion, compute the Y range the children
 * will occupy, scan all already-placed nodes and subgraphs for the max
 * right edge overlapping that range, and place the entire column of
 * children to the right of that edge.
 */
function resolvePendingExpansions(
	pendingExpansions: PendingExpansion[],
	result: { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] },
): void {
	for (const expansion of pendingExpansions) {
		const { mergedNode, children } = expansion;

		// Compute the Y range the children will occupy.
		const childrenTotalHeight = children.length * NODE_HEIGHT + (children.length - 1) * NODE_GAP_Y;
		const rangeTop = mergedNode.y;
		const rangeBottom = mergedNode.y + childrenTotalHeight;

		// Find the max right edge of any existing node or subgraph
		// that overlaps this Y range.
		let maxRightX = mergedNode.x + mergedNode.width;
		for (const n of result.nodes) {
			if (n.y + n.height > rangeTop && n.y < rangeBottom) {
				maxRightX = Math.max(maxRightX, n.x + n.width);
			}
		}
		for (const sg of result.subgraphs) {
			if (sg.y + sg.height > rangeTop && sg.y < rangeBottom) {
				maxRightX = Math.max(maxRightX, sg.x + sg.width);
			}
		}

		const expandX = maxRightX + PARALLEL_GAP_X;
		let expandY = mergedNode.y;
		let expandMaxWidth = 0;

		const childNodes: LayoutNode[] = [];
		for (const child of children) {
			const childWidth = measureNodeWidth(child.label, child.sublabel);
			const childNode: LayoutNode = {
				id: child.id,
				kind: child.kind,
				label: child.label,
				sublabel: child.sublabel,
				tooltip: child.tooltip,
				isError: child.isError,
				x: expandX,
				y: expandY,
				width: childWidth,
				height: NODE_HEIGHT,
			};
			childNodes.push(childNode);
			result.nodes.push(childNode);
			expandMaxWidth = Math.max(expandMaxWidth, childWidth);
			expandY += NODE_HEIGHT + NODE_GAP_Y;
		}

		// Horizontal edge from merged node to first child
		result.edges.push({
			fromId: mergedNode.id,
			toId: childNodes[0].id,
			fromX: mergedNode.x + mergedNode.width,
			fromY: mergedNode.y + mergedNode.height / 2,
			toX: expandX,
			toY: childNodes[0].y + childNodes[0].height / 2,
		});

		// Vertical edges between consecutive children
		for (let k = 0; k < childNodes.length - 1; k++) {
			result.edges.push(makeEdge(childNodes[k], childNodes[k + 1]));
		}
	}
}

function layoutSubtree(node: FlowNode, startX: number, y: number, depth: number, collapsedIds?: ReadonlySet<string>, expandedMergedIds?: ReadonlySet<string>, pendingExpansions?: PendingExpansion[]): SubtreeLayout {
	const isMerged = (node.mergedNodes?.length ?? 0) >= 2;
	const isMergedExpanded = isMerged && expandedMergedIds?.has(node.id);
	const mergedExtra = isMerged ? MERGED_TOGGLE_WIDTH : 0;
	const nodeWidth = measureNodeWidth(node.label, node.sublabel) + mergedExtra;
	const isSubagent = node.kind === 'subagentInvocation';
	const isCollapsed = isSubagent && collapsedIds?.has(node.id);
	const nodeHeight = isMessageKind(node.kind) && node.sublabel ? MESSAGE_NODE_HEIGHT : NODE_HEIGHT;

	const layoutNode: LayoutNode = {
		id: node.id,
		kind: node.kind,
		label: node.label,
		sublabel: node.sublabel,
		tooltip: node.tooltip,
		isError: node.isError,
		x: startX,
		y: y,
		width: nodeWidth,
		height: nodeHeight,
		mergedCount: isMerged ? node.mergedNodes!.length : undefined,
		isMergedExpanded,
	};

	const result: SubtreeLayout = {
		nodes: [layoutNode],
		edges: [],
		subgraphs: [],
		width: nodeWidth,
		height: nodeHeight,
		entryNode: layoutNode,
		exitNodes: [layoutNode],
	};

	// Expanded merged discovery: defer child placement to pass 2.
	// Only emit the merged summary node now; children will be placed
	// to the right after all main-flow nodes have been positioned.
	if (isMergedExpanded && pendingExpansions) {
		pendingExpansions.push({ mergedNode: layoutNode, children: node.mergedNodes! });
		return result;
	}

	if (node.children.length === 0 && !isCollapsed) {
		return result;
	}

	// Collapsed subagent: show just the header + a compact badge area
	if (isCollapsed) {
		const collapsedHeight = SUBGRAPH_HEADER_HEIGHT + SUBGRAPH_PADDING * 2;
		const totalChildCount = countDescendants(node);
		const sgY = (y + nodeHeight + NODE_GAP_Y) - NODE_GAP_Y / 2;
		const headerLabel = subgraphHeaderLabel(node);
		const sgWidth = Math.max(NODE_MIN_WIDTH, measureSubgraphHeaderWidth(headerLabel)) + SUBGRAPH_PADDING * 2;
		result.subgraphs.push({
			label: headerLabel,
			x: startX - SUBGRAPH_PADDING,
			y: sgY,
			width: sgWidth,
			height: collapsedHeight,
			depth,
			nodeId: node.id,
			collapsedChildCount: totalChildCount,
		});
		// Draw a connecting edge from the node to the collapsed subgraph
		result.edges.push({
			fromX: startX + nodeWidth / 2,
			fromY: y + nodeHeight,
			toX: startX - SUBGRAPH_PADDING + sgWidth / 2,
			toY: sgY,
		});
		result.width = Math.max(nodeWidth, sgWidth);
		result.height = nodeHeight + NODE_GAP_Y + collapsedHeight;
		return result;
	}

	if (node.children.length === 0) {
		return result;
	}

	const childDepth = isSubagent ? depth + 1 : depth;
	const indentX = isSubagent ? SUBGRAPH_PADDING : 0;
	const groups = groupChildren(node.children);

	let childStartY = y + nodeHeight + NODE_GAP_Y;
	if (isSubagent) {
		childStartY += SUBGRAPH_HEADER_HEIGHT;
	}

	const { exitNodes, maxWidth, endY } = layoutGroups(
		groups, startX + indentX, childStartY, childDepth, [layoutNode], result, collapsedIds, expandedMergedIds, pendingExpansions,
	);

	const totalChildrenHeight = endY - childStartY - NODE_GAP_Y;

	let sgContentWidth = maxWidth;
	if (isSubagent) {
		const headerLabel = subgraphHeaderLabel(node);
		sgContentWidth = Math.max(maxWidth, measureSubgraphHeaderWidth(headerLabel));
		result.subgraphs.push({
			label: headerLabel,
			x: startX - SUBGRAPH_PADDING,
			y: (y + nodeHeight + NODE_GAP_Y) - NODE_GAP_Y / 2,
			width: sgContentWidth + SUBGRAPH_PADDING * 2,
			height: totalChildrenHeight + SUBGRAPH_HEADER_HEIGHT + NODE_GAP_Y,
			depth,
			nodeId: node.id,
		});
	}

	result.width = Math.max(nodeWidth, maxWidth + indentX * 2, isSubagent ? sgContentWidth + indentX * 2 : 0);
	result.height = nodeHeight + NODE_GAP_Y + totalChildrenHeight + (isSubagent ? SUBGRAPH_HEADER_HEIGHT : 0);
	result.exitNodes = exitNodes;

	return result;
}

function layoutParallelGroup(children: FlowNode[], startX: number, y: number, depth: number, collapsedIds?: ReadonlySet<string>, expandedMergedIds?: ReadonlySet<string>, pendingExpansions?: PendingExpansion[]): {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	subgraphs: SubgraphRect[];
	entryNodes: LayoutNode[];
	exitNodes: LayoutNode[];
	width: number;
	height: number;
} {
	const subtreeLayouts: SubtreeLayout[] = [];
	let totalWidth = 0;
	let maxHeight = 0;

	for (const child of children) {
		const subtree = layoutSubtree(child, 0, y, depth, collapsedIds, expandedMergedIds, pendingExpansions);
		subtreeLayouts.push(subtree);
		totalWidth += subtree.width;
		maxHeight = Math.max(maxHeight, subtree.height);
	}
	totalWidth += (children.length - 1) * PARALLEL_GAP_X;

	const nodes: LayoutNode[] = [];
	const edges: LayoutEdge[] = [];
	const subgraphs: SubgraphRect[] = [];
	const entryNodes: LayoutNode[] = [];
	const exitNodes: LayoutNode[] = [];

	let currentX = startX;
	for (const subtree of subtreeLayouts) {
		const dx = currentX;
		const offsetNodes = subtree.nodes.map(n => ({ ...n, x: n.x + dx }));
		const offsetEdges = subtree.edges.map(e => ({
			fromId: e.fromId, toId: e.toId,
			fromX: e.fromX + dx, fromY: e.fromY,
			toX: e.toX + dx, toY: e.toY,
		}));
		const offsetSubgraphs = subtree.subgraphs.map(s => ({ ...s, x: s.x + dx }));

		nodes.push(...offsetNodes);
		edges.push(...offsetEdges);
		subgraphs.push(...offsetSubgraphs);
		entryNodes.push(offsetNodes.find(n => n.id === subtree.entryNode.id)!);

		const exitIds = new Set(subtree.exitNodes.map(n => n.id));
		exitNodes.push(...offsetNodes.filter(n => exitIds.has(n.id)));
		currentX += subtree.width + PARALLEL_GAP_X;
	}

	return { nodes, edges, subgraphs, entryNodes, exitNodes, width: totalWidth, height: maxHeight };
}

function centerLayout(layout: { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] }, centerX: number): void {
	if (layout.nodes.length === 0) {
		return;
	}

	let minX = Infinity;
	let maxX = -Infinity;
	for (const node of layout.nodes) {
		minX = Math.min(minX, node.x);
		maxX = Math.max(maxX, node.x + node.width);
	}
	const dx = centerX - (minX + maxX) / 2;

	for (let i = 0; i < layout.nodes.length; i++) {
		const n = layout.nodes[i];
		(layout.nodes as LayoutNode[])[i] = { ...n, x: n.x + dx };
	}
	for (let i = 0; i < layout.edges.length; i++) {
		const e = layout.edges[i];
		(layout.edges as LayoutEdge[])[i] = { fromId: e.fromId, toId: e.toId, fromX: e.fromX + dx, fromY: e.fromY, toX: e.toX + dx, toY: e.toY };
	}
	for (let i = 0; i < layout.subgraphs.length; i++) {
		const s = layout.subgraphs[i];
		(layout.subgraphs as SubgraphRect[])[i] = { ...s, x: s.x + dx };
	}
}

// ---- SVG Rendering ----

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) {
		el.setAttribute(k, String(v));
	}
	return el;
}

function getNodeColor(kind: IChatDebugEvent['kind'], isError?: boolean): string {
	if (isError) {
		return 'var(--vscode-errorForeground)';
	}
	switch (kind) {
		case 'userMessage':
			return 'var(--vscode-textLink-foreground)';
		case 'modelTurn':
			return 'var(--vscode-charts-blue, var(--vscode-textLink-foreground))';
		case 'toolCall':
			return 'var(--vscode-testing-iconPassed, #73c991)';
		case 'subagentInvocation':
			return 'var(--vscode-charts-purple, #b267e6)';
		case 'agentResponse':
			return 'var(--vscode-foreground)';
		case 'generic':
			return 'var(--vscode-descriptionForeground)';
	}
}

const SUBGRAPH_COLORS = [
	'var(--vscode-charts-purple, #b267e6)',
	'var(--vscode-charts-blue, #3dc9b0)',
	'var(--vscode-charts-yellow, #e5c07b)',
	'var(--vscode-charts-orange, #d19a66)',
];

export function renderFlowChartSVG(layout: FlowLayout): FlowChartRenderResult {
	const focusableElements = new Map<string, SVGElement>();
	const svg = svgEl('svg', {
		width: layout.width,
		height: layout.height,
		viewBox: `0 0 ${layout.width} ${layout.height}`,
		role: 'img',
		'aria-label': `Agent flow chart with ${layout.nodes.length} nodes`,
	});
	svg.classList.add('chat-debug-flowchart-svg');

	renderSubgraphs(svg, layout.subgraphs, focusableElements);
	renderEdges(svg, layout.edges);
	renderNodes(svg, layout.nodes, focusableElements);

	// Sort focusable elements by visual position (top-to-bottom, left-to-right)
	// so keyboard navigation follows the flow chart order.
	const positionByKey = new Map<string, { y: number; x: number }>();
	for (const sg of layout.subgraphs) {
		positionByKey.set(`sg:${sg.nodeId}`, { y: sg.y, x: sg.x });
	}
	for (const node of layout.nodes) {
		positionByKey.set(node.id, { y: node.y, x: node.x });
	}
	const sortedFocusable = new Map(
		[...focusableElements.entries()].sort((a, b) => {
			const posA = positionByKey.get(a[0]);
			const posB = positionByKey.get(b[0]);
			if (!posA || !posB) {
				return 0;
			}
			return posA.y !== posB.y ? posA.y - posB.y : posA.x - posB.x;
		})
	);

	// Build adjacency map from edges so keyboard navigation can follow
	// graph directionality instead of visual sort order.
	const adjacency = new Map<string, { next: string[]; prev: string[] }>();
	for (const edge of layout.edges) {
		if (edge.fromId && edge.toId) {
			let fromEntry = adjacency.get(edge.fromId);
			if (!fromEntry) {
				fromEntry = { next: [], prev: [] };
				adjacency.set(edge.fromId, fromEntry);
			}
			fromEntry.next.push(edge.toId);

			let toEntry = adjacency.get(edge.toId);
			if (!toEntry) {
				toEntry = { next: [], prev: [] };
				adjacency.set(edge.toId, toEntry);
			}
			toEntry.prev.push(edge.fromId);
		}
	}

	return { svg, focusableElements: sortedFocusable, adjacency, positions: positionByKey };
}

function renderSubgraphs(svg: SVGElement, subgraphs: readonly SubgraphRect[], focusableElements: Map<string, SVGElement>): void {
	for (let sgIdx = 0; sgIdx < subgraphs.length; sgIdx++) {
		const sg = subgraphs[sgIdx];
		const color = SUBGRAPH_COLORS[sg.depth % SUBGRAPH_COLORS.length];
		const isCollapsed = sg.collapsedChildCount !== undefined;
		const g = document.createElementNS(SVG_NS, 'g');
		g.classList.add('chat-debug-flowchart-subgraph');

		const rectAttrs = { x: sg.x, y: sg.y, width: sg.width, height: sg.height, rx: NODE_BORDER_RADIUS, ry: NODE_BORDER_RADIUS };
		const clipId = `sg-clip-${sgIdx}`;

		// ClipPath for rounded corners
		const clipPath = svgEl('clipPath', { id: clipId });
		clipPath.appendChild(svgEl('rect', rectAttrs));
		svg.appendChild(clipPath);

		// Filled background
		g.appendChild(svgEl('rect', { ...rectAttrs, fill: color, opacity: 0.06 + sg.depth * 0.02 }));

		// Dashed border
		g.appendChild(svgEl('rect', { ...rectAttrs, fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-dasharray': '6,3', opacity: 0.5 }));

		// Gutter line
		g.appendChild(svgEl('rect', { x: sg.x, y: sg.y, width: GUTTER_WIDTH, height: sg.height, fill: color, opacity: 0.7, 'clip-path': `url(#${clipId})` }));

		// Header group (clickable, keyboard accessible)
		const headerGroup = document.createElementNS(SVG_NS, 'g');
		headerGroup.setAttribute('data-subgraph-id', sg.nodeId);
		headerGroup.classList.add('chat-debug-flowchart-subgraph-header');
		headerGroup.setAttribute('tabindex', '0');
		headerGroup.setAttribute('role', 'button');
		headerGroup.setAttribute('aria-expanded', String(!isCollapsed));
		headerGroup.setAttribute('aria-label', `${sg.label}: ${isCollapsed ? 'collapsed' : 'expanded'}${isCollapsed && sg.collapsedChildCount !== undefined ? `, ${sg.collapsedChildCount} items hidden` : ''}`);

		const headerBar = svgEl('rect', { x: sg.x, y: sg.y, width: sg.width, height: SUBGRAPH_HEADER_HEIGHT, fill: color, opacity: 0.15, 'clip-path': `url(#${clipId})` });
		headerGroup.appendChild(headerBar);

		// Chevron + header label
		const chevron = isCollapsed ? '\u25B6' : '\u25BC';
		const headerText = svgEl('text', {
			x: sg.x + GUTTER_WIDTH + 8,
			y: sg.y + SUBGRAPH_HEADER_HEIGHT / 2 + 4,
			'font-size': SUBLABEL_FONT_SIZE,
			fill: color,
			'font-family': 'var(--vscode-font-family, sans-serif)',
			'font-weight': '600',
		});
		headerText.textContent = `${chevron} ${sg.label}`;
		headerGroup.appendChild(headerText);
		g.appendChild(headerGroup);
		focusableElements.set(`sg:${sg.nodeId}`, headerGroup as unknown as SVGElement);

		// Collapsed badge
		if (isCollapsed && sg.collapsedChildCount !== undefined) {
			const badgeText = svgEl('text', {
				x: sg.x + sg.width / 2,
				y: sg.y + SUBGRAPH_HEADER_HEIGHT + SUBGRAPH_PADDING + 4,
				'font-size': SUBLABEL_FONT_SIZE,
				fill: 'var(--vscode-descriptionForeground)',
				'font-family': 'var(--vscode-font-family, sans-serif)',
				'font-style': 'italic',
				'text-anchor': 'middle',
			});
			badgeText.textContent = `+${sg.collapsedChildCount} items`;
			g.appendChild(badgeText);
		}

		svg.appendChild(g);
	}
}

function renderEdges(svg: SVGElement, edges: readonly LayoutEdge[]): void {
	const strokeAttrs = { fill: 'none', stroke: 'var(--vscode-descriptionForeground)', 'stroke-width': EDGE_STROKE_WIDTH, 'stroke-linecap': 'round' };
	// allow-any-unicode-next-line
	const r = 6; // corner radius for 90° bends

	for (const edge of edges) {
		const midY = (edge.fromY + edge.toY) / 2;
		let d: string;
		const isHorizontal = edge.fromY === edge.toY;

		if (isHorizontal) {
			// Horizontally aligned: straight line (used by expanded merged nodes)
			d = `M ${edge.fromX} ${edge.fromY} L ${edge.toX} ${edge.toY}`;
		} else if (edge.fromX === edge.toX) {
			// Vertically aligned: straight line
			d = `M ${edge.fromX} ${edge.fromY} L ${edge.toX} ${edge.toY}`;
		} else {
			// allow-any-unicode-next-line
			// Orthogonal routing: down, 90° horizontal, 90° down
			const dx = edge.toX - edge.fromX;
			const signX = dx > 0 ? 1 : -1;
			const absDx = Math.abs(dx);
			const cr = Math.min(r, absDx / 2, (edge.toY - edge.fromY) / 4);

			d = `M ${edge.fromX} ${edge.fromY}`
				// Down to first bend
				+ ` L ${edge.fromX} ${midY - cr}`
				// allow-any-unicode-next-line
				// 90° arc turning horizontal
				+ ` Q ${edge.fromX} ${midY}, ${edge.fromX + signX * cr} ${midY}`
				// Horizontal to second bend
				+ ` L ${edge.toX - signX * cr} ${midY}`
				// allow-any-unicode-next-line
				// 90° arc turning down
				+ ` Q ${edge.toX} ${midY}, ${edge.toX} ${midY + cr}`
				// Down to target
				+ ` L ${edge.toX} ${edge.toY}`;
		}

		svg.appendChild(svgEl('path', { ...strokeAttrs, d }));

		// Arrowhead: right-pointing for horizontal edges, down-pointing otherwise
		const a = 5;
		let arrowD: string;
		if (isHorizontal) {
			const signX = edge.toX > edge.fromX ? 1 : -1;
			arrowD = `M ${edge.toX - signX * a * 1.5} ${edge.toY - a} L ${edge.toX} ${edge.toY} L ${edge.toX - signX * a * 1.5} ${edge.toY + a}`;
		} else {
			arrowD = `M ${edge.toX - a} ${edge.toY - a * 1.5} L ${edge.toX} ${edge.toY} L ${edge.toX + a} ${edge.toY - a * 1.5}`;
		}
		svg.appendChild(svgEl('path', {
			...strokeAttrs,
			'stroke-linejoin': 'round',
			d: arrowD,
		}));
	}
}

function renderNodes(svg: SVGElement, nodes: readonly LayoutNode[], focusableElements: Map<string, SVGElement>): void {
	const fontFamily = 'var(--vscode-font-family, sans-serif)';
	const nodeFill = 'var(--vscode-editor-background, var(--vscode-editorWidget-background))';

	for (const node of nodes) {
		const g = document.createElementNS(SVG_NS, 'g');
		g.classList.add('chat-debug-flowchart-node');
		g.setAttribute('data-node-id', node.id);
		g.setAttribute('tabindex', '0');
		g.setAttribute('role', 'img');

		const ariaLabel = node.sublabel ? `${node.label}, ${node.sublabel}` : node.label;
		g.setAttribute('aria-label', ariaLabel);
		focusableElements.set(node.id, g as unknown as SVGElement);

		if (node.tooltip) {
			const title = document.createElementNS(SVG_NS, 'title');
			title.textContent = node.tooltip;
			g.appendChild(title);
		}

		const color = getNodeColor(node.kind, node.isError);
		const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
		const rectAttrs = { x: node.x, y: node.y, width: node.width, height: node.height, rx: NODE_BORDER_RADIUS, ry: NODE_BORDER_RADIUS };

		// Clip path shared by gutter bar and text
		const clipId = `clip-${safeId}`;
		const clipPath = svgEl('clipPath', { id: clipId });
		clipPath.appendChild(svgEl('rect', rectAttrs));
		svg.appendChild(clipPath);

		// Focus ring (hidden by default, shown on :focus via CSS)
		const focusOffset = 3;
		g.appendChild(svgEl('rect', {
			class: 'chat-debug-flowchart-focus-ring',
			x: node.x - focusOffset,
			y: node.y - focusOffset,
			width: node.width + focusOffset * 2,
			height: node.height + focusOffset * 2,
			rx: NODE_BORDER_RADIUS + focusOffset,
			ry: NODE_BORDER_RADIUS + focusOffset,
			fill: 'none',
			stroke: 'var(--vscode-focusBorder)',
			'stroke-width': 2,
		}));

		// Node rectangle
		g.appendChild(svgEl('rect', { ...rectAttrs, fill: nodeFill, stroke: color, 'stroke-width': node.isError ? 2 : 1.5 }));

		// Kind indicator (colored gutter bar)
		g.appendChild(svgEl('rect', { x: node.x, y: node.y, width: 4, height: node.height, fill: color, 'clip-path': `url(#${clipId})` }));

		// Label text
		const textX = node.x + NODE_PADDING_H;
		const isMessage = isMessageKind(node.kind);
		if (isMessage && node.sublabel) {
			// Message nodes: small header label + larger message text
			const header = svgEl('text', { x: textX, y: node.y + NODE_PADDING_V + SUBLABEL_FONT_SIZE, 'font-size': SUBLABEL_FONT_SIZE, fill: 'var(--vscode-descriptionForeground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
			header.textContent = node.label;
			g.appendChild(header);

			const msg = svgEl('text', { x: textX, y: node.y + node.height - NODE_PADDING_V - 2, 'font-size': FONT_SIZE, fill: 'var(--vscode-foreground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
			msg.textContent = node.sublabel;
			g.appendChild(msg);
		} else if (node.sublabel) {
			const label = svgEl('text', { x: textX, y: node.y + NODE_PADDING_V + FONT_SIZE, 'font-size': FONT_SIZE, fill: 'var(--vscode-foreground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
			label.textContent = node.label;
			g.appendChild(label);

			const sub = svgEl('text', { x: textX, y: node.y + node.height - NODE_PADDING_V, 'font-size': SUBLABEL_FONT_SIZE, fill: 'var(--vscode-descriptionForeground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
			sub.textContent = node.sublabel;
			g.appendChild(sub);
		} else {
			const label = svgEl('text', { x: textX, y: node.y + node.height / 2 + FONT_SIZE / 2 - 1, 'font-size': FONT_SIZE, fill: 'var(--vscode-foreground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
			label.textContent = node.label;
			g.appendChild(label);
		}

		// Merged-discovery expand/collapse toggle on the right side
		if (node.mergedCount) {
			g.setAttribute('data-is-toggle', 'true');
			renderMergedToggle(g, node, color, fontFamily);
		}

		svg.appendChild(g);
	}
}

function renderMergedToggle(g: Element, node: LayoutNode, color: string, fontFamily: string): void {
	const toggleX = node.x + node.width - MERGED_TOGGLE_WIDTH;
	const toggleGroup = document.createElementNS(SVG_NS, 'g');
	toggleGroup.classList.add('chat-debug-flowchart-merged-toggle');
	toggleGroup.setAttribute('data-merged-id', node.id);

	// Separator line
	toggleGroup.appendChild(svgEl('line', {
		x1: toggleX, y1: node.y + 4,
		x2: toggleX, y2: node.y + node.height - 4,
		stroke: 'var(--vscode-descriptionForeground)',
		'stroke-width': 0.5,
		opacity: 0.4,
	}));

	// allow-any-unicode-next-line
	// Expand chevron (▶ collapsed, ◀ expanded)
	const chevronX = toggleX + MERGED_TOGGLE_WIDTH / 2;
	const chevronY = node.y + node.height / 2;
	const chevron = svgEl('text', {
		x: chevronX,
		y: chevronY + 4,
		'font-size': 9,
		fill: color,
		'font-family': fontFamily,
		'text-anchor': 'middle',
		cursor: 'pointer',
	});
	// allow-any-unicode-next-line
	chevron.textContent = node.isMergedExpanded ? '\u25C0' : '\u25B6'; // ◀ or ▶
	toggleGroup.appendChild(chevron);

	// Hit area for the toggle — invisible rect covering the toggle zone
	toggleGroup.appendChild(svgEl('rect', {
		x: toggleX,
		y: node.y,
		width: MERGED_TOGGLE_WIDTH,
		height: node.height,
		fill: 'transparent',
		cursor: 'pointer',
	}));

	g.appendChild(toggleGroup);
}
