/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatDebugEvent } from '../../common/chatDebugService.js';
import { FlowLayout, FlowNode, LayoutEdge, LayoutNode, SubgraphRect } from './chatDebugFlowGraph.js';

// ---- Layout constants ----

const NODE_HEIGHT = 36;
const NODE_MIN_WIDTH = 140;
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

function measureNodeWidth(label: string, sublabel?: string): number {
	const charWidth = 7;
	const labelWidth = label.length * charWidth + NODE_PADDING_H * 2;
	const sublabelWidth = sublabel ? sublabel.length * (charWidth - 1) + NODE_PADDING_H * 2 : 0;
	return Math.max(NODE_MIN_WIDTH, labelWidth, sublabelWidth);
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
): { exitNodes: LayoutNode[]; maxWidth: number; endY: number } {
	let currentY = startY;
	let maxWidth = 0;
	let exitNodes = prevExitNodes;

	for (const group of groups) {
		if (group.type === 'parallel') {
			const pg = layoutParallelGroup(group.children, startX, currentY, depth);
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
				const sub = layoutSubtree(child, startX, currentY, depth);
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
export function layoutFlowGraph(roots: FlowNode[]): FlowLayout {
	if (roots.length === 0) {
		return { nodes: [], edges: [], subgraphs: [], width: 0, height: 0 };
	}

	const groups = groupChildren(roots);
	const result: { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] } = {
		nodes: [],
		edges: [],
		subgraphs: [],
	};

	const { maxWidth, endY } = layoutGroups(groups, CANVAS_PADDING, CANVAS_PADDING, 0, [], result);
	const width = maxWidth + CANVAS_PADDING * 2;
	const height = endY - NODE_GAP_Y + CANVAS_PADDING;

	centerLayout(result as FlowLayout & { nodes: LayoutNode[]; edges: LayoutEdge[]; subgraphs: SubgraphRect[] }, width / 2);

	return { nodes: result.nodes, edges: result.edges, subgraphs: result.subgraphs, width, height };
}

function layoutSubtree(node: FlowNode, startX: number, y: number, depth: number): SubtreeLayout {
	const nodeWidth = measureNodeWidth(node.label, node.sublabel);
	const isSubagent = node.kind === 'subagentInvocation';

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
		height: NODE_HEIGHT,
	};

	const result: SubtreeLayout = {
		nodes: [layoutNode],
		edges: [],
		subgraphs: [],
		width: nodeWidth,
		height: NODE_HEIGHT,
		entryNode: layoutNode,
		exitNodes: [layoutNode],
	};

	if (node.children.length === 0) {
		return result;
	}

	const childDepth = isSubagent ? depth + 1 : depth;
	const indentX = isSubagent ? SUBGRAPH_PADDING : 0;
	const groups = groupChildren(node.children);

	let childStartY = y + NODE_HEIGHT + NODE_GAP_Y;
	if (isSubagent) {
		childStartY += SUBGRAPH_HEADER_HEIGHT;
	}

	const { exitNodes, maxWidth, endY } = layoutGroups(
		groups, startX + indentX, childStartY, childDepth, [layoutNode], result,
	);

	// Adjust widths for indented subgraph content
	const adjustedWidth = Math.max(nodeWidth, maxWidth + indentX * 2);
	const totalChildrenHeight = endY - childStartY - NODE_GAP_Y;

	if (isSubagent) {
		result.subgraphs.push({
			label: node.label,
			x: startX - SUBGRAPH_PADDING,
			y: (y + NODE_HEIGHT + NODE_GAP_Y) - NODE_GAP_Y / 2,
			width: Math.max(nodeWidth, maxWidth) + SUBGRAPH_PADDING * 2,
			height: totalChildrenHeight + SUBGRAPH_HEADER_HEIGHT + NODE_GAP_Y,
			depth,
		});
	}

	result.width = adjustedWidth;
	result.height = NODE_HEIGHT + NODE_GAP_Y + totalChildrenHeight + (isSubagent ? SUBGRAPH_HEADER_HEIGHT : 0);
	result.exitNodes = exitNodes;

	return result;
}

function layoutParallelGroup(children: FlowNode[], startX: number, y: number, depth: number): {
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
		const subtree = layoutSubtree(child, 0, y, depth);
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
		(layout.edges as LayoutEdge[])[i] = { fromX: e.fromX + dx, fromY: e.fromY, toX: e.toX + dx, toY: e.toY };
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

export function renderFlowChartSVG(layout: FlowLayout): SVGElement {
	const svg = svgEl('svg', {
		width: layout.width,
		height: layout.height,
		viewBox: `0 0 ${layout.width} ${layout.height}`,
	});
	svg.classList.add('chat-debug-flowchart-svg');

	renderSubgraphs(svg, layout.subgraphs);
	renderEdges(svg, layout.edges);
	renderNodes(svg, layout.nodes);

	return svg;
}

function renderSubgraphs(svg: SVGElement, subgraphs: readonly SubgraphRect[]): void {
	for (let sgIdx = 0; sgIdx < subgraphs.length; sgIdx++) {
		const sg = subgraphs[sgIdx];
		const color = SUBGRAPH_COLORS[sg.depth % SUBGRAPH_COLORS.length];
		const g = document.createElementNS(SVG_NS, 'g');

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

		// Header bar
		g.appendChild(svgEl('rect', { x: sg.x, y: sg.y, width: sg.width, height: SUBGRAPH_HEADER_HEIGHT, fill: color, opacity: 0.15, 'clip-path': `url(#${clipId})` }));

		// Header label
		const headerText = svgEl('text', {
			x: sg.x + GUTTER_WIDTH + 8,
			y: sg.y + SUBGRAPH_HEADER_HEIGHT / 2 + 4,
			'font-size': SUBLABEL_FONT_SIZE,
			fill: color,
			'font-family': 'var(--vscode-font-family, sans-serif)',
			'font-weight': '600',
		});
		headerText.textContent = sg.label;
		g.appendChild(headerText);

		svg.appendChild(g);
	}
}

function renderEdges(svg: SVGElement, edges: readonly LayoutEdge[]): void {
	const strokeAttrs = { fill: 'none', stroke: 'var(--vscode-descriptionForeground)', 'stroke-width': EDGE_STROKE_WIDTH, 'stroke-linecap': 'round' };

	for (const edge of edges) {
		const midY = (edge.fromY + edge.toY) / 2;
		svg.appendChild(svgEl('path', {
			...strokeAttrs,
			d: `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`,
		}));

		const a = 5; // arrowhead size
		svg.appendChild(svgEl('path', {
			...strokeAttrs,
			'stroke-linejoin': 'round',
			d: `M ${edge.toX - a} ${edge.toY - a * 1.5} L ${edge.toX} ${edge.toY} L ${edge.toX + a} ${edge.toY - a * 1.5}`,
		}));
	}
}

function renderNodes(svg: SVGElement, nodes: readonly LayoutNode[]): void {
	const fontFamily = 'var(--vscode-font-family, sans-serif)';
	const nodeFill = 'var(--vscode-editor-background, var(--vscode-editorWidget-background))';

	for (const node of nodes) {
		const g = document.createElementNS(SVG_NS, 'g');
		g.classList.add('chat-debug-flowchart-node');
		g.setAttribute('data-node-id', node.id);

		if (node.tooltip) {
			const title = document.createElementNS(SVG_NS, 'title');
			title.textContent = node.tooltip;
			g.appendChild(title);
		}

		const color = getNodeColor(node.kind, node.isError);
		const rectAttrs = { x: node.x, y: node.y, width: node.width, height: node.height, rx: NODE_BORDER_RADIUS, ry: NODE_BORDER_RADIUS };

		// Node rectangle
		g.appendChild(svgEl('rect', { ...rectAttrs, fill: nodeFill, stroke: color, 'stroke-width': node.isError ? 2 : 1.5 }));

		// Kind indicator (colored bar on the left, clipped to node shape)
		const clipId = `clip-${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
		const clipPath = svgEl('clipPath', { id: clipId });
		clipPath.appendChild(svgEl('rect', rectAttrs));
		svg.appendChild(clipPath);
		g.appendChild(svgEl('rect', { x: node.x, y: node.y, width: 4, height: node.height, fill: color, 'clip-path': `url(#${clipId})` }));

		// Label text
		const textX = node.x + NODE_PADDING_H;
		if (node.sublabel) {
			const label = svgEl('text', { x: textX, y: node.y + NODE_PADDING_V + FONT_SIZE, 'font-size': FONT_SIZE, fill: 'var(--vscode-foreground)', 'font-family': fontFamily });
			label.textContent = node.label;
			g.appendChild(label);

			const sub = svgEl('text', { x: textX, y: node.y + NODE_HEIGHT - NODE_PADDING_V, 'font-size': SUBLABEL_FONT_SIZE, fill: 'var(--vscode-descriptionForeground)', 'font-family': fontFamily });
			sub.textContent = node.sublabel;
			g.appendChild(sub);
		} else {
			const label = svgEl('text', { x: textX, y: node.y + NODE_HEIGHT / 2 + FONT_SIZE / 2 - 1, 'font-size': FONT_SIZE, fill: 'var(--vscode-foreground)', 'font-family': fontFamily });
			label.textContent = node.label;
			g.appendChild(label);
		}

		svg.appendChild(g);
	}
}
