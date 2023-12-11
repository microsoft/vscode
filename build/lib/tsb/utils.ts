/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export module collections {

    const hasOwnProperty = Object.prototype.hasOwnProperty;

    export function lookup<T>(collection: { [keys: string]: T }, key: string): T | null {
        if (hasOwnProperty.call(collection, key)) {
            return collection[key];
        }
        return null;
    }

    export function insert<T>(collection: { [keys: string]: T }, key: string, value: T): void {
        collection[key] = value;
    }

    export function lookupOrInsert<T>(collection: { [keys: string]: T }, key: string, value: T): T {
        if (hasOwnProperty.call(collection, key)) {
            return collection[key];
        } else {
            collection[key] = value;
            return value;
        }
    }

    export function forEach<T>(collection: { [keys: string]: T }, callback: (entry: { key: string; value: T }) => void): void {
        for (const key in collection) {
            if (hasOwnProperty.call(collection, key)) {
                callback({
                    key: key,
                    value: collection[key]
                });
            }
        }
    }

    export function contains(collection: { [keys: string]: any }, key: string): boolean {
        return hasOwnProperty.call(collection, key);
    }
}

export module strings {

    /**
     * The empty string. The one and only.
     */
    export const empty = '';

    export const eolUnix = '\r\n';

    export function format(value: string, ...rest: any[]): string {
        return value.replace(/({\d+})/g, function (match) {
            const index = Number(match.substring(1, match.length - 1));
            return String(rest[index]) || match;
        });
    }
}

export module graph {

    export interface Node<T> {
        data: T;
        incoming: { [key: string]: Node<T> };
        outgoing: { [key: string]: Node<T> };
    }

    export function newNode<T>(data: T): Node<T> {
        return {
            data: data,
            incoming: {},
            outgoing: {}
        };
    }

    export class Graph<T> {

        private _nodes: { [key: string]: Node<T> } = {};

        constructor(private _hashFn: (element: T) => string) {
            // empty
        }

        traverse(start: T, inwards: boolean, callback: (data: T) => void): void {
            const startNode = this.lookup(start);
            if (!startNode) {
                return;
            }
            this._traverse(startNode, inwards, {}, callback);
        }

        private _traverse(node: Node<T>, inwards: boolean, seen: { [key: string]: boolean }, callback: (data: T) => void): void {
            const key = this._hashFn(node.data);
            if (collections.contains(seen, key)) {
                return;
            }
            seen[key] = true;
            callback(node.data);
            const nodes = inwards ? node.outgoing : node.incoming;
            collections.forEach(nodes, (entry) => this._traverse(entry.value, inwards, seen, callback));
        }

        inertEdge(from: T, to: T): void {
            const fromNode = this.lookupOrInsertNode(from);
            const toNode = this.lookupOrInsertNode(to);

            fromNode.outgoing[this._hashFn(to)] = toNode;
            toNode.incoming[this._hashFn(from)] = fromNode;
        }

        removeNode(data: T): void {
            const key = this._hashFn(data);
            delete this._nodes[key];
            collections.forEach(this._nodes, (entry) => {
                delete entry.value.outgoing[key];
                delete entry.value.incoming[key];
            });
        }

        lookupOrInsertNode(data: T): Node<T> {
            const key = this._hashFn(data);
            let node = collections.lookup(this._nodes, key);

            if (!node) {
                node = newNode(data);
                this._nodes[key] = node;
            }

            return node;
        }

        lookup(data: T): Node<T> | null {
            return collections.lookup(this._nodes, this._hashFn(data));
        }
    }

}
