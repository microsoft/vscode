/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A data structure for efficiently finding all values that are indexed by a key
 * that is a prefix of a given key, using a radix trie representation.
 *
 * An overarching goal of the implementation is to minimize storing and handling
 * the full keys since in the case of completions, the keys are the full text of
 * the document before the cursor which can be large.
 */
export class LRURadixTrie<T> {
	/** Singular, empty root node for the the trie. */
	private readonly root = new LRURadixNode<T>();

	/** Set of all leaf nodes with values, tracked for evicting LRU values. */
	private readonly leafNodes: Set<LRURadixNode<T>> = new Set();

	constructor(private readonly maxSize: number) { }

	/**
	 * Traverses the trie to insert a new value. If an existing exact match is
	 * found the value is added to a list of values at that node. Otherwise a
	 * new node is created.
	 *
	 * As a side effect, the least recently used node is evicted if the max size
	 * is exceeded.
	 */
	set(key: string, value: T): void {
		let { node, remainingKey } = this.findClosestNode(key);
		// If no exact match, add a new node under the closest node.
		if (remainingKey.length > 0) {
			// Check if there is a child node with an edge that is a prefix of
			// the remaining key.
			for (const [edge, child] of node.children) {
				if (edge.startsWith(remainingKey)) {
					// Split the edge by adding a new intermediate node.
					const commonPrefix = edge.slice(0, remainingKey.length);
					const intermediate = new LRURadixNode<T>();
					node.removeChild(edge);
					node.addChild(commonPrefix, intermediate);
					intermediate.addChild(edge.slice(commonPrefix.length), child);
					node = intermediate;
					remainingKey = remainingKey.slice(commonPrefix.length);
					break;
				}
			}
			if (remainingKey.length > 0) {
				// Add a new node with the remaining key.
				const newNode = new LRURadixNode<T>();
				node.addChild(remainingKey, newNode);
				node = newNode;
			}
		}
		// Set value on the node
		node.value = value;
		// Ensure the node which may be new or newly with a value is in the
		// leafNode set.
		this.leafNodes.add(node);
		// Evict least recently used node if max size is exceeded.
		if (this.leafNodes.size > this.maxSize) {
			this.evictLeastRecentlyUsed();
		}
	}

	/** Traverses the trie and returns all values whose keys are a prefix of the
	 * given key. Returns them in order of longest prefix first.
	 */
	findAll(key: string): Array<{ remainingKey: string; value: T }> {
		return this.findClosestNode(key)
			.stack.map(({ node, remainingKey }) =>
				node.value !== undefined ? { remainingKey, value: node.value } : undefined
			)
			.filter(x => x !== undefined);
	}

	/** Removes the value at a given key if any from the trie. */
	delete(key: string): void {
		const { node, remainingKey } = this.findClosestNode(key);
		// If no exact match is found, do nothing.
		if (remainingKey.length > 0) { return; }
		// Exact match found, remove the value.
		this.deleteNode(node);
	}

	/** Traverses the trie to find the node with the closest prefix to a given key. */
	private findClosestNode(key: string) {
		let hasNext = true;
		let node: LRURadixNode<T> = this.root;
		const stack: { node: LRURadixNode<T>; remainingKey: string }[] = [{ node, remainingKey: key }];
		while (key.length > 0 && hasNext) {
			hasNext = false;
			for (const [edge, child] of node.children) {
				if (key.startsWith(edge)) {
					key = key.slice(edge.length);
					stack.unshift({ node: child, remainingKey: key });
					node = child;
					hasNext = true;
					break;
				}
			}
		}
		return { node, remainingKey: key, stack };
	}

	/** Deletes a node from the trie and resolves relationships with surrounding nodes.
	 * - If the node has no children, remove it from its parent.
	 * - If the node has one child, replace it with its child in the parent,
	 *   concatenating the edges together.
	 * - If the node has multiple children, the node is left in place as an
	 *   intermediary node.
	 * - In all cases, the value at the node is removed and the node is removed
	 *   from the flatNodes set of leaf nodes.
	 */
	private deleteNode(node: LRURadixNode<T>): void {
		node.value = undefined;
		this.leafNodes.delete(node);
		// If the node has no parent, it is the root. Done.
		if (node.parent === undefined) { return; }
		// If more than one child, keep the node as an intermediary node. Done.
		if (node.childCount > 1) { return; }
		const { node: parent, edge } = node.parent;
		// If exactly one child, replace the node with the child in the parent.
		if (node.childCount === 1) {
			const [childEdge, childNode] = Array.from(node.children)[0];
			node.removeChild(childEdge);
			parent.removeChild(edge);
			parent.addChild(edge + childEdge, childNode);
			return;
		}
		// If the node has no children, remove it from the parent.
		parent.removeChild(edge);
		// If the parent node is the root, no further action is needed.
		if (parent.parent === undefined) { return; }
		const grandparent = parent.parent;
		// If the parent node has only one child remaining and no value, merge
		// the parent and remaining child together.
		if (parent.value === undefined && parent.childCount === 1) {
			const [childEdge, childNode] = Array.from(parent.children)[0];
			const newEdge = grandparent.edge + childEdge;
			parent.removeChild(childEdge);
			grandparent.node.removeChild(grandparent.edge);
			grandparent.node.addChild(newEdge, childNode);
		}
	}

	/** Walks the trie to find and evict the least recently used node. This is
	 * intentionally optimized for read performance over write performance.
	 */
	private evictLeastRecentlyUsed(): void {
		const node = this.findLeastRecentlyUsed();
		if (node) { this.deleteNode(node); }
	}

	/** Iterate through the set of leaf nodes to find the least recently used.
	 *
	 * Note, this could be done more efficiently with a heap or even just
	 * keeping the list sorted. Currently, this is mirroring the LRUCacheMap
	 * implementation to optimize for read performance over write performance.
	 * Though this may be worth revisiting since both reading and writing are on
	 * the critical path for completions.
	 */
	private findLeastRecentlyUsed(): LRURadixNode<T> | undefined {
		let least: LRURadixNode<T> | undefined;
		for (const node of this.leafNodes) {
			if (least === undefined || node.touched < least.touched) {
				least = node;
			}
		}
		return least;
	}
}

/** Internal node representation in a LRURadixTrie.
 * - Optionally has a value to represent a leaf node.
 * - Contains a list of child nodes, not mutually exclusive with having value.
 * - If not a root, has a parent edge for traversal up the trie.
 * - Maintains state on most recent access time for LRU eviction.
 */
class LRURadixNode<T> {
	private readonly _children: Map<string, LRURadixNode<T>> = new Map();
	private _touched = performance.now();
	private _value: T | undefined;

	/** Reference to the parent node and edge to this node for backtracking. */
	parent: { node: LRURadixNode<T>; edge: string } | undefined;

	/** Iterator for the children of this node. */
	get children() {
		return this._children.entries();
	}

	/** The number of children of this node. */
	get childCount() {
		return this._children.size;
	}

	/** Adds a child node to this node and sets its parent reference. */
	addChild(edge: string, child: LRURadixNode<T>): void {
		this._children.set(edge, child);
		child.parent = { node: this, edge };
	}

	/** Removes a child node from this node and clears its parent reference. */
	removeChild(edge: string): void {
		const child = this._children.get(edge);
		if (child) { child.parent = undefined; }
		this._children.delete(edge);
	}

	/** Reads the value and updates the touched timestamp. */
	get value(): T | undefined {
		this.touch();
		return this._value;
	}

	/** Sets value and updates the touched timestamp. */
	set value(value: T | undefined) {
		this.touch();
		this._value = value;
	}

	/** The last time (ms from process start) this node's value was accessed. */
	get touched(): number {
		return this._touched;
	}

	private touch(): void {
		this._touched = performance.now();
	}
}
