/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Type definitions for Sinon 1.16.0
// Project: http://sinonjs.org/
// Definitions by: William Sears <https://github.com/mrbigdog2u>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare module '~sinon/lib/sinon' {
	module Sinon {
		export interface SinonSpyCallApi {
			// Properties
			thisValue: any;
			args: any[];
			exception: any;
			returnValue: any;

			// Methods
			calledOn(obj: any): boolean;
			calledWith(...args: any[]): boolean;
			calledWithExactly(...args: any[]): boolean;
			calledWithMatch(...args: any[]): boolean;
			notCalledWith(...args: any[]): boolean;
			notCalledWithMatch(...args: any[]): boolean;
			returned(value: any): boolean;
			threw(): boolean;
			threw(type: string): boolean;
			threw(obj: any): boolean;
			callArg(pos: number): void;
			callArgOn(pos: number, obj: any, ...args: any[]): void;
			callArgWith(pos: number, ...args: any[]): void;
			callArgOnWith(pos: number, obj: any, ...args: any[]): void;
			yield(...args: any[]): void;
			yieldOn(obj: any, ...args: any[]): void;
			yieldTo(property: string, ...args: any[]): void;
			yieldToOn(property: string, obj: any, ...args: any[]): void;
		}

		export interface SinonSpyCall extends SinonSpyCallApi {
			calledBefore(call: SinonSpyCall): boolean;
			calledAfter(call: SinonSpyCall): boolean;
			calledWithNew(call: SinonSpyCall): boolean;
		}

		export interface SinonSpy extends SinonSpyCallApi {
			// Properties
			callCount: number;
			called: boolean;
			notCalled: boolean;
			calledOnce: boolean;
			calledTwice: boolean;
			calledThrice: boolean;
			firstCall: SinonSpyCall;
			secondCall: SinonSpyCall;
			thirdCall: SinonSpyCall;
			lastCall: SinonSpyCall;
			thisValues: any[];
			args: any[][];
			exceptions: any[];
			returnValues: any[];

			// Methods
			(...args: any[]): any;
			calledBefore(anotherSpy: SinonSpy): boolean;
			calledAfter(anotherSpy: SinonSpy): boolean;
			calledWithNew(spy: SinonSpy): boolean;
			withArgs(...args: any[]): SinonSpy;
			alwaysCalledOn(obj: any): boolean;
			alwaysCalledWith(...args: any[]): boolean;
			alwaysCalledWithExactly(...args: any[]): boolean;
			alwaysCalledWithMatch(...args: any[]): boolean;
			neverCalledWith(...args: any[]): boolean;
			neverCalledWithMatch(...args: any[]): boolean;
			alwaysThrew(): boolean;
			alwaysThrew(type: string): boolean;
			alwaysThrew(obj: any): boolean;
			alwaysReturned(): boolean;
			invokeCallback(...args: any[]): void;
			getCall(n: number): SinonSpyCall;
			getCalls(): SinonSpyCall[];
			reset(): void;
			printf(format: string, ...args: any[]): string;
			restore(): void;
		}

		export interface SinonSpyStatic {
			(): SinonSpy;
			(func: any): SinonSpy;
			(obj: any, method: string): SinonSpy;
		}

		export interface SinonStatic {
			spy: SinonSpyStatic;
		}

		export interface SinonStub extends SinonSpy {
			resetBehavior(): void;
			returns(obj: any): SinonStub;
			returnsArg(index: number): SinonStub;
			returnsThis(): SinonStub;
			throws(type?: string): SinonStub;
			throws(obj: any): SinonStub;
			callsArg(index: number): SinonStub;
			callsArgOn(index: number, context: any): SinonStub;
			callsArgWith(index: number, ...args: any[]): SinonStub;
			callsArgOnWith(index: number, context: any, ...args: any[]): SinonStub;
			callsArgAsync(index: number): SinonStub;
			callsArgOnAsync(index: number, context: any): SinonStub;
			callsArgWithAsync(index: number, ...args: any[]): SinonStub;
			callsArgOnWithAsync(index: number, context: any, ...args: any[]): SinonStub;
			onCall(n: number): SinonStub;
			onFirstCall(): SinonStub;
			onSecondCall(): SinonStub;
			onThirdCall(): SinonStub;
			yields(...args: any[]): SinonStub;
			yieldsOn(context: any, ...args: any[]): SinonStub;
			yieldsTo(property: string, ...args: any[]): SinonStub;
			yieldsToOn(property: string, context: any, ...args: any[]): SinonStub;
			yieldsAsync(...args: any[]): SinonStub;
			yieldsOnAsync(context: any, ...args: any[]): SinonStub;
			yieldsToAsync(property: string, ...args: any[]): SinonStub;
			yieldsToOnAsync(property: string, context: any, ...args: any[]): SinonStub;
			withArgs(...args: any[]): SinonStub;
		}

		export interface SinonStubStatic {
			(): SinonStub;
			(obj: any): SinonStub;
			(obj: any, method: string): SinonStub;
			(obj: any, method: string, func: any): SinonStub;
		}

		export interface SinonStatic {
			stub: SinonStubStatic;
		}

		export interface SinonExpectation extends SinonStub {
			atLeast(n: number): SinonExpectation;
			atMost(n: number): SinonExpectation;
			never(): SinonExpectation;
			once(): SinonExpectation;
			twice(): SinonExpectation;
			thrice(): SinonExpectation;
			exactly(n: number): SinonExpectation;
			withArgs(...args: any[]): SinonExpectation;
			withExactArgs(...args: any[]): SinonExpectation;
			on(obj: any): SinonExpectation;
			verify(): SinonExpectation;
			restore(): void;
		}

		export interface SinonExpectationStatic {
			create(methodName?: string): SinonExpectation;
		}

		export interface SinonMock {
			expects(method: string): SinonExpectation;
			restore(): void;
			verify(): void;
		}

		export interface SinonMockStatic {
			(): SinonExpectation;
			(obj: any): SinonMock;
		}

		export interface SinonStatic {
			expectation: SinonExpectationStatic;
			mock: SinonMockStatic;
		}

		export interface SinonFakeTimers {
			now: number;
			create(now: number): SinonFakeTimers;
			setTimeout(callback: (...args: any[]) => void, timeout: number, ...args: any[]): number;
			clearTimeout(id: number): void;
			setInterval(callback: (...args: any[]) => void, timeout: number, ...args: any[]): number;
			clearInterval(id: number): void;
			tick(ms: number): number;
			reset(): void;
			Date(): Date;
			Date(year: number): Date;
			Date(year: number, month: number): Date;
			Date(year: number, month: number, day: number): Date;
			Date(year: number, month: number, day: number, hour: number): Date;
			Date(year: number, month: number, day: number, hour: number, minute: number): Date;
			Date(year: number, month: number, day: number, hour: number, minute: number, second: number): Date;
			Date(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number): Date;
			restore(): void;

			/**
			 * Simulate the user changing the system clock while your program is running. It changes the 'now' timestamp
			 * without affecting timers, intervals or immediates.
			 * @param now The new 'now' in unix milliseconds
			 */
			setSystemTime(now: number): void;
			/**
			 * Simulate the user changing the system clock while your program is running. It changes the 'now' timestamp
			 * without affecting timers, intervals or immediates.
			 * @param now The new 'now' as a JavaScript Date
			 */
			setSystemTime(date: Date): void;
		}

		export interface SinonFakeTimersStatic {
			(): SinonFakeTimers;
			(...timers: string[]): SinonFakeTimers;
			(now: number, ...timers: string[]): SinonFakeTimers;
		}

		export interface SinonStatic {
			useFakeTimers: SinonFakeTimersStatic;
			clock: SinonFakeTimers;
		}

		export interface SinonFakeUploadProgress {
			eventListeners: {
				progress: any[];
				load: any[];
				abort: any[];
				error: any[];
			};

			addEventListener(event: string, listener: (e: Event) => any): void;
			removeEventListener(event: string, listener: (e: Event) => any): void;
			dispatchEvent(event: Event): void;
		}

		export interface SinonFakeXMLHttpRequest {
			// Properties
			onCreate: (xhr: SinonFakeXMLHttpRequest) => void;
			url: string;
			method: string;
			requestHeaders: any;
			requestBody: string;
			status: number;
			statusText: string;
			async: boolean;
			username: string;
			password: string;
			withCredentials: boolean;
			upload: SinonFakeUploadProgress;
			responseXML: Document;
			getResponseHeader(header: string): string;
			getAllResponseHeaders(): any;

			// Methods
			restore(): void;
			useFilters: boolean;
			addFilter(filter: (method: string, url: string, async: boolean, username: string, password: string) => boolean): void;
			setResponseHeaders(headers: any): void;
			setResponseBody(body: string): void;
			respond(status: number, headers: any, body: string): void;
			autoRespond(ms: number): void;
		}

		export interface SinonFakeXMLHttpRequestStatic {
			(): SinonFakeXMLHttpRequest;
		}

		export interface SinonStatic {
			useFakeXMLHttpRequest: SinonFakeXMLHttpRequestStatic;
			FakeXMLHttpRequest: SinonFakeXMLHttpRequest;
		}

		export interface SinonFakeServer {
			// Properties
			autoRespond: boolean;
			autoRespondAfter: number;
			fakeHTTPMethods: boolean;
			getHTTPMethod: (request: SinonFakeXMLHttpRequest) => string;
			requests: SinonFakeXMLHttpRequest[];
			respondImmediately: boolean;

			// Methods
			respondWith(body: string): void;
			respondWith(response: any[]): void;
			respondWith(fn: (xhr: SinonFakeXMLHttpRequest) => void): void;
			respondWith(url: string, body: string): void;
			respondWith(url: string, response: any[]): void;
			respondWith(url: string, fn: (xhr: SinonFakeXMLHttpRequest) => void): void;
			respondWith(method: string, url: string, body: string): void;
			respondWith(method: string, url: string, response: any[]): void;
			respondWith(method: string, url: string, fn: (xhr: SinonFakeXMLHttpRequest) => void): void;
			respondWith(url: RegExp, body: string): void;
			respondWith(url: RegExp, response: any[]): void;
			respondWith(url: RegExp, fn: (xhr: SinonFakeXMLHttpRequest) => void): void;
			respondWith(method: string, url: RegExp, body: string): void;
			respondWith(method: string, url: RegExp, response: any[]): void;
			respondWith(method: string, url: RegExp, fn: (xhr: SinonFakeXMLHttpRequest) => void): void;
			respond(): void;
			restore(): void;
		}

		export interface SinonFakeServerStatic {
			create(): SinonFakeServer;
		}

		export interface SinonStatic {
			fakeServer: SinonFakeServerStatic;
			fakeServerWithClock: SinonFakeServerStatic;
		}

		export interface SinonExposeOptions {
			prefix?: string;
			includeFail?: boolean;
		}

		export interface SinonAssert {
			// Properties
			failException: string;
			fail: (message?: string) => void; // Overridable
			pass: (assertion: any) => void; // Overridable

			// Methods
			notCalled(spy: SinonSpy): void;
			called(spy: SinonSpy): void;
			calledOnce(spy: SinonSpy): void;
			calledTwice(spy: SinonSpy): void;
			calledThrice(spy: SinonSpy): void;
			callCount(spy: SinonSpy, count: number): void;
			callOrder(...spies: SinonSpy[]): void;
			calledOn(spy: SinonSpy, obj: any): void;
			alwaysCalledOn(spy: SinonSpy, obj: any): void;
			calledWith(spy: SinonSpy, ...args: any[]): void;
			alwaysCalledWith(spy: SinonSpy, ...args: any[]): void;
			neverCalledWith(spy: SinonSpy, ...args: any[]): void;
			calledWithExactly(spy: SinonSpy, ...args: any[]): void;
			alwaysCalledWithExactly(spy: SinonSpy, ...args: any[]): void;
			calledWithMatch(spy: SinonSpy, ...args: any[]): void;
			alwaysCalledWithMatch(spy: SinonSpy, ...args: any[]): void;
			neverCalledWithMatch(spy: SinonSpy, ...args: any[]): void;
			threw(spy: SinonSpy): void;
			threw(spy: SinonSpy, exception: string): void;
			threw(spy: SinonSpy, exception: any): void;
			alwaysThrew(spy: SinonSpy): void;
			alwaysThrew(spy: SinonSpy, exception: string): void;
			alwaysThrew(spy: SinonSpy, exception: any): void;
			expose(obj: any, options?: SinonExposeOptions): void;
		}

		export interface SinonStatic {
			assert: SinonAssert;
		}

		export interface SinonMatcher {
			and(expr: SinonMatcher): SinonMatcher;
			or(expr: SinonMatcher): SinonMatcher;
		}

		export interface SinonMatch {
			(value: number): SinonMatcher;
			(value: string): SinonMatcher;
			(expr: RegExp): SinonMatcher;
			(obj: any): SinonMatcher;
			(callback: (value: any) => boolean): SinonMatcher;
			any: SinonMatcher;
			defined: SinonMatcher;
			truthy: SinonMatcher;
			falsy: SinonMatcher;
			bool: SinonMatcher;
			number: SinonMatcher;
			string: SinonMatcher;
			object: SinonMatcher;
			func: SinonMatcher;
			array: SinonMatcher;
			regexp: SinonMatcher;
			date: SinonMatcher;
			same(obj: any): SinonMatcher;
			typeOf(type: string): SinonMatcher;
			instanceOf(type: any): SinonMatcher;
			has(property: string, expect?: any): SinonMatcher;
			hasOwn(property: string, expect?: any): SinonMatcher;
		}

		export interface SinonStatic {
			match: SinonMatch;
		}

		export interface SinonSandboxConfig {
			injectInto?: any;
			properties?: string[];
			useFakeTimers?: any;
			useFakeServer?: any;
		}

		export interface SinonSandbox {
			clock: SinonFakeTimers;
			requests: SinonFakeXMLHttpRequest;
			server: SinonFakeServer;
			spy: SinonSpyStatic;
			stub: SinonStubStatic;
			mock: SinonMockStatic;
			useFakeTimers: SinonFakeTimersStatic;
			useFakeXMLHttpRequest: SinonFakeXMLHttpRequestStatic;
			useFakeServer(): SinonFakeServer;
			restore(): void;
		}

		export interface SinonSandboxStatic {
			create(): SinonSandbox;
			create(config: SinonSandboxConfig): SinonSandbox;
		}

		export interface SinonStatic {
			sandbox: SinonSandboxStatic;
		}

		export interface SinonTestConfig {
			injectIntoThis?: boolean;
			injectInto?: any;
			properties?: string[];
			useFakeTimers?: boolean;
			useFakeServer?: boolean;
		}

		export interface SinonTestWrapper extends SinonSandbox {
			(...args: any[]): any;
		}

		export interface SinonStatic {
			config: SinonTestConfig;
			test(fn: (...args: any[]) => any): SinonTestWrapper;
			testCase(tests: any): any;
		}

		// Utility overridables
		export interface SinonStatic {
			createStubInstance(constructor: any): SinonStub;
			format(obj: any): string;
			log(message: string): void;
			restore(object: any): void;
		}
	}

	var Sinon: Sinon.SinonStatic;

	export = Sinon;
}
declare module 'sinon/lib/sinon' {
	import main = require('~sinon/lib/sinon');
	export = main;
}
declare module 'sinon' {
	import main = require('~sinon/lib/sinon');
	export = main;
}