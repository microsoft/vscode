/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nodeKey, Ros2NodeLanguage, Ros2WorkspaceGraph } from './ros2WorkspaceModel.js';

/**
 * Pure layout engine for the ROS2 communication graph view (REQ-5). Turns the
 * Workspace Knowledge Graph into positioned vertices and edges — a layered,
 * left-to-right data-flow drawing (publishers → topics → subscribers). No DOM
 * or rendering dependencies so the algorithm is unit-testable.
 */

export type Ros2GraphVertexKind = 'node' | 'topic';

export type Ros2GraphEdgeKind = 'topic' | 'service' | 'action';

export interface Ros2GraphVertex {
	/** `node:<pkg>/<node>` or `topic:<name>` — stable across relayouts. */
	readonly id: string;
	readonly kind: Ros2GraphVertexKind;
	readonly label: string;
	/** Package name for nodes; message type for topics (when known). */
	readonly sublabel?: string;
	/** Source language, node vertices only. */
	readonly language?: Ros2NodeLanguage;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface Ros2GraphEdge {
	/** Vertex id the edge leaves from. */
	readonly source: string;
	/** Vertex id the edge points to. */
	readonly target: string;
	/** Topic edges are solid; service/action links render dashed. */
	readonly kind: Ros2GraphEdgeKind;
	/** Service/action name for direct node→node links. */
	readonly label?: string;
}

export interface Ros2GraphLayoutOptions {
	/** Restrict the drawing to nodes of these packages (and the topics they touch). */
	readonly packages?: readonly string[];
}

export interface Ros2GraphLayoutResult {
	readonly vertices: readonly Ros2GraphVertex[];
	readonly edges: readonly Ros2GraphEdge[];
	/** Total drawing extent, including a margin on every side. */
	readonly width: number;
	readonly height: number;
}

const MARGIN = 24;
const COLUMN_GAP = 96;
const ROW_GAP = 28;
const NODE_HEIGHT = 44;
const TOPIC_HEIGHT = 34;
const MIN_WIDTH = 72;
const MAX_WIDTH = 280;
const CHAR_WIDTH = 7.2;
const LABEL_PADDING = 28;

function vertexWidth(label: string, sublabel: string | undefined): number {
	const chars = Math.max(label.length, sublabel?.length ?? 0);
	return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(chars * CHAR_WIDTH) + LABEL_PADDING));
}

export function nodeVertexId(pkg: string, node: string): string {
	return `node:${nodeKey(pkg, node)}`;
}

export function topicVertexId(topic: string): string {
	return `topic:${topic}`;
}

interface MutableVertex {
	readonly id: string;
	readonly kind: Ros2GraphVertexKind;
	readonly label: string;
	readonly sublabel?: string;
	readonly language?: Ros2NodeLanguage;
	readonly width: number;
	readonly height: number;
	layer: number;
	/** Row index within the layer, refined by the barycenter sweeps. */
	order: number;
	x: number;
	y: number;
}

/**
 * Compute a deterministic layered layout of the workspace communication graph.
 * Layering is longest-path over the pub/sub/service digraph (cycles are broken
 * on DFS back-edges); vertical order within a layer is refined with barycenter
 * sweeps to reduce edge crossings.
 */
export function computeRos2GraphLayout(graph: Ros2WorkspaceGraph, options?: Ros2GraphLayoutOptions): Ros2GraphLayoutResult {
	const packageFilter = options?.packages && options.packages.length > 0 ? new Set(options.packages) : undefined;

	// --- Vertices -----------------------------------------------------------

	const vertices = new Map<string, MutableVertex>();
	const includedNodeKeys = new Set<string>();

	for (const node of graph.nodes) {
		if (packageFilter && !packageFilter.has(node.package)) {
			continue;
		}
		includedNodeKeys.add(nodeKey(node.package, node.name));
		const id = nodeVertexId(node.package, node.name);
		if (!vertices.has(id)) {
			vertices.set(id, {
				id, kind: 'node', label: node.name, sublabel: node.package, language: node.language,
				width: vertexWidth(node.name, node.package), height: NODE_HEIGHT,
				layer: 0, order: 0, x: 0, y: 0
			});
		}
	}

	// --- Edges --------------------------------------------------------------

	const edges: Ros2GraphEdge[] = [];

	for (const topic of graph.topics) {
		const publishers = topic.publishers.filter(k => includedNodeKeys.has(k));
		const subscribers = topic.subscribers.filter(k => includedNodeKeys.has(k));
		if (publishers.length === 0 && subscribers.length === 0) {
			continue;
		}
		const id = topicVertexId(topic.name);
		if (!vertices.has(id)) {
			vertices.set(id, {
				id, kind: 'topic', label: topic.name, sublabel: topic.messageType,
				width: vertexWidth(topic.name, topic.messageType), height: TOPIC_HEIGHT,
				layer: 0, order: 0, x: 0, y: 0
			});
		}
		for (const pub of publishers) {
			edges.push({ source: `node:${pub}`, target: id, kind: 'topic' });
		}
		for (const sub of subscribers) {
			edges.push({ source: id, target: `node:${sub}`, kind: 'topic' });
		}
	}

	// Service/action links: connect clients to servers of the same name with a
	// direct dashed edge (no intermediate vertex).
	for (const family of ['service', 'action'] as const) {
		const servers = new Map<string, string[]>();
		const clients = new Map<string, string[]>();
		for (const comm of graph.communications) {
			if (!includedNodeKeys.has(nodeKey(comm.package, comm.node))) {
				continue;
			}
			const into = comm.kind === `${family}_server` ? servers : comm.kind === `${family}_client` ? clients : undefined;
			if (into) {
				const list = into.get(comm.name) ?? [];
				list.push(nodeVertexId(comm.package, comm.node));
				into.set(comm.name, list);
			}
		}
		for (const [name, clientIds] of clients) {
			for (const serverId of servers.get(name) ?? []) {
				for (const clientId of clientIds) {
					if (clientId !== serverId) {
						edges.push({ source: clientId, target: serverId, kind: family, label: name });
					}
				}
			}
		}
	}

	// --- Layering (longest path, cycle-safe) --------------------------------

	const sortedIds = [...vertices.keys()].sort();
	const outgoing = new Map<string, string[]>();
	for (const edge of edges) {
		const list = outgoing.get(edge.source) ?? [];
		list.push(edge.target);
		outgoing.set(edge.source, list);
	}
	for (const list of outgoing.values()) {
		list.sort();
	}

	// Iterative DFS marking back-edges so cyclic graphs (A→t→B→t2→A) terminate.
	const WHITE = 0, GRAY = 1, BLACK = 2;
	const color = new Map<string, number>(sortedIds.map(id => [id, WHITE]));
	const backEdges = new Set<string>();
	// NUL separator: it cannot occur in a vertex id, so the key is collision-proof.
	const edgeKeyOf = (source: string, target: string) => `${source}\u0000${target}`;
	for (const rootId of sortedIds) {
		if (color.get(rootId) !== WHITE) {
			continue;
		}
		const stack: { id: string; next: number }[] = [{ id: rootId, next: 0 }];
		color.set(rootId, GRAY);
		while (stack.length > 0) {
			const frame = stack[stack.length - 1];
			const targets = outgoing.get(frame.id) ?? [];
			if (frame.next < targets.length) {
				const target = targets[frame.next++];
				const targetColor = color.get(target);
				if (targetColor === GRAY) {
					backEdges.add(edgeKeyOf(frame.id, target));
				} else if (targetColor === WHITE) {
					color.set(target, GRAY);
					stack.push({ id: target, next: 0 });
				}
			} else {
				color.set(frame.id, BLACK);
				stack.pop();
			}
		}
	}

	const forwardIncoming = new Map<string, string[]>();
	const forwardOutgoing = new Map<string, string[]>();
	const inDegree = new Map<string, number>(sortedIds.map(id => [id, 0]));
	for (const edge of edges) {
		if (backEdges.has(edgeKeyOf(edge.source, edge.target))) {
			continue;
		}
		let out = forwardOutgoing.get(edge.source);
		if (!out) {
			forwardOutgoing.set(edge.source, out = []);
		}
		out.push(edge.target);
		let into = forwardIncoming.get(edge.target);
		if (!into) {
			forwardIncoming.set(edge.target, into = []);
		}
		into.push(edge.source);
		inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
	}

	// Kahn topological pass assigning layer = max(pred layer) + 1.
	const queue = sortedIds.filter(id => (inDegree.get(id) ?? 0) === 0);
	const remaining = new Map(inDegree);
	while (queue.length > 0) {
		const id = queue.shift()!;
		const vertex = vertices.get(id)!;
		for (const target of forwardOutgoing.get(id) ?? []) {
			const targetVertex = vertices.get(target)!;
			targetVertex.layer = Math.max(targetVertex.layer, vertex.layer + 1);
			const left = remaining.get(target)! - 1;
			remaining.set(target, left);
			if (left === 0) {
				queue.push(target);
			}
		}
	}

	// Isolated vertices (nothing in, nothing out) go to a trailing column so
	// they do not interleave with the data-flow columns.
	const connected = new Set<string>();
	for (const edge of edges) {
		connected.add(edge.source);
		connected.add(edge.target);
	}
	let maxConnectedLayer = 0;
	for (const id of connected) {
		maxConnectedLayer = Math.max(maxConnectedLayer, vertices.get(id)!.layer);
	}
	for (const id of sortedIds) {
		if (!connected.has(id)) {
			vertices.get(id)!.layer = connected.size > 0 ? maxConnectedLayer + 1 : 0;
		}
	}

	// --- Ordering within layers (barycenter sweeps) -------------------------

	const layers: MutableVertex[][] = [];
	for (const id of sortedIds) {
		const vertex = vertices.get(id)!;
		(layers[vertex.layer] ??= []).push(vertex);
	}
	for (const layer of layers) {
		layer?.forEach((vertex, index) => { vertex.order = index; });
	}

	const neighborOrders = (id: string, neighbors: Map<string, string[]>): number[] =>
		(neighbors.get(id) ?? []).map(n => vertices.get(n)!.order);

	for (let sweep = 0; sweep < 3; sweep++) {
		const forward = sweep % 2 === 0;
		for (let i = 0; i < layers.length; i++) {
			const layer = layers[forward ? i : layers.length - 1 - i];
			if (!layer || layer.length < 2) {
				continue;
			}
			const barycenter = new Map<string, number>();
			for (const vertex of layer) {
				const orders = neighborOrders(vertex.id, forward ? forwardIncoming : forwardOutgoing);
				barycenter.set(vertex.id, orders.length > 0 ? orders.reduce((a, b) => a + b, 0) / orders.length : vertex.order);
			}
			layer.sort((a, b) => (barycenter.get(a.id)! - barycenter.get(b.id)!) || a.id.localeCompare(b.id));
			layer.forEach((vertex, index) => { vertex.order = index; });
		}
	}

	// --- Coordinates --------------------------------------------------------

	const layerHeights = layers.map(layer => layer ? layer.reduce((sum, v) => sum + v.height, 0) + ROW_GAP * Math.max(0, layer.length - 1) : 0);
	const tallest = Math.max(0, ...layerHeights);

	let x = MARGIN;
	for (let i = 0; i < layers.length; i++) {
		const layer = layers[i];
		if (!layer || layer.length === 0) {
			continue;
		}
		const columnWidth = Math.max(...layer.map(v => v.width));
		let y = MARGIN + (tallest - layerHeights[i]) / 2;
		for (const vertex of layer) {
			vertex.x = x + (columnWidth - vertex.width) / 2;
			vertex.y = y;
			y += vertex.height + ROW_GAP;
		}
		x += columnWidth + COLUMN_GAP;
	}
	const width = layers.some(l => l && l.length > 0) ? x - COLUMN_GAP + MARGIN : MARGIN * 2;
	const height = tallest + MARGIN * 2;

	const result = sortedIds.map((id): Ros2GraphVertex => {
		const { layer, order, ...vertex } = vertices.get(id)!;
		return vertex;
	});
	return { vertices: result, edges, width, height };
}
