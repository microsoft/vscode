/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
function groupChildren(children) {
    const subagentIndices = [];
    for (let i = 0; i < children.length; i++) {
        if (children[i].kind === 'subagentInvocation') {
            subagentIndices.push(i);
        }
    }
    if (subagentIndices.length < 2) {
        return [{ type: 'sequential', children }];
    }
    // Cluster subagents whose created timestamps are within the threshold.
    const parallelClusters = [];
    let cluster = [subagentIndices[0]];
    for (let k = 1; k < subagentIndices.length; k++) {
        const prevCreated = children[subagentIndices[k - 1]].created;
        const currCreated = children[subagentIndices[k]].created;
        if (Math.abs(currCreated - prevCreated) <= PARALLEL_TIME_THRESHOLD_MS) {
            cluster.push(subagentIndices[k]);
        }
        else {
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
    const parallelIndices = new Set();
    for (const c of parallelClusters) {
        for (const idx of c) {
            parallelIndices.add(idx);
        }
    }
    const groups = [];
    let clusterIdx = 0;
    let i = 0;
    while (i < children.length) {
        if (clusterIdx < parallelClusters.length && i === parallelClusters[clusterIdx][0]) {
            const cl = parallelClusters[clusterIdx];
            const lastIdx = cl[cl.length - 1];
            const setup = [];
            const subagents = [];
            for (let j = cl[0]; j <= lastIdx; j++) {
                if (parallelIndices.has(j)) {
                    subagents.push(children[j]);
                }
                else {
                    setup.push(children[j]);
                }
            }
            if (setup.length > 0) {
                groups.push({ type: 'sequential', children: setup });
            }
            groups.push({ type: 'parallel', children: subagents });
            i = lastIdx + 1;
            clusterIdx++;
        }
        else {
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
function isMessageKind(kind) {
    return kind === 'userMessage' || kind === 'agentResponse';
}
function measureNodeWidth(label, sublabel) {
    const charWidth = 7;
    const labelWidth = label.length * charWidth + NODE_PADDING_H * 2;
    const sublabelWidth = sublabel ? sublabel.length * (charWidth - 1) + NODE_PADDING_H * 2 : 0;
    return Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, labelWidth, sublabelWidth));
}
function subgraphHeaderLabel(node) {
    // For subagent nodes, the label already includes the description
    // (e.g. "Subagent: Count markdown files"), so don't append it again.
    if (node.kind === 'subagentInvocation') {
        return node.label;
    }
    if (node.description && node.description !== node.label) {
        return `${node.label}: ${node.description}`;
    }
    return node.label;
}
function measureSubgraphHeaderWidth(headerLabel) {
    return headerLabel.length * 6 + SUBGRAPH_PADDING * 2 + 20; // 20 for chevron
}
function countDescendants(node) {
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
function layoutGroups(groups, startX, startY, depth, prevExitNodes, result, collapsedIds, expandedMergedIds, pendingExpansions) {
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
        }
        else {
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
function makeEdge(from, to) {
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
export function layoutFlowGraph(roots, options) {
    if (roots.length === 0) {
        return { nodes: [], edges: [], subgraphs: [], width: 0, height: 0 };
    }
    const collapsedIds = options?.collapsedIds;
    const expandedMergedIds = options?.expandedMergedIds;
    const groups = groupChildren(roots);
    const pendingExpansions = [];
    const result = {
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
    centerLayout(result, width / 2);
    return { nodes: result.nodes, edges: result.edges, subgraphs: result.subgraphs, width, height };
}
/**
 * Pass 2: For each pending expansion, compute the Y range the children
 * will occupy, scan all already-placed nodes and subgraphs for the max
 * right edge overlapping that range, and place the entire column of
 * children to the right of that edge.
 */
function resolvePendingExpansions(pendingExpansions, result) {
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
        const childNodes = [];
        for (const child of children) {
            const childWidth = measureNodeWidth(child.label, child.sublabel);
            const childNode = {
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
function layoutSubtree(node, startX, y, depth, collapsedIds, expandedMergedIds, pendingExpansions) {
    const isMerged = (node.mergedNodes?.length ?? 0) >= 2;
    const isMergedExpanded = isMerged && expandedMergedIds?.has(node.id);
    const mergedExtra = isMerged ? MERGED_TOGGLE_WIDTH : 0;
    const nodeWidth = measureNodeWidth(node.label, node.sublabel) + mergedExtra;
    const isSubagent = node.kind === 'subagentInvocation';
    const isCollapsed = isSubagent && collapsedIds?.has(node.id);
    const nodeHeight = isMessageKind(node.kind) && node.sublabel ? MESSAGE_NODE_HEIGHT : NODE_HEIGHT;
    const layoutNode = {
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
        mergedCount: isMerged ? node.mergedNodes.length : undefined,
        isMergedExpanded,
    };
    const result = {
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
        pendingExpansions.push({ mergedNode: layoutNode, children: node.mergedNodes });
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
    const { exitNodes, maxWidth, endY } = layoutGroups(groups, startX + indentX, childStartY, childDepth, [layoutNode], result, collapsedIds, expandedMergedIds, pendingExpansions);
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
function layoutParallelGroup(children, startX, y, depth, collapsedIds, expandedMergedIds, pendingExpansions) {
    const subtreeLayouts = [];
    let totalWidth = 0;
    let maxHeight = 0;
    for (const child of children) {
        const subtree = layoutSubtree(child, 0, y, depth, collapsedIds, expandedMergedIds, pendingExpansions);
        subtreeLayouts.push(subtree);
        totalWidth += subtree.width;
        maxHeight = Math.max(maxHeight, subtree.height);
    }
    totalWidth += (children.length - 1) * PARALLEL_GAP_X;
    const nodes = [];
    const edges = [];
    const subgraphs = [];
    const entryNodes = [];
    const exitNodes = [];
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
        entryNodes.push(offsetNodes.find(n => n.id === subtree.entryNode.id));
        const exitIds = new Set(subtree.exitNodes.map(n => n.id));
        exitNodes.push(...offsetNodes.filter(n => exitIds.has(n.id)));
        currentX += subtree.width + PARALLEL_GAP_X;
    }
    return { nodes, edges, subgraphs, entryNodes, exitNodes, width: totalWidth, height: maxHeight };
}
function centerLayout(layout, centerX) {
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
        layout.nodes[i] = { ...n, x: n.x + dx };
    }
    for (let i = 0; i < layout.edges.length; i++) {
        const e = layout.edges[i];
        layout.edges[i] = { fromId: e.fromId, toId: e.toId, fromX: e.fromX + dx, fromY: e.fromY, toX: e.toX + dx, toY: e.toY };
    }
    for (let i = 0; i < layout.subgraphs.length; i++) {
        const s = layout.subgraphs[i];
        layout.subgraphs[i] = { ...s, x: s.x + dx };
    }
}
// ---- SVG Rendering ----
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}
function getNodeColor(kind, isError) {
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
export function renderFlowChartSVG(layout) {
    const focusableElements = new Map();
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
    const positionByKey = new Map();
    for (const sg of layout.subgraphs) {
        positionByKey.set(`sg:${sg.nodeId}`, { y: sg.y, x: sg.x });
    }
    for (const node of layout.nodes) {
        positionByKey.set(node.id, { y: node.y, x: node.x });
    }
    const sortedFocusable = new Map([...focusableElements.entries()].sort((a, b) => {
        const posA = positionByKey.get(a[0]);
        const posB = positionByKey.get(b[0]);
        if (!posA || !posB) {
            return 0;
        }
        return posA.y !== posB.y ? posA.y - posB.y : posA.x - posB.x;
    }));
    // Build adjacency map from edges so keyboard navigation can follow
    // graph directionality instead of visual sort order.
    const adjacency = new Map();
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
function renderSubgraphs(svg, subgraphs, focusableElements) {
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
        focusableElements.set(`sg:${sg.nodeId}`, headerGroup);
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
function renderEdges(svg, edges) {
    const strokeAttrs = { fill: 'none', stroke: 'var(--vscode-descriptionForeground)', 'stroke-width': EDGE_STROKE_WIDTH, 'stroke-linecap': 'round' };
    // allow-any-unicode-next-line
    const r = 6; // corner radius for 90° bends
    for (const edge of edges) {
        const midY = (edge.fromY + edge.toY) / 2;
        let d;
        const isHorizontal = edge.fromY === edge.toY;
        if (isHorizontal) {
            // Horizontally aligned: straight line (used by expanded merged nodes)
            d = `M ${edge.fromX} ${edge.fromY} L ${edge.toX} ${edge.toY}`;
        }
        else if (edge.fromX === edge.toX) {
            // Vertically aligned: straight line
            d = `M ${edge.fromX} ${edge.fromY} L ${edge.toX} ${edge.toY}`;
        }
        else {
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
        let arrowD;
        if (isHorizontal) {
            const signX = edge.toX > edge.fromX ? 1 : -1;
            arrowD = `M ${edge.toX - signX * a * 1.5} ${edge.toY - a} L ${edge.toX} ${edge.toY} L ${edge.toX - signX * a * 1.5} ${edge.toY + a}`;
        }
        else {
            arrowD = `M ${edge.toX - a} ${edge.toY - a * 1.5} L ${edge.toX} ${edge.toY} L ${edge.toX + a} ${edge.toY - a * 1.5}`;
        }
        svg.appendChild(svgEl('path', {
            ...strokeAttrs,
            'stroke-linejoin': 'round',
            d: arrowD,
        }));
    }
}
function renderNodes(svg, nodes, focusableElements) {
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
        focusableElements.set(node.id, g);
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
        }
        else if (node.sublabel) {
            const label = svgEl('text', { x: textX, y: node.y + NODE_PADDING_V + FONT_SIZE, 'font-size': FONT_SIZE, fill: 'var(--vscode-foreground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
            label.textContent = node.label;
            g.appendChild(label);
            const sub = svgEl('text', { x: textX, y: node.y + node.height - NODE_PADDING_V, 'font-size': SUBLABEL_FONT_SIZE, fill: 'var(--vscode-descriptionForeground)', 'font-family': fontFamily, 'clip-path': `url(#${clipId})` });
            sub.textContent = node.sublabel;
            g.appendChild(sub);
        }
        else {
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
function renderMergedToggle(g, node, color, fontFamily) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRmxvd0xheW91dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnRmxvd0xheW91dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyw2QkFBNkI7QUFFN0IsTUFBTSxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQ3ZCLE1BQU0sbUJBQW1CLEdBQUcsRUFBRSxDQUFDO0FBQy9CLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQztBQUMzQixNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFDM0IsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDO0FBQzFCLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQztBQUN6QixNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUM7QUFDdEIsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7QUFDN0IsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLENBQUM7QUFDOUIsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQ3JCLE1BQU0sa0JBQWtCLEdBQUcsRUFBRSxDQUFDO0FBQzlCLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO0FBQzVCLE1BQU0sY0FBYyxHQUFHLEVBQUUsQ0FBQztBQUMxQixNQUFNLGNBQWMsR0FBRyxFQUFFLENBQUM7QUFDMUIsTUFBTSxzQkFBc0IsR0FBRyxFQUFFLENBQUM7QUFDbEMsTUFBTSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBQ3ZCLE1BQU0sbUJBQW1CLEdBQUcsRUFBRSxDQUFDO0FBMkIvQiwrQkFBK0I7QUFFL0IseUZBQXlGO0FBQ3pGLE1BQU0sMEJBQTBCLEdBQUcsS0FBSyxDQUFDO0FBRXpDOzs7Ozs7OztHQVFHO0FBQ0gsU0FBUyxhQUFhLENBQUMsUUFBb0I7SUFDMUMsTUFBTSxlQUFlLEdBQWEsRUFB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QUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCxNQUFNLEVBQUUsR0FBRyxPQUFPLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRXZDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekIsTUFBTSxDQUFDLEtBQXNCLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztJQUMzRCxDQUFDO0lBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDOUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixNQUFNLENBQUMsS0FBc0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxSSxDQUFDO0lBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbEQsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QixNQUFNLENBQUMsU0FBNEIsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO0lBQ2pFLENBQUM7QUFDRixDQUFDO0FBRUQsMEJBQTBCO0FBRTFCLE1BQU0sTUFBTSxHQUFHLDRCQUE0QixDQUFDO0FBRTVDLFNBQVMsS0FBSyxDQUF1QyxHQUFNLEVBQUUsS0FBc0M7SUFDbEcsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDakQsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUM1QyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBQ0QsT0FBTyxFQUFFLENBQUM7QUFDWCxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsSUFBNkIsRUFBRSxPQUFpQjtJQUNyRSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ2IsT0FBTywrQkFBK0IsQ0FBQztJQUN4QyxDQUFDO0lBQ0QsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLEtBQUssYUFBYTtZQUNqQixPQUFPLG1DQUFtQyxDQUFDO1FBQzVDLEtBQUssV0FBVztZQUNmLE9BQU8sOERBQThELENBQUM7UUFDdkUsS0FBSyxVQUFVO1lBQ2QsT0FBTywyQ0FBMkMsQ0FBQztRQUNwRCxLQUFLLG9CQUFvQjtZQUN4QixPQUFPLHNDQUFzQyxDQUFDO1FBQy9DLEtBQUssZUFBZTtZQUNuQixPQUFPLDBCQUEwQixDQUFDO1FBQ25DLEtBQUssU0FBUztZQUNiLE9BQU8scUNBQXFDLENBQUM7SUFDL0MsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGVBQWUsR0FBRztJQUN2QixzQ0FBc0M7SUFDdEMsb0NBQW9DO0lBQ3BDLHNDQUFzQztJQUN0QyxzQ0FBc0M7Q0FDdEMsQ0FBQztBQUVGLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxNQUFrQjtJQUNwRCxNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO0lBQ3hELE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUU7UUFDeEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO1FBQ25CLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtRQUNyQixPQUFPLEVBQUUsT0FBTyxNQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUU7UUFDL0MsSUFBSSxFQUFFLEtBQUs7UUFDWCxZQUFZLEVBQUUseUJBQXlCLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxRQUFRO0tBQ2xFLENBQUMsQ0FBQztJQUNILEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFFOUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDMUQsV0FBVyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0IsV0FBVyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFFbEQsNEVBQTRFO0lBQzVFLHVEQUF1RDtJQUN2RCxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBb0MsQ0FBQztJQUNsRSxLQUFLLE1BQU0sRUFBRSxJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNuQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFDRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNqQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUNELE1BQU0sZUFBZSxHQUFHLElBQUksR0FBRyxDQUM5QixDQUFDLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDOUMsTUFBTSxJQUFJLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLElBQUksR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsQ0FBQztRQUNWLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUQsQ0FBQyxDQUFDLENBQ0YsQ0FBQztJQUVGLG1FQUFtRTtJQUNuRSxxREFBcUQ7SUFDckQsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLEVBQThDLENBQUM7SUFDeEUsS0FBSyxNQUFNLElBQUksSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDakMsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM5QixJQUFJLFNBQVMsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hCLFNBQVMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDO2dCQUNuQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUNELFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUUvQixJQUFJLE9BQU8sR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsT0FBTyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBQ2pDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsQ0FBQztBQUN6RixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsR0FBZSxFQUFFLFNBQWtDLEVBQUUsaUJBQTBDO0lBQ3ZILEtBQUssSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxFQUFFLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVCLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxFQUFFLENBQUMsS0FBSyxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqRSxNQUFNLFdBQVcsR0FBRyxFQUFFLENBQUMsbUJBQW1CLEtBQUssU0FBUyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFFakQsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLGtCQUFrQixFQUFFLENBQUM7UUFDM0gsTUFBTSxNQUFNLEdBQUcsV0FBVyxLQUFLLEVBQUUsQ0FBQztRQUVsQywrQkFBK0I7UUFDL0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ25ELFFBQVEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQy9DLEdBQUcsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFMUIsb0JBQW9CO1FBQ3BCLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLElBQUksR0FBRyxFQUFFLENBQUMsS0FBSyxHQUFHLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3RixnQkFBZ0I7UUFDaEIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxTQUFTLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFeEksY0FBYztRQUNkLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxRQUFRLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXRKLGdEQUFnRDtRQUNoRCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMxRCxXQUFXLENBQUMsWUFBWSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN4RCxXQUFXLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO1FBQ2xFLFdBQVcsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLFdBQVcsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDaEUsV0FBVyxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxVQUFVLEdBQUcsV0FBVyxJQUFJLEVBQUUsQ0FBQyxtQkFBbUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLG1CQUFtQixlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFek0sTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLFFBQVEsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ25LLFdBQVcsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbkMseUJBQXlCO1FBQ3pCLE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDbEQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUNoQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxZQUFZLEdBQUcsQ0FBQztZQUMxQixDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxzQkFBc0IsR0FBRyxDQUFDLEdBQUcsQ0FBQztZQUN4QyxXQUFXLEVBQUUsa0JBQWtCO1lBQy9CLElBQUksRUFBRSxLQUFLO1lBQ1gsYUFBYSxFQUFFLHVDQUF1QztZQUN0RCxhQUFhLEVBQUUsS0FBSztTQUNwQixDQUFDLENBQUM7UUFDSCxVQUFVLENBQUMsV0FBVyxHQUFHLEdBQUcsT0FBTyxJQUFJLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNsRCxXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDM0IsaUJBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLFdBQW9DLENBQUMsQ0FBQztRQUUvRSxrQkFBa0I7UUFDbEIsSUFBSSxXQUFXLElBQUksRUFBRSxDQUFDLG1CQUFtQixLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUU7Z0JBQy9CLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLEdBQUcsQ0FBQztnQkFDdEIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsc0JBQXNCLEdBQUcsZ0JBQWdCLEdBQUcsQ0FBQztnQkFDdkQsV0FBVyxFQUFFLGtCQUFrQjtnQkFDL0IsSUFBSSxFQUFFLHFDQUFxQztnQkFDM0MsYUFBYSxFQUFFLHVDQUF1QztnQkFDdEQsWUFBWSxFQUFFLFFBQVE7Z0JBQ3RCLGFBQWEsRUFBRSxRQUFRO2FBQ3ZCLENBQUMsQ0FBQztZQUNILFNBQVMsQ0FBQyxXQUFXLEdBQUcsSUFBSSxFQUFFLENBQUMsbUJBQW1CLFFBQVEsQ0FBQztZQUMzRCxDQUFDLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFFRCxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsR0FBZSxFQUFFLEtBQTRCO0lBQ2pFLE1BQU0sV0FBVyxHQUFHLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUscUNBQXFDLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQ2xKLDhCQUE4QjtJQUM5QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyw4QkFBOEI7SUFFM0MsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUMxQixNQUFNLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQVMsQ0FBQztRQUNkLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUU3QyxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLHNFQUFzRTtZQUN0RSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLE1BQU0sSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDL0QsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDcEMsb0NBQW9DO1lBQ3BDLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssTUFBTSxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMvRCxDQUFDO2FBQU0sQ0FBQztZQUNQLDhCQUE4QjtZQUM5QixxREFBcUQ7WUFDckQsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ2pDLE1BQU0sS0FBSyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzQixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFL0QsQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO2dCQUNsQyxxQkFBcUI7a0JBQ25CLE1BQU0sSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLEdBQUcsRUFBRSxFQUFFO2dCQUNqQyw4QkFBOEI7Z0JBQzlCLDZCQUE2QjtrQkFDM0IsTUFBTSxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssR0FBRyxFQUFFLElBQUksSUFBSSxFQUFFO2dCQUNoRSw0QkFBNEI7a0JBQzFCLE1BQU0sSUFBSSxDQUFDLEdBQUcsR0FBRyxLQUFLLEdBQUcsRUFBRSxJQUFJLElBQUksRUFBRTtnQkFDdkMsOEJBQThCO2dCQUM5Qix1QkFBdUI7a0JBQ3JCLE1BQU0sSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLEtBQUssSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsRUFBRSxFQUFFO2dCQUNwRCxpQkFBaUI7a0JBQ2YsTUFBTSxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNqQyxDQUFDO1FBRUQsR0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXRELDBFQUEwRTtRQUMxRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWixJQUFJLE1BQWMsQ0FBQztRQUNuQixJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLEdBQUcsS0FBSyxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDdEksQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLEdBQUcsS0FBSyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ3RILENBQUM7UUFDRCxHQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUU7WUFDN0IsR0FBRyxXQUFXO1lBQ2QsaUJBQWlCLEVBQUUsT0FBTztZQUMxQixDQUFDLEVBQUUsTUFBTTtTQUNULENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxHQUFlLEVBQUUsS0FBNEIsRUFBRSxpQkFBMEM7SUFDN0csTUFBTSxVQUFVLEdBQUcsdUNBQXVDLENBQUM7SUFDM0QsTUFBTSxRQUFRLEdBQUcsd0VBQXdFLENBQUM7SUFFMUYsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUMxQixNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoRCxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxZQUFZLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUU5QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ2pGLENBQUMsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3hDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQTBCLENBQUMsQ0FBQztRQUUzRCxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN4RCxLQUFLLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDakMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNyRCxNQUFNLFNBQVMsR0FBRyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztRQUVuSSwwQ0FBMEM7UUFDMUMsTUFBTSxNQUFNLEdBQUcsUUFBUSxNQUFNLEVBQUUsQ0FBQztRQUNoQyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbkQsUUFBUSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDL0MsR0FBRyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUUxQiwwREFBMEQ7UUFDMUQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUMzQixLQUFLLEVBQUUsaUNBQWlDO1lBQ3hDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLFdBQVc7WUFDdkIsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsV0FBVztZQUN2QixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLEdBQUcsQ0FBQztZQUNuQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLEdBQUcsQ0FBQztZQUNyQyxFQUFFLEVBQUUsa0JBQWtCLEdBQUcsV0FBVztZQUNwQyxFQUFFLEVBQUUsa0JBQWtCLEdBQUcsV0FBVztZQUNwQyxJQUFJLEVBQUUsTUFBTTtZQUNaLE1BQU0sRUFBRSwyQkFBMkI7WUFDbkMsY0FBYyxFQUFFLENBQUM7U0FDakIsQ0FBQyxDQUFDLENBQUM7UUFFSixpQkFBaUI7UUFDakIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxTQUFTLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0SCxzQ0FBc0M7UUFDdEMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxRQUFRLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRW5JLGFBQWE7UUFDYixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLGNBQWMsQ0FBQztRQUN0QyxNQUFNLFNBQVMsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNoQywwREFBMEQ7WUFDMUQsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsY0FBYyxHQUFHLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUscUNBQXFDLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsUUFBUSxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDck8sTUFBTSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFdEIsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxjQUFjLEdBQUcsQ0FBQyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLDBCQUEwQixFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFFBQVEsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQzNNLEdBQUcsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztZQUNoQyxDQUFDLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BCLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMxQixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxjQUFjLEdBQUcsU0FBUyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLDBCQUEwQixFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFFBQVEsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZNLEtBQUssQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUMvQixDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJCLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUscUNBQXFDLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsUUFBUSxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDM04sR0FBRyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEIsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRyxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSwwQkFBMEIsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxRQUFRLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQztZQUNoTixLQUFLLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDL0IsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBRUQsNERBQTREO1FBQzVELElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3RCLENBQUMsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDekMsa0JBQWtCLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEIsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLENBQVUsRUFBRSxJQUFnQixFQUFFLEtBQWEsRUFBRSxVQUFrQjtJQUMxRixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsbUJBQW1CLENBQUM7SUFDMUQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDMUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztJQUNoRSxXQUFXLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVwRCxpQkFBaUI7SUFDakIsV0FBVyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ3JDLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUMzQixFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUN6QyxNQUFNLEVBQUUscUNBQXFDO1FBQzdDLGNBQWMsRUFBRSxHQUFHO1FBQ25CLE9BQU8sRUFBRSxHQUFHO0tBQ1osQ0FBQyxDQUFDLENBQUM7SUFFSiw4QkFBOEI7SUFDOUIsMkNBQTJDO0lBQzNDLE1BQU0sUUFBUSxHQUFHLE9BQU8sR0FBRyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7SUFDbkQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUMxQyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQzdCLENBQUMsRUFBRSxRQUFRO1FBQ1gsQ0FBQyxFQUFFLFFBQVEsR0FBRyxDQUFDO1FBQ2YsV0FBVyxFQUFFLENBQUM7UUFDZCxJQUFJLEVBQUUsS0FBSztRQUNYLGFBQWEsRUFBRSxVQUFVO1FBQ3pCLGFBQWEsRUFBRSxRQUFRO1FBQ3ZCLE1BQU0sRUFBRSxTQUFTO0tBQ2pCLENBQUMsQ0FBQztJQUNILDhCQUE4QjtJQUM5QixPQUFPLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTO0lBQzVFLFdBQVcsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFakMsb0VBQW9FO0lBQ3BFLFdBQVcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRTtRQUNyQyxDQUFDLEVBQUUsT0FBTztRQUNWLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNULEtBQUssRUFBRSxtQkFBbUI7UUFDMUIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1FBQ25CLElBQUksRUFBRSxhQUFhO1FBQ25CLE1BQU0sRUFBRSxTQUFTO0tBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBRUosQ0FBQyxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1QixDQUFDIn0=