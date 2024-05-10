"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.graph = exports.strings = exports.collections = void 0;
var collections;
(function (collections) {
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    function lookup(collection, key) {
        if (hasOwnProperty.call(collection, key)) {
            return collection[key];
        }
        return null;
    }
    collections.lookup = lookup;
    function insert(collection, key, value) {
        collection[key] = value;
    }
    collections.insert = insert;
    function lookupOrInsert(collection, key, value) {
        if (hasOwnProperty.call(collection, key)) {
            return collection[key];
        }
        else {
            collection[key] = value;
            return value;
        }
    }
    collections.lookupOrInsert = lookupOrInsert;
    function forEach(collection, callback) {
        for (const key in collection) {
            if (hasOwnProperty.call(collection, key)) {
                callback({
                    key: key,
                    value: collection[key]
                });
            }
        }
    }
    collections.forEach = forEach;
    function contains(collection, key) {
        return hasOwnProperty.call(collection, key);
    }
    collections.contains = contains;
})(collections || (exports.collections = collections = {}));
var strings;
(function (strings) {
    /**
     * The empty string. The one and only.
     */
    strings.empty = '';
    strings.eolUnix = '\r\n';
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
    function newNode(data) {
        return {
            data: data,
            incoming: {},
            outgoing: {}
        };
    }
    graph.newNode = newNode;
    class Graph {
        _hashFn;
        _nodes = {};
        constructor(_hashFn) {
            this._hashFn = _hashFn;
            // empty
        }
        traverse(start, inwards, callback) {
            const startNode = this.lookup(start);
            if (!startNode) {
                return;
            }
            this._traverse(startNode, inwards, {}, callback);
        }
        _traverse(node, inwards, seen, callback) {
            const key = this._hashFn(node.data);
            if (collections.contains(seen, key)) {
                return;
            }
            seen[key] = true;
            callback(node.data);
            const nodes = inwards ? node.outgoing : node.incoming;
            collections.forEach(nodes, (entry) => this._traverse(entry.value, inwards, seen, callback));
        }
        inertEdge(from, to) {
            const fromNode = this.lookupOrInsertNode(from);
            const toNode = this.lookupOrInsertNode(to);
            fromNode.outgoing[this._hashFn(to)] = toNode;
            toNode.incoming[this._hashFn(from)] = fromNode;
        }
        removeNode(data) {
            const key = this._hashFn(data);
            delete this._nodes[key];
            collections.forEach(this._nodes, (entry) => {
                delete entry.value.outgoing[key];
                delete entry.value.incoming[key];
            });
        }
        lookupOrInsertNode(data) {
            const key = this._hashFn(data);
            let node = collections.lookup(this._nodes, key);
            if (!node) {
                node = newNode(data);
                this._nodes[key] = node;
            }
            return node;
        }
        lookup(data) {
            return collections.lookup(this._nodes, this._hashFn(data));
        }
    }
    graph.Graph = Graph;
})(graph || (exports.graph = graph = {}));
//# sourceMappingURL=utils.js.map