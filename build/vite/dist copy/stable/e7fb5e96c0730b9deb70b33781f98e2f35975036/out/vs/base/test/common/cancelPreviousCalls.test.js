/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import assert from 'assert';
import { Disposable } from '../../common/lifecycle.js';
import { CancellationToken } from '../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { cancelPreviousCalls } from '../../common/decorators/cancelPreviousCalls.js';
suite('cancelPreviousCalls decorator', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    class MockDisposable extends Disposable {
        constructor() {
            super(...arguments);
            /**
             * Arguments that the {@linkcode doSomethingAsync} method was called with.
             */
            this.callArgs1 = [];
            /**
             * Arguments that the {@linkcode doSomethingElseAsync} method was called with.
             */
            this.callArgs2 = [];
        }
        /**
         * Returns the arguments that the {@linkcode doSomethingAsync} method was called with.
         */
        get callArguments1() {
            return this.callArgs1;
        }
        /**
         * Returns the arguments that the {@linkcode doSomethingElseAsync} method was called with.
         */
        get callArguments2() {
            return this.callArgs2;
        }
        async doSomethingAsync(arg1, arg2, cancellationToken) {
            this.callArgs1.push([arg1, arg2, cancellationToken]);
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        async doSomethingElseAsync(arg1, arg2, cancellationToken) {
            this.callArgs2.push([arg1, arg2, cancellationToken]);
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    }
    __decorate([
        cancelPreviousCalls
    ], MockDisposable.prototype, "doSomethingAsync", null);
    __decorate([
        cancelPreviousCalls
    ], MockDisposable.prototype, "doSomethingElseAsync", null);
    test('should call method with CancellationToken', async () => {
        const instance = disposables.add(new MockDisposable());
        await instance.doSomethingAsync(1, 'foo');
        const callArguments = instance.callArguments1;
        assert.strictEqual(callArguments.length, 1, `The 'doSomethingAsync' method must be called just once.`);
        const args = callArguments[0];
        assert(args.length === 3, `The 'doSomethingAsync' method must be called with '3' arguments, got '${args.length}'.`);
        const arg1 = args[0];
        const arg2 = args[1];
        const arg3 = args[2];
        assert.strictEqual(arg1, 1, `The 'doSomethingAsync' method call must have the correct 1st argument.`);
        assert.strictEqual(arg2, 'foo', `The 'doSomethingAsync' method call must have the correct 2nd argument.`);
        assert(CancellationToken.isCancellationToken(arg3), `The last argument of the 'doSomethingAsync' method must be a 'CancellationToken', got '${arg3}'.`);
        assert(arg3.isCancellationRequested === false, `The 'CancellationToken' argument must not yet be cancelled.`);
        assert(instance.callArguments2.length === 0, `The 'doSomethingElseAsync' method must not be called.`);
    });
    test('cancel token of the previous call when method is called again', async () => {
        const instance = disposables.add(new MockDisposable());
        instance.doSomethingAsync(1, 'foo');
        await new Promise(resolve => setTimeout(resolve, 10));
        instance.doSomethingAsync(2, 'bar');
        const callArguments = instance.callArguments1;
        assert.strictEqual(callArguments.length, 2, `The 'doSomethingAsync' method must be called twice.`);
        const call1Args = callArguments[0];
        assert(call1Args.length === 3, `The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`);
        assert.strictEqual(call1Args[0], 1, `The first call of the 'doSomethingAsync' method must have the correct 1st argument.`);
        assert.strictEqual(call1Args[1], 'foo', `The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`);
        assert(CancellationToken.isCancellationToken(call1Args[2]), `The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`);
        assert(call1Args[2].isCancellationRequested === true, `The 'CancellationToken' of the first call must be cancelled.`);
        const call2Args = callArguments[1];
        assert(call2Args.length === 3, `The second call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`);
        assert.strictEqual(call2Args[0], 2, `The second call of the 'doSomethingAsync' method must have the correct 1st argument.`);
        assert.strictEqual(call2Args[1], 'bar', `The second call of the 'doSomethingAsync' method must have the correct 2nd argument.`);
        assert(CancellationToken.isCancellationToken(call2Args[2]), `The second call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`);
        assert(call2Args[2].isCancellationRequested === false, `The 'CancellationToken' of the second call must be cancelled.`);
        assert(instance.callArguments2.length === 0, `The 'doSomethingElseAsync' method must not be called.`);
    });
    test('different method calls must not interfere with each other', async () => {
        const instance = disposables.add(new MockDisposable());
        instance.doSomethingAsync(10, 'baz');
        await new Promise(resolve => setTimeout(resolve, 10));
        instance.doSomethingElseAsync(25, 'qux');
        assert.strictEqual(instance.callArguments1.length, 1, `The 'doSomethingAsync' method must be called once.`);
        const call1Args = instance.callArguments1[0];
        assert(call1Args.length === 3, `The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`);
        assert.strictEqual(call1Args[0], 10, `The first call of the 'doSomethingAsync' method must have the correct 1st argument.`);
        assert.strictEqual(call1Args[1], 'baz', `The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`);
        assert(CancellationToken.isCancellationToken(call1Args[2]), `The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`);
        assert(call1Args[2].isCancellationRequested === false, `The 'CancellationToken' of the first call must not be cancelled.`);
        assert.strictEqual(instance.callArguments2.length, 1, `The 'doSomethingElseAsync' method must be called once.`);
        const call2Args = instance.callArguments2[0];
        assert(call2Args.length === 3, `The first call of the 'doSomethingElseAsync' method must have '3' arguments, got '${call1Args.length}'.`);
        assert.strictEqual(call2Args[0], 25, `The first call of the 'doSomethingElseAsync' method must have the correct 1st argument.`);
        assert.strictEqual(call2Args[1], 'qux', `The first call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`);
        assert(CancellationToken.isCancellationToken(call2Args[2]), `The first call of the 'doSomethingElseAsync' method must have the 'CancellationToken' as the 3rd argument.`);
        assert(call2Args[2].isCancellationRequested === false, `The 'CancellationToken' of the second call must be cancelled.`);
        instance.doSomethingElseAsync(105, 'uxi');
        assert.strictEqual(instance.callArguments1.length, 1, `The 'doSomethingAsync' method must be called once.`);
        assert.strictEqual(instance.callArguments2.length, 2, `The 'doSomethingElseAsync' method must be called twice.`);
        assert(call1Args[2].isCancellationRequested === false, `The 'CancellationToken' of the first call must not be cancelled.`);
        const call3Args = instance.callArguments2[1];
        assert(CancellationToken.isCancellationToken(call3Args[2]), `The last argument of the second call of the 'doSomethingElseAsync' method must be a 'CancellationToken'.`);
        assert(call2Args[2].isCancellationRequested, `The 'CancellationToken' of the first call must be cancelled.`);
        assert(call3Args[2].isCancellationRequested === false, `The 'CancellationToken' of the second call must not be cancelled.`);
        assert.strictEqual(call3Args[0], 105, `The second call of the 'doSomethingElseAsync' method must have the correct 1st argument.`);
        assert.strictEqual(call3Args[1], 'uxi', `The second call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FuY2VsUHJldmlvdXNDYWxscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9jYW5jZWxQcmV2aW91c0NhbGxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDckUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFckYsS0FBSyxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtJQUMzQyxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTlELE1BQU0sY0FBZSxTQUFRLFVBQVU7UUFBdkM7O1lBQ0M7O2VBRUc7WUFDYyxjQUFTLEdBQXdELEVBQUUsQ0FBQztZQUVyRjs7ZUFFRztZQUNjLGNBQVMsR0FBd0QsRUFBRSxDQUFDO1FBNkJ0RixDQUFDO1FBM0JBOztXQUVHO1FBQ0gsSUFBVyxjQUFjO1lBQ3hCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUN2QixDQUFDO1FBRUQ7O1dBRUc7UUFDSCxJQUFXLGNBQWM7WUFDeEIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQ3ZCLENBQUM7UUFHSyxBQUFOLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFZLEVBQUUsSUFBWSxFQUFFLGlCQUFxQztZQUN2RixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBRXJELE1B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