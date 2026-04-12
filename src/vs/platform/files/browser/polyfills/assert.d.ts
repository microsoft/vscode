export interface AssertionError extends Error {
    actual: unknown;
    expected: unknown;
    operator: string;
    generatedMessage: boolean;
    code: string;
}
interface AssertionErrorConstructor {
    new (info: {
        message?: string;
        actual?: unknown;
        expected?: unknown;
        operator?: string;
        stackStartFn?: Function;
    }): AssertionError;
    (this: any, info: {
        message?: string;
        actual?: unknown;
        expected?: unknown;
        operator?: string;
        stackStartFn?: Function;
    }): void;
    prototype: any;
}
export declare const AssertionError: AssertionErrorConstructor;
declare function assert(value: unknown, message?: string | Error): asserts value;
declare namespace assert {
    var ok: (value: unknown, message?: string | Error) => asserts value;
    var equal: (actual: unknown, expected: unknown, message?: string | Error) => void;
    var notEqual: (actual: unknown, expected: unknown, message?: string | Error) => void;
    var strictEqual: (actual: unknown, expected: unknown, message?: string | Error) => void;
    var notStrictEqual: (actual: unknown, expected: unknown, message?: string | Error) => void;
    var deepEqual: <T>(actual: T, expected: T, message?: string | Error) => void;
    var deepStrictEqual: <T>(actual: T, expected: T, message?: string | Error) => void;
    var notDeepStrictEqual: <T>(actual: T, expected: T, message?: string | Error) => void;
    var throws: (fn: () => unknown, validatorOrMsg?: RegExp | Function | Error | {
        message?: RegExp | string;
        code?: string;
    } | string, msg?: string) => void;
    var doesNotThrow: (fn: () => unknown, validatorOrMsg?: RegExp | Function | string, msg?: string) => void;
    var rejects: (asyncFn: Promise<unknown> | (() => Promise<unknown>), validatorOrMsg?: RegExp | Function | Error | {
        message?: RegExp | string;
        code?: string;
    } | string, msg?: string) => Promise<void>;
    var doesNotReject: (asyncFn: Promise<unknown> | (() => Promise<unknown>), validatorOrMsg?: RegExp | Function | string, msg?: string) => Promise<void>;
    var fail: (msgOrActual?: string | unknown, expected?: unknown, message?: string, operator?: string) => never;
    var match: (str: string, re: RegExp, message?: string | Error) => void;
    var doesNotMatch: (str: string, re: RegExp, message?: string | Error) => void;
    var ifError: (value: unknown) => void;
    var AssertionError: AssertionErrorConstructor;
    var strict: typeof assert;
}
export default assert;
export { assert };
