// Type definitions for Q
// Project: https://github.com/kriskowal/q
// Definitions by: Barrie Nemetchek <https://github.com/bnemetchek>, Andrew Gaspar <https://github.com/AndrewGaspar/>, John Reilly <https://github.com/johnnyreilly>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/**
 * If value is a Q promise, returns the promise.
 * If value is a promise from another library it is coerced into a Q promise (where possible).
 */
declare function Q<T>(promise: Q.IPromise<T>): Q.Promise<T>;
/**
 * If value is not a promise, returns a promise that is fulfilled with value.
 */
declare function Q<T>(value: T): Q.Promise<T>;
/**
 * Calling with nothing at all creates a void promise
 */
declare function Q(): Q.Promise<void>;

declare namespace Q {
    type IWhenable<T> = IPromise<T> | T;
    interface IPromise<T> {
        then<U>(onFulfill?: (value: T) => IWhenable<U>, onReject?: (error: any) => IWhenable<U>): IPromise<U>;
    }

    interface Deferred<T> {
        promise: Promise<T>;
        resolve(value?: IWhenable<T>): void;
        reject(reason: any): void;
        notify(value: any): void;
        makeNodeResolver(): (reason: any, value: T) => void;
    }

    interface Promise<T> {
        /**
         * Like a finally clause, allows you to observe either the fulfillment or rejection of a promise, but to do so without modifying the final value. This is useful for collecting resources regardless of whether a job succeeded, like closing a database connection, shutting a server down, or deleting an unneeded key from an object.

         * finally returns a promise, which will become resolved with the same fulfillment value or rejection reason as promise. However, if callback returns a promise, the resolution of the returned promise will be delayed until the promise returned from callback is finished.
         */
        fin(finallyCallback: () => any): Promise<T>;
        /**
         * Like a finally clause, allows you to observe either the fulfillment or rejection of a promise, but to do so without modifying the final value. This is useful for collecting resources regardless of whether a job succeeded, like closing a database connection, shutting a server down, or deleting an unneeded key from an object.

         * finally returns a promise, which will become resolved with the same fulfillment value or rejection reason as promise. However, if callback returns a promise, the resolution of the returned promise will be delayed until the promise returned from callback is finished.
         */
        finally(finallyCallback: () => any): Promise<T>;

        /**
         * The then method from the Promises/A+ specification, with an additional progress handler.
         */
        then<U>(onFulfill?: (value: T) => IWhenable<U>, onReject?: (error: any) => IWhenable<U>, onProgress?: Function): Promise<U>;

        /**
         * Like then, but "spreads" the array into a variadic fulfillment handler. If any of the promises in the array are rejected, instead calls onRejected with the first rejected promise's rejection reason.
         *
         * This is especially useful in conjunction with all
         */
        spread<U>(onFulfill: (...args: any[]) => IWhenable<U>, onReject?: (reason: any) => IWhenable<U>): Promise<U>;

        fail<U>(onRejected: (reason: any) => IWhenable<U>): Promise<U>;

        /**
         * A sugar method, equivalent to promise.then(undefined, onRejected).
         */
        catch<U>(onRejected: (reason: any) => IWhenable<U>): Promise<U>;

        /**
         * A sugar method, equivalent to promise.then(undefined, undefined, onProgress).
         */
        progress(onProgress: (progress: any) => any): Promise<T>;

        /**
         * Much like then, but with different behavior around unhandled rejection. If there is an unhandled rejection, either because promise is rejected and no onRejected callback was provided, or because onFulfilled or onRejected threw an error or returned a rejected promise, the resulting rejection reason is thrown as an exception in a future turn of the event loop.
         *
         * This method should be used to terminate chains of promises that will not be passed elsewhere. Since exceptions thrown in then callbacks are consumed and transformed into rejections, exceptions at the end of the chain are easy to accidentally, silently ignore. By arranging for the exception to be thrown in a future turn of the event loop, so that it won't be caught, it causes an onerror event on the browser window, or an uncaughtException event on Node.js's process object.
         *
         * Exceptions thrown by done will have long stack traces, if Q.longStackSupport is set to true. If Q.onerror is set, exceptions will be delivered there instead of thrown in a future turn.
         *
         * The Golden Rule of done vs. then usage is: either return your promise to someone else, or if the chain ends with you, call done to terminate it.
         */
        done(onFulfilled?: (value: T) => any, onRejected?: (reason: any) => any, onProgress?: (progress: any) => any): void;

        /**
         * If callback is a function, assumes it's a Node.js-style callback, and calls it as either callback(rejectionReason) when/if promise becomes rejected, or as callback(null, fulfillmentValue) when/if promise becomes fulfilled. If callback is not a function, simply returns promise.
         */
        nodeify(callback: (reason: any, value: any) => void): Promise<T>;

        /**
         * Returns a promise to get the named property of an object. Essentially equivalent to
         *
         * promise.then(function (o) {
         *     return o[propertyName];
         * });
         */
        get<U>(propertyName: String): Promise<U>;
        set<U>(propertyName: String, value: any): Promise<U>;
        delete<U>(propertyName: String): Promise<U>;
        /**
         * Returns a promise for the result of calling the named method of an object with the given array of arguments. The object itself is this in the function, just like a synchronous method call. Essentially equivalent to
         *
         * promise.then(function (o) {
         *     return o[methodName].apply(o, args);
         * });
         */
        post<U>(methodName: String, args: any[]): Promise<U>;
        /**
         * Returns a promise for the result of calling the named method of an object with the given variadic arguments. The object itself is this in the function, just like a synchronous method call.
         */
        invoke<U>(methodName: String, ...args: any[]): Promise<U>;
        fapply<U>(args: any[]): Promise<U>;
        fcall<U>(...args: any[]): Promise<U>;

        /**
         * Returns a promise for an array of the property names of an object. Essentially equivalent to
         *
         * promise.then(function (o) {
         *     return Object.keys(o);
         * });
         */
        keys(): Promise<string[]>;

        /**
         * A sugar method, equivalent to promise.then(function () { return value; }).
         */
        thenResolve<U>(value: U): Promise<U>;
        /**
         * A sugar method, equivalent to promise.then(function () { throw reason; }).
         */
        thenReject(reason: any): Promise<T>;

        /**
         * Attaches a handler that will observe the value of the promise when it becomes fulfilled, returning a promise for that same value, perhaps deferred but not replaced by the promise returned by the onFulfilled handler.
         */
        tap(onFulfilled: (value: T) => any): Promise<T>;

        timeout(ms: number, message?: string): Promise<T>;
        /**
         * Returns a promise that will have the same result as promise, but will only be fulfilled or rejected after at least ms milliseconds have passed.
         */
        delay(ms: number): Promise<T>;

        /**
         * Returns whether a given promise is in the fulfilled state. When the static version is used on non-promises, the result is always true.
         */
        isFulfilled(): boolean;
        /**
         * Returns whether a given promise is in the rejected state. When the static version is used on non-promises, the result is always false.
         */
        isRejected(): boolean;
        /**
         * Returns whether a given promise is in the pending state. When the static version is used on non-promises, the result is always false.
         */
        isPending(): boolean;

        valueOf(): any;

        /**
         * Returns a "state snapshot" object, which will be in one of three forms:
         *
         * - { state: "pending" }
         * - { state: "fulfilled", value: <fulfllment value> }
         * - { state: "rejected", reason: <rejection reason> }
         */
        inspect(): PromiseState<T>;
    }

    interface PromiseState<T> {
        /**
         * "fulfilled", "rejected", "pending"
         */
        state: string;
        value?: T;
        reason?: any;
    }

    // If no value provided, returned promise will be of void type
    export function when(): Promise<void>;

    // if no fulfill, reject, or progress provided, returned promise will be of same type
    export function when<T>(value: IWhenable<T>): Promise<T>;

    // If a non-promise value is provided, it will not reject or progress
    export function when<T, U>(value: IWhenable<T>, onFulfilled: (val: T) => IWhenable<U>, onRejected?: (reason: any) => IWhenable<U>, onProgress?: (progress: any) => any): Promise<U>;

    /**
     * Currently "impossible" (and I use the term loosely) to implement due to TypeScript limitations as it is now.
     * See: https://github.com/Microsoft/TypeScript/issues/1784 for discussion on it.
     */
    // export function try(method: Function, ...args: any[]): Promise<any>;

    export function fbind<T>(method: (...args: any[]) => IWhenable<T>, ...args: any[]): (...args: any[]) => Promise<T>;

    export function fcall<T>(method: (...args: any[]) => T, ...args: any[]): Promise<T>;

    export function send<T>(obj: any, functionName: string, ...args: any[]): Promise<T>;
    export function invoke<T>(obj: any, functionName: string, ...args: any[]): Promise<T>;
    export function mcall<T>(obj: any, functionName: string, ...args: any[]): Promise<T>;

    export function denodeify<T>(nodeFunction: Function, ...args: any[]): (...args: any[]) => Promise<T>;
    export function nbind<T>(nodeFunction: Function, thisArg: any, ...args: any[]): (...args: any[]) => Promise<T>;
    export function nfbind<T>(nodeFunction: Function, ...args: any[]): (...args: any[]) => Promise<T>;
    export function nfcall<T>(nodeFunction: Function, ...args: any[]): Promise<T>;
    export function nfapply<T>(nodeFunction: Function, args: any[]): Promise<T>;

    export function ninvoke<T>(nodeModule: any, functionName: string, ...args: any[]): Promise<T>;
    export function npost<T>(nodeModule: any, functionName: string, args: any[]): Promise<T>;
    export function nsend<T>(nodeModule: any, functionName: string, ...args: any[]): Promise<T>;
    export function nmcall<T>(nodeModule: any, functionName: string, ...args: any[]): Promise<T>;

    /**
     * Returns a promise that is fulfilled with an array containing the fulfillment value of each promise, or is rejected with the same rejection reason as the first promise to be rejected.
     */
    export function all<A, B, C, D, E, F>(promises: IWhenable<[IWhenable<A>, IWhenable<B>, IWhenable<C>, IWhenable<D>, IWhenable<E>, IWhenable<F>]>): Promise<[A, B, C, D, E, F]>;
    /**
     * Returns a promise that is fulfilled with an array containing the fulfillment value of each promise, or is rejected with the same rejection reason as the first promise to be rejected.
     */
    export function all<A, B, C, D, E>(promises: IWhenable<[IWhenable<A>, IWhenable<B>, IWhenable<C>, IWhenable<D>, IWhenable<E>]>): Promise<[A, B, C, D, E]>;
    /**
     * Returns a promise that is fulfilled with an array containing the fulfillment value of each promise, or is rejected with the same rejection reason as the first promise to be rejected.
     */
    export function all<A, B, C, D>(promises: IWhenable<[IWhenable<A>, IWhenable<B>, IWhenable<C>, IWhenable<D>]>): Promise<[A, B, C, D]>;
    /**
     * Returns a promise that is fulfilled with an array containing the fulfillment value of each promise, or is rejected with the same rejection reason as the first promise to be rejected.
     */
    export function all<A, B, C>(promises: IWhenable<[IWhenable<A>, IWhenable<B>, IWhenable<C>]>): Promise<[A, B, C]>;
    /**
     * Returns a promise that is fulfilled with an array containing the fulfillment value of each promise, or is rejected with the same rejection reason as the first promise to be rejected.
     */
    export function all<A, B>(promises: IWhenable<[IWhenable<A>, IWhenable<B>]>): Promise<[A, B]>;
    /**
     * Returns a promise that is fulfilled with an array containing the fulfillment value of each promise, or is rejected with the same rejection reason as the first promise to be rejected.
     */
    export function all<T>(promises: IWhenable<IWhenable<T>[]>): Promise<T[]>;

    /**
    * Returns a promise for the first of an array of promises to become settled.
    */
    export function race<T>(promises: IWhenable<T>[]): Promise<T>;

    /**
     * Returns a promise that is fulfilled with an array of promise state snapshots, but only after all the original promises have settled, i.e. become either fulfilled or rejected.
     */
    export function allSettled<T>(promises: IWhenable<IWhenable<T>[]>): Promise<PromiseState<T>[]>;

    export function allResolved<T>(promises: IWhenable<IWhenable<T>[]>): Promise<Promise<T>[]>;

    /**
     * Like then, but "spreads" the array into a variadic fulfillment handler. If any of the promises in the array are rejected, instead calls onRejected with the first rejected promise's rejection reason.
     * This is especially useful in conjunction with all.
     */
    export function spread<T, U>(promises: IWhenable<T>[], onFulfilled: (...args: T[]) => IWhenable<U>, onRejected?: (reason: any) => IWhenable<U>): Promise<U>;

    /**
     * Returns a promise that will have the same result as promise, except that if promise is not fulfilled or rejected before ms milliseconds, the returned promise will be rejected with an Error with the given message. If message is not supplied, the message will be "Timed out after " + ms + " ms".
     */
    export function timeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T>;

    /**
     * Returns a promise that will have the same result as promise, but will only be fulfilled or rejected after at least ms milliseconds have passed.
     */
    export function delay<T>(promise: Promise<T>, ms: number): Promise<T>;
    /**
     * Returns a promise that will have the same result as promise, but will only be fulfilled or rejected after at least ms milliseconds have passed.
     */
    export function delay<T>(value: T, ms: number): Promise<T>;
    /**
     * Returns a promise that will be fulfilled with undefined after at least ms milliseconds have passed.
     */
    export function delay(ms: number): Promise <void>;
    /**
     * Returns whether a given promise is in the fulfilled state. When the static version is used on non-promises, the result is always true.
     */
    export function isFulfilled(promise: Promise<any>): boolean;
    /**
     * Returns whether a given promise is in the rejected state. When the static version is used on non-promises, the result is always false.
     */
    export function isRejected(promise: Promise<any>): boolean;
    /**
     * Returns whether a given promise is in the pending state. When the static version is used on non-promises, the result is always false.
     */
    export function isPending(promise: Promise<any>): boolean;

    /**
     * Returns a "deferred" object with a:
     * promise property
     * resolve(value) method
     * reject(reason) method
     * notify(value) method
     * makeNodeResolver() method
     */
    export function defer<T>(): Deferred<T>;

    /**
     * Returns a promise that is rejected with reason.
     */
    export function reject<T>(reason?: any): Promise<T>;

    export function Promise<T>(resolver: (resolve: (val: IWhenable<T>) => void , reject: (reason: any) => void , notify: (progress: any) => void ) => void ): Promise<T>;

    /**
     * Creates a new version of func that accepts any combination of promise and non-promise values, converting them to their fulfillment values before calling the original func. The returned version also always returns a promise: if func does a return or throw, then Q.promised(func) will return fulfilled or rejected promise, respectively.
     *
     * This can be useful for creating functions that accept either promises or non-promise values, and for ensuring that the function always returns a promise even in the face of unintentional thrown exceptions.
     */
    export function promised<T>(callback: (...args: any[]) => T): (...args: any[]) => Promise<T>;

    /**
     * Returns whether the given value is a Q promise.
     */
    export function isPromise(object: any): boolean;
    /**
     * Returns whether the given value is a promise (i.e. it's an object with a then function).
     */
    export function isPromiseAlike(object: any): boolean;
    /**
     * Returns whether a given promise is in the pending state. When the static version is used on non-promises, the result is always false.
     */
    export function isPending(object: any): boolean;
    /**
     * If an object is not a promise, it is as "near" as possible.
     * If a promise is rejected, it is as "near" as possible too.
     * If it’s a fulfilled promise, the fulfillment value is nearer.
     * If it’s a deferred promise and the deferred has been resolved, the
     * resolution is "nearer".
     */
    export function nearer<T>(promise: Promise<T>): T;

    /**
     * This is an experimental tool for converting a generator function into a deferred function. This has the potential of reducing nested callbacks in engines that support yield.
     */
    export function async<T>(generatorFunction: any): (...args: any[]) => Promise<T>;
    export function nextTick(callback: Function): void;

    /**
     * A settable property that will intercept any uncaught errors that would otherwise be thrown in the next tick of the event loop, usually as a result of done. Can be useful for getting the full stack trace of an error in browsers, which is not usually possible with window.onerror.
     */
    export var onerror: (reason: any) => void;
    /**
     * A settable property that lets you turn on long stack trace support. If turned on, "stack jumps" will be tracked across asynchronous promise operations, so that if an uncaught error is thrown by done or a rejection reason's stack property is inspected in a rejection callback, a long stack trace is produced.
     */
    export var longStackSupport: boolean;

    /**
     * Calling resolve with a pending promise causes promise to wait on the passed promise, becoming fulfilled with its fulfillment value or rejected with its rejection reason (or staying pending forever, if the passed promise does).
     * Calling resolve with a rejected promise causes promise to be rejected with the passed promise's rejection reason.
     * Calling resolve with a fulfilled promise causes promise to be fulfilled with the passed promise's fulfillment value.
     * Calling resolve with a non-promise value causes promise to be fulfilled with that value.
     */
    export function resolve<T>(object: IWhenable<T>): Promise<T>;

	/**
	 * Resets the global "Q" variable to the value it has before Q was loaded.
	 * This will either be undefined if there was no version or the version of Q which was already loaded before.
	 * @returns { The last version of Q. }
	 */
	export function noConflict(): typeof Q;
}

declare module "q" {
    export = Q;
}