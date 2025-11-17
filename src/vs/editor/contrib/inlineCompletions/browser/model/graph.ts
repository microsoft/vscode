/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class DirectedGraph<T> {
	private readonly _nodes = new Set<T>();
	private readonly _outgoingEdges = new Map<T, Set<T>>();

	public static from<T>(nodes: readonly T[], getOutgoing: (node: T) => readonly T[]): DirectedGraph<T> {
		const graph = new DirectedGraph<T>();

		for (const node of nodes) {
			graph._nodes.add(node);
		}

		for (const node of nodes) {
			const outgoing = getOutgoing(node);
			if (outgoing.length > 0) {
				const outgoingSet = new Set<T>();
				for (const target of outgoing) {
					outgoingSet.add(target);
				}
				graph._outgoingEdges.set(node, outgoingSet);
			}
		}

		return graph;
	}

	/**
	 * After this, the graph is guaranteed to have no cycles.
	 */
	removeCycles(): { foundCycles: T[] } {
		const foundCycles: T[] = [];
		const visited = new Set<T>();
		const recursionStack = new Set<T>();
		const toRemove: Array<{ from: T; to: T }> = [];

		const dfs = (node: T): void => {
			visited.add(node);
			recursionStack.add(node);

			const outgoing = this._outgoingEdges.get(node);
			if (outgoing) {
				for (const neighbor of outgoing) {
					if (!visited.has(neighbor)) {
						dfs(neighbor);
					} else if (recursionStack.has(neighbor)) {
						// Found a cycle
						foundCycles.push(neighbor);
						toRemove.push({ from: node, to: neighbor });
					}
				}
			}

			recursionStack.delete(node);
		};

		// Run DFS from all unvisited nodes
		for (const node of this._nodes) {
			if (!visited.has(node)) {
				dfs(node);
			}
		}

		// Remove edges that cause cycles
		for (const { from, to } of toRemove) {
			const outgoingSet = this._outgoingEdges.get(from);
			if (outgoingSet) {
				outgoingSet.delete(to);
			}
		}

		return { foundCycles };
	}

	getOutgoing(node: T): readonly T[] {
		const outgoing = this._outgoingEdges.get(node);
		return outgoing ? Array.from(outgoing) : [];
	}
}
