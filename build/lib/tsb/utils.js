"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.graph = exports.strings = void 0;
var strings;
(function (strings) {
    function format(value, ...rest) {
        return value.replace(/({\d+})/g, function (match) {
            const index = Number(match.substring(1, match.length - 1));
            return String(rest[index]) || match;
        });
    }
    strings.format = format;
})(strings || (exports.strings = strings = {}));
var graph;
(function (graph) {
    class Node {
        data;
        incoming = new Map();
        outgoing = new Map();
        constructor(data) {
            this.data = data;
        }
    }
    graph.Node = Node;
    class Graph {
        _nodes = new Map();
        inertEdge(from, to) {
            const fromNode = this.lookupOrInsertNode(from);
            const toNode = this.lookupOrInsertNode(to);
            fromNode.outgoing.set(toNode.data, toNode);
            toNode.incoming.set(fromNode.data, fromNode);
        }
        resetNode(data) {
            const node = this._nodes.get(data);
            if (!node) {
                return;
            }
            for (const outDep of node.outgoing.values()) {
                outDep.incoming.delete(node.data);
            }
            node.outgoing.clear();
        }
        lookupOrInsertNode(data) {
            let node = this._nodes.get(data);
            if (!node) {
                node = new Node(data);
                this._nodes.set(data, node);
            }
            return node;
        }
        lookup(data) {
            return this._nodes.get(data) ?? null;
        }
        findCycle() {
            let result;
            let foundStartNodes = false;
            const checked = new Set();
            for (const [_start, value] of this._nodes) {
                if (Object.values(value.incoming).length > 0) {
                    continue;
                }
                foundStartNodes = true;
                const dfs = (node, visited) => {
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
    graph.Graph = Graph;
})(graph || (exports.graph = graph = {}));
//# sourceMappingURL=utils.js.map