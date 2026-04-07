/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Chunk, PromptSnapshotNode } from './components';

/**
 * Represents the context during the traversal of a prompt snapshot tree.
 * This context is passed to every node and can be modified by transformers.
 */
interface WalkContext {
	/**
	 * Context properties that can be added by custom transformers.
	 */
	[key: string]: unknown;
}

/**
 * A function that transforms the walking context as the tree is traversed.
 * Transformers are applied in sequence before visiting each node.
 *
 * @param node - The current node being visited
 * @param parent - The parent of the current node (undefined for root)
 * @param context - The current context
 * @returns A new context to be used for this node and its children
 */
export type WalkContextTransformer = (
	node: PromptSnapshotNode,
	parent: PromptSnapshotNode | undefined,
	context: WalkContext
) => WalkContext;

/**
 * A utility class for traversing a prompt snapshot tree.
 * The walker applies transformers to modify the context at each node
 * and calls a visitor function with the transformed context.
 */
export class SnapshotWalker {
	/**
	 * Creates a new SnapshotWalker.
	 *
	 * @param snapshot - The root node of the snapshot tree to walk
	 * @param transformers - Optional array of context transformers to apply during traversal
	 */
	constructor(
		private readonly snapshot: PromptSnapshotNode,
		private readonly transformers: WalkContextTransformer[] = defaultTransformers()
	) { }

	/**
	 * Walks the snapshot tree and applies the visitor function to each node.
	 *
	 * @param visitor - Function called for each node during traversal. Return false to skip traversing children.
	 * @param options - Optional configuration for the walk
	 */
	walkSnapshot(
		visitor: (n: PromptSnapshotNode, parent: PromptSnapshotNode | undefined, context: WalkContext) => boolean
	) {
		this.walkSnapshotNode(this.snapshot, undefined, visitor, {});
	}

	private walkSnapshotNode(
		node: PromptSnapshotNode,
		parent: PromptSnapshotNode | undefined,
		visitor: (n: PromptSnapshotNode, parent: PromptSnapshotNode | undefined, context: WalkContext) => boolean,
		context: WalkContext
	) {
		// Apply all transformers to create the new context for this node
		const newContext = this.transformers.reduce((ctx, transformer) => transformer(node, parent, ctx), { ...context });

		// Visit the node with the transformed context
		const accept = visitor(node, parent, newContext);
		if (!accept) {
			return;
		}

		// Process children with the new context
		for (const child of node.children ?? []) {
			this.walkSnapshotNode(child, node, visitor, newContext);
		}
	}
}

export function defaultTransformers(): WalkContextTransformer[] {
	return [
		// Weight transformer - computes the weight of the current relative to the parent
		(node, _, context) => {
			if (context.weight === undefined) {
				context.weight = 1;
			}
			const weight = node.props?.weight ?? 1;
			const clampedWeight = typeof weight === 'number' ? Math.max(0, Math.min(1, weight)) : 1;
			return { ...context, weight: clampedWeight * (context.weight as number) };
		},
		// Chunk transformer
		(node, _, context) => {
			if (node.name === Chunk.name) {
				// Initialize chunk set if it doesn't exist
				const chunks = context.chunks ? new Set<string>(context.chunks as Set<string>) : new Set<string>();
				// Add current node path to the set
				chunks.add(node.path);
				return { ...context, chunks };
			}
			return context;
		},
		// Source transformer
		(node, _, context) => {
			if (node.props?.source !== undefined) {
				return { ...context, source: node.props.source };
			}
			return context;
		},
	];
}
