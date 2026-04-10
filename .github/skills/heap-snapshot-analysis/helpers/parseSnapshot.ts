/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * V8 Heap Snapshot Parser
 *
 * Parses .heapsnapshot files that are too large for JSON.parse by using
 * Buffer-based section extraction. Provides a graph structure for
 * retainer path analysis.
 */

import { readFileSync, statSync } from 'fs';

export interface SnapshotMeta {
	node_fields: string[];
	node_types: string[][];
	edge_fields: string[];
	edge_types: string[][];
}

export interface SnapshotData {
	meta: SnapshotMeta;
	nodes: number[];
	edges: number[];
	strings: string[];
}

export interface HeapNode {
	type: string;
	name: string;
	id: number;
	selfSize: number;
	edgeCount: number;
	nodeIndex: number;
}

export interface HeapEdge {
	type: string;
	name: string;
	toNodeIndex: number;
}

export interface HeapGraph {
	nodes: HeapNode[];
	/** Forward edges per node index */
	forwardEdges: HeapEdge[][];
	/** Reverse edges per node index (non-weak only) */
	reverseEdges: Map<number, { fromNodeIndex: number; edgeName: string; edgeType: string }[]>;
	strings: string[];
}

/**
 * Parse a V8 heap snapshot file.
 * Uses Buffer-based extraction to handle files larger than V8's string limit.
 */
export function parseSnapshot(path: string): SnapshotData {
	console.log(`Parsing ${path}...`);
	const startTime = Date.now();
	const stat = statSync(path);
	console.log(`  File size: ${(stat.size / 1024 / 1024).toFixed(0)}MB`);

	const buf = readFileSync(path);
	console.log(`  Read in ${Date.now() - startTime}ms`);

	// Parse meta
	const metaKeyPos = buf.indexOf(Buffer.from('"meta"'));
	if (metaKeyPos === -1) { throw new Error('meta section not found in snapshot'); }
	const metaBraceStart = buf.indexOf(Buffer.from('{'), metaKeyPos);
	if (metaBraceStart === -1) { throw new Error('meta section opening brace not found'); }
	let depth = 0, metaBraceEnd = -1;
	for (let i = metaBraceStart; i < buf.length; i++) {
		if (buf[i] === 0x7B) { depth++; }
		else if (buf[i] === 0x7D) { depth--; if (depth === 0) { metaBraceEnd = i + 1; break; } }
		if (buf[i] === 0x22) { i++; while (i < buf.length) { if (buf[i] === 0x5C) { i++; } else if (buf[i] === 0x22) { break; } i++; } }
	}
	const meta: SnapshotMeta = JSON.parse(buf.subarray(metaBraceStart, metaBraceEnd).toString('utf8'));
	console.log(`  node_fields: ${meta.node_fields.join(', ')}`);

	// Extract nodes array
	const nodesKeyBuf = Buffer.from('"nodes":[');
	const nodesPos = buf.indexOf(nodesKeyBuf);
	if (nodesPos === -1) { throw new Error('nodes array not found in snapshot'); }
	const nodesArrayStart = nodesPos + 8;
	const nodesEnd = buf.indexOf(Buffer.from(']'), nodesArrayStart);
	const nodes = buf.subarray(nodesArrayStart + 1, nodesEnd).toString('utf8').split(',').map(Number);
	const nodeFieldCount = meta.node_fields.length;
	console.log(`  Parsed ${nodes.length / nodeFieldCount} nodes in ${Date.now() - startTime}ms`);

	// Extract edges array
	const edgesKeyBuf = Buffer.from('"edges":[');
	const edgesPos = buf.indexOf(edgesKeyBuf);
	if (edgesPos === -1) { throw new Error('edges array not found in snapshot'); }
	const edgesArrayStart = edgesPos + 8;
	const edgesEnd = buf.indexOf(Buffer.from(']'), edgesArrayStart);
	const edges = buf.subarray(edgesArrayStart + 1, edgesEnd).toString('utf8').split(',').map(Number);
	console.log(`  Parsed ${edges.length / meta.edge_fields.length} edges in ${Date.now() - startTime}ms`);

	// Extract strings array
	const stringsKeyBuf = Buffer.from('"strings":[');
	let stringsPos = -1;
	for (let i = buf.length - 100; i >= 0; i--) {
		if (buf[i] === 0x22 && buf.subarray(i, i + 11).equals(stringsKeyBuf)) {
			stringsPos = i;
			break;
		}
	}
	if (stringsPos === -1) { throw new Error('strings array not found'); }

	const stringsArrayStart = stringsPos + 10;
	depth = 0;
	let stringsEnd = -1;
	for (let i = stringsArrayStart; i < buf.length; i++) {
		if (buf[i] === 0x5B) { depth++; }
		else if (buf[i] === 0x5D) { depth--; if (depth === 0) { stringsEnd = i + 1; break; } }
		if (buf[i] === 0x22) { i++; while (i < buf.length) { if (buf[i] === 0x5C) { i++; } else if (buf[i] === 0x22) { break; } i++; } }
	}
	if (stringsEnd === -1) { throw new Error('strings array end not found'); }

	const strings: string[] = JSON.parse(buf.subarray(stringsArrayStart, stringsEnd).toString('utf8'));
	console.log(`  Parsed ${strings.length} strings in ${Date.now() - startTime}ms`);

	return { meta, nodes, edges, strings };
}

/**
 * Build a graph structure from parsed snapshot data.
 * Includes both forward edges (for traversal) and reverse edges (for retainer analysis).
 * Reverse edges exclude weak references since they don't prevent GC.
 */
export function buildGraph(data: SnapshotData): HeapGraph {
	const { meta, nodes, edges, strings } = data;
	const nfc = meta.node_fields.length;
	const efc = meta.edge_fields.length;
	const nodeTypes = meta.node_types[0];
	const edgeTypes = meta.edge_types[0];

	const typeIdx = meta.node_fields.indexOf('type');
	const nameIdx = meta.node_fields.indexOf('name');
	const idIdx = meta.node_fields.indexOf('id');
	const selfSizeIdx = meta.node_fields.indexOf('self_size');
	const edgeCountIdx = meta.node_fields.indexOf('edge_count');

	const eTypeIdx = meta.edge_fields.indexOf('type');
	const eNameIdx = meta.edge_fields.indexOf('name_or_index');
	const eToIdx = meta.edge_fields.indexOf('to_node');

	const nodeCount = nodes.length / nfc;
	const heapNodes: HeapNode[] = [];

	for (let i = 0; i < nodes.length; i += nfc) {
		heapNodes.push({
			type: nodeTypes[nodes[i + typeIdx]],
			name: strings[nodes[i + nameIdx]],
			id: nodes[i + idIdx],
			selfSize: nodes[i + selfSizeIdx],
			edgeCount: nodes[i + edgeCountIdx],
			nodeIndex: i / nfc,
		});
	}

	// Build forward edges and reverse edges (non-weak)
	const forwardEdges: HeapEdge[][] = new Array(nodeCount);
	const reverseEdges = new Map<number, { fromNodeIndex: number; edgeName: string; edgeType: string }[]>();
	let edgeOffset = 0;

	for (let ni = 0; ni < nodeCount; ni++) {
		const ec = heapNodes[ni].edgeCount;
		const myEdges: HeapEdge[] = [];

		for (let j = 0; j < ec; j++) {
			const base = (edgeOffset + j) * efc;
			const edgeType = edgeTypes[edges[base + eTypeIdx]];
			const nameOrIndex = edges[base + eNameIdx];
			const toNodeOffset = edges[base + eToIdx];
			const toNodeIndex = toNodeOffset / nfc;
			const edgeName = (edgeType === 'element' || edgeType === 'hidden')
				? String(nameOrIndex)
				: strings[nameOrIndex];

			myEdges.push({ type: edgeType, name: edgeName, toNodeIndex });

			// Build reverse edges, skipping weak refs
			if (edgeType !== 'weak') {
				if (!reverseEdges.has(toNodeIndex)) {
					reverseEdges.set(toNodeIndex, []);
				}
				reverseEdges.get(toNodeIndex)!.push({ fromNodeIndex: ni, edgeName, edgeType });
			}
		}

		forwardEdges[ni] = myEdges;
		edgeOffset += ec;
	}

	return { nodes: heapNodes, forwardEdges, reverseEdges, strings };
}

/**
 * Collect all node IDs from a snapshot for before/after comparison.
 */
export function collectNodeIds(data: SnapshotData): Set<number> {
	const ids = new Set<number>();
	const nfc = data.meta.node_fields.length;
	const idIdx = data.meta.node_fields.indexOf('id');
	for (let i = 0; i < data.nodes.length; i += nfc) {
		ids.add(data.nodes[i + idIdx]);
	}
	return ids;
}
