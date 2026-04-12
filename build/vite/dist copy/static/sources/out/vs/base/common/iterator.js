/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isIterable } from './types.js';
export var Iterable;
(function (Iterable) {
    function is(thing) {
        return !!thing && typeof thing === 'object' && typeof thing[Symbol.iterator] === 'function';
    }
    Iterable.is = is;
    const _empty = Object.freeze([]);
    function empty() {
        return _empty;
    }
    Iterable.empty = empty;
    function* single(element) {
        yield element;
    }
    Iterable.single = single;
    function wrap(iterableOrElement) {
        if (is(iterableOrElement)) {
            return iterableOrElement;
        }
        else {
            return single(iterableOrElement);
        }
    }
    Iterable.wrap = wrap;
    function from(iterable) {
        return iterable ?? _empty;
    }
    Iterable.from = from;
    function* reverse(array) {
        for (let i = array.length - 1; i >= 0; i--) {
            yield array[i];
        }
    }
    Iterable.reverse = reverse;
    function isEmpty(iterable) {
        return !iterable || iterable[Symbol.iterator]().next().done === true;
    }
    Iterable.isEmpty = isEmpty;
    function first(iterable) {
        return iterable[Symbol.iterator]().next().value;
    }
    Iterable.first = first;
    function some(iterable, predicate) {
        let i = 0;
        for (const element of iterable) {
            if (predicate(element, i++)) {
                return true;
            }
        }
        return false;
    }
    Iterable.some = some;
    function every(iterable, predicate) {
        let i = 0;
        for (const element of iterable) {
            if (!predicate(element, i++)) {
                return false;
            }
        }
        return true;
    }
    Iterable.every = every;
    function find(iterable, predicate) {
        for (const element of iterable) {
            if (predicate(element)) {
                return element;
            }
        }
        return undefined;
    }
    Iterable.find = find;
    function* filter(iterable, predicate) {
        for (const element of iterable) {
            if (predicate(element)) {
                yield element;
            }
        }
    }
    Iterable.filter = filter;
    function* map(iterable, fn) {
        let index = 0;
        for (const element of iterable) {
            yield fn(element, index++);
        }
    }
    Iterable.map = map;
    function* flatMap(iterable, fn) {
        let index = 0;
        for (const element of iterable) {
            yield* fn(element, index++);
        }
    }
    Iterable.flatMap = flatMap;
    function* concat(...iterables) {
        for (const item of iterables) {
            if (isIterable(item)) {
                yield* item;
            }
            else {
                yield item;
            }
        }
    }
    Iterable.concat = concat;
    function reduce(iterable, reducer, initialValue) {
        let value = initialValue;
        for (const element of iterable) {
            value = reducer(value, element);
        }
        return value;
    }
    Iterable.reduce = reduce;
    function length(iterable) {
        let count = 0;
        for (const _ of iterable) {
            count++;
        }
        return count;
    }
    Iterable.length = length;
    /**
     * Returns an iterable slice of the array, with the same semantics as `array.slice()`.
     */
    function* slice(arr, from, to = arr.length) {
        if (from < -arr.length) {
            from = 0;
        }
        if (from < 0) {
            from += arr.length;
        }
        if (to < 0) {
            to += arr.length;
        }
        else if (to > arr.length) {
            to = arr.length;
        }
        for (; from < to; from++) {
            yield arr[from];
        }
    }
    Iterable.slice = slice;
    /**
     * Consumes `atMost` elements from iterable and returns the consumed elements,
     * and an iterable for the rest of the elements.
     */
    function consume(iterable, atMost = Number.POSITIVE_INFINITY) {
        const consumed = [];
        if (atMost === 0) {
            return [consumed, iterable];
        }
        const iterator = iterable[Symbol.iterator]();
        for (let i = 0; i < atMost; i++) {
            const next = iterator.next();
            if (next.done) {
                return [consumed, Iterable.empty()];
            }
            consumed.push(next.value);
        }
        return [consumed, { [Symbol.iterator]() { return iterator; } }];
    }
    Iterable.consume = consume;
    async function asyncToArray(iterable) {
        const result = [];
        for await (const item of iterable) {
            result.push(item);
        }
        return result;
    }
    Iterable.asyncToArray = asyncToArray;
    async function asyncToArrayFlat(iterable) {
        let result = [];
        for await (const item of iterable) {
            result = result.concat(item);
        }
        return result;
    }
    Iterable.asyncToArrayFlat = asyncToArrayFlat;
})(Iterable || (Iterable = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXRlcmF0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9pdGVyYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXhDLE1BQU0sS0FBVyxRQUFRLENBMEx4QjtBQTFMRCxXQUFpQixRQUFRO0lBRXhCLFNBQWdCLEVBQUUsQ0FBYyxLQUFjO1FBQzdDLE9BQU8sQ0FBQyxDQUFDLEtBQUssSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksT0FBUSxLQUFxQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxVQUFVLENBQUM7SUFDOUcsQ0FBQztJQUZlLFdBQUUsS0FFakIsQ0FBQTtJQUVELE1BQU0sTUFBTSxHQUFvQixNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2xELFNBQWdCLEtBQUs7UUFDcEIsT0FBTyxNQUEwQixDQUFDO0lBQ25DLENBQUM7SUFGZSxjQUFLLFFBRXBCLENBQUE7SUFFRCxRQUFlLENBQUMsQ0FBQyxNQUFNLENBQUksT0FBVTtRQUNwQyxNQUFNLE9BQU8sQ0FBQztJQUNmLENBQUM7SUFGZ0IsZUFBTSxTQUV0QixDQUFBO0lBRUQsU0FBZ0IsSUFBSSxDQUFJLGlCQUFrQztRQUN6RCxJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7WUFDM0IsT0FBTyxpQkFBaUIsQ0FBQztRQUMxQixDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDbEMsQ0FBQztJQUNGLENBQUM7SUFOZSxhQUFJLE9BTW5CLENBQUE7SUFFRCxTQUFnQixJQUFJLENBQUksUUFBd0M7UUFDL0QsT0FBTyxRQUFRLElBQUssTUFBc0IsQ0FBQztJQUM1QyxDQUFDO0lB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