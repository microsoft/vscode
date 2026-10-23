/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PriorityQueue } from '../../util/priorityQueue';
import { DEFAULT_ELISION_MARKER, getAvailableNodeId, NodeCostFunction } from './utils';

export type NodeId = number;

/**
 * IVirtualNodes are abstract, potentially mutable nodes that can be snapshotted to
 * concrete, immutable RenderNodes. Virtual nodes do not need to have all the information required
 * for RenderNodes - for example, we don't need to know which cost function will be used when we
 * construct a virtual node, and some aspects of their rendering (canMerge and elisionMarker) are
 * optional. Virtual nodes can in principle also be useful in cases where the children are specified only implicitly,
 * but have not yet been concretely initialized.
 *
 * Although virtual nodes are in principle mutable, they are EXPECTED to change their `id` if they
 * are changed in other ways (for example, adding or removing children)
 *
 * The length of the text of a virtual node should be the length of its children, plus one. This
 * is because the and the children of a virtual node interleave each other. For example:
 *
 * text: ['function hello_world() {\n\t', '\n\t', '\n}']
 * children: ['console.log('hello world');', '//another child']
 *
 * The main example of a IVirtualNode (besides RenderNodes) right now is the ContextNode defined in #prompt/ast
 */
export interface IVirtualNode {
	id: NodeId;
	/** Text fragments that this node renders, excluding children.
	 *  The length of this array must be equal to the number of children + 1. */
	text: readonly string[]; // length of children + 1
	/** Child nodes that this node renders, interleaved with text fragments. */
	children: readonly IVirtualNode[];
	canMerge?: boolean;
	elisionMarker?: string;
}

/**
 * RenderNodes are frozen IVirtualNodes. In addition to the properties of IVirtualNodes,
 * they have an associated cost (how expensive it is to render this node -- for example, its token length)
 * and a weight (how desirable it is to render this node - higher weight indicates a greater preference
 * to render it).
 *
 * RenderNodes contain the state required to recursively render a tree of nodes, within a given budget,
 * replacing the least valuable nodes with elision markers. In addition, they offer a convenience method
 * (`updateWeights`) for setting weights in the entire tree, and then "rectifying" the weights to minimally
 * redistribute weight upwards in the tree so that parents are always more valuable than children.
 *
 * We don't use a class for RenderNodes because they get passed across thread boundaries.
 */
export interface RenderNode extends IVirtualNode {
	readonly id: NodeId;
	readonly text: readonly string[];
	readonly children: readonly RenderNode[];
	/** How much it costs to render this node, excluding children. Should be at least 1. */
	readonly cost: number;
	/** How important this node is - higher means preferred for rendering. Should be nonnegative. */
	weight: number;
	/** Weight, but rectified to ensure parent nodes are always more valuable than children. */
	rectifiedWeight?: number;
	/** Whether this (elided) node can be merged with the previous (elided) children into a single elision marker. */
	canMerge: boolean;
	/** The text to use when this node is elided. */
	elisionMarker: string;
	/** Only render this node if a child is also rendered. Note that setting this
	 * to `true` on a leaf will prevent it from being rendered. */
	requireRenderedChild: boolean;
}

export function createRenderNode(partial: Partial<RenderNode>): RenderNode {
	const node: RenderNode = {
		id: partial.id ?? getAvailableNodeId(),
		text: partial.text ?? new Array((partial.children?.length ?? 0) + 1).fill(''),
		children: partial.children ?? [],
		cost: partial.cost ?? 1,
		weight: partial.weight ?? 0,
		rectifiedWeight: partial.rectifiedWeight,
		canMerge: partial.canMerge ?? false,
		elisionMarker: partial.elisionMarker ?? DEFAULT_ELISION_MARKER,
		requireRenderedChild: partial.requireRenderedChild ?? false,
	};
	if (node.text.length !== node.children.length + 1) {
		throw new Error(
			`RenderNode text length (${node.text.length}) must be children length + 1 (${node.children.length + 1})`
		);
	}
	return node;
}

function isRenderedChildRequired(node: RenderNode): boolean {
	return node.requireRenderedChild || (node.rectifiedWeight ?? node.weight) > node.weight;
}

export function rectifiedValue(node: RenderNode): number {
	return (node.rectifiedWeight ?? node.weight) / Math.max(node.cost, 1);
}

/**
 * Assign weights to nodes, while recursively minimally redistributing weights from children to ancestors
 * so that the rectified value (rectifiedWeight / cost) of each node is no greater than the value of its parent.
 * If no `weighter` is specified, uses the existing node weights a just redistributes from children to ancestors.
 */
export function rectifyWeights(node: RenderNode, weighter?: (node: RenderNode) => number) {
	const rectificationQueue = recursivelyRectifyWeights(node, weighter);
	for (const { item, priority } of rectificationQueue.clear()) {
		for (const node of item.nodes) {
			node.rectifiedWeight = priority * Math.max(node.cost, 1);
		}
	}
}

type NodeGroup = {
	nodes: RenderNode[];
	totalCost: number;
	totalWeight: number;
};
function recursivelyRectifyWeights(
	node: RenderNode,
	weighter?: (node: RenderNode) => number
): PriorityQueue<NodeGroup> {
	const childQueues = node.children.map(child => recursivelyRectifyWeights(child, weighter));
	node.weight = Math.max(0, weighter ? weighter(node) : node.weight);
	if (node.weight === 0 && childQueues.reduce((sum, q) => sum + q.size, 0) === 0) {
		return new PriorityQueue<NodeGroup>([]);
	}

	const merged: PriorityQueue<NodeGroup> = new PriorityQueue(childQueues.flatMap(queue => queue.clear()));
	const group: NodeGroup = {
		nodes: [node],
		totalCost: node.cost,
		totalWeight: node.weight,
	};

	// Combine with descendants until the combined average value is greater than or equal to the next item in the queue
	while ((merged.peek()?.priority ?? 0) > group.totalWeight / Math.max(group.totalCost, 1)) {
		const { item } = merged.pop()!;
		group.nodes.push(...item.nodes);
		group.totalCost += item.totalCost;
		group.totalWeight += item.totalWeight;
	}
	merged.insert(group, group.totalWeight / Math.max(group.totalCost, 1));
	return merged;
}

export type RenderedText = {
	text: string;
	cost: number;
	renderedNodes: Map<NodeId, RenderNode>;
};
type RenderOptions = Partial<{
	/* The maximum cost of the rendered text. If undefined, we render every unmasked node */
	budget: number;
	/* A node or list of nodes to exclude from rendering (along with its children). */
	mask: NodeId | NodeId[];
	/* A true cost function to use when enforcing the budget.
	 * If omitted, the cost is the sum of the costs of the rendered nodes.
	 *
	 * This is used to strictly enforce a budget when the cost of concatenating nodes can exceed the sum of their costs,
	 * as in the case of tokenized lengths. In this case, multiple elision rounds may be required as we use the
	 * nodewise costs to estimate how many marginal nodes need to be removed to satisfy the overall budget.
	 */
	costFunction: (text: string) => number;
}>;

/**
 * Recursively render this node and its children
 *
 * @return An object containing the rendered text and its cost, which will either be the length of the text
 * or the result of the cost function if provided.
 */
export function render(node: RenderNode, options: RenderOptions = {}): RenderedText {
	const { budget, mask, costFunction } = options;
	const exclude = mask ?? [];
	const exclusionSet = new Set(Array.isArray(exclude) ? exclude : [exclude]);

	if ((budget ?? node.cost) < node.cost || exclusionSet.has(node.id)) {
		return {
			text: node.elisionMarker,
			cost: costFunction ? costFunction(node.elisionMarker) : node.elisionMarker.length,
			renderedNodes: new Map(),
		};
	}

	if (budget === undefined) {
		// just elide any excluded nodes (and their descendants)
		const elider = (node: RenderNode) => exclusionSet.has(node.id);
		const renderParts: string[] = [];
		const renderedNodes: Map<NodeId, RenderNode> = new Map();
		recursivelyRender(node, renderParts, elider, renderedNodes);
		if (renderParts.length === 0) {
			return renderEmpty(node, costFunction);
		}
		const text = renderParts.join('');
		const cost = costFunction
			? costFunction(text)
			: [...renderedNodes.values()].reduce((sum, n) => sum + n.cost, 0);
		return { text, cost, renderedNodes };
	}

	// Elide nodes that are not in the rendered set
	let targetNodes = new Map<NodeId, RenderNode>();
	// With the additional cost function, we keep track of the order in which we select nodes for rendering
	// This is used to remove nodes that are marginally valuable if the final true cost exceeds the budget
	const marginalNodes: RenderNode[] = [];
	// Include highest-value non-excluded nodes up to the budget
	const explorationQueue = new PriorityQueue<RenderNode>([{ item: node, priority: rectifiedValue(node) }]);
	let remainingBudget = budget;
	while (remainingBudget > 0 && explorationQueue.size > 0) {
		const { item } = explorationQueue.pop()!;
		if (exclusionSet.has(item.id)) {
			continue;
		}
		if (item.cost <= remainingBudget) {
			remainingBudget -= item.cost;
			targetNodes.set(item.id, item);
			marginalNodes.push(item);
			// Add children to the queue, prioritizing those with higher value
			for (const child of item.children) {
				explorationQueue.insert(child, rectifiedValue(child));
			}
		}
	}

	// We have a rendering plan that is projected to be within budget, but actual cost of the combined text may differ
	// If we have a cost function, we may still need to iteratively remove nodes until the true cost is within budget
	while (targetNodes.size > 0) {
		const renderParts: string[] = [];
		const elider = (node: RenderNode) => !targetNodes.has(node.id);
		// `renderedNodes` will be a subset of `targetNodes`; some additional nodes may be elided due to
		// the requirement to render at least one child
		const renderedNodes = new Map<NodeId, RenderNode>();
		recursivelyRender(node, renderParts, elider, renderedNodes);
		if (renderParts.length === 0) {
			// If we didn't render anything, we can return the elision marker
			return renderEmpty(node, costFunction);
		}
		const text = renderParts.join('');
		if (costFunction === undefined) {
			// Within budget by construction
			const cost = [...renderedNodes.values()].reduce((sum, n) => sum + n.cost, 0);
			return { text, cost, renderedNodes };
		}

		let cost = costFunction(text);
		if (cost <= budget) {
			// If the cost of the rendered text is within budget, return it
			return { text, cost, renderedNodes };
		}

		// Otherwise, we will elide additional nodes and try again
		targetNodes = renderedNodes;
		while (marginalNodes.length > 0 && cost > budget) {
			const node = marginalNodes.pop()!;
			if (targetNodes.has(node.id)) {
				cost -= node.cost; // Use nodewise cost to *estimate* change in overall cost
				targetNodes.delete(node.id);
			} // Otherwise, we didn't render it because of requireRenderedChild
		}

		if (marginalNodes.length === 0) {
			// infeasible budget
			break;
		}
	}
	return renderEmpty(node, costFunction);
}

function renderEmpty(node: RenderNode, costFunction?: (text: string) => number): RenderedText {
	return {
		text: node.elisionMarker,
		cost: costFunction ? costFunction(node.elisionMarker) : node.elisionMarker.length,
		renderedNodes: new Map(),
	};
}

function recursivelyRender(
	node: RenderNode,
	parts: string[],
	elider: (node: RenderNode) => boolean,
	renderedNodes: Map<NodeId, RenderNode>,
	mergeElision: boolean = false
): boolean {
	const numParts = parts.length;
	if (elider(node)) {
		if (numParts >= 2) {
			if (
				mergeElision ||
				(parts[numParts - 2] === node.elisionMarker && parts[numParts - 1].trim().length === 0)
			) {
				parts.pop(); // elide by removing separator from previous elision
				return false;
			}
		}
		parts.push(node.elisionMarker);
		return false;
	}

	// Combine text fragments and rendered children
	let requiresChild = isRenderedChildRequired(node);
	let didRender = true;
	for (const [i, child] of node.children.entries()) {
		parts.push(node.text[i] ?? '');
		didRender = recursivelyRender(child, parts, elider, renderedNodes, child.canMerge && !didRender);
		requiresChild &&= !didRender;
	}
	if (requiresChild) {
		// We did not render any child, but are required to render one
		// Revert `parts` to its state before this node's text fragments
		while (parts.length > numParts) {
			parts.pop();
		}
		return false;
	}
	// Finish rendering this node with the last text fragment
	parts.push(node.text[node.text.length - 1] ?? '');
	renderedNodes.set(node.id, node);
	return true;
}

/**
 * Freeze a tree of virtual nodes into RenderNodes, using a given cost function and elision marker.
 *
 * Optionally, make use a cache (such as an LRUCacheMap) mapping IDs to RenderNodes. When we encounter a cached ID,
 * we return the cached RenderNode without recursing further. For this to behave as expected, the IVirtualNodes
 * *must* change their ID whenever their subtree changes.
 */
export function snapshot(
	node: IVirtualNode,
	costFunction: NodeCostFunction,
	elisionMarker: string = DEFAULT_ELISION_MARKER
): RenderNode {
	const children = node.children.map(child => snapshot(child, costFunction, elisionMarker));
	elisionMarker = node.elisionMarker ?? elisionMarker;
	const cost = costFunction(node);
	const renderNode: RenderNode = createRenderNode({
		...node,
		children,
		cost,
		weight: 0,
		elisionMarker: node.elisionMarker ?? elisionMarker,
	});
	return renderNode;
}

export const EMPTY_NODE: RenderNode = {
	id: getAvailableNodeId(),
	text: [''],
	children: [],
	cost: 0,
	weight: 0,
	elisionMarker: '',
	canMerge: true,
	requireRenderedChild: false,
};
