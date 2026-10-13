/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Retainer Path Analysis
 *
 * Finds what keeps objects alive in the heap by tracing non-weak
 * reverse edges from target objects to GC roots.
 */

import { type HeapGraph, type HeapNode } from './parseSnapshot.ts';

export interface RetainerPathOptions {
	/** Maximum number of paths to find per target class. Default: 5. */
	maxPaths?: number;
	/** Maximum BFS depth. Default: 25. */
	maxDepth?: number;
	/** Maximum number of instances to attempt before giving up. Default: 200. */
	maxAttempts?: number;
}

/**
 * Find retainer paths for all instances of a named class.
 * Skips weak edges so only genuine retainers are reported.
 *
 * @returns The number of paths found.
 */
export function findRetainerPaths(
	graph: HeapGraph,
	targetName: string,
	options: RetainerPathOptions = {},
): number {
	const { maxPaths = 5, maxDepth = 25, maxAttempts = 200 } = options;

	// Find target nodes
	const targets: number[] = [];
	for (let i = 0; i < graph.nodes.length; i++) {
		if (graph.nodes[i].name === targetName && graph.nodes[i].type === 'object') {
			targets.push(i);
		}
	}

	console.log(`Found ${targets.length} instances of ${targetName}`);

	let pathsFound = 0;
	let attempts = 0;
	let unreachable = 0;
	for (const targetIdx of targets) {
		if (pathsFound >= maxPaths) { break; }
		if (attempts >= maxAttempts) {
			console.log(`  (stopped after ${maxAttempts} attempts, ${unreachable} unreachable)`);
			break;
		}
		attempts++;

		const path = bfsToRoot(graph, targetIdx, maxDepth);
		if (path) {
			console.log(`\nPath #${pathsFound + 1} for ${targetName} (id:${graph.nodes[targetIdx].id}):`);
			printPath(graph, path);
			pathsFound++;
		} else {
			unreachable++;
		}
	}

	if (pathsFound === 0 && unreachable > 0) {
		console.log(`  No retainer paths found (${unreachable} instances unreachable — likely pending GC)`);
	}

	return pathsFound;
}

/**
 * Find ALL non-weak retainers of a specific node (by node index).
 * Returns the immediate parent nodes that reference this node.
 */
export function findDirectRetainers(
	graph: HeapGraph,
	nodeIndex: number,
): { node: HeapNode; edgeName: string; edgeType: string }[] {
	const incoming = graph.reverseEdges.get(nodeIndex) || [];
	return incoming.map(edge => ({
		node: graph.nodes[edge.fromNodeIndex],
		edgeName: edge.edgeName,
		edgeType: edge.edgeType,
	}));
}

/**
 * Find a node by its heap ID and optional name filter.
 */
export function findNodeById(graph: HeapGraph, id: number, name?: string): number {
	for (let i = 0; i < graph.nodes.length; i++) {
		if (graph.nodes[i].id === id && (!name || graph.nodes[i].name === name)) {
			return i;
		}
	}
	return -1;
}

/**
 * Find all instances of a named class.
 */
export function findNodesByName(graph: HeapGraph, name: string, type = 'object'): HeapNode[] {
	return graph.nodes.filter(n => n.name === name && n.type === type);
}

// ---- Internal ----

function bfsToRoot(graph: HeapGraph, startNi: number, maxDepth: number): number[] | null {
	const visited = new Set<number>();
	// Use parent pointers instead of copying full paths — much faster for large graphs
	const parent = new Map<number, number>();
	const queue: number[] = [startNi];
	const depth = new Map<number, number>();
	visited.add(startNi);
	depth.set(startNi, 0);
	let head = 0;

	while (head < queue.length) {
		const current = queue[head++];
		const currentDepth = depth.get(current)!;

		if (currentDepth > maxDepth) { continue; }

		const node = graph.nodes[current];
		if (node.type === 'synthetic' || current === 0) {
			// Reconstruct path from parent pointers
			const path: number[] = [];
			let cur: number | undefined = current;
			while (cur !== undefined) {
				path.push(cur);
				cur = parent.get(cur);
			}
			path.reverse();
			return path;
		}

		const incoming = graph.reverseEdges.get(current) || [];
		for (const edge of incoming) {
			if (!visited.has(edge.fromNodeIndex)) {
				visited.add(edge.fromNodeIndex);
				parent.set(edge.fromNodeIndex, current);
				depth.set(edge.fromNodeIndex, currentDepth + 1);
				queue.push(edge.fromNodeIndex);
			}
		}
	}

	return null;
}

function printPath(graph: HeapGraph, path: number[]): void {
	for (let idx = 0; idx < path.length; idx++) {
		const n = graph.nodes[path[idx]];
		let edgeLabel = '';
		if (idx > 0) {
			const prevNi = path[idx - 1];
			const edges = graph.reverseEdges.get(prevNi) || [];
			const edge = edges.find(e => e.fromNodeIndex === path[idx]);
			edgeLabel = edge ? ` <--[${edge.edgeName}(${edge.edgeType})]-- ` : ' <-- ';
		}
		console.log(`  ${edgeLabel}${n.type}::${n.name}(${n.id})`);
	}
}
