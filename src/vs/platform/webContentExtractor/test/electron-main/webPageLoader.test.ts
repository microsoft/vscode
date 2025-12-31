/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { AXNode } from '../../electron-main/cdpAccessibilityDomain.js';
import { WebPageLoader } from '../../electron-main/webPageLoader.js';
import { IWebContentExtractorOptions } from '../../common/webContentExtractor.js';

interface MockElectronEvent {
	preventDefault?: sinon.SinonStub;
}

class MockWebContents {
	private readonly _listeners = new Map<string, ((...args: unknown[]) => void)[]>();
	public readonly debugger: MockDebugger;
	public loadURL = sinon.stub().resolves();
	public getTitle = sinon.stub().returns('Test Page Title');
	public executeJavaScript = sinon.stub().resolves(undefined);

	public session = {
		webRequest: {
			onBeforeSendHeaders: sinon.stub()
		}
	};

	constructor() {
		this.debugger = new MockDebugger();
	}

	once(event: string, listener: (...args: unknown[]) => void): this {
		if (!this._listeners.has(event)) {
			this._listeners.set(event, []);
		}
		this._listeners.get(event)!.push(listener);
		return this;
	}

	on(event: string, listener: (...args: unknown[]) => void): this {
		if (!this._listeners.has(event)) {
			this._listeners.set(event, []);
		}
		this._listeners.get(event)!.push(listener);
		return this;
	}

	emit(event: string, ...args: unknown[]): void {
		const listeners = this._listeners.get(event) || [];
		for (const listener of listeners) {
			listener(...args);
		}
		this._listeners.delete(event);
	}

	beginFrameSubscription(_onlyDirty: boolean, callback: () => void): void {
		setTimeout(() => callback(), 0);
	}

	endFrameSubscription(): void {
	}
}

class MockDebugger {
	private readonly _listeners = new Map<string, ((...args: unknown[]) => void)[]>();
	public attach = sinon.stub();
	public sendCommand = sinon.stub().resolves({});

	on(event: string, listener: (...args: unknown[]) => void): this {
		if (!this._listeners.has(event)) {
			this._listeners.set(event, []);
		}
		this._listeners.get(event)!.push(listener);
		return this;
	}

	emit(event: string, ...args: unknown[]): void {
		const listeners = this._listeners.get(event) || [];
		for (const listener of listeners) {
			listener(...args);
		}
	}
}

class MockBrowserWindow {
	public readonly webContents: MockWebContents;
	public destroy = sinon.stub();
	public loadURL = sinon.stub().resolves();

	constructor(_options?: Electron.BrowserWindowConstructorOptions) {
		this.webContents = new MockWebContents();
	}
}

suite('WebPageLoader', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let window: MockBrowserWindow;

	teardown(() => {
		sinon.restore();
	});

	function createWebPageLoader(uri: URI, options?: IWebContentExtractorOptions, isTrustedDomain?: (uri: URI) => boolean): WebPageLoader {
		const loader = new WebPageLoader((options) => {
			window = new MockBrowserWindow(options);
			// eslint-disable-next-line local/code-no-any-casts
			return window as any;
		}, new NullLogService(), uri, options, isTrustedDomain ?? (() => false));
		disposables.add(loader);
		return loader;
	}

	function createMockAXNodes(): AXNode[] {
		return [
			{
				nodeId: 'node1',
				ignored: false,
				role: { type: 'role', value: 'paragraph' },
				childIds: ['node2']
			},
			{
				nodeId: 'node2',
				ignored: false,
				role: { type: 'role', value: 'StaticText' },
				name: { type: 'string', value: 'Test content from page' }
			}
		];
	}

	//#region Basic Loading Tests

	test('successful page load returns ok status with content', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate page load events
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'ok');
		assert.strictEqual(result.title, 'Test Page Title');
		assert.ok(result.result.includes('Test content from page'));
	}));

	test('page load failure returns error status', async () => {
		const uri = URI.parse('https://example.com/page');

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: createMockAXNodes() });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate page load failure
		const mockEvent: MockElectronEvent = {};
		window.webContents.emit('did-fail-load', mockEvent, -6, 'ERR_CONNECTION_REFUSED');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'error');
		if (result.status === 'error') {
			assert.strictEqual(result.statusCode, -6);
			assert.strictEqual(result.error, 'ERR_CONNECTION_REFUSED');
		}
	});

	test('ERR_ABORTED is ignored and content extraction continues', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate ERR_ABORTED (-3) which should be ignored
		const mockEvent: MockElectronEvent = {};
		window.webContents.emit('did-fail-load', mockEvent, -3, 'ERR_ABORTED');

		const result = await loadPromise;

		// ERR_ABORTED should not cause an error status, content should be extracted
		assert.strictEqual(result.status, 'ok');
		if (result.status === 'ok') {
			assert.ok(result.result.includes('Test content from page'));
		}
	}));

	//#endregion

	//#region Redirect Tests

	test('redirect to different authority returns redirect status when followRedirects is false', async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://other-domain.com/redirected';

		const loader = createWebPageLoader(uri, { followRedirects: false });

		window.webContents.debugger.sendCommand.resolves({});

		const loadPromise = loader.load();

		// Simulate redirect to different authority
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		const result = await loadPromise;

		assert.strictEqual(result.status, 'redirect');
		if (result.status === 'redirect') {
			assert.strictEqual(result.toURI.authority, 'other-domain.com');
		}
		assert.ok((mockEvent.preventDefault!).called);
	});

	test('redirect to same authority is not treated as redirect', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://example.com/other-page';
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri, { followRedirects: false });

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate redirect to same authority
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		// Should not prevent default for same-authority redirects
		assert.ok(!(mockEvent.preventDefault!).called);

		// Continue with normal load
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;
		assert.strictEqual(result.status, 'ok');
	}));

	test('redirect is followed when followRedirects option is true', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://other-domain.com/redirected';
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri, { followRedirects: true });

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate redirect
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		// Should not prevent default when followRedirects is true
		assert.ok(!(mockEvent.preventDefault!).called);

		// Continue with normal load after redirect
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;
		assert.strictEqual(result.status, 'ok');
	}));

	test('redirect from www to non-www same domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://www.example.com/page');
		const redirectUrl = 'https://example.com/other-page';
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri, { followRedirects: false });

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate redirect from www to non-www
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		// Should not prevent default for www prefix redirect
		assert.ok(!(mockEvent.preventDefault!).called);

		// Continue with normal load
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;
		assert.strictEqual(result.status, 'ok');
	}));

	test('redirect from non-www to www same domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://www.example.com/other-page';
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri, { followRedirects: false });

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate redirect from non-www to www
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		// Should not prevent default for www prefix redirect
		assert.ok(!(mockEvent.preventDefault!).called);

		// Continue with normal load
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;
		assert.strictEqual(result.status, 'ok');
	}));

	test('redirect to trusted domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://trusted-domain.com/redirected';
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri,
			{ followRedirects: false },
			(uri) => uri.authority === 'trusted-domain.com' || uri.authority === 'another-trusted.com'
		);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate redirect to trusted domain
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		// Should not prevent default for trusted domain redirect
		assert.ok(!(mockEvent.preventDefault!).called);

		// Continue with normal load
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;
		assert.strictEqual(result.status, 'ok');
	}));

	test('redirect to non-trusted domain is blocked', async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://untrusted-domain.com/redirected';

		const loader = createWebPageLoader(uri,
			{ followRedirects: false },
			(uri) => uri.authority === 'trusted-domain.com'
		);

		window.webContents.debugger.sendCommand.resolves({});

		const loadPromise = loader.load();

		// Simulate redirect to non-trusted domain
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		const result = await loadPromise;

		// Should prevent redirect to non-trusted domain
		assert.ok((mockEvent.preventDefault!).called);
		assert.strictEqual(result.status, 'redirect');
		if (result.status === 'redirect') {
			assert.strictEqual(result.toURI.authority, 'untrusted-domain.com');
		}
	});

	test('redirect to wildcard subdomain trusted domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const redirectUrl = 'https://sub.trusted-domain.com/redirected';
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri,
			{ followRedirects: false },
			(uri) => uri.authority.endsWith('.trusted-domain.com') || uri.authority === 'trusted-domain.com'
		);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate redirect to subdomain of trusted wildcard domain
		const mockEvent: MockElectronEvent = {
			preventDefault: sinon.stub()
		};
		window.webContents.emit('will-redirect', mockEvent, redirectUrl);

		// Should not prevent default for wildcard subdomain match
		assert.ok(!(mockEvent.preventDefault!).called);

		// Continue with normal load
		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;
		assert.strictEqual(result.status, 'ok');
	}));

	//#endregion

	//#region HTTP Error Tests

	test('HTTP error status code returns error with content', async () => {
		const uri = URI.parse('https://example.com/not-found');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate network response with error status
		const mockEvent: MockElectronEvent = {};
		window.webContents.debugger.emit('message', mockEvent, 'Network.responseReceived', {
			requestId: 'req1',
			type: 'Document',
			response: {
				status: 404,
				statusText: 'Not Found'
			}
		});

		const result = await loadPromise;

		assert.strictEqual(result.status, 'error');
		if (result.status === 'error') {
			assert.strictEqual(result.statusCode, 404);
			assert.strictEqual(result.error, 'Not Found');
		}
	});

	test('HTTP 500 error returns server error status', async () => {
		const uri = URI.parse('https://example.com/server-error');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate network response with 500 status
		const mockEvent: MockElectronEvent = {};
		window.webContents.debugger.emit('message', mockEvent, 'Network.responseReceived', {
			requestId: 'req1',
			type: 'Document',
			response: {
				status: 500,
				statusText: 'Internal Server Error'
			}
		});

		const result = await loadPromise;

		assert.strictEqual(result.status, 'error');
		if (result.status === 'error') {
			assert.strictEqual(result.statusCode, 500);
			assert.strictEqual(result.error, 'Internal Server Error');
		}
	});

	test('HTTP error without status text uses fallback message', async () => {
		const uri = URI.parse('https://example.com/error');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate network response without status text
		const mockEvent: MockElectronEvent = {};
		window.webContents.debugger.emit('message', mockEvent, 'Network.responseReceived', {
			requestId: 'req1',
			type: 'Document',
			response: {
				status: 503
			}
		});

		const result = await loadPromise;

		assert.strictEqual(result.status, 'error');
		if (result.status === 'error') {
			assert.strictEqual(result.statusCode, 503);
			assert.strictEqual(result.error, 'HTTP error 503');
		}
	});

	//#endregion

	//#region Network Request Tracking Tests

	test('tracks network requests and waits for completion', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate page starting to load
		window.webContents.emit('did-start-loading');

		// Simulate network requests
		const mockEvent: MockElectronEvent = {};
		window.webContents.debugger.emit('message', mockEvent, 'Network.requestWillBeSent', {
			requestId: 'req1'
		});
		window.webContents.debugger.emit('message', mockEvent, 'Network.requestWillBeSent', {
			requestId: 'req2'
		});

		// Simulate page finish load (but network requests still pending)
		window.webContents.emit('did-finish-load');

		// Simulate network requests completing
		window.webContents.debugger.emit('message', mockEvent, 'Network.loadingFinished', {
			requestId: 'req1'
		});
		window.webContents.debugger.emit('message', mockEvent, 'Network.loadingFinished', {
			requestId: 'req2'
		});

		const result = await loadPromise;

		assert.strictEqual(result.status, 'ok');
	}));

	test('handles network request failures gracefully', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const axNodes = createMockAXNodes();

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		// Simulate page load
		window.webContents.emit('did-start-loading');

		// Simulate a network request that fails
		const mockEvent: MockElectronEvent = {};
		window.webContents.debugger.emit('message', mockEvent, 'Network.requestWillBeSent', {
			requestId: 'req1'
		});
		window.webContents.debugger.emit('message', mockEvent, 'Network.loadingFailed', {
			requestId: 'req1'
		});

		window.webContents.emit('did-finish-load');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'ok');
	}));

	//#endregion

	//#region Accessibility Tree Extraction Tests

	test('extracts content from accessibility tree', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		const axNodes: AXNode[] = [
			{
				nodeId: 'heading1',
				ignored: false,
				role: { type: 'role', value: 'heading' },
				name: { type: 'string', value: 'Page Title' },
				properties: [{ name: 'level', value: { type: 'integer', value: 1 } }],
				childIds: ['text1']
			},
			{
				nodeId: 'text1',
				ignored: false,
				role: { type: 'role', value: 'StaticText' },
				name: { type: 'string', value: 'Page Title' }
			}
		];

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: axNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'ok');
		if (result.status === 'ok') {
			assert.ok(result.result.includes('# Page Title'));
		}
	}));

	test('falls back to DOM extraction when accessibility tree yields insufficient content', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');
		// Create AX tree with very short content (less than MIN_CONTENT_LENGTH)
		const shortAXNodes: AXNode[] = [
			{
				nodeId: 'node1',
				ignored: false,
				role: { type: 'role', value: 'StaticText' },
				name: { type: 'string', value: 'Short' }
			}
		];

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: shortAXNodes });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		// Mock DOM extraction returning longer content
		const domContent = 'This is much longer content extracted from the DOM that exceeds the minimum content length requirement and should be used instead of the short accessibility tree content.';
		window.webContents.executeJavaScript.resolves(domContent);

		const loadPromise = loader.load();

		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'ok');
		if (result.status === 'ok') {
			assert.strictEqual(result.result, domContent);
		}
		// Verify executeJavaScript was called for DOM extraction
		assert.ok(window.webContents.executeJavaScript.called);
	}));

	test('returns error when both accessibility tree and DOM extraction yield no content', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/empty-page');

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					// Return empty accessibility tree
					return Promise.resolve({ nodes: [] });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		// Mock DOM extraction returning undefined (no content)
		window.webContents.executeJavaScript.resolves(undefined);

		const loadPromise = loader.load();

		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'error');
		if (result.status === 'error') {
			assert.ok(result.error.includes('Failed to extract meaningful content'));
		}
		// Verify both extraction methods were attempted
		assert.ok(window.webContents.executeJavaScript.called);
	}));

	//#endregion

	//#region Header Modification Tests

	test('onBeforeSendHeaders adds browser headers for navigation', () => {
		createWebPageLoader(URI.parse('https://example.com/page'));

		// Get the callback passed to onBeforeSendHeaders
		assert.ok(window.webContents.session.webRequest.onBeforeSendHeaders.called);
		const callback = window.webContents.session.webRequest.onBeforeSendHeaders.getCall(0).args[0];

		// Mock callback function
		let modifiedHeaders: Record<string, string> | undefined;
		const mockCallback = (details: { requestHeaders: Record<string, string> }) => {
			modifiedHeaders = details.requestHeaders;
		};

		// Simulate a request to the same domain
		callback(
			{
				url: 'https://example.com/page',
				requestHeaders: {
					'TestHeader': 'TestValue'
				}
			},
			mockCallback
		);

		// Verify headers were added
		assert.ok(modifiedHeaders);
		assert.strictEqual(modifiedHeaders['DNT'], '1');
		assert.strictEqual(modifiedHeaders['Sec-GPC'], '1');
		assert.strictEqual(modifiedHeaders['TestHeader'], 'TestValue');
	});

	//#endregion

	//#region Disposal Tests

	test('disposes resources after load completes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/page');

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: createMockAXNodes() });
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		await loadPromise;

		// The loader should call destroy on the window when disposed
		assert.ok(window.destroy.called);
	}));

	//#endregion
});
