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

interface MockElectronEvent {
	preventDefault?: sinon.SinonStub;
}

class MockWebContents {
	private readonly _listeners = new Map<string, ((...args: unknown[]) => void)[]>();
	public readonly debugger: MockDebugger;
	public loadURL = sinon.stub().resolves();
	public getTitle = sinon.stub().returns('Test Page Title');

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

	function createWebPageLoader(uri: URI, options?: { followRedirects?: boolean }): WebPageLoader {
		const loader = new WebPageLoader((options) => {
			window = new MockBrowserWindow(options);
			// eslint-disable-next-line local/code-no-any-casts
			return window as any;
		}, new NullLogService(), uri, options);
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

	test('handles empty accessibility tree', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.parse('https://example.com/empty');

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.resolve({ nodes: [] });
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
			assert.strictEqual(result.result, '');
		}
	}));

	test('handles accessibility extraction failure', async () => {
		const uri = URI.parse('https://example.com/page');

		const loader = createWebPageLoader(uri);

		window.webContents.debugger.sendCommand.callsFake((command: string) => {
			switch (command) {
				case 'Network.enable':
					return Promise.resolve();
				case 'Accessibility.getFullAXTree':
					return Promise.reject(new Error('Debugger detached'));
				default:
					assert.fail(`Unexpected command: ${command}`);
			}
		});

		const loadPromise = loader.load();

		window.webContents.emit('did-start-loading');
		window.webContents.emit('did-finish-load');

		const result = await loadPromise;

		assert.strictEqual(result.status, 'error');
		if (result.status === 'error') {
			assert.ok(result.error.includes('Debugger detached'));
		}
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
