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
import { WebPageLoader } from '../../electron-main/webPageLoader.js';
class MockWebContents {
    constructor() {
        this._listeners = new Map();
        this._onceListeners = new Set();
        this.loadURL = sinon.stub().resolves();
        this.getTitle = sinon.stub().returns('Test Page Title');
        this.executeJavaScript = sinon.stub().resolves(undefined);
        this.session = {
            webRequest: {
                onBeforeSendHeaders: sinon.stub(),
                onHeadersReceived: sinon.stub()
            },
            on: sinon.stub()
        };
        this.debugger = new MockDebugger();
    }
    once(event, listener) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(listener);
        this._onceListeners.add(listener);
        return this;
    }
    on(event, listener) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(listener);
        return this;
    }
    emit(event, ...args) {
        const listeners = this._listeners.get(event) || [];
        for (const listener of listeners) {
            listener(...args);
        }
        // Remove once listeners, keep on listeners
        const remaining = listeners.filter(l => !this._onceListeners.has(l));
        for (const listener of listeners) {
            this._onceListeners.delete(listener);
        }
        if (remaining.length > 0) {
            this._listeners.set(event, remaining);
        }
        else {
            this._listeners.delete(event);
        }
    }
    beginFrameSubscription(_onlyDirty, callback) {
        setTimeout(() => callback(), 0);
    }
    endFrameSubscription() {
    }
}
class MockDebugger {
    constructor() {
        this._listeners = new Map();
        this.attach = sinon.stub();
        this.sendCommand = sinon.stub().resolves({});
    }
    on(event, listener) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(listener);
        return this;
    }
    emit(event, ...args) {
        const listeners = this._listeners.get(event) || [];
        for (const listener of listeners) {
            listener(...args);
        }
    }
}
class MockBrowserWindow {
    constructor(_options) {
        this.destroy = sinon.stub();
        this.loadURL = sinon.stub().resolves();
        this.webContents = new MockWebContents();
    }
}
suite('WebPageLoader', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let window;
    teardown(() => {
        sinon.restore();
    });
    function createWebPageLoader(uri, options, isTrustedDomain) {
        const loader = new WebPageLoader((options) => {
            window = new MockBrowserWindow(options);
            // eslint-disable-next-line local/code-no-any-casts
            return window;
        }, new NullLogService(), uri, options, isTrustedDomain ?? (() => false));
        disposables.add(loader);
        return loader;
    }
    function createMockAXNodes() {
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
    function setupDebuggerMock(options = {}) {
        const { axNodes = createMockAXNodes(), frameTree = { frame: { id: 'main-frame' }, childFrames: [] }, accessibilityHang } = options;
        window.webContents.debugger.sendCommand.callsFake((command, params) => {
            switch (command) {
                case 'Network.enable':
                    return Promise.resolve();
                case 'Page.enable':
                    return Promise.resolve();
                case 'Page.getFrameTree':
                    return Promise.resolve({ frameTree });
                case 'Accessibility.getFullAXTree':
                    if (accessibilityHang) {
                        return new Promise(() => { });
                    }
                    else if (typeof axNodes === 'function') {
                        return Promise.resolve({ nodes: axNodes(params?.frameId ?? '') });
                    }
                    else {
                        return Promise.resolve({ nodes: axNodes });
                    }
                default:
                    assert.fail(`Unexpected command: ${command}`);
            }
        });
    }
    //#region Basic Loading Tests
    test('successful page load returns ok status with content', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
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
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate page load failure
        const mockEvent = {};
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
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate ERR_ABORTED (-3) which should be ignored
        const mockEvent = {};
        window.webContents.emit('did-fail-load', mockEvent, -3, 'ERR_ABORTED');
        const result = await loadPromise;
        // ERR_ABORTED should not cause an error status, content should be extracted
        assert.strictEqual(result.status, 'ok');
        if (result.status === 'ok') {
            assert.ok(result.result.includes('Test content from page'));
        }
    }));
    test('ERR_BLOCKED_BY_CLIENT is ignored and content extraction continues', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate ERR_BLOCKED_BY_CLIENT (-27) which should be ignored
        const mockEvent = {};
        window.webContents.emit('did-fail-load', mockEvent, -27, 'ERR_BLOCKED_BY_CLIENT');
        const result = await loadPromise;
        // ERR_BLOCKED_BY_CLIENT should not cause an error status, content should be extracted
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
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        const result = await loadPromise;
        assert.strictEqual(result.status, 'redirect');
        if (result.status === 'redirect') {
            assert.strictEqual(result.toURI.authority, 'other-domain.com');
        }
        assert.ok((mockEvent.preventDefault).called);
    });
    test('redirect to same authority is not treated as redirect', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const redirectUrl = 'https://example.com/other-page';
        const loader = createWebPageLoader(uri, { followRedirects: false });
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate redirect to same authority
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        // Should not prevent default for same-authority redirects
        assert.ok(!(mockEvent.preventDefault).called);
        // Continue with normal load
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'ok');
    }));
    test('redirect is followed when followRedirects option is true', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const redirectUrl = 'https://other-domain.com/redirected';
        const loader = createWebPageLoader(uri, { followRedirects: true });
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate redirect
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        // Should not prevent default when followRedirects is true
        assert.ok(!(mockEvent.preventDefault).called);
        // Continue with normal load after redirect
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'ok');
    }));
    test('redirect from www to non-www same domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://www.example.com/page');
        const redirectUrl = 'https://example.com/other-page';
        const loader = createWebPageLoader(uri, { followRedirects: false });
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate redirect from www to non-www
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        // Should not prevent default for www prefix redirect
        assert.ok(!(mockEvent.preventDefault).called);
        // Continue with normal load
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'ok');
    }));
    test('redirect from non-www to www same domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const redirectUrl = 'https://www.example.com/other-page';
        const loader = createWebPageLoader(uri, { followRedirects: false });
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate redirect from non-www to www
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        // Should not prevent default for www prefix redirect
        assert.ok(!(mockEvent.preventDefault).called);
        // Continue with normal load
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'ok');
    }));
    test('redirect to trusted domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const redirectUrl = 'https://trusted-domain.com/redirected';
        const loader = createWebPageLoader(uri, { followRedirects: false }, (uri) => uri.authority === 'trusted-domain.com' || uri.authority === 'another-trusted.com');
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate redirect to trusted domain
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        // Should not prevent default for trusted domain redirect
        assert.ok(!(mockEvent.preventDefault).called);
        // Continue with normal load
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'ok');
    }));
    test('post-load navigation to different domain is blocked silently and content is extracted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const adRedirectUrl = 'https://eus.rubiconproject.com/usync.html?p=12776';
        const loader = createWebPageLoader(uri, { followRedirects: false });
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate successful page load
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        // Simulate ad/tracker script redirecting after page load
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-navigate', mockEvent, adRedirectUrl);
        const result = await loadPromise;
        // Navigation should be prevented
        assert.ok((mockEvent.preventDefault).called);
        // But result should be ok (content extracted), NOT redirect
        assert.strictEqual(result.status, 'ok');
        assert.ok(result.result.includes('Test content from page'));
    }));
    test('initial same-domain navigation is allowed but later cross-domain navigation is blocked', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const sameDomainUrl = 'https://example.com/otherpage';
        const crossDomainUrl = 'https://eus.rubiconproject.com/usync.html?p=12776';
        const loader = createWebPageLoader(uri, { followRedirects: false });
        setupDebuggerMock();
        const loadPromise = loader.load();
        // First navigation: same-authority, should be allowed
        const initialEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-navigate', initialEvent, sameDomainUrl);
        assert.ok(!(initialEvent.preventDefault).called);
        // Simulate successful page load
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        // Second navigation: cross-domain after load, should be blocked
        const crossDomainEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-navigate', crossDomainEvent, crossDomainUrl);
        const result = await loadPromise;
        assert.ok((crossDomainEvent.preventDefault).called);
        assert.strictEqual(result.status, 'ok');
        assert.ok(result.result.includes('Test content from page'));
    }));
    test('redirect to non-trusted domain is blocked', async () => {
        const uri = URI.parse('https://example.com/page');
        const redirectUrl = 'https://untrusted-domain.com/redirected';
        const loader = createWebPageLoader(uri, { followRedirects: false }, (uri) => uri.authority === 'trusted-domain.com');
        window.webContents.debugger.sendCommand.resolves({});
        const loadPromise = loader.load();
        // Simulate redirect to non-trusted domain
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        const result = await loadPromise;
        // Should prevent redirect to non-trusted domain
        assert.ok((mockEvent.preventDefault).called);
        assert.strictEqual(result.status, 'redirect');
        if (result.status === 'redirect') {
            assert.strictEqual(result.toURI.authority, 'untrusted-domain.com');
        }
    });
    test('redirect to wildcard subdomain trusted domain is allowed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const redirectUrl = 'https://sub.trusted-domain.com/redirected';
        const loader = createWebPageLoader(uri, { followRedirects: false }, (uri) => uri.authority.endsWith('.trusted-domain.com') || uri.authority === 'trusted-domain.com');
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate redirect to subdomain of trusted wildcard domain
        const mockEvent = {
            preventDefault: sinon.stub()
        };
        window.webContents.emit('will-redirect', mockEvent, redirectUrl);
        // Should not prevent default for wildcard subdomain match
        assert.ok(!(mockEvent.preventDefault).called);
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
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate network response with error status
        const mockEvent = {};
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
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate network response with 500 status
        const mockEvent = {};
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
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate network response without status text
        const mockEvent = {};
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
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate page starting to load
        window.webContents.emit('did-start-loading');
        // Simulate network requests
        const mockEvent = {};
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
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        // Simulate page load
        window.webContents.emit('did-start-loading');
        // Simulate a network request that fails
        const mockEvent = {};
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
        const axNodes = [
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
        setupDebuggerMock({ axNodes });
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
        const shortAXNodes = [
            {
                nodeId: 'node1',
                ignored: false,
                role: { type: 'role', value: 'StaticText' },
                name: { type: 'string', value: 'Short' }
            }
        ];
        const loader = createWebPageLoader(uri);
        setupDebuggerMock({ axNodes: shortAXNodes });
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
    test('returns error when accessibility tree extraction hangs', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const loader = createWebPageLoader(uri);
        setupDebuggerMock({ accessibilityHang: true });
        const loadPromise = loader.load();
        window.webContents.emit('did-start-loading');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'error');
        if (result.status === 'error') {
            assert.ok(result.error.includes('Failed to extract meaningful content'));
        }
        // Verify executeJavaScript was NOT called for DOM extraction
        assert.ok(!window.webContents.executeJavaScript.called);
    }));
    test('returns error when both accessibility tree and DOM extraction yield no content', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/empty-page');
        const loader = createWebPageLoader(uri);
        setupDebuggerMock({ axNodes: [] });
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
    test('extracts content from multiple frames including iframes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page-with-iframes');
        // Accessibility nodes for the main frame
        const mainFrameNodes = [
            {
                nodeId: 'main-root',
                ignored: false,
                role: { type: 'role', value: 'RootWebArea' },
                childIds: ['main-heading']
            },
            {
                nodeId: 'main-heading',
                ignored: false,
                role: { type: 'role', value: 'heading' },
                name: { type: 'string', value: 'Main Page Content' },
                properties: [{ name: 'level', value: { type: 'integer', value: 1 } }],
                childIds: ['main-text']
            },
            {
                nodeId: 'main-text',
                ignored: false,
                role: { type: 'role', value: 'StaticText' },
                name: { type: 'string', value: 'Main Page Content' }
            }
        ];
        // Accessibility nodes for an iframe (simulating nested documentation content)
        const iframeNodes = [
            {
                nodeId: 'iframe-root',
                ignored: false,
                role: { type: 'role', value: 'RootWebArea' },
                childIds: ['iframe-heading']
            },
            {
                nodeId: 'iframe-heading',
                ignored: false,
                role: { type: 'role', value: 'heading' },
                name: { type: 'string', value: 'Iframe Documentation Content' },
                properties: [{ name: 'level', value: { type: 'integer', value: 2 } }],
                childIds: ['iframe-text']
            },
            {
                nodeId: 'iframe-text',
                ignored: false,
                role: { type: 'role', value: 'StaticText' },
                name: { type: 'string', value: 'Iframe Documentation Content' }
            }
        ];
        // Accessibility nodes for a nested iframe
        const nestedIframeNodes = [
            {
                nodeId: 'nested-root',
                ignored: false,
                role: { type: 'role', value: 'RootWebArea' },
                childIds: ['nested-paragraph']
            },
            {
                nodeId: 'nested-paragraph',
                ignored: false,
                role: { type: 'role', value: 'paragraph' },
                childIds: ['nested-text']
            },
            {
                nodeId: 'nested-text',
                ignored: false,
                role: { type: 'role', value: 'StaticText' },
                name: { type: 'string', value: 'Deeply nested iframe content that should also be extracted' }
            }
        ];
        const loader = createWebPageLoader(uri);
        const frameTree = {
            frame: { id: 'main-frame', url: 'https://example.com/page-with-iframes' },
            childFrames: [
                {
                    frame: { id: 'iframe-1', url: 'https://example.com/iframe-content' },
                    childFrames: [
                        {
                            frame: { id: 'nested-iframe', url: 'https://example.com/nested-content' },
                            childFrames: []
                        }
                    ]
                }
            ]
        };
        setupDebuggerMock({
            frameTree,
            axNodes: (frameId) => {
                switch (frameId) {
                    case 'main-frame':
                        return mainFrameNodes;
                    case 'iframe-1':
                        return iframeNodes;
                    case 'nested-iframe':
                        return nestedIframeNodes;
                    default:
                        return [];
                }
            }
        });
        const loadPromise = loader.load();
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        const result = await loadPromise;
        assert.strictEqual(result.status, 'ok');
        if (result.status === 'ok') {
            // Verify content from main frame is included
            assert.ok(result.result.includes('Main Page Content'), 'Should include main frame content');
            // Verify content from iframe is included
            assert.ok(result.result.includes('Iframe Documentation Content'), 'Should include iframe content');
            // Verify content from nested iframe is included
            assert.ok(result.result.includes('Deeply nested iframe content'), 'Should include nested iframe content');
        }
        // Verify Accessibility.getFullAXTree was called for each frame
        const getFullAXTreeCalls = window.webContents.debugger.sendCommand.getCalls()
            .filter(call => call.args[0] === 'Accessibility.getFullAXTree');
        assert.strictEqual(getFullAXTreeCalls.length, 3, 'Should call getFullAXTree for all 3 frames');
    }));
    //#endregion
    //#region Header Modification Tests
    test('onBeforeSendHeaders adds browser headers for navigation', () => {
        createWebPageLoader(URI.parse('https://example.com/page'));
        // Get the callback passed to onBeforeSendHeaders
        assert.ok(window.webContents.session.webRequest.onBeforeSendHeaders.called);
        const callback = window.webContents.session.webRequest.onBeforeSendHeaders.getCall(0).args[0];
        // Mock callback function
        let modifiedHeaders;
        const mockCallback = (details) => {
            modifiedHeaders = details.requestHeaders;
        };
        // Simulate a request to the same domain
        callback({
            url: 'https://example.com/page',
            requestHeaders: {
                'TestHeader': 'TestValue'
            }
        }, mockCallback);
        // Verify headers were added
        assert.ok(modifiedHeaders);
        assert.strictEqual(modifiedHeaders['DNT'], '1');
        assert.strictEqual(modifiedHeaders['Sec-GPC'], '1');
        assert.strictEqual(modifiedHeaders['TestHeader'], 'TestValue');
    });
    //#endregion
    //#region Download Prevention Tests
    test('onHeadersReceived replaces Content-Disposition attachment with inline for text content', () => {
        createWebPageLoader(URI.parse('https://example.com/page'));
        // Get the callback passed to onHeadersReceived
        assert.ok(window.webContents.session.webRequest.onHeadersReceived.called);
        const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
        for (const contentType of ['application/xml', 'text/html', 'text/plain', 'application/json', 'application/xhtml+xml', 'application/rss+xml', 'application/vnd.custom+json']) {
            let response;
            const mockCallback = (result) => {
                response = result;
            };
            listener({
                url: 'https://example.com/file',
                responseHeaders: {
                    'Content-Disposition': ['attachment; filename="file.xml"'],
                    'Content-Type': [contentType]
                }
            }, mockCallback);
            assert.ok(response, `Expected response for ${contentType}`);
            assert.deepStrictEqual(response.responseHeaders['Content-Disposition'], ['inline'], `Expected inline for ${contentType}`);
            assert.strictEqual(response.cancel, false, `Should not cancel for ${contentType}`);
        }
    });
    test('onHeadersReceived cancels Content-Disposition attachment for binary content', () => {
        createWebPageLoader(URI.parse('https://example.com/page'));
        const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
        for (const contentType of ['application/octet-stream', 'application/zip', 'application/pdf', 'image/png', 'video/mp4']) {
            let response;
            const mockCallback = (result) => {
                response = result;
            };
            listener({
                url: 'https://example.com/file.bin',
                responseHeaders: {
                    'Content-Disposition': ['attachment; filename="file.bin"'],
                    'Content-Type': [contentType]
                }
            }, mockCallback);
            assert.ok(response, `Expected response for ${contentType}`);
            assert.strictEqual(response.cancel, true, `Expected cancel for ${contentType}`);
        }
    });
    test('onHeadersReceived cancels Content-Disposition attachment when content type is missing', () => {
        createWebPageLoader(URI.parse('https://example.com/page'));
        const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
        let response;
        const mockCallback = (result) => {
            response = result;
        };
        listener({
            url: 'https://example.com/file',
            responseHeaders: {
                'Content-Disposition': ['attachment; filename="file"']
            }
        }, mockCallback);
        assert.ok(response);
        assert.strictEqual(response.cancel, true);
    });
    test('onHeadersReceived allows normal responses without Content-Disposition attachment', () => {
        createWebPageLoader(URI.parse('https://example.com/page'));
        const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
        let response;
        const mockCallback = (result) => {
            response = result;
        };
        // Simulate a normal HTML response
        listener({
            url: 'https://example.com/page',
            responseHeaders: {
                'Content-Type': ['text/html'],
                'Content-Disposition': ['inline']
            }
        }, mockCallback);
        assert.ok(response);
        assert.strictEqual(response.responseHeaders, undefined);
    });
    test('will-download handler cancels download and returns error', async () => {
        const uri = URI.parse('https://dl.google.com/linux/chrome/rpm/stable/x86_64/repodata/repomd.xml');
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        // Get the will-download handler
        assert.ok(window.webContents.session.on.called);
        const willDownloadCall = window.webContents.session.on.getCalls()
            .find(call => call.args[0] === 'will-download');
        assert.ok(willDownloadCall);
        const willDownloadHandler = willDownloadCall.args[1];
        const loadPromise = loader.load();
        // Simulate a download being triggered
        const mockItem = {
            cancel: sinon.stub(),
            getFilename: sinon.stub().returns('repomd.xml')
        };
        willDownloadHandler({}, mockItem);
        const result = await loadPromise;
        // Verify download was cancelled
        assert.ok(mockItem.cancel.called);
        // Verify error result
        assert.strictEqual(result.status, 'error');
        if (result.status === 'error') {
            assert.ok(result.error.includes('Download not allowed'));
            assert.ok(result.error.includes('repomd.xml'));
        }
    });
    //#endregion
    //#region Disposal Tests
    test('disposes resources after load completes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const uri = URI.parse('https://example.com/page');
        const loader = createWebPageLoader(uri);
        setupDebuggerMock();
        const loadPromise = loader.load();
        window.webContents.emit('did-start-loading');
        window.webContents.emit('did-finish-load');
        await loadPromise;
        // The loader should call destroy on the window when disposed
        assert.ok(window.destroy.called);
    }));
    //#endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViUGFnZUxvYWRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci90ZXN0L2VsZWN0cm9uLW1haW4vd2ViUGFnZUxvYWRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFNUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBT3JFLE1BQU0sZUFBZTtJQWdCcEI7UUFmaUIsZUFBVSxHQUFHLElBQUksR0FBRyxFQUE0QyxDQUFDO1FBQ2pFLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQWdDLENBQUM7UUFFbkUsWUFBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsQyxhQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ25ELHNCQUFpQixHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFckQsWUFBTyxHQUFHO1lBQ2hCLFVBQVUsRUFBRTtnQkFDWCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFO2dCQUNqQyxpQkFBaUIsRUFBRSxLQUFLLENB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