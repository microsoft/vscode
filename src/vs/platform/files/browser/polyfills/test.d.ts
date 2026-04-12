export interface TestContext {
    name: string;
    signal: AbortSignal;
    _controller: AbortController;
    diagnostic(msg: string): void;
    plan(_count: number): void;
    todo(msg?: string): void;
    skip(msg?: string): void;
    abort(): void;
}
interface TestContextConstructor {
    new (name: string): TestContext;
    (this: any, name: string): void;
    prototype: any;
}
export declare const TestContext: TestContextConstructor;
type TestFn = (t: TestContext) => void | Promise<void>;
type HookFn = () => void | Promise<void>;
interface TestOpts {
    name: string;
    skip?: boolean;
    todo?: boolean;
    only?: boolean;
}
export declare function describe(name: string, fn: () => void | Promise<void>): void;
export declare function describe(options: TestOpts, fn: () => void | Promise<void>): void;
export declare function it(name: string, fn?: TestFn): void;
export declare function it(options: TestOpts, fn?: TestFn): void;
export { it as test };
export declare function before(fn: HookFn): void;
export declare function after(fn: HookFn): void;
export declare function beforeEach(fn: HookFn): void;
export declare function afterEach(fn: HookFn): void;
export declare function skip(name?: string, _fn?: TestFn): void;
export declare function todo(name?: string, _fn?: TestFn): void;
export declare const mock: {
    fn(impl?: Function): Function;
    method(obj: Record<string, unknown>, methodName: string, impl?: Function): Function;
    reset(): void;
    restoreAll(): void;
};
declare const _default: {
    describe: typeof describe;
    it: typeof it;
    test: typeof it;
    before: typeof before;
    after: typeof after;
    beforeEach: typeof beforeEach;
    afterEach: typeof afterEach;
    skip: typeof skip;
    todo: typeof todo;
    mock: {
        fn(impl?: Function): Function;
        method(obj: Record<string, unknown>, methodName: string, impl?: Function): Function;
        reset(): void;
        restoreAll(): void;
    };
    TestContext: TestContextConstructor;
};
export default _default;
