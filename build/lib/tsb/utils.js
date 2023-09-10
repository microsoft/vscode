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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxJQUFjLFdBQVcsQ0FzQ3hCO0FBdENELFdBQWMsV0FBVztJQUVyQixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQztJQUV2RCxTQUFnQixNQUFNLENBQUksVUFBaUMsRUFBRSxHQUFXO1FBQ3BFLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLEVBQUU7WUFDdEMsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDMUI7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBTGUsa0JBQU0sU0FLckIsQ0FBQTtJQUVELFNBQWdCLE1BQU0sQ0FBSSxVQUFpQyxFQUFFLEdBQVcsRUFBRSxLQUFRO1FBQzlFLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDNUIsQ0FBQztJQUZlLGtCQUFNLFNBRXJCLENBQUE7SUFFRCxTQUFnQixjQUFjLENBQUksVUFBaUMsRUFBRSxHQUFXLEVBQUUsS0FBUTtRQUN0RixJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ3RDLE9BQU8sVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQzFCO2FBQU07WUFDSCxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLE9BQU8sS0FBSyxDQUFDO1NBQ2hCO0lBQ0wsQ0FBQztJQVBlLDBCQUFjLGlCQU83QixDQUFBO0lBRUQsU0FBZ0IsT0FBTyxDQUFJLFVBQWlDLEVBQUUsUUFBb0Q7UUFDOUcsS0FBSyxNQUFNLEdBQUcsSUFBSSxVQUFVLEVBQUU7WUFDMUIsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDdEMsUUFB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