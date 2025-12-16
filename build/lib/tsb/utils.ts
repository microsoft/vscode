/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const strings = (() => {

    function format(value: string, ...rest: unknown[]): string {
        return value.replace(/(\{\d+\})/g, function (match) {
            const index = Number(match.substring(1, match.length - 1));
            return String(rest[index]) || match;
        });
    }

    return { format };
})();

export const graph = (() => {

    class Node<T> {

        readonly incoming = new Map<T, Node<T>>();
        readonly outgoing = new Map<T, Node<T>>();
        readonly data: T;

        constructor(data: T) {
            this.data = data;
        }
    }

    class Graph<T> {

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

        findCycles(allData: T[]): Map<T, T[] | undefined> {
            const result = new Map<T, T[] | undefined>();
            const checked = new Set<T>();
            for (const data of allData) {
                const node = this.lookup(data);
                if (!node) {
                    continue;
                }
                const r = this._findCycle(node, checked, new Set());
                result.set(node.data, r);
            }
            return result;
        }

        private _findCycle(node: Node<T>, checked: Set<T>, seen: Set<T>): T[] | undefined {

            if (checked.has(node.data)) {
                return undefined;
            }

            let result: T[] | undefined;
            for (const child of node.outgoing.values()) {
                if (seen.has(child.data)) {
                    const seenArr = Array.from(seen);
                    const idx = seenArr.indexOf(child.data);
                    seenArr.push(child.data);
                    return idx > 0 ? seenArr.slice(idx) : seenArr;
                }
                seen.add(child.data);
                result = this._findCycle(child, checked, seen);
                seen.delete(child.data);
                if (result) {
                    break;
                }
            }
            checked.add(node.data);
            return result;
        }
    }

    return { Node, Graph };
})();
