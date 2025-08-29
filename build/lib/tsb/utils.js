"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graph = exports.strings = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
        findCycles(allData) {
            const result = new Map();
            const checked = new Set();
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
        _findCycle(node, checked, seen) {
            if (checked.has(node.data)) {
                return undefined;
            }
            let result;
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
    graph.Graph = Graph;
})(graph || (exports.graph = graph = {}));
//# sourceMappingURL=utils.js.map