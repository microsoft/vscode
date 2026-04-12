"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const utils_1 = require("../utils");
function expect(a) {
    return {
        toEqual: (b) => {
            (0, node_assert_1.deepStrictEqual)(a, b);
        }
    };
}
suite('fig/shared/ fieldsAreEqual', () => {
    test('should return immediately if two values are the same', () => {
        expect((0, utils_1.fieldsAreEqual)('hello', 'hello', [])).toEqual(true);
        expect((0, utils_1.fieldsAreEqual)('hello', 'hell', [])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)(1, 1, ['valueOf'])).toEqual(true);
        expect((0, utils_1.fieldsAreEqual)(null, null, [])).toEqual(true);
        expect((0, utils_1.fieldsAreEqual)(null, undefined, [])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)(undefined, undefined, [])).toEqual(true);
        expect((0, utils_1.fieldsAreEqual)(null, 'hello', [])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)(100, null, [])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)({}, {}, [])).toEqual(true);
        expect((0, utils_1.fieldsAreEqual)(() => { }, () => { }, [])).toEqual(false);
    });
    test('should return true if fields are equal', () => {
        const fn = () => { };
        expect((0, utils_1.fieldsAreEqual)({
            a: 'hello',
            b: 100,
            c: undefined,
            d: false,
            e: fn,
            f: { fa: true, fb: { fba: true } },
            g: null,
        }, {
            a: 'hello',
            b: 100,
            c: undefined,
            d: false,
            e: fn,
            f: { fa: true, fb: { fba: true } },
            g: null,
        }, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual(true);
        expect((0, utils_1.fieldsAreEqual)({ a: {} }, { a: {} }, ['a'])).toEqual(true);
    });
    test('should return false if any field is not equal or fields are not specified', () => {
        expect((0, utils_1.fieldsAreEqual)({ a: null }, { a: {} }, ['a'])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)({ a: undefined }, { a: 'hello' }, ['a'])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)({ a: false }, { a: true }, ['a'])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)({ a: { b: { c: 'hello' } } }, { a: { b: { c: 'hell' } } }, ['a'])).toEqual(false);
        expect((0, utils_1.fieldsAreEqual)({ a: 'true' }, { b: 'true' }, [])).toEqual(false);
    });
});
suite('fig/shared/ makeArray', () => {
    test('should transform an object into an array', () => {
        expect((0, utils_1.makeArray)(true)).toEqual([true]);
    });
    test('should not transform arrays with one value', () => {
        expect((0, utils_1.makeArray)([true])).toEqual([true]);
    });
    test('should not transform arrays with multiple values', () => {
        expect((0, utils_1.makeArray)([true, false])).toEqual([true, false]);
    });
});
suite('fig/shared/ makeArrayIfExists', () => {
    test('works', () => {
        expect((0, utils_1.makeArrayIfExists)(null)).toEqual(null);
        expect((0, utils_1.makeArrayIfExists)(undefined)).toEqual(null);
        expect((0, utils_1.makeArrayIfExists)('a')).toEqual(['a']);
        expect((0, utils_1.makeArrayIfExists)(['a'])).toEqual(['a']);
    });
});
suite('fig/shared/ longestCommonPrefix', () => {
    test('should return the shared match', () => {
        expect((0, utils_1.longestCommonPrefix)(['foo', 'foo bar', 'foo hello world'])).toEqual('foo');
    });
    test('should return nothing if not all items starts by the same chars', () => {
        expect((0, utils_1.longestCommonPrefix)(['foo', 'foo bar', 'hello world'])).toEqual('');
    });
});
suite('fig/shared/ compareNamedObjectsAlphabetically', () => {
    test('should return 1 to sort alphabetically z against b for string', () => {
        (0, node_assert_1.ok)((0, utils_1.compareNamedObjectsAlphabetically)('z', 'b') > 0);
    });
    test('should return 1 to sort alphabetically z against b for object with name', () => {
        (0, node_assert_1.ok)((0, utils_1.compareNamedObjectsAlphabetically)({ name: 'z' }, { name: 'b' }) > 0);
    });
    test('should return 1 to sort alphabetically c against x for object with name', () => {
        (0, node_assert_1.ok)((0, utils_1.compareNamedObjectsAlphabetically)({ name: 'c' }, { name: 'x' }) < 0);
    });
    test('should return 1 to sort alphabetically z against b for object with name array', () => {
        (0, node_assert_1.ok)((0, utils_1.compareNamedObjectsAlphabetically)({ name: ['z'] }, { name: ['b'] }) > 0);
    });
    test('should return 1 to sort alphabetically c against x for object with name array', () => {
        (0, node_assert_1.ok)((0, utils_1.compareNamedObjectsAlphabetically)({ name: ['c'] }, { name: ['x'] }) < 0);
    });
});
//# sourceMappingURL=utils.test.js.map