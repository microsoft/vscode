import '../../common/extensions';
import { traceError } from '../../logging';
import { isTestExecution } from '../constants';
import { createDeferred, Deferred } from './async';
import { getCacheKeyFromFunctionArgs, getGlobalCacheStore } from './cacheUtils';
import { StopWatch } from './stopWatch';

const _debounce = require('lodash/debounce') as typeof import('lodash/debounce');

type VoidFunction = () => any;
type AsyncVoidFunction = () => Promise<any>;

/**
 * Combine multiple sequential calls to the decorated function into one.
 * @export
 * @param {number} [wait] Wait time (milliseconds).
 * @returns void
 *
 * The point is to ensure that successive calls to the function result
 * only in a single actual call.  Following the most recent call to
 * the debounced function, debouncing resets after the "wait" interval
 * has elapsed.
 */
export function debounceSync(wait?: number) {
    if (isTestExecution()) {
        // If running tests, lets debounce until the next cycle in the event loop.
        // Same as `setTimeout(()=> {}, 0);` with a value of `0`.
        wait = undefined;
    }
    return makeDebounceDecorator(wait);
}

/**
 * Combine multiple sequential calls to the decorated async function into one.
 * @export
 * @param {number} [wait] Wait time (milliseconds).
 * @returns void
 *
 * The point is to ensure that successive calls to the function result
 * only in a single actual call.  Following the most recent call to
 * the debounced function, debouncing resets after the "wait" interval
 * has elapsed.
 */
export function debounceAsync(wait?: number) {
    if (isTestExecution()) {
        // If running tests, lets debounce until the next cycle in the event loop.
        // Same as `setTimeout(()=> {}, 0);` with a value of `0`.
        wait = undefined;
    }
    return makeDebounceAsyncDecorator(wait);
}

export function makeDebounceDecorator(wait?: number) {
    return function (_target: any, _propertyName: string, descriptor: TypedPropertyDescriptor<VoidFunction>) {
        // We could also make use of _debounce() options.  For instance,
        // the following causes the original method to be called
        // immediately:
        //
        //   {leading: true, trailing: false}
        //
        // The default is:
        //
        //   {leading: false, trailing: true}
        //
        // See https://lodash.com/docs/#debounce.
        const options = {};
        const originalMethod = descriptor.value!;
        const debounced = _debounce(
            function (this: any) {
                return originalMethod.apply(this, arguments as any);
            },
            wait,
            options,
        );
        (descriptor as any).value = debounced;
    };
}

export function makeDebounceAsyncDecorator(wait?: number) {
    return function (_target: any, _propertyName: string, descriptor: TypedPropertyDescriptor<AsyncVoidFunction>) {
        type StateInformation = {
            started: boolean;
            deferred: Deferred<any> | undefined;
            timer: NodeJS.Timer | number | undefined;
        };
        const originalMethod = descriptor.value!;
        const state: StateInformation = { started: false, deferred: undefined, timer: undefined };

        // Lets defer execution using a setTimeout for the given time.
        (descriptor as any).value = function (this: any) {
            const existingDeferred: Deferred<any> | undefined = state.deferred;
            if (existingDeferred && state.started) {
                return existingDeferred.promise;
            }

            // Clear previous timer.
            const existingDeferredCompleted = existingDeferred && existingDeferred.completed;
            const deferred = (state.deferred =
                !existingDeferred || existingDeferredCompleted ? createDeferred<any>() : existingDeferred);
            if (state.timer) {
                clearTimeout(state.timer as any);
            }

            state.timer = setTimeout(async () => {
                state.started = true;
                originalMethod
                    .apply(this)
                    .then((r) => {
                        state.started = false;
                        deferred.resolve(r);
                    })
                    .catch((ex) => {
                        state.started = false;
                        deferred.reject(ex);
                    });
            }, wait || 0);
            return deferred.promise;
        };
    };
}

type PromiseFunctionWithAnyArgs = (...any: any) => Promise<any>;
const cacheStoreForMethods = getGlobalCacheStore();

/**
 * Extension start up time is considered the duration until extension is likely to keep running commands in background.
 * It is observed on CI it can take upto 3 minutes, so this is an intelligent guess.
 */
const extensionStartUpTime = 200_000;
/**
 * Tracks the time since the module was loaded. For caching purposes, we consider this time to approximately signify
 * how long extension has been active.
 */
const moduleLoadWatch = new StopWatch();
/**
 * Caches function value until a specific duration.
 * @param expiryDurationMs Duration to cache the result for. If set as '-1', the cache will never expire for the session.
 * @param cachePromise If true, cache the promise instead of the promise result.
 * @param expiryDurationAfterStartUpMs If specified, this is the duration to cache the result for after extension startup (until extension is likely to
 * keep running commands in background)
 */
export function cache(expiryDurationMs: number, cachePromise = false, expiryDurationAfterStartUpMs?: number) {
    return function (
        target: Object,
        propertyName: string,
        descriptor: TypedPropertyDescriptor<PromiseFunctionWithAnyArgs>,
    ) {
        const originalMethod = descriptor.value!;
        const className = 'constructor' in target && target.constructor.name ? target.constructor.name : '';
        const keyPrefix = `Cache_Method_Output_${className}.${propertyName}`;
        descriptor.value = async function (...args: any) {
            if (isTestExecution()) {
                return originalMethod.apply(this, args) as Promise<any>;
            }
            let key: string;
            try {
                key = getCacheKeyFromFunctionArgs(keyPrefix, args);
            } catch (ex) {
                traceError('Error while creating key for keyPrefix:', keyPrefix, ex);
                return originalMethod.apply(this, args) as Promise<any>;
            }
            const cachedItem = cacheStoreForMethods.get(key);
            if (cachedItem && (cachedItem.expiry > Date.now() || expiryDurationMs === -1)) {
                return Promise.resolve(cachedItem.data);
            }
            const expiryMs =
                expiryDurationAfterStartUpMs && moduleLoadWatch.elapsedTime > extensionStartUpTime
                    ? expiryDurationAfterStartUpMs
                    : expiryDurationMs;
            const promise = originalMethod.apply(this, args) as Promise<any>;
            if (cachePromise) {
                cacheStoreForMethods.set(key, { data: promise, expiry: Date.now() + expiryMs });
            } else {
                promise
                    .then((result) => cacheStoreForMethods.set(key, { data: result, expiry: Date.now() + expiryMs }))
                    .ignoreErrors();
            }
            return promise;
        };
    };
}

/**
 * Swallows exceptions thrown by a function. Function must return either a void or a promise that resolves to a void.
 * When exceptions (including in promises) are caught, this will return `undefined` to calling code.
 * @export
 * @param {string} [scopeName] Scope for the error message to be logged along with the error.
 * @returns void
 */
export function swallowExceptions(scopeName?: string) {
    return function (_target: any, propertyName: string, descriptor: TypedPropertyDescriptor<any>) {
        const originalMethod = descriptor.value!;
        const errorMessage = `Python Extension (Error in ${scopeName || propertyName}, method:${propertyName}):`;

        descriptor.value = function (...args: any[]) {
            try {
                const result = originalMethod.apply(this, args);

                // If method being wrapped returns a promise then wait and swallow errors.
                if (result && typeof result.then === 'function' && typeof result.catch === 'function') {
                    return (result as Promise<void>).catch((error) => {
                        if (isTestExecution()) {
                            return;
                        }
                        traceError(errorMessage, error);
                    });
                }
            } catch (error) {
                if (isTestExecution()) {
                    return;
                }
                traceError(errorMessage, error);
            }
        };
    };
}
