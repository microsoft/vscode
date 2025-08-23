/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-async-promise-executor */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

export async function sleep(timeout: number): Promise<number> {
    return new Promise<number>((resolve) => {
        setTimeout(() => resolve(timeout), timeout);
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function isThenable<T>(v: any): v is Thenable<T> {
    return typeof v?.then === 'function';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function isPromise<T>(v: any): v is Promise<T> {
    return typeof v?.then === 'function' && typeof v?.catch === 'function';
}

// Deferred

export interface Deferred<T> {
    readonly promise: Promise<T>;
    readonly resolved: boolean;
    readonly rejected: boolean;
    readonly completed: boolean;
    resolve(value?: T | PromiseLike<T>): void;
    reject(reason?: string | Error | Record<string, unknown> | unknown): void;
}

class DeferredImpl<T> implements Deferred<T> {
    private _resolve!: (value: T | PromiseLike<T>) => void;

    private _reject!: (reason?: string | Error | Record<string, unknown>) => void;

    private _resolved = false;

    private _rejected = false;

    private _promise: Promise<T>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(private scope: any = null) {
        this._promise = new Promise<T>((res, rej) => {
            this._resolve = res;
            this._reject = rej;
        });
    }

    public resolve(_value: T | PromiseLike<T>) {
        if (this.completed) {
            return;
        }
        this._resolve.apply(this.scope ? this.scope : this, [_value]);
        this._resolved = true;
    }

    public reject(_reason?: string | Error | Record<string, unknown>) {
        if (this.completed) {
            return;
        }
        this._reject.apply(this.scope ? this.scope : this, [_reason]);
        this._rejected = true;
    }

    get promise(): Promise<T> {
        return this._promise;
    }

    get resolved(): boolean {
        return this._resolved;
    }

    get rejected(): boolean {
        return this._rejected;
    }

    get completed(): boolean {
        return this._rejected || this._resolved;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function createDeferred<T = void>(scope: any = null): Deferred<T> {
    return new DeferredImpl<T>(scope);
}

export function createDeferredFrom<T>(...promises: Promise<T>[]): Deferred<T> {
    const deferred = createDeferred<T>();
    Promise.all<T>(promises)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(deferred.resolve.bind(deferred) as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch(deferred.reject.bind(deferred) as any);

    return deferred;
}
export function createDeferredFromPromise<T>(promise: Promise<T>): Deferred<T> {
    const deferred = createDeferred<T>();
    promise.then(deferred.resolve.bind(deferred)).catch(deferred.reject.bind(deferred));
    return deferred;
}

// iterators

interface IAsyncIterator<T> extends AsyncIterator<T, void> {}

export interface IAsyncIterableIterator<T> extends IAsyncIterator<T>, AsyncIterable<T> {}

/**
 * An iterator that yields nothing.
 */
export function iterEmpty<T>(): IAsyncIterableIterator<T> {
    return ((async function* () {
        /** No body. */
    })() as unknown) as IAsyncIterableIterator<T>;
}

type NextResult<T> = { index: number } & (
    | { result: IteratorResult<T, T | void>; err: null }
    | { result: null; err: Error }
);
async function getNext<T>(it: AsyncIterator<T, T | void>, indexMaybe?: number): Promise<NextResult<T>> {
    const index = indexMaybe === undefined ? -1 : indexMaybe;
    try {
        const result = await it.next();
        return { index, result, err: null };
    } catch (err) {
        return { index, err: err as Error, result: null };
    }
}

const NEVER: Promise<unknown> = new Promise(() => {
    /** No body. */
});

/**
 * Yield everything produced by the given iterators as soon as each is ready.
 *
 * When one of the iterators has something to yield then it gets yielded
 * right away, regardless of where the iterator is located in the array
 * of iterators.
 *
 * @param iterators - the async iterators from which to yield items
 * @param onError - called/awaited once for each iterator that fails
 */
export async function* chain<T>(
    iterators: AsyncIterator<T, T | void>[],
    onError?: (err: Error, index: number) => Promise<void>,
    // Ultimately we may also want to support cancellation.
): IAsyncIterableIterator<T> {
    const promises = iterators.map(getNext);
    let numRunning = iterators.length;

    while (numRunning > 0) {
        // Promise.race will not fail, because each promise calls getNext,
        // Which handles failures by wrapping each iterator in a try/catch block.
        const { index, result, err } = await Promise.race(promises);

        if (err !== null) {
            promises[index] = NEVER as Promise<NextResult<T>>;
            numRunning -= 1;
            if (onError !== undefined) {
                await onError(err, index);
            }
            // XXX Log the error.
        } else if (result!.done) {
            promises[index] = NEVER as Promise<NextResult<T>>;
            numRunning -= 1;
            // If R is void then result.value will be undefined.
            if (result!.value !== undefined) {
                yield result!.value;
            }
        } else {
            promises[index] = getNext(iterators[index], index);
            // Only the "return" result can be undefined (void),
            // so we're okay here.
            yield result!.value as T;
        }
    }
}

/**
 * Map the async function onto the items and yield the results.
 *
 * @param items - the items to map onto and iterate
 * @param func - the async function to apply for each item
 * @param race - if `true` (the default) then results are yielded
 *               potentially out of order, as soon as each is ready
 */
export async function* mapToIterator<T, R = T>(
    items: T[],
    func: (item: T) => Promise<R>,
    race = true,
): IAsyncIterableIterator<R> {
    if (race) {
        const iterators = items.map((item) => {
            async function* generator() {
                yield func(item);
            }
            return generator();
        });
        yield* iterable(chain(iterators));
    } else {
        yield* items.map(func);
    }
}

/**
 * Convert an iterator into an iterable, if it isn't one already.
 */
export function iterable<T>(iterator: IAsyncIterator<T>): IAsyncIterableIterator<T> {
    const it = iterator as IAsyncIterableIterator<T>;
    if (it[Symbol.asyncIterator] === undefined) {
        it[Symbol.asyncIterator] = () => it;
    }
    return it;
}

/**
 * Get everything yielded by the iterator.
 */
export async function flattenIterator<T>(iterator: IAsyncIterator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of iterable(iterator)) {
        results.push(item);
    }
    return results;
}

/**
 * Get everything yielded by the iterable.
 */
export async function flattenIterable<T>(iterableItem: AsyncIterable<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of iterableItem) {
        results.push(item);
    }
    return results;
}

/**
 * Wait for a condition to be fulfilled within a timeout.
 */
export async function waitForCondition(
    condition: () => Promise<boolean>,
    timeoutMs: number,
    errorMessage: string,
): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            clearTimeout(timeout);

            clearTimeout(timer);
            reject(new Error(errorMessage));
        }, timeoutMs);
        const timer = setInterval(async () => {
            if (!(await condition().catch(() => false))) {
                return;
            }
            clearTimeout(timeout);
            clearTimeout(timer);
            resolve();
        }, 10);
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPromiseLike<T>(v: any): v is PromiseLike<T> {
    return typeof v?.then === 'function';
}

export function raceTimeout<T>(timeout: number, ...promises: Promise<T>[]): Promise<T | undefined>;
export function raceTimeout<T>(timeout: number, defaultValue: T, ...promises: Promise<T>[]): Promise<T>;
export function raceTimeout<T>(timeout: number, defaultValue: T, ...promises: Promise<T>[]): Promise<T> {
    const resolveValue = isPromiseLike(defaultValue) ? undefined : defaultValue;
    if (isPromiseLike(defaultValue)) {
        promises.push((defaultValue as unknown) as Promise<T>);
    }

    let promiseResolve: ((value: T) => void) | undefined = undefined;

    const timer = setTimeout(() => promiseResolve?.((resolveValue as unknown) as T), timeout);

    return Promise.race([
        Promise.race(promises).finally(() => clearTimeout(timer)),
        new Promise<T>((resolve) => (promiseResolve = resolve)),
    ]);
}
