/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextKeyExpr, implies } from '../../common/contextkey.js';
function createContext(ctx) {
    return {
        getValue: (key) => {
            return ctx[key];
        }
    };
}
suite('ContextKeyExpr', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('ContextKeyExpr.equals', () => {
        const a = ContextKeyExpr.and(ContextKeyExpr.has('a1'), ContextKeyExpr.and(ContextKeyExpr.has('and.a')), ContextKeyExpr.has('a2'), ContextKeyExpr.regex('d3', /d.*/), ContextKeyExpr.regex('d4', /\*\*3*/), ContextKeyExpr.equals('b1', 'bb1'), ContextKeyExpr.equals('b2', 'bb2'), ContextKeyExpr.notEquals('c1', 'cc1'), ContextKeyExpr.notEquals('c2', 'cc2'), ContextKeyExpr.not('d1'), ContextKeyExpr.not('d2'));
        const b = ContextKeyExpr.and(ContextKeyExpr.equals('b2', 'bb2'), ContextKeyExpr.notEquals('c1', 'cc1'), ContextKeyExpr.not('d1'), ContextKeyExpr.regex('d4', /\*\*3*/), ContextKeyExpr.notEquals('c2', 'cc2'), ContextKeyExpr.has('a2'), ContextKeyExpr.equals('b1', 'bb1'), ContextKeyExpr.regex('d3', /d.*/), ContextKeyExpr.has('a1'), ContextKeyExpr.and(ContextKeyExpr.equals('and.a', true)), ContextKeyExpr.not('d2'));
        assert(a.equals(b), 'expressions should be equal');
    });
    test('issue #134942: Equals in comparator expressions', () => {
        function testEquals(expr, str) {
            const deserialized = ContextKeyExpr.deserialize(str);
            assert.ok(expr);
            assert.ok(deserialized);
            assert.strictEqual(expr.equals(deserialized), true, str);
        }
        testEquals(ContextKeyExpr.greater('value', 0), 'value > 0');
        testEquals(ContextKeyExpr.greaterEquals('value', 0), 'value >= 0');
        testEquals(ContextKeyExpr.smaller('value', 0), 'value < 0');
        testEquals(ContextKeyExpr.smallerEquals('value', 0), 'value <= 0');
    });
    test('normalize', () => {
        const key1IsTrue = ContextKeyExpr.equals('key1', true);
        const key1IsNotFalse = ContextKeyExpr.notEquals('key1', false);
        const key1IsFalse = ContextKeyExpr.equals('key1', false);
        const key1IsNotTrue = ContextKeyExpr.notEquals('key1', true);
        assert.ok(key1IsTrue.equals(ContextKeyExpr.has('key1')));
        assert.ok(key1IsNotFalse.equals(ContextKeyExpr.has('key1')));
        assert.ok(key1IsFalse.equals(ContextKeyExpr.not('key1')));
        assert.ok(key1IsNotTrue.equals(ContextKeyExpr.not('key1')));
    });
    test('evaluate', () => {
        const context = createContext({
            'a': true,
            'b': false,
            'c': '5',
            'd': 'd'
        });
        function testExpression(expr, expected) {
            // console.log(expr + ' ' + expected);
            const rules = ContextKeyExpr.deserialize(expr);
            assert.strictEqual(rules.evaluate(context), expected, expr);
        }
        function testBatch(expr, value) {
            /* eslint-disable eqeqeq */
            testExpression(expr, !!value);
            testExpression(expr + ' == true', !!value);
            testExpression(expr + ' != true', !value);
            testExpression(expr + ' == false', !value);
            testExpression(expr + ' != false', !!value);
            // eslint-disable-next-line local/code-no-any-casts
            testExpression(expr + ' == 5', value == '5');
            // eslint-disable-next-line local/code-no-any-casts
            testExpression(expr + ' != 5', value != '5');
            testExpression('!' + expr, !value);
            testExpression(expr + ' =~ /d.*/', /d.*/.test(value));
            testExpression(expr + ' =~ /D/i', /D/i.test(value));
            /* eslint-enable eqeqeq */
        }
        testBatch('a', true);
        testBatch('b', false);
        testBatch('c', '5');
        testBatch('d', 'd');
        testBatch('z', undefined);
        testExpression('true', true);
        testExpression('false', false);
        testExpression('a && !b', true && !false);
        testExpression('a && b', true && false);
        testExpression('a && !b && c == 5', true && !false && '5' === '5');
        testExpression('d =~ /e.*/', false);
        // precedence test: false && true || true === true because && is evaluated first
        testExpression('b && a || a', true);
        testExpression('a || b', true);
        testExpression('b || b', false);
        testExpression('b && a || a && b', false);
    });
    test('negate', () => {
        function testNegate(expr, expected) {
            const actual = ContextKeyExpr.deserialize(expr).negate().serialize();
            assert.strictEqual(actual, expected);
        }
        testNegate('true', 'false');
        testNegate('false', 'true');
        testNegate('a', '!a');
        testNegate('a && b || c', '!a && !c || !b && !c');
        testNegate('a && b || c || d', '!a && !c && !d || !b && !c && !d');
        testNegate('!a && !b || !c && !d', 'a && c || a && d || b && c || b && d');
        testNegate('!a && !b || !c && !d || !e && !f', 'a && c && e || a && c && f || a && d && e || a && d && f || b && c && e || b && c && f || b && d && e || b && d && f');
    });
    test('false, true', () => {
        function testNormalize(expr, expected) {
            const actual = ContextKeyExpr.deserialize(expr).serialize();
            assert.strictEqual(actual, expected);
        }
        testNormalize('true', 'true');
        testNormalize('!true', 'false');
        testNormalize('false', 'false');
        testNormalize('!false', 'true');
        testNormalize('a && true', 'a');
        testNormalize('a && false', 'false');
        testNormalize('a || true', 'true');
        testNormalize('a || false', 'a');
        testNormalize('isMac', isMacintosh ? 'true' : 'false');
        testNormalize('isLinux', isLinux ? 'true' : 'false');
        testNormalize('isWindows', isWindows ? 'true' : 'false');
    });
    test('issue #101015: distribute OR', () => {
        function t(expr1, expr2, expected) {
            const e1 = ContextKeyExpr.deserialize(expr1);
            const e2 = ContextKeyExpr.deserialize(expr2);
            const actual = ContextKeyExpr.and(e1, e2)?.serialize();
            assert.strictEqual(actual, expected);
        }
        t('a', 'b', 'a && b');
        t('a || b', 'c', 'a && c || b && c');
        t('a || b', 'c || d', 'a && c || a && d || b && c || b && d');
        t('a || b', 'c && d', 'a && c && d || b && c && d');
        t('a || b', 'c && d || e', 'a && e || b && e || a && c && d || b && c && d');
    });
    test('ContextKeyInExpr', () => {
        const ainb = ContextKeyExpr.deserialize('a in b');
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 3, 'b': [3, 2, 1] })), true);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 3, 'b': [1, 2, 3] })), true);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 3, 'b': [1, 2] })), false);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 3 })), false);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 3, 'b': null })), false);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 'x', 'b': ['x'] })), true);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 'x', 'b': ['y'] })), false);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 'x', 'b': {} })), false);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 'x', 'b': { 'x': false } })), true);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 'x', 'b': { 'x': true } })), true);
        assert.strictEqual(ainb.evaluate(createContext({ 'a': 'prototype', 'b': {} })), false);
        // file URI case-insensitive comparison on Windows
        if (isWindows) {
            // Array source: file URIs with different casing should match on Windows
            assert.strictEqual(ainb.evaluate(createContext({ 'a': 'file:///c%3A/Users/path/file.ts', 'b': ['file:///c%3A/users/path/file.ts'] })), true);
            assert.strictEqual(ainb.evaluate(createContext({ 'a': 'file:///c%3A/users/path/file.ts', 'b': ['file:///c%3A/Users/path/file.ts'] })), true);
            // Object source: file URIs with different casing should match on Windows
            assert.strictEqual(ainb.evaluate(createContext({ 'a': 'file:///c%3A/Users/path/file.ts', 'b': { 'file:///c%3A/users/path/file.ts': true } })), true);
            // Non-file URIs should still be case-sensitive
            assert.strictEqual(ainb.evaluate(createContext({ 'a': 'git:/path/File.ts', 'b': ['git:/path/file.ts'] })), false);
            // Exact match still works
            assert.strictEqual(ainb.evaluate(createContext({ 'a': 'file:///c%3A/Users/path/file.ts', 'b': ['file:///c%3A/Users/path/file.ts'] })), true);
        }
    });
    test('ContextKeyNotInExpr', () => {
        const aNotInB = ContextKeyExpr.deserialize('a not in b');
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 3, 'b': [3, 2, 1] })), false);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 3, 'b': [1, 2, 3] })), false);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 3, 'b': [1, 2] })), true);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 3 })), true);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 3, 'b': null })), true);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'x', 'b': ['x'] })), false);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'x', 'b': ['y'] })), true);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'x', 'b': {} })), true);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'x', 'b': { 'x': false } })), false);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'x', 'b': { 'x': true } })), false);
        assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'prototype', 'b': {} })), true);
        // file URI case-insensitive comparison on Windows
        if (isWindows) {
            assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'file:///c%3A/Users/path/file.ts', 'b': ['file:///c%3A/users/path/file.ts'] })), false);
            assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'file:///c%3A/users/path/file.ts', 'b': ['file:///c%3A/Users/path/file.ts'] })), false);
            assert.strictEqual(aNotInB.evaluate(createContext({ 'a': 'git:/path/File.ts', 'b': ['git:/path/file.ts'] })), true);
        }
    });
    test('issue #106524: distributing AND should normalize', () => {
        const actual = ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.has('a'), ContextKeyExpr.has('b')), ContextKeyExpr.has('c'));
        const expected = ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.has('a'), ContextKeyExpr.has('c')), ContextKeyExpr.and(ContextKeyExpr.has('b'), ContextKeyExpr.has('c')));
        assert.strictEqual(actual.equals(expected), true);
    });
    test('issue #129625: Removes duplicated terms in OR expressions', () => {
        const expr = ContextKeyExpr.or(ContextKeyExpr.has('A'), ContextKeyExpr.has('B'), ContextKeyExpr.has('A'));
        assert.strictEqual(expr.serialize(), 'A || B');
    });
    test('Resolves true constant OR expressions', () => {
        const expr = ContextKeyExpr.or(ContextKeyExpr.has('A'), ContextKeyExpr.not('A'));
        assert.strictEqual(expr.serialize(), 'true');
    });
    test('Resolves false constant AND expressions', () => {
        const expr = ContextKeyExpr.and(ContextKeyExpr.has('A'), ContextKeyExpr.not('A'));
        assert.strictEqual(expr.serialize(), 'false');
    });
    test('issue #129625: Removes duplicated terms in AND expressions', () => {
        const expr = ContextKeyExpr.and(ContextKeyExpr.has('A'), ContextKeyExpr.has('B'), ContextKeyExpr.has('A'));
        assert.strictEqual(expr.serialize(), 'A && B');
    });
    test('issue #129625: Remove duplicated terms when negating', () => {
        const expr = ContextKeyExpr.and(ContextKeyExpr.has('A'), ContextKeyExpr.or(ContextKeyExpr.has('B1'), ContextKeyExpr.has('B2')));
        assert.strictEqual(expr.serialize(), 'A && B1 || A && B2');
        assert.strictEqual(expr.negate().serialize(), '!A || !A && !B1 || !A && !B2 || !B1 && !B2');
        assert.strictEqual(expr.negate().negate().serialize(), 'A && B1 || A && B2');
        assert.strictEqual(expr.negate().negate().negate().serialize(), '!A || !A && !B1 || !A && !B2 || !B1 && !B2');
    });
    test('issue #129625: remove redundant terms in OR expressions', () => {
        function strImplies(p0, q0) {
            const p = ContextKeyExpr.deserialize(p0);
            const q = ContextKeyExpr.deserialize(q0);
            return implies(p, q);
        }
        assert.strictEqual(strImplies('a && b', 'a'), true);
        assert.strictEqual(strImplies('a', 'a && b'), false);
    });
    test('implies', () => {
        function strImplies(p0, q0) {
            const p = ContextKeyExpr.deserialize(p0);
            const q = ContextKeyExpr.deserialize(q0);
            return implies(p, q);
        }
        assert.strictEqual(strImplies('a', 'a'), true);
        assert.strictEqual(strImplies('a', 'a || b'), true);
        assert.strictEqual(strImplies('a', 'a && b'), false);
        assert.strictEqual(strImplies('a', 'a && b || a && c'), false);
        assert.strictEqual(strImplies('a && b', 'a'), true);
        assert.strictEqual(strImplies('a && b', 'b'), true);
        assert.strictEqual(strImplies('a && b', 'a && b || c'), true);
        assert.strictEqual(strImplies('a || b', 'a || c'), false);
        assert.strictEqual(strImplies('a || b', 'a || b'), true);
        assert.strictEqual(strImplies('a && b', 'a && b'), true);
        assert.strictEqual(strImplies('a || b', 'a || b || c'), true);
        assert.strictEqual(strImplies('c && a && b', 'c && a'), true);
    });
    test('Greater, GreaterEquals, Smaller, SmallerEquals evaluate', () => {
        function checkEvaluate(expr, ctx, expected) {
            const _expr = ContextKeyExpr.deserialize(expr);
            assert.strictEqual(_expr.evaluate(createContext(ctx)), expected);
        }
        checkEvaluate('a > 1', {}, false);
        checkEvaluate('a > 1', { a: 0 }, false);
        checkEvaluate('a > 1', { a: 1 }, false);
        checkEvaluate('a > 1', { a: 2 }, true);
        checkEvaluate('a > 1', { a: '0' }, false);
        checkEvaluate('a > 1', { a: '1' }, false);
        checkEvaluate('a > 1', { a: '2' }, true);
        checkEvaluate('a > 1', { a: 'a' }, false);
        checkEvaluate('a > 10', { a: 2 }, false);
        checkEvaluate('a > 10', { a: 11 }, true);
        checkEvaluate('a > 10', { a: '11' }, true);
        checkEvaluate('a > 10', { a: '2' }, false);
        checkEvaluate('a > 10', { a: '11' }, true);
        checkEvaluate('a > 1.1', { a: 1 }, false);
        checkEvaluate('a > 1.1', { a: 2 }, true);
        checkEvaluate('a > 1.1', { a: 11 }, true);
        checkEvaluate('a > 1.1', { a: '1.1' }, false);
        checkEvaluate('a > 1.1', { a: '2' }, true);
        checkEvaluate('a > 1.1', { a: '11' }, true);
        checkEvaluate('a > b', { a: 'b' }, false);
        checkEvaluate('a > b', { a: 'c' }, false);
        checkEvaluate('a > b', { a: 1000 }, false);
        checkEvaluate('a >= 2', { a: '1' }, false);
        checkEvaluate('a >= 2', { a: '2' }, true);
        checkEvaluate('a >= 2', { a: '3' }, true);
        checkEvaluate('a < 2', { a: '1' }, true);
        checkEvaluate('a < 2', { a: '2' }, false);
        checkEvaluate('a < 2', { a: '3' }, false);
        checkEvaluate('a <= 2', { a: '1' }, true);
        checkEvaluate('a <= 2', { a: '2' }, true);
        checkEvaluate('a <= 2', { a: '3' }, false);
    });
    test('Greater, GreaterEquals, Smaller, SmallerEquals negate', () => {
        function checkNegate(expr, expected) {
            const a = ContextKeyExpr.deserialize(expr);
            const b = a.negate();
            assert.strictEqual(b.serialize(), expected);
        }
        checkNegate('a > 1', 'a <= 1');
        checkNegate('a > 1.1', 'a <= 1.1');
        checkNegate('a > b', 'a <= b');
        checkNegate('a >= 1', 'a < 1');
        checkNegate('a >= 1.1', 'a < 1.1');
        checkNegate('a >= b', 'a < b');
        checkNegate('a < 1', 'a >= 1');
        checkNegate('a < 1.1', 'a >= 1.1');
        checkNegate('a < b', 'a >= b');
        checkNegate('a <= 1', 'a > 1');
        checkNegate('a <= 1.1', 'a > 1.1');
        checkNegate('a <= b', 'a > b');
    });
    test('issue #111899: context keys can use `<` or `>` ', () => {
        const actual = ContextKeyExpr.deserialize('editorTextFocus && vim.active && vim.use<C-r>');
        assert.ok(actual.equals(ContextKeyExpr.and(ContextKeyExpr.has('editorTextFocus'), ContextKeyExpr.has('vim.active'), ContextKeyExpr.has('vim.use<C-r>'))));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dGtleS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vY29udGV4dGtleS90ZXN0L2NvbW1vbi9jb250ZXh0a2V5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQXdCLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTNGLFNBQVMsYUFBYSxDQUFDLEdBQVE7SUFDOUIsT0FBTztRQUNOLFFBQVEsRUFBRSxDQUFDLEdBQVcsRUFBRSxFQUFFO1lBQ3pCLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pCLENBQUM7S0FDRCxDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7SUFFNUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLE1BQU0sQ0FBQyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQzNCLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ3hCLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUMvQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUN4QixjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsRUFDakMsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLEVBQ3BDLGNB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QUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25GLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJ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LEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDM0MsYUFBYSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzQyxhQUFhLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTNDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QyxhQUFhLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzQyxhQUFhLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTVDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxQyxhQUFhLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTNDLGFBQWEsQ0FBQyxR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