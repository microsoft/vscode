/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
/**
 * Groups the collection into a dictionary based on the provided
 * group function.
 */
export function groupBy(data, groupFn) {
    const result = Object.create(null);
    for (const element of data) {
        const key = groupFn(element);
        let target = result[key];
        if (!target) {
            target = result[key] = [];
        }
        target.push(element);
    }
    return result;
}
export function groupByMap(data, groupFn) {
    const result = new Map();
    for (const element of data) {
        const key = groupFn(element);
        let target = result.get(key);
        if (!target) {
            target = [];
            result.set(key, target);
        }
        target.push(element);
    }
    return result;
}
export function diffSets(before, after) {
    const removed = [];
    const added = [];
    for (const element of before) {
        if (!after.has(element)) {
            removed.push(element);
        }
    }
    for (const element of after) {
        if (!before.has(element)) {
            added.push(element);
        }
    }
    return { removed, added };
}
export function diffMaps(before, after) {
    const removed = [];
    const added = [];
    for (const [index, value] of before) {
        if (!after.has(index)) {
            removed.push(value);
        }
    }
    for (const [index, value] of after) {
        if (!before.has(index)) {
            added.push(value);
        }
    }
    return { removed, added };
}
/**
 * Computes the intersection of two sets.
 *
 * @param setA - The first set.
 * @param setB - The second iterable.
 * @returns A new set containing the elements that are in both `setA` and `setB`.
 */
export function intersection(setA, setB) {
    const result = new Set();
    for (const elem of setB) {
        if (setA.has(elem)) {
            result.add(elem);
        }
    }
    return result;
}
export class SetWithKey {
    static { _a = Symbol.toStringTag; }
    constructor(values, toKey) {
        this.toKey = toKey;
        this._map = new Map();
        this[_a] = 'SetWithKey';
        for (const value of values) {
            this.add(value);
        }
    }
    get size() {
        return this._map.size;
    }
    add(value) {
        const key = this.toKey(value);
        this._map.set(key, value);
        return this;
    }
    delete(value) {
        return this._map.delete(this.toKey(value));
    }
    has(value) {
        return this._map.has(this.toKey(value));
    }
    *entries() {
        for (const entry of this._map.values()) {
            yield [entry, entry];
        }
    }
    keys() {
        return this.values();
    }
    *values() {
        for (const entry of this._map.values()) {
            yield entry;
        }
    }
    clear() {
        this._map.clear();
    }
    forEach(callbackfn, thisArg) {
        this._map.forEach(entry => callbackfn.call(thisArg, entry, entry, this));
    }
    [Symbol.iterator]() {
        return this.values();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sbGVjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7QUFjaEc7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLE9BQU8sQ0FBd0MsSUFBa0IsRUFBRSxPQUEwQjtJQUM1RyxNQUFNLE1BQU0sR0FBNEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1RCxLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQzVCLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDM0IsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEIsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELE1BQU0sVUFBVSxVQUFVLENBQU8sSUFBUyxFQUFFLE9BQTBCO0lBQ3JFLE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDakMsS0FBSyxNQUFNLE9BQU8sSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUM1QixNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0IsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLEdBQUcsRUFBRSxDQUFDO1lBQ1osTUFBTSxDQUFDLEdBQUcsQ0FBQyxH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