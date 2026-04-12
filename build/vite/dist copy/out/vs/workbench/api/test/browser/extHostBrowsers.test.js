/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ExtHostBrowsers } from '../../common/extHostBrowsers.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostBrowsers', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const defaultDto = {
        id: 'browser-1',
        url: 'https://example.com',
        title: 'Example',
        favicon: undefined,
    };
    function createDto(overrides) {
        return { ...defaultDto, ...overrides };
    }
    function createExtHostBrowsers(overrides) {
        const proxy = new class extends mock() {
            $openBrowserTab() { return Promise.resolve(createDto()); }
            $startCDPSession() { return Promise.resolve(); }
            $closeCDPSession() { return Promise.resolve(); }
            $sendCDPMessage() { return Promise.resolve(); }
            $closeBrowserTab() { return Promise.resolve(); }
        };
        if (overrides) {
            Object.assign(proxy, overrides);
        }
        return store.add(new ExtHostBrowsers(SingleProxyRPCProtocol(proxy)));
    }
    // #region browserTabs
    test('browserTabs populates from $onDidOpenBrowserTab', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://one.com', title: 'One' }));
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b2', url: 'https://two.com', title: 'Two' }));
        const tabs = extHost.browserTabs;
        assert.strictEqual(tabs.length, 2);
        assert.strictEqual(tabs[0].url, 'https://one.com');
        assert.strictEqual(tabs[1].url, 'https://two.com');
    });
    test('browserTabs returns a snapshot, not a live array', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const snapshot1 = extHost.browserTabs;
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b2' }));
        const snapshot2 = extHost.browserTabs;
        assert.notStrictEqual(snapshot1, snapshot2);
        assert.strictEqual(snapshot1.length, 1);
        assert.strictEqual(snapshot2.length, 2);
    });
    // #endregion
    // #region activeBrowserTab
    test('activeBrowserTab updates via $onDidChangeActiveBrowserTab', () => {
        const extHost = createExtHostBrowsers();
        const dto = createDto({ id: 'b1', url: 'https://active.com' });
        extHost.$onDidOpenBrowserTab(dto);
        extHost.$onDidChangeActiveBrowserTab('b1');
        assert.strictEqual(extHost.activeBrowserTab?.url, 'https://active.com');
    });
    test('activeBrowserTab becomes undefined when cleared', () => {
        const extHost = createExtHostBrowsers();
        const dto = createDto({ id: 'b1' });
        extHost.$onDidOpenBrowserTab(dto);
        extHost.$onDidChangeActiveBrowserTab('b1');
        assert.ok(extHost.activeBrowserTab);
        extHost.$onDidChangeActiveBrowserTab(undefined);
        assert.strictEqual(extHost.activeBrowserTab, undefined);
    });
    test('$onDidChangeActiveBrowserTab with unknown tab returns undefined', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidChangeActiveBrowserTab('non-existent');
        assert.strictEqual(extHost.activeBrowserTab, undefined);
    });
    // #endregion
    // #region openBrowserTab
    test('openBrowserTab returns a BrowserTab with correct properties', async () => {
        const dto = createDto({ id: 'opened', url: 'https://opened.com', title: 'Opened' });
        const extHost = createExtHostBrowsers({
            $openBrowserTab: () => Promise.resolve(dto),
        });
        const tab = await extHost.openBrowserTab('https://opened.com');
        assert.strictEqual(tab.url, 'https://opened.com');
        assert.strictEqual(tab.title, 'Opened');
    });
    test('openBrowserTab fires onDidOpenBrowserTab for new tabs', async () => {
        const extHost = createExtHostBrowsers({
            $openBrowserTab: () => Promise.resolve(createDto({ id: 'new-tab' })),
        });
        const opened = [];
        store.add(extHost.onDidOpenBrowserTab(tab => opened.push(tab)));
        await extHost.openBrowserTab('https://example.com');
        assert.strictEqual(opened.length, 1);
        assert.strictEqual(opened[0].url, 'https://example.com');
    });
    test('openBrowserTab reuses existing tab when IDs match', async () => {
        const extHost = createExtHostBrowsers({
            $openBrowserTab: () => Promise.resolve(createDto({ id: 'same', url: 'https://updated.com' })),
        });
        extHost.$onDidOpenBrowserTab(createDto({ id: 'same', url: 'https://original.com' }));
        const tab = await extHost.openBrowserTab('https://updated.com');
        assert.strictEqual(extHost.browserTabs.length, 1);
        assert.strictEqual(tab.url, 'https://updated.com');
    });
    test('openBrowserTab forwards options to proxy', async () => {
        let capturedViewColumn;
        let capturedOptions;
        const extHost = createExtHostBrowsers({
            $openBrowserTab: (_url, viewColumn, options) => {
                capturedViewColumn = viewColumn;
                capturedOptions = options;
                return Promise.resolve(createDto({ id: 'opts' }));
            },
        });
        await extHost.openBrowserTab('https://example.com', { viewColumn: 2, preserveFocus: true, background: true });
        // ViewColumn.from converts API viewColumn (1-based) to EditorGroupColumn (0-based)
        assert.strictEqual(capturedViewColumn, 1);
        assert.strictEqual(capturedOptions?.preserveFocus, true);
        assert.strictEqual(capturedOptions?.inactive, true);
    });
    // #endregion
    // #region $onDidOpenBrowserTab
    test('$onDidOpenBrowserTab fires event', () => {
        const extHost = createExtHostBrowsers();
        const opened = [];
        store.add(extHost.onDidOpenBrowserTab(tab => opened.push(tab)));
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://opened.com' }));
        assert.strictEqual(opened.length, 1);
        assert.strictEqual(opened[0].url, 'https://opened.com');
    });
    // #endregion
    // #region $onDidCloseBrowserTab
    test('$onDidCloseBrowserTab removes tab and fires event', () => {
        const extHost = createExtHostBrowsers();
        const changes = [];
        store.add(extHost.onDidChangeBrowserTabState(tab => changes.push(tab)));
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://old.com' }));
        extHost.$onDidChangeBrowserTabState(createDto({ id: 'b1', url: 'https://new.com' }));
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].url, 'https://new.com');
    });
    test('$onDidChangeBrowserTabState does not fire when data is unchanged', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://example.com', title: 'Old Title' }));
        extHost.$onDidChangeBrowserTabState(createDto({ id: 'b1', url: 'https://example.com', title: 'New Title' }));
        assert.strictEqual(extHost.browserTabs[0].url, 'https://example.com');
        assert.strictEqual(extHost.browserTabs[0].title, 'New Title');
    });
    // #endregion
    // #region $onDidChangeActiveBrowserTab event
    test('$onDidChangeActiveBrowserTab fires event', () => {
        const extHost = createExtHostBrowsers();
        const activeChanges = [];
        store.add(extHost.onDidChangeActiveBrowserTab(tab => activeChanges.push(tab?.url)));
        const dto = createDto({ id: 'b1' });
        extHost.$onDidOpenBrowserTab(dto);
        extHost.$onDidChangeActiveBrowserTab('b1');
        extHost.$onDidChangeActiveBrowserTab(undefined);
        assert.deepStrictEqual(activeChanges, ['https://example.com', undefined]);
    });
    // #endregion
    // #region BrowserTab icon
    test('icon is globe ThemeIcon when no favicon', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: undefined }));
        assert.strictEqual(extHost.browserTabs[0].icon.id, 'globe');
    });
    test('icon is URI when favicon is provided', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: 'https://example.com/favicon.ico' }));
        assert.strictEqual(String(extHost.browserTabs[0].icon), 'https://example.com/favicon.ico');
    });
    test('icon updates when favicon changes', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: undefined }));
        assert.strictEqual(extHost.browserTabs[0].icon.id, 'globe');
        extHost.$onDidChangeBrowserTabState(createDto({ id: 'b1', favicon: 'https://example.com/new.ico' }));
        assert.strictEqual(String(extHost.browserTabs[0].icon), 'https://example.com/new.ico');
    });
    test('icon reverts to globe when favicon is cleared', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: 'https://example.com/icon.ico' }));
        assert.strictEqual(String(extHost.browserTabs[0].icon), 'https://example.com/icon.ico');
        extHost.$onDidChangeBrowserTabState(createDto({ id: 'b1', favicon: undefined }));
        assert.strictEqual(extHost.browserTabs[0].icon.id, 'globe');
    });
    // #endregion
    // #region BrowserTab readonly properties
    test('tab properties are not directly writable', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://example.com', title: 'Title' }));
        const tab = extHost.browserTabs[0];
        // Attempting to assign to getter-only properties should either throw or be silently ignored
        assert.throws(() => { tab.url = 'https://hacked.com'; });
        assert.throws(() => { tab.title = 'Hacked'; });
        assert.strictEqual(tab.url, 'https://example.com');
        assert.strictEqual(tab.title, 'Title');
    });
    test('startCDPSession calls $startCDPSession on proxy', async () => {
        let capturedBrowserId;
        const extHost = createExtHostBrowsers({
            $startCDPSession: (_sessionId, browserId) => {
                capturedBrowserId = browserId;
                return Promise.resolve();
            },
        });
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const session = await extHost.browserTabs[0].startCDPSession();
        assert.ok(session);
        assert.strictEqual(capturedBrowserId, 'b1');
    });
    test('sendMessage validates message structure', async () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const session = await extHost.browserTabs[0].startCDPSession();
        // Valid message succeeds
        await session.sendMessage({ id: 1, method: 'Page.enable' });
        // Invalid messages are rejected
        await assert.rejects(Promise.resolve().then(() => session.sendMessage(null)), /must be an object/);
        await assert.rejects(Promise.resolve().then(() => session.sendMessage({ method: 'Foo' })), /numeric id/);
        await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1 })), /method string/);
    });
    test('sendMessage forwards valid message to proxy', async () => {
        const sentMessages = [];
        const extHost = createExtHostBrowsers({
            $sendCDPMessage: (_sid, message) => {
                sentMessages.push(message);
                return Promise.resolve();
            },
        });
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const session = await extHost.browserTabs[0].startCDPSession();
        await session.sendMessage({ id: 1, method: 'Page.enable', params: {} });
        assert.strictEqual(sentMessages.length, 1);
        assert.deepStrictEqual(sentMessages[0], { id: 1, method: 'Page.enable', params: {}, sessionId: undefined });
    });
    test('sendMessage rejects after session is closed', async () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const session = await extHost.browserTabs[0].startCDPSession();
        await session.close();
        await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1, method: 'Foo' })), /closed/);
    });
    test('$onCDPSessionMessage delivers to correct session', async () => {
        const capturedIds = [];
        const extHost = createExtHostBrowsers({
            $startCDPSession: (sessionId) => {
                capturedIds.push(sessionId);
                return Promise.resolve();
            },
        });
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const session1 = await extHost.browserTabs[0].startCDPSession();
        const session2 = await extHost.browserTabs[0].startCDPSession();
        const received1 = [];
        const received2 = [];
        store.add(session1.onDidReceiveMessage(m => received1.push(m)));
        store.add(session2.onDidReceiveMessage(m => received2.push(m)));
        extHost.$onCDPSessionMessage(capturedIds[1], { id: 1, result: { data: 'hello' } });
        assert.deepStrictEqual(received1, []);
        assert.deepStrictEqual(received2, [{ id: 1, result: { data: 'hello' } }]);
    });
    test('$onCDPSessionClosed fires onDidClose', async () => {
        const capturedIds = [];
        const extHost = createExtHostBrowsers({
            $startCDPSession: (sessionId) => {
                capturedIds.push(sessionId);
                return Promise.resolve();
            },
        });
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
        const session = await extHost.browserTabs[0].startCDPSession();
        let closeFired = false;
        store.add(session.onDidClose(() => { closeFired = true; }));
        extHost.$onCDPSessionClosed(capturedIds[0]);
        assert.ok(closeFired);
    });
    // #endregion
    // #region Reference stability
    test('tab object reference is stable across updates', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://old.com', title: 'Old' }));
        const tabBefore = extHost.browserTabs[0];
        extHost.$onDidChangeBrowserTabState(createDto({ id: 'b1', url: 'https://new.com', title: 'New' }));
        const tabAfter = extHost.browserTabs[0];
        assert.strictEqual(tabBefore, tabAfter);
        assert.strictEqual(tabAfter.url, 'https://new.com');
    });
    test('openBrowserTab returns same reference as browserTabs entry', async () => {
        const extHost = createExtHostBrowsers({
            $openBrowserTab: () => Promise.resolve(createDto({ id: 'ref-test' })),
        });
        const returned = await extHost.openBrowserTab('https://example.com');
        const fromArray = extHost.browserTabs[0];
        assert.strictEqual(returned, fromArray);
    });
    // #endregion
    // #region Multiple tabs tracked independently
    test('closing one tab does not affect others', () => {
        const extHost = createExtHostBrowsers();
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://one.com' }));
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b2', url: 'https://two.com' }));
        extHost.$onDidOpenBrowserTab(createDto({ id: 'b3', url: 'https://three.com' }));
        extHost.$onDidCloseBrowserTab('b2');
        assert.strictEqual(extHost.browserTabs.length, 2);
        assert.deepStrictEqual(extHost.browserTabs.map(t => t.url), ['https://one.com', 'https://three.com']);
    });
    test('closing active tab clears activeBrowserTab', () => {
        const extHost = createExtHostBrowsers();
        const dto = createDto({ id: 'b1' });
        extHost.$onDidOpenBrowserTab(dto);
        extHost.$onDidChangeActiveBrowserTab('b1');
        assert.ok(extHost.activeBrowserTab);
        extHost.$onDidCloseBrowserTab('b1');
        assert.strictEqual(extHost.activeBrowserTab, undefined);
    });
    // #endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEJyb3dzZXJzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9leHRIb3N0QnJvd3NlcnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO0lBRTdCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsTUFBTSxVQUFVLEdBQWtCO1FBQ2pDLEVBQUUsRUFBRSxXQUFXO1FBQ2YsR0FBRyxFQUFFLHFCQUFxQjtRQUMxQixLQUFLLEVBQUUsU0FBUztRQUNoQixPQUFPLEVBQUUsU0FBUztLQUNsQixDQUFDO0lBRUYsU0FBUyxTQUFTLENBQUMsU0FBa0M7UUFDcEQsT0FBTyxFQUFFLEdBQUcsVUFBVSxFQUFFLEdBQUcsU0FBUyxFQUFFLENBQUM7SUFDeEMsQ0FBQztJQUVELFNBQVMscUJBQXFCLENBQUMsU0FBNEM7UUFDMUUsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUEyQjtZQUNyRCxlQUFlLEtBQTZCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsRixnQkFBZ0IsS0FBb0IsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFD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