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
})(collections = exports.collections || (exports.collections = {}));
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
})(strings = exports.strings || (exports.strings = {}));
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
})(graph = exports.graph || (exports.graph = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxJQUFjLFdBQVcsQ0FzQ3hCO0FBdENELFdBQWMsV0FBVztJQUVyQixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQztJQUV2RCxTQUFnQixNQUFNLENBQUksVUFBaUMsRUFBRSxHQUFXO1FBQ3BFLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLEVBQUU7WUFDdEMsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDMUI7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBTGUsa0JBQU0sU0FLckIsQ0FBQTtJQUVELFNBQWdCLE1BQU0sQ0FBSSxVQUFpQyxFQUFFLEdBQVcsRUFBRSxLQUFRO1FBQzlFLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDNUIsQ0FBQztJQUZlLGtCQUFNLFNBRXJCLENBQUE7SUFFRCxTQUFnQixjQUFjLENBQUksVUFBaUMsRUFBRSxHQUFXLEVBQUUsS0FBUTtRQUN0RixJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ3RDLE9BQU8sVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQzFCO2FBQU07WUFDSCxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLE9BQU8sS0FBSyxDQUFDO1NBQ2hCO0lBQ0wsQ0FBQztJQVBlLDBCQUFjLGlCQU83QixDQUFBO0lBRUQsU0FBZ0IsT0FBTyxDQUFJLFVBQWlDLEVBQUUsUUFBb0Q7UUFDOUcsS0FBSyxNQUFNLEdBQUcsSUFBSSxVQUFVLEVBQUU7WUFDMUIsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDdEMsUUFB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