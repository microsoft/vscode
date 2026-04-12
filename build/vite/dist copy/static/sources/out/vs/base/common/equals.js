/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as arrays from './arrays.js';
/**
 * Compares two items for equality using strict equality.
*/
export function strictEquals(a, b) {
    return a === b;
}
export function strictEqualsC() {
    return (a, b) => a === b;
}
/**
 * Checks if the items of two arrays are equal.
 * By default, strict equality is used to compare elements, but a custom equality comparer can be provided.
 */
export function arrayEquals(a, b, itemEquals) {
    return arrays.equals(a, b, itemEquals ?? strictEquals);
}
/**
 * Checks if the items of two arrays are equal.
 * By default, strict equality is used to compare elements, but a custom equality comparer can be provided.
 */
export function arrayEqualsC(itemEquals) {
    return (a, b) => arrays.equals(a, b, itemEquals ?? strictEquals);
}
/**
 * Drills into arrays (items ordered) and objects (keys unordered) and uses strict equality on everything else.
*/
export function structuralEquals(a, b) {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!structuralEquals(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    if (a && typeof a === 'object' && b && typeof b === 'object') {
        if (Object.getPrototypeOf(a) === Object.prototype && Object.getPrototypeOf(b) === Object.prototype) {
            const aObj = a;
            const bObj = b;
            const keysA = Object.keys(aObj);
            const keysB = Object.keys(bObj);
            const keysBSet = new Set(keysB);
            if (keysA.length !== keysB.length) {
                return false;
            }
            for (const key of keysA) {
                if (!keysBSet.has(key)) {
                    return false;
                }
                if (!structuralEquals(aObj[key], bObj[key])) {
                    return false;
                }
            }
            return true;
        }
    }
    return false;
}
export function structuralEqualsC() {
    return (a, b) => structuralEquals(a, b);
}
/**
 * `getStructuralKey(a) === getStructuralKey(b) <=> structuralEquals(a, b)`
 * (assuming that a and b are not cyclic structures and nothing extends globalThis Array).
*/
export function getStructuralKey(t) {
    return JSON.stringify(toNormalizedJsonStructure(t));
}
let objectId = 0;
const objIds = new WeakMap();
function toNormalizedJsonStructure(t) {
    if (Array.isArray(t)) {
        return t.map(toNormalizedJsonStructure);
    }
    if (t && typeof t === 'object') {
        if (Object.getPrototypeOf(t) === Object.prototype) {
            const tObj = t;
            const res = Object.create(null);
            for (const key of Object.keys(tObj).sort()) {
                res[key] = toNormalizedJsonStructure(tObj[key]);
            }
            return res;
        }
        else {
            let objId = objIds.get(t);
            if (objId === undefined) {
                objId = objectId++;
                objIds.set(t, objId);
            }
            // Random string to prevent collisions
            return objId + '----2b76a038c20c4bcc';
        }
    }
    return t;
}
/**
 * Two items are considered equal, if their stringified representations are equal.
*/
export function jsonStringifyEquals(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
/**
 * Two items are considered equal, if their stringified representations are equal.
*/
export function jsonStringifyEqualsC() {
    return (a, b) => JSON.stringify(a) === JSON.stringify(b);
}
/**
 * Uses `item.equals(other)` to determine equality.
 */
export function thisEqualsC() {
    return (a, b) => a.equals(b);
}
/**
 * Checks if two items are both null or undefined, or are equal according to the provided equality comparer.
*/
export function equalsIfDefined(v1, v2, equals) {
    if (v1 === undefined || v1 === null || v2 === undefined || v2 === null) {
        return v2 === v1;
    }
    return equals(v1, v2);
}
/**
 * Returns an equality comparer that checks if two items are both null or undefined, or are equal according to the provided equality comparer.
*/
export function equalsIfDefinedC(equals) {
    return (v1, v2) => {
        if (v1 === undefined || v1 === null || v2 === undefined || v2 === null) {
            return v2 === v1;
        }
        return equals(v1, v2);
    };
}
/**
 * Each function in this file which offers an equality comparison, has an accompanying
 * `*C` variant which returns an EqualityComparer function.
 *
 * The `*C` variant allows for easier composition of equality comparers and improved type-inference.
*/
export var equals;
(function (equals) {
    equals.strict = strictEquals;
    equals.strictC = strictEqualsC;
    equals.array = arrayEquals;
    equals.arrayC = arrayEqualsC;
    equals.structural = structuralEquals;
    equals.structuralC = structuralEqualsC;
    equals.jsonStringify = jsonStringifyEquals;
    equals.jsonStringifyC = jsonStringifyEqualsC;
    equals.thisC = thisEqualsC;
    equals.ifDefined = equalsIfDefined;
    equals.ifDefinedC = equalsIfDefinedC;
})(equals || (equals = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXF1YWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vZXF1YWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sYUFBYSxDQUFDO0FBaUJ0Qzs7RUFFRTtBQUNGLE1BQU0sVUFBVSxZQUFZLENBQUksQ0FBSSxFQUFFLENBQUk7SUFDekMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxNQUFNLFVBQVUsYUFBYTtJQUM1QixPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUMxQixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLFdBQVcsQ0FBSSxDQUFlLEVBQUUsQ0FBZSxFQUFFLFVBQWdDO0lBQ2hHLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FBSSxVQUFnQztJQUMvRCxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUNsRSxDQUFDO0FBRUQ7O0VBRUU7QUFDRixNQUFNLFVBQVUsZ0JBQWdCLENBQUksQ0FBSSxFQUFFLENBQUk7SUFDN0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDYixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMs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