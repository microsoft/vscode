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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxJQUFjLFdBQVcsQ0FzQ3hCO0FBdENELFdBQWMsV0FBVztJQUVyQixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQztJQUV2RCxTQUFnQixNQUFNLENBQUksVUFBaUMsRUFBRSxHQUFXO1FBQ3BFLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUxlLGtCQUFNLFNBS3JCLENBQUE7SUFFRCxTQUFnQixNQUFNLENBQUksVUFBaUMsRUFBRSxHQUFXLEVBQUUsS0FBUTtRQUM5RSxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQzVCLENBQUM7SUFGZSxrQkFBTSxTQUVyQixDQUFBO0lBRUQsU0FBZ0IsY0FBYyxDQUFJLFVBQWlDLEVBQUUsR0FBVyxFQUFFLEtBQVE7UUFDdEYsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLE9BQU8sVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNCLENBQUM7YUFBTSxDQUFDO1lBQ0osVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUN4QixPQUFPLEtBQUssQ0FBQztRQUNqQixDQUFDO0lBQ0wsQ0FBQztJQVBlLDBCQUFjLGlCQU83QixDQUFBO0lBRUQsU0FBZ0IsT0FBTyxDQUFJLFVBQWlDLEVBQUUsUUFBb0Q7UUFDOUcsS0FBSyxNQUFNLEdBQUcsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUMzQixJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMs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