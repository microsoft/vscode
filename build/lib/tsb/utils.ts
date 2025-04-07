/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace strings {

    export function format(value: string, ...rest: any[]): string {
        return value.replace(/({\d+})/g, function (match) {
            const index = Number(match.substring(1, match.length - 1));
            return String(rest[index]) || match;
        });
    }
}

export namespace graph {

    export class Node<T> {

        readonly incoming = new Map<T, Node<T>>();
        readonly outgoing = new Map<T, Node<T>>();

        constructor(readonly data: T) {

        }
    }

    export class Graph<T> {

        private _nodes = new Map<T, Node<T>>();

        inertEdge(from: T, to: T): void {
            const fromNode = this.lookupOrInsertNode(from);
            const toNode = this.lookupOrInsertNode(to);

            fromNode.outgoing.set(toNode.data, toNode);
            toNode.incoming.set(fromNode.data, fromNode);
        }

        resetNode(data: T): void {
            const node = this._nodes.get(data);
            if (!node) {
                return;
            }
            for (const outDep of node.outgoing.values()) {
                outDep.incoming.delete(node.data);
            }
            node.outgoing.clear();
        }

        lookupOrInsertNode(data: T): Node<T> {
            let node = this._nodes.get(data);

            if (!node) {
                node = new Node(data);
                this._nodes.set(data, node);
            }

            return node;
        }

        lookup(data: T): Node<T> | null {
            return this._nodes.get(data) ?? null;
        }

        findCycle(): T[] | undefined {

            let result: T[] | undefined;
            let foundStartNodes = false;
            const checked = new Set<Node<T>>();

            for (const [_start, value] of this._nodes) {

                if (Object.values(value.incoming).length > 0) {
                    continue;
                }

                foundStartNodes = true;

                const dfs = (node: Node<T>, visited: Set<Node<T>>) => {

                    if (checked.has(node)) {
                        return;
                    }

                    if (visited.has(node)) {
                        result = [...visited, node].map(n => n.data);
                        const idx = result.indexOf(node.data);
                        result = result.slice(idx);
                        return;
                    }
                    visited.add(node);
                    for (const child of Object.values(node.outgoing)) {
                        dfs(child, visited);
                        if (result) {
                            break;
                        }
                    }
                    visited.delete(node);
                    checked.add(node);
                };
                dfs(value, new Set());
                if (result) {
                    break;
                }
            }

            if (!foundStartNodes) {
                // everything is a cycle
                return Array.from(this._nodes.keys());
            }

            return result;
        }
    }

}
