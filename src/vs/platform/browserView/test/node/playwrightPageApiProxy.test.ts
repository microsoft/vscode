/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createPageApiProxy } from '../../node/playwrightPageApiProxy.js';

suite('Playwright page API proxy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks API request contexts through direct, reflected, and event paths', () => {
		type RequestContext = { get(url: string): Promise<string> };
		type Request = { frame(): { page(): PageApi } };
		type Route = { fallback(): void };
		type WebSocketRoute = { connectToServer(): void };
		type PageApi = {
			readonly request: RequestContext;
			context(): { readonly request: RequestContext; browser(): object };
			mainFrame(): { page(): PageApi };
			on(event: 'request', listener: (request: Request) => void): void;
			listeners(event: 'request'): Function[];
			route(url: string, listener: (route: Route) => void): void;
			routeWebSocket(url: string, listener: (route: WebSocketRoute) => void): void;
		};
		class TestRequestContext implements RequestContext {
			async get(url: string): Promise<string> { return url; }
		}
		class TestContext {
			constructor(readonly request: RequestContext) { }
		}
		const requestContext = new TestRequestContext();
		let requestListener: ((request: Request) => void) | undefined;
		let routeListener: ((route: Route) => void) | undefined;
		let webSocketRouteListener: ((route: WebSocketRoute) => void) | undefined;
		const page: PageApi = {
			request: requestContext,
			context: () => Object.assign(new TestContext(requestContext), { browser: () => ({}) }),
			mainFrame: () => ({ page: () => page }),
			on: (_event, listener) => requestListener = listener,
			listeners: () => requestListener ? [requestListener] : [],
			route: (_url, listener) => routeListener = listener,
			routeWebSocket: (_url, listener) => webSocketRouteListener = listener,
		};
		const membrane = createPageApiProxy(page, new Map(), {
			createFunction: callback => callback,
			createArray: () => [],
			createObject: () => Object.create(null),
			throwError: message => { throw new Error(message); },
		});
		const proxy = membrane.proxy;

		assert.throws(() => proxy.request, /blocked by network domain policy/);
		assert.throws(() => proxy.context().request, /blocked by network domain policy/);
		assert.throws(() => proxy.mainFrame().page().request, /blocked by network domain policy/);
		assert.throws(() => proxy.context().browser, /unavailable in page-scoped automation/);
		assert.strictEqual(Object.getOwnPropertyDescriptor(proxy, 'request'), undefined);

		let eventRequest: Request | undefined;
		proxy.on('request', request => eventRequest = request);
		const returnedListener = proxy.listeners('request')[0];
		assert.notStrictEqual(returnedListener, requestListener);
		let routeCallbackCalled = false;
		proxy.route('**/*', () => routeCallbackCalled = true);
		let webSocketRouteCallbackCalled = false;
		proxy.routeWebSocket('**/*', () => webSocketRouteCallbackCalled = true);
		requestListener?.({ frame: () => ({ page: () => page }) });
		assert.throws(() => eventRequest?.frame().page().request, /blocked by network domain policy/);

		const mainFrame = proxy.mainFrame;
		eventRequest = undefined;
		membrane.revoke();
		assert.throws(() => proxy.mainFrame(), /no longer available/);
		assert.throws(() => mainFrame(), /no longer available/);
		assert.throws(() => returnedListener({ frame: () => ({ page: () => page }) }), /no longer available/);
		requestListener?.({ frame: () => ({ page: () => page }) });
		let routeFallbackCalled = false;
		routeListener?.({ fallback: () => routeFallbackCalled = true });
		let webSocketConnected = false;
		webSocketRouteListener?.({ connectToServer: () => webSocketConnected = true });
		assert.strictEqual(eventRequest, undefined);
		assert.deepStrictEqual({
			routeCallbackCalled,
			routeFallbackCalled,
			webSocketRouteCallbackCalled,
			webSocketConnected,
		}, {
			routeCallbackCalled: false,
			routeFallbackCalled: true,
			webSocketRouteCallbackCalled: false,
			webSocketConnected: true,
		});
	});
});
