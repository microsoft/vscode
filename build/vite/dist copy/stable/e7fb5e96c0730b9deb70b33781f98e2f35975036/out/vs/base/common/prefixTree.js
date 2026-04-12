/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from './iterator.js';
const unset = Symbol('unset');
/**
 * A simple prefix tree implementation where a value is stored based on
 * well-defined prefix segments.
 */
export class WellDefinedPrefixTree {
    constructor() {
        this.root = new Node();
        this._size = 0;
    }
    /** Tree size, not including the root. */
    get size() {
        return this._size;
    }
    /** Gets the top-level nodes of the tree */
    get nodes() {
        return this.root.children?.values() || Iterable.empty();
    }
    /** Gets the top-level nodes of the tree */
    get entries() {
        return this.root.children?.entries() || Iterable.empty();
    }
    /**
     * Inserts a new value in the prefix tree.
     * @param onNode - called for each node as we descend to the insertion point,
     * including the insertion point itself.
     */
    insert(key, value, onNode) {
        this.opNode(key, n => n._value = value, onNode);
    }
    /** Mutates a value in the prefix tree. */
    mutate(key, mutate) {
        this.opNode(key, n => n._value = mutate(n._value === unset ? undefined : n._value));
    }
    /** Mutates nodes along the path in the prefix tree. */
    mutatePath(key, mutate) {
        this.opNode(key, () => { }, n => mutate(n));
    }
    /** Deletes a node from the prefix tree, returning the value it contained. */
    delete(key) {
        const path = this.getPathToKey(key);
        if (!path) {
            return;
        }
        let i = path.length - 1;
        const value = path[i].node._value;
        if (value === unset) {
            return; // not actually a real node
        }
        this._size--;
        path[i].node._value = unset;
        for (; i > 0; i--) {
            const { node, part } = path[i];
            if (node.children?.size || node._value !== unset) {
                break;
            }
            path[i - 1].node.children.delete(part);
        }
        return value;
    }
    /** Deletes a subtree from the prefix tree, returning the values they contained. */
    *deleteRecursive(key) {
        const path = this.getPathToKey(key);
        if (!path) {
            return;
        }
        const subtree = path[path.length - 1].node;
        // important: run the deletion before we start to yield results, so that
        // it still runs even if the caller doesn't consumer the iterator
        for (let i = path.length - 1; i > 0; i--) {
            const parent = path[i - 1];
            parent.node.children.delete(path[i].part);
            if (parent.node.children.size > 0 || parent.node._value !== unset) {
                break;
            }
        }
        for (const node of bfsIterate(subtree)) {
            if (node._value !== unset) {
                this._size--;
                yield node._value;
            }
        }
        // special case for the root note
        if (subtree === this.root) {
            this.root._value = unset;
            this.root.children = undefined;
        }
    }
    /** Gets a value from the tree. */
    find(key) {
        let node = this.root;
        for (const segment of key) {
            const next = node.children?.get(segment);
            if (!next) {
                return undefined;
            }
            node = next;
        }
        return node._value === unset ? undefined : node._value;
    }
    /** Gets whether the tree has the key, or a parent of the key, already inserted. */
    hasKeyOrParent(key) {
        let node = this.root;
        for (const segment of key) {
            const next = node.children?.get(segment);
            if (!next) {
                return false;
            }
            if (next._value !== unset) {
                return true;
            }
            node = next;
        }
        return false;
    }
    /** Gets whether the tree has the given key or any children. */
    hasKeyOrChildren(key) {
        let node = this.root;
        for (const segment of key) {
            const next = node.children?.get(segment);
            if (!next) {
                return false;
            }
            node = next;
        }
        return true;
    }
    /** Gets whether the tree has the given key. */
    hasKey(key) {
        let node = this.root;
        for (const segment of key) {
            const next = node.children?.get(segment);
            if (!next) {
                return false;
            }
            node = next;
        }
        return node._value !== unset;
    }
    getPathToKey(key) {
        const path = [{ part: '', node: this.root }];
        let i = 0;
        for (const part of key) {
            const node = path[i].node.children?.get(part);
            if (!node) {
                return; // node not in tree
            }
            path.push({ part, node });
            i++;
        }
        return path;
    }
    opNode(key, fn, onDescend) {
        let node = this.root;
        for (const part of key) {
            if (!node.children) {
                const next = new Node();
                node.children = new Map([[part, next]]);
                node = next;
            }
            else if (!node.children.has(part)) {
                const next = new Node();
                node.children.set(part, next);
                node = next;
            }
            else {
                node = node.children.get(part);
            }
            onDescend?.(node);
        }
        const sizeBefore = node._value === unset ? 0 : 1;
        fn(node);
        const sizeAfter = node._value === unset ? 0 : 1;
        this._size += sizeAfter - sizeBefore;
    }
    /** Returns an iterable of the tree values in no defined order. */
    *values() {
        for (const { _value } of bfsIterate(this.root)) {
            if (_value !== unset) {
                yield _value;
            }
        }
    }
}
function* bfsIterate(root) {
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        yield node;
        if (node.children) {
            for (const child of node.children.values()) {
                stack.push(child);
            }
        }
    }
}
class Node {
    constructor() {
        this._value = unset;
    }
    get value() {
        return this._value === unset ? undefined : this._value;
    }
    set value(value) {
        this._value = value === undefined ? unset : value;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZml4VHJlZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL3ByZWZpeFRyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUV6QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7QUFVOUI7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLHFCQUFxQjtJQUFsQztRQUNpQixTQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUssQ0FBQztRQUM3QixVQUFLLEdBQUcsQ0FBQyxDQUFDO0lBK01uQixDQUFDO0lBN01BLHlDQUF5QztJQUN6QyxJQUFXLElBQUk7UUFDZCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUM7SUFDbkIsQ0FBQztJQUVELDJDQUEyQztJQUMzQyxJQUFXLEtBQUs7UUFDZixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN6RCxDQUFDO0lBRUQsMkNBQTJDO0lBQzNDLElBQVcsT0FBTztRQUNqQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUMxRCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILE1BQU0sQ0FBQyxHQUFxQixFQUFFLEtBQVEsRUFBRSxNQUF3QztRQUMvRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFRCwwQ0FBMEM7SUFDMUMsTUFBTSxDQUFDLEdBQXFCLEVBQUUsTUFBd0I7UUFDckQs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