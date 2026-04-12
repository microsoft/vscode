/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Avoid circular dependency on EventEmitter by implementing a subset of the interface.
export class ErrorHandler {
    constructor() {
        this.listeners = [];
        this.unexpectedErrorHandler = function (e) {
            setTimeout(() => {
                if (e.stack) {
                    if (ErrorNoTelemetry.isErrorNoTelemetry(e)) {
                        throw new ErrorNoTelemetry(e.message + '\n\n' + e.stack);
                    }
                    throw new Error(e.message + '\n\n' + e.stack);
                }
                throw e;
            }, 0);
        };
    }
    addListener(listener) {
        this.listeners.push(listener);
        return () => {
            this._removeListener(listener);
        };
    }
    emit(e) {
        this.listeners.forEach((listener) => {
            listener(e);
        });
    }
    _removeListener(listener) {
        this.listeners.splice(this.listeners.indexOf(listener), 1);
    }
    setUnexpectedErrorHandler(newUnexpectedErrorHandler) {
        this.unexpectedErrorHandler = newUnexpectedErrorHandler;
    }
    getUnexpectedErrorHandler() {
        return this.unexpectedErrorHandler;
    }
    onUnexpectedError(e) {
        this.unexpectedErrorHandler(e);
        this.emit(e);
    }
    // For external errors, we don't want the listeners to be called
    onUnexpectedExternalError(e) {
        this.unexpectedErrorHandler(e);
    }
}
export const errorHandler = new ErrorHandler();
/** @skipMangle */
export function setUnexpectedErrorHandler(newUnexpectedErrorHandler) {
    errorHandler.setUnexpectedErrorHandler(newUnexpectedErrorHandler);
}
/**
 * Returns if the error is a SIGPIPE error. SIGPIPE errors should generally be
 * logged at most once, to avoid a loop.
 *
 * @see https://github.com/microsoft/vscode-remote-release/issues/6481
 */
export function isSigPipeError(e) {
    if (!e || typeof e !== 'object') {
        return false;
    }
    const cast = e;
    return cast.code === 'EPIPE' && cast.syscall?.toUpperCase() === 'WRITE';
}
/**
 * This function should only be called with errors that indicate a bug in the product.
 * E.g. buggy extensions/invalid user-input/network issues should not be able to trigger this code path.
 * If they are, this indicates there is also a bug in the product.
*/
export function onBugIndicatingError(e) {
    errorHandler.onUnexpectedError(e);
    return undefined;
}
export function onUnexpectedError(e) {
    // ignore errors from cancelled promises
    if (!isCancellationError(e)) {
        errorHandler.onUnexpectedError(e);
    }
    return undefined;
}
export function onUnexpectedExternalError(e) {
    // ignore errors from cancelled promises
    if (!isCancellationError(e)) {
        errorHandler.onUnexpectedExternalError(e);
    }
    return undefined;
}
export function transformErrorForSerialization(error) {
    if (error instanceof Error) {
        const { name, message, cause } = error;
        // eslint-disable-next-line local/code-no-any-casts
        const stack = error.stacktrace || error.stack;
        return {
            $isError: true,
            name,
            message,
            stack,
            noTelemetry: ErrorNoTelemetry.isErrorNoTelemetry(error),
            cause: cause ? transformErrorForSerialization(cause) : undefined,
            code: error.code
        };
    }
    // return as is
    return error;
}
export function transformErrorFromSerialization(data) {
    let error;
    if (data.noTelemetry) {
        error = new ErrorNoTelemetry();
    }
    else {
        error = new Error();
        error.name = data.name;
    }
    error.message = data.message;
    error.stack = data.stack;
    if (data.code) {
        error.code = data.code;
    }
    if (data.cause) {
        error.cause = transformErrorFromSerialization(data.cause);
    }
    return error;
}
export const canceledName = 'Canceled';
/**
 * Checks if the given error is a promise in canceled state
 */
export function isCancellationError(error) {
    if (error instanceof CancellationError) {
        return true;
    }
    return error instanceof Error && error.name === canceledName && error.message === canceledName;
}
// !!!IMPORTANT!!!
// Do NOT change this class because it is also used as an API-type.
export class CancellationError extends Error {
    constructor() {
        super(canceledName);
        this.name = this.message;
    }
}
export class PendingMigrationError extends Error {
    static { this._name = 'PendingMigrationError'; }
    static is(error) {
        return error instanceof PendingMigrationError || (error instanceof Error && error.name === PendingMigrationError._name);
    }
    constructor(message) {
        super(message);
        this.name = PendingMigrationError._name;
    }
}
/**
 * @deprecated use {@link CancellationError `new CancellationError()`} instead
 */
export function canceled() {
    const error = new Error(canceledName);
    error.name = error.message;
    return error;
}
export function illegalArgument(name) {
    if (name) {
        return new Error(`Illegal argument: ${name}`);
    }
    else {
        return new Error('Illegal argument');
    }
}
export function illegalState(name) {
    if (name) {
        return new Error(`Illegal state: ${name}`);
    }
    else {
        return new Error('Illegal state');
    }
}
export class ReadonlyError extends TypeError {
    constructor(name) {
        super(name ? `${name} is read-only and cannot be changed` : 'Cannot change read-only property');
    }
}
export function getErrorMessage(err) {
    if (!err) {
        return 'Error';
    }
    if (err.message) {
        return err.message;
    }
    if (err.stack) {
        return err.stack.split('\n')[0];
    }
    return String(err);
}
export class NotImplementedError extends Error {
    constructor(message) {
        super('NotImplemented');
        if (message) {
            this.message = message;
        }
    }
}
export class NotSupportedError extends Error {
    constructor(message) {
        super('NotSupported');
        if (message) {
            this.message = message;
        }
    }
}
export class ExpectedError extends Error {
    constructor() {
        super(...arguments);
        this.isExpected = true;
    }
}
/**
 * Error that when thrown won't be logged in telemetry as an unhandled error.
 */
export class ErrorNoTelemetry extends Error {
    constructor(msg) {
        super(msg);
        this.name = 'CodeExpectedError';
    }
    static fromError(err) {
        if (err instanceof ErrorNoTelemetry) {
            return err;
        }
        const result = new ErrorNoTelemetry();
        result.message = err.message;
        result.stack = err.stack;
        return result;
    }
    static isErrorNoTelemetry(err) {
        return err.name === 'CodeExpectedError';
    }
}
/**
 * This error indicates a bug.
 * Do not throw this for invalid user input.
 * Only catch this error to recover gracefully from bugs.
 */
export class BugIndicatingError extends Error {
    constructor(message) {
        super(message || 'An unexpected bug occurred.');
        Object.setPrototypeOf(this, BugIndicatingError.prototype);
        // Because we know for sure only buggy code throws this,
        // we definitely want to break here and fix the bug.
        // debugger;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vZXJyb3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBVWhHLHVGQUF1RjtBQUN2RixNQUFNLE9BQU8sWUFBWTtJQUl4QjtRQUVDLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBRXBCLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxVQUFVLENBQU07WUFDN0MsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDZixJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDYixJQUFJLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQzVDLE1BQU0sSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsT0FBTyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzFELENBQUM7b0JBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQy9DLENBQUM7Z0JBRUQsTUFBTSxDQUFDLENBQUM7WUFDVCxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUM7SUFDSCxDQUFDO0lBRUQsV0FBVyxDQUFDLFFBQStCO1FBQzFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTlCLE9BQU8sR0FBRyxFQUFFO1lBQ1gsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUM7SUFDSCxDQUFDO0lBRU8sSUFBSSxDQUFDLENBQU07UUFDbEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUNuQyxR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