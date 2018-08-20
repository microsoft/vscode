// Type definitions for mocha 2.2.5
// Project: http://mochajs.org/
// Definitions by: Kazi Manzur Rashid <https://github.com/kazimanzurrashid/>, otiai10 <https://github.com/otiai10>, jt000 <https://github.com/jt000>, Vadim Macagon <https://github.com/enlight>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

interface MochaSetupOptions {
	//milliseconds to wait before considering a test slow
	slow?: number;

	// timeout in milliseconds
	timeout?: number;

	// ui name "bdd", "tdd", "exports" etc
	ui?: string;

	//array of accepted globals
	globals?: any[];

	// reporter instance (function or string), defaults to `mocha.reporters.Spec`
	reporter?: any;

	// bail on the first test failure
	bail?: boolean;

	// ignore global leaks
	ignoreLeaks?: boolean;

	// grep string or regexp to filter tests with
	grep?: any;
}

declare var mocha: Mocha;
declare var describe: Mocha.IContextDefinition;
declare var xdescribe: Mocha.IContextDefinition;
// alias for `describe`
declare var context: Mocha.IContextDefinition;
// alias for `describe`
declare var suite: Mocha.IContextDefinition;
declare var it: Mocha.ITestDefinition;
declare var xit: Mocha.ITestDefinition;
// alias for `it`
declare var test: Mocha.ITestDefinition;
declare var specify: Mocha.ITestDefinition;

// Used with the --delay flag; see https://mochajs.org/#hooks
declare function run(): void;

interface MochaDone {
	(error?: any): any;
}

declare function setup(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
declare function teardown(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
declare function suiteSetup(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
declare function suiteTeardown(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
declare function before(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
declare function before(description: string, callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
declare function after(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
declare function after(description: string, callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
declare function beforeEach(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
declare function beforeEach(description: string, callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
declare function afterEach(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
declare function afterEach(description: string, callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;

declare class Mocha {
	currentTest: Mocha.ITestDefinition;
	constructor(options?: {
		grep?: RegExp;
		ui?: string;
		reporter?: string;
		timeout?: number;
		reporterOptions?: any;
		slow?: number;
		bail?: boolean;
	});

	/** Setup mocha with the given options. */
	setup(options: MochaSetupOptions): Mocha;
	bail(value?: boolean): Mocha;
	addFile(file: string): Mocha;
	/** Sets reporter by name, defaults to "spec". */
	reporter(name: string): Mocha;
	/** Sets reporter constructor, defaults to mocha.reporters.Spec. */
	reporter(reporter: (runner: Mocha.IRunner, options: any) => any): Mocha;
	ui(value: string): Mocha;
	grep(value: string): Mocha;
	grep(value: RegExp): Mocha;
	invert(): Mocha;
	ignoreLeaks(value: boolean): Mocha;
	checkLeaks(): Mocha;
    /**
     * Function to allow assertion libraries to throw errors directly into mocha.
     * This is useful when running tests in a browser because window.onerror will
     * only receive the 'message' attribute of the Error.
     */
	throwError(error: Error): void;
	/** Enables growl support. */
	growl(): Mocha;
	globals(value: string): Mocha;
	globals(values: string[]): Mocha;
	useColors(value: boolean): Mocha;
	useInlineDiffs(value: boolean): Mocha;
	timeout(value: number): Mocha;
	slow(value: number): Mocha;
	enableTimeouts(value: boolean): Mocha;
	asyncOnly(value: boolean): Mocha;
	noHighlighting(value: boolean): Mocha;
	/** Runs tests and invokes `onComplete()` when finished. */
	run(onComplete?: (failures: number) => void): Mocha.IRunner;
}

// merge the Mocha class declaration with a module
declare namespace Mocha {
	interface ISuiteCallbackContext {
		timeout(ms: number): this;
		retries(n: number): this;
		slow(ms: number): this;
	}

	interface IHookCallbackContext {
		skip(): this;
		timeout(ms: number): this;
		[index: string]: any;
	}


	interface ITestCallbackContext {
		skip(): this;
		timeout(ms: number): this;
		retries(n: number): this;
		slow(ms: number): this;
		[index: string]: any;
	}

	/** Partial interface for Mocha's `Runnable` class. */
	interface IRunnable {
		title: string;
		fn: Function;
		async: boolean;
		sync: boolean;
		timedOut: boolean;
		timeout(n: number): this;
	}

	/** Partial interface for Mocha's `Suite` class. */
	interface ISuite {
		parent: ISuite;
		title: string;

		fullTitle(): string;
	}

	/** Partial interface for Mocha's `Test` class. */
	interface ITest extends IRunnable {
		parent: ISuite;
		pending: boolean;
		state: 'failed' | 'passed' | undefined;

		fullTitle(): string;
	}

	interface IBeforeAndAfterContext extends IHookCallbackContext {
		currentTest: ITest;
	}


	/** Partial interface for Mocha's `Runner` class. */
	interface IRunner { }

	interface IContextDefinition {
		(description: string, callback: (this: ISuiteCallbackContext) => void): ISuite;
		only(description: string, callback: (this: ISuiteCallbackContext) => void): ISuite;
		skip(description: string, callback: (this: ISuiteCallbackContext) => void): void;
		timeout(ms: number): void;
	}

	interface ITestDefinition {
		(expectation: string, callback?: (this: ITestCallbackContext, done: MochaDone) => any): ITest;
		only(expectation: string, callback?: (this: ITestCallbackContext, done: MochaDone) => any): ITest;
		skip(expectation: string, callback?: (this: ITestCallbackContext, done: MochaDone) => any): void;
		timeout(ms: number): void;
		state: "failed" | "passed";
	}

	export module reporters {
		export class Base {
			stats: {
				suites: number;
				tests: number;
				passes: number;
				pending: number;
				failures: number;
			};

			constructor(runner: IRunner);
		}

		export class Doc extends Base { }
		export class Dot extends Base { }
		export class HTML extends Base { }
		export class HTMLCov extends Base { }
		export class JSON extends Base { }
		export class JSONCov extends Base { }
		export class JSONStream extends Base { }
		export class Landing extends Base { }
		export class List extends Base { }
		export class Markdown extends Base { }
		export class Min extends Base { }
		export class Nyan extends Base { }
		export class Progress extends Base {
            /**
             * @param options.open String used to indicate the start of the progress bar.
             * @param options.complete String used to indicate a complete test on the progress bar.
             * @param options.incomplete String used to indicate an incomplete test on the progress bar.
             * @param options.close String used to indicate the end of the progress bar.
             */
			constructor(runner: IRunner, options?: {
				open?: string;
				complete?: string;
				incomplete?: string;
				close?: string;
			});
		}
		export class Spec extends Base { }
		export class TAP extends Base { }
		export class XUnit extends Base {
			constructor(runner: IRunner, options?: any);
		}
	}
}

declare module "mocha" {
	export = Mocha;
}