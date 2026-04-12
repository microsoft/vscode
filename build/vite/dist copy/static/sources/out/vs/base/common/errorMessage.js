/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as arrays from './arrays.js';
import * as types from './types.js';
import * as nls from '../../nls.js';
function exceptionToErrorMessage(exception, verbose) {
    if (verbose && (exception.stack || exception.stacktrace)) {
        return nls.localize('stackTrace.format', "{0}: {1}", detectSystemErrorMessage(exception), stackToString(exception.stack) || stackToString(exception.stacktrace));
    }
    return detectSystemErrorMessage(exception);
}
function stackToString(stack) {
    if (Array.isArray(stack)) {
        return stack.join('\n');
    }
    return stack;
}
function detectSystemErrorMessage(exception) {
    // Custom node.js error from us
    if (exception.code === 'ERR_UNC_HOST_NOT_ALLOWED') {
        return `${exception.message}. Please update the 'security.allowedUNCHosts' setting if you want to allow this host.`;
    }
    // See https://nodejs.org/api/errors.html#errors_class_system_error
    if (typeof exception.code === 'string' && typeof exception.errno === 'number' && typeof exception.syscall === 'string') {
        return nls.localize('nodeExceptionMessage', "A system error occurred ({0})", exception.message);
    }
    return exception.message || nls.localize('error.defaultMessage', "An unknown error occurred. Please consult the log for more details.");
}
/**
 * Tries to generate a human readable error message out of the error. If the verbose parameter
 * is set to true, the error message will include stacktrace details if provided.
 *
 * @returns A string containing the error message.
 */
export function toErrorMessage(error = null, verbose = false) {
    if (!error) {
        return nls.localize('error.defaultMessage', "An unknown error occurred. Please consult the log for more details.");
    }
    if (Array.isArray(error)) {
        const errors = arrays.coalesce(error);
        const msg = toErrorMessage(errors[0], verbose);
        if (errors.length > 1) {
            return nls.localize('error.moreErrors', "{0} ({1} errors in total)", msg, errors.length);
        }
        return msg;
    }
    if (types.isString(error)) {
        return error;
    }
    if (error.detail) {
        const detail = error.detail;
        if (detail.error) {
            return exceptionToErrorMessage(detail.error, verbose);
        }
        if (detail.exception) {
            return exceptionToErrorMessage(detail.exception, verbose);
        }
    }
    if (error.stack) {
        return exceptionToErrorMessage(error, verbose);
    }
    if (error.message) {
        return error.message;
    }
    return nls.localize('error.defaultMessage', "An unknown error occurred. Please consult the log for more details.");
}
export function isErrorWithActions(obj) {
    const candidate = obj;
    return candidate instanceof Error && Array.isArray(candidate.actions);
}
export function createErrorWithActions(messageOrError, actions) {
    let error;
    if (typeof messageOrError === 'string') {
        error = new Error(messageOrError);
    }
    else {
        error = messageOrError;
    }
    error.actions = actions;
    return error;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JNZXNzYWdlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sYUFBYSxDQUFDO0FBQ3RDLE9BQU8sS0FBSyxLQUFLLE1BQU0sWUFBWSxDQUFDO0FBQ3BDLE9BQU8sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDO0FBR3BDLFNBQVMsdUJBQXVCLENBQUMsU0FBYyxFQUFFLE9BQWdCO0lBQ2hFLElBQUksT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUMxRCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksYUFBYSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ2xLLENBQUM7SUFFRCxPQUFPLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzVDLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxLQUFvQztJQUMxRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsd0JBQXdCLENBQUMsU0FBYztJQUUvQywrQkFBK0I7SUFDL0IsSUFBSSxTQUFTLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7UUFDbkQsT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUFPLHdGQUF3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