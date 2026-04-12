/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError, onUnexpectedError } from './errors.js';
/**
 * Throws an error with the provided message if the provided value does not evaluate to a true Javascript value.
 *
 * @deprecated Use `assert(...)` instead.
 * This method is usually used like this:
 * ```ts
 * import * as assert from 'vs/base/common/assert';
 * assert.ok(...);
 * ```
 *
 * However, `assert` in that example is a user chosen name.
 * There is no tooling for generating such an import statement.
 * Thus, the `assert(...)` function should be used instead.
 */
export function ok(value, message) {
    if (!value) {
        throw new Error(message ? `Assertion failed (${message})` : 'Assertion Failed');
    }
}
export function assertNever(value, message = 'Unreachable') {
    throw new Error(message);
}
export function softAssertNever(value) {
    // no-op
}
/**
 * Asserts that a condition is `truthy`.
 *
 * @throws provided {@linkcode messageOrError} if the {@linkcode condition} is `falsy`.
 *
 * @param condition The condition to assert.
 * @param messageOrError An error message or error object to throw if condition is `falsy`.
 */
export function assert(condition, messageOrError = 'unexpected state') {
    if (!condition) {
        // if error instance is provided, use it, otherwise create a new one
        const errorToThrow = typeof messageOrError === 'string'
            ? new BugIndicatingError(`Assertion Failed: ${messageOrError}`)
            : messageOrError;
        throw errorToThrow;
    }
}
/**
 * Like assert, but doesn't throw.
 */
export function softAssert(condition, message = 'Soft Assertion Failed') {
    if (!condition) {
        onUnexpectedError(new BugIndicatingError(message));
    }
}
/**
 * condition must be side-effect free!
 */
export function assertFn(condition) {
    if (!condition()) {
        // eslint-disable-next-line no-debugger
        debugger;
        // Reevaluate `condition` again to make debugging easier
        condition();
        onUnexpectedError(new BugIndicatingError('Assertion Failed'));
    }
}
export function checkAdjacentItems(items, predicate) {
    let i = 0;
    while (i < items.length - 1) {
        const a = items[i];
        const b = items[i + 1];
        if (!predicate(a, b)) {
            return false;
        }
        i++;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vYXNzZXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVwRTs7Ozs7Ozs7Ozs7OztHQWFHO0FBQ0gsTUFBTSxVQUFVLEVBQUUsQ0FBQyxLQUFlLEVBQUUsT0FBZ0I7SUFDbkQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUNqRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sVUFBVSxXQUFXLENBQUMsS0FBWSxFQUFFLE9BQU8sR0FBRyxhQUFhO0lBQ2hFLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUVELE1BQU0sVUFBVSxlQUFlLENBQUMsS0FBWTtJQUMzQyxRQUFRO0FBQ1QsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxNQUFNLFVBQVUsTUFBTSxDQUNyQixTQUFrQixFQUNsQixpQkFBaUMsa0JBQWtCO0lBRW5ELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQixvRUFBb0U7UUFDcEUsTUFBTSxZQUFZLEdBQUcsT0FBTyxjQUFjLEtBQUssUUFBUTtZQUN0RCxDQUFDLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxxQkFBcUIsY0FBYyxFQUFFLENBQUM7WUFDL0QsQ0FBQyxDQUFDLGNBQWMsQ0FBQztRQUVsQixNQUFNLFlBQVksQ0FBQztJQUNwQixDQUFDO0FBQ0YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFVBQVUsQ0FBQyxTQUFrQixFQUFFLE9BQU8sR0FBRyx1QkFBdUI7SUFDL0UsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hCLGlCQUFpQixDQUFDLElBQUksa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNwRCxDQUFDO0FBQ0YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLFFBQVEsQ0FBQyxTQUF3QjtJQUNoRCxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQztRQUNsQix1Q0FBdUM7UUFDdkMsUUFBUSxDQUFDO1FBQ1Qsd0RBQXdEO1FBQ3hELFNBQVMsRUFBRSxDQUFDO1FBQ1osaUJBQWlCLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUksS0FBbUIsRUFBRSxTQUEwQztJQUNwRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDVixPQUFPLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzdCLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuQixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdEIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsQ0FBQyxFQUFFLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDIn0=