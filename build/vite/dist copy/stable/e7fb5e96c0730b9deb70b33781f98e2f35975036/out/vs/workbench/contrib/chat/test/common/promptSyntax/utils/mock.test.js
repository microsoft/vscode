/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mockObject, mockService } from './mock.js';
import { typeCheck } from '../../../../../../../base/common/types.js';
import { randomBoolean } from '../../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
suite('mockService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('mockObject', () => {
        test('overrides properties and functions', () => {
            const mock = mockObject({
                bar: 'oh hi!',
                baz: 42,
                anotherMethod(arg) {
                    return isNaN(arg);
                },
            });
            typeCheck(mock);
            assert.strictEqual(mock.bar, 'oh hi!', 'bar should be overriden');
            assert.strictEqual(mock.baz, 42, 'baz should be overriden');
            assert(!(mock.anotherMethod(490274)), 'Must execute overriden method correctly 1.');
            assert(mock.anotherMethod(NaN), 'Must execute overriden method correctly 2.');
            assert.throws(() => {
                // property is not overriden so must throw
                // eslint-disable-next-line local/code-no-unused-expressions
                mock.foo;
            });
            assert.throws(() => {
                // function is not overriden so must throw
                mock.someMethod(randomBoolean());
            });
        });
        test('immutability of the overrides object', () => {
            const overrides = {
                baz: 4,
            };
            const mock = mockObject(overrides);
            typeCheck(mock);
            assert.strictEqual(mock.baz, 4, 'baz should be overridden');
            // overrides object must be immutable
            assert.throws(() => {
                overrides.foo = 'test';
            });
            assert.throws(() => {
                overrides.someMethod = (arg) => {
                    return `${arg}__${arg}`;
                };
            });
        });
    });
    suite('mockService', () => {
        test('overrides properties and functions', () => {
            const mock = mockService({
                id: 'ciao!',
                counter: 74,
                testMethod2(arg) {
                    return !isNaN(arg);
                },
            });
            typeCheck(mock);
            assert.strictEqual(mock.id, 'ciao!', 'id should be overridden');
            assert.strictEqual(mock.counter, 74, 'counter should be overridden');
            assert(mock.testMethod2(74368), 'Must execute overridden method correctly 1.');
            assert(!(mock.testMethod2(NaN)), 'Must execute overridden method correctly 2.');
            assert.throws(() => {
                // property is not overridden so must throw
                // eslint-disable-next-line local/code-no-unused-expressions
                mock.prop1;
            });
            assert.throws(() => {
                // function is not overridden so must throw
                mock.method1(randomBoolean());
            });
        });
        test('immutability of the overrides object', () => {
            const overrides = {
                baz: false,
            };
            const mock = mockService(overrides);
            typeCheck(mock);
            assert.strictEqual(mock.baz, false, 'baz should be overridden');
            // overrides object must be immutable
            assert.throws(() => {
                overrides.foo = 'test';
            });
            assert.throws(() => {
                overrides.someMethod = (arg) => {
                    return `${arg}__${arg}`;
                };
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9jay50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvdXRpbHMvbW9jay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUNwRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXpHLEtBQUssQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO0lBQ3pCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7UUFDeEIsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQVMvQyxNQUFNLElBQUksR0FBRyxVQUFVLENBQWM7Z0JBQ3BDLEdBQUcsRUFBRSxRQUFRO2dCQUNiLEdBQUcsRUFBRSxFQUFFO2dCQUNQLGFBQWEsQ0FBQyxHQUFXO29CQUN4QixPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkIsQ0FBQzthQUNELENBQUMsQ0FBQztZQUVILFNBQVMsQ0FBYyxJQUFJLENBQUMsQ0FBQztZQUU3QixNQUFNLENBQUMsV0FBVyxDQUNqQixJQUFJLENBQUMsR0FBRyxFQUNSLFFBQVEsRUFDUix5QkFBeUIsQ0FDekIsQ0FBQztZQUVGLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLElBQUksQ0FBQyxHQUFHLEVBQ1IsRUFBRSxFQUNGLHlCQUF5QixDQUN6QixDQUFDO1lBRUYs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