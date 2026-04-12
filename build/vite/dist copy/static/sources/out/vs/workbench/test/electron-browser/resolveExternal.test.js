/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NativeWindow } from '../../electron-browser/window.js';
import { ITunnelService } from '../../../platform/tunnel/common/tunnel.js';
import { URI } from '../../../base/common/uri.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
class TunnelMock {
    constructor() {
        this.assignedPorts = {};
        this.expectedDispose = false;
    }
    reset(ports) {
        this.assignedPorts = ports;
    }
    expectDispose() {
        this.expectedDispose = true;
    }
    getExistingTunnel() {
        return Promise.resolve(undefined);
    }
    openTunnel(_addressProvider, _host, port) {
        if (!this.assignedPorts[port]) {
            return Promise.reject(new Error('Unexpected tunnel request'));
        }
        const res = {
            localAddress: `localhost:${this.assignedPorts[port]}`,
            tunnelRemoteHost: '4.3.2.1',
            tunnelRemotePort: this.assignedPorts[port],
            privacy: '',
            dispose: () => {
                assert(this.expectedDispose, 'Unexpected dispose');
                this.expectedDispose = false;
                return Promise.resolve();
            }
        };
        delete this.assignedPorts[port];
        return Promise.resolve(res);
    }
    validate() {
        try {
            assert(Object.keys(this.assignedPorts).length === 0, 'Expected tunnel to be used');
            assert(!this.expectedDispose, 'Expected dispose to be called');
        }
        finally {
            this.expectedDispose = false;
        }
    }
}
class TestNativeWindow extends NativeWindow {
    create() { }
    registerListeners() { }
    enableMultiWindowAwareTimeout() { }
}
suite.skip('NativeWindow:resolveExternal', () => {
    const disposables = new DisposableStore();
    const tunnelMock = new TunnelMock();
    let window;
    setup(() => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        instantiationService.stub(ITunnelService, tunnelMock);
        window = disposables.add(instantiationService.createInstance(TestNativeWindow));
    });
    teardown(() => {
        disposables.clear();
    });
    async function doTest(uri, ports = {}, expectedUri) {
        tunnelMock.reset(ports);
        const res = await window.resolveExternalUri(URI.parse(uri), {
            allowTunneling: true,
            openExternal: true
        });
        assert.strictEqual(!expectedUri, !res, `Expected URI ${expectedUri} but got ${res}`);
        if (expectedUri && res) {
            assert.strictEqual(res.resolved.toString(), URI.parse(expectedUri).toString());
        }
        tunnelMock.validate();
    }
    test('invalid', async () => {
        await doTest('file:///foo.bar/baz');
        await doTest('http://foo.bar/path');
    });
    test('simple', async () => {
        await doTest('http://localhost:1234/path', { 1234: 1234 }, 'http://localhost:1234/path');
    });
    test('all interfaces', async () => {
        await doTest('http://0.0.0.0:1234/path', { 1234: 1234 }, 'http://localhost:1234/path');
    });
    test('changed port', async () => {
        await doTest('http://localhost:1234/path', { 1234: 1235 }, 'http://localhost:1235/path');
    });
    test('query', async () => {
        await doTest('http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455', { 4455: 4455 }, 'http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455');
    });
    test('query with different port', async () => {
        tunnelMock.expectDispose();
        await doTest('http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455', { 4455: 4567 });
    });
    test('both url and query', async () => {
        await doTest('http://localhost:1234/path?a=b&c=http%3a%2f%2flocalhost%3a4455', { 1234: 4321, 4455: 4455 }, 'http://localhost:4321/path?a=b&c=http%3a%2f%2flocalhost%3a4455');
    });
    test('both url and query, query rejected', async () => {
        tunnelMock.expectDispose();
        await doTest('http://localhost:1234/path?a=b&c=http%3a%2f%2flocalhost%3a4455', { 1234: 4321, 4455: 5544 }, 'http://localhost:4321/path?a=b&c=http%3a%2f%2flocalhost%3a4455');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZUV4dGVybmFsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9lbGVjdHJvbi1icm93c2VyL3Jlc29sdmVFeHRlcm5hbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGNBQWMsRUFBZ0IsTUFBTSwyQ0FBMkMsQ0FBQztBQUN6RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFHbEQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSXBFLE1BQU0sVUFBVTtJQUFoQjtRQUNTLGtCQUFhLEdBQVksRUFBRSxDQUFDO1FBQzVCLG9CQUFlLEdBQUcsS0FBSyxDQUFDO0lBeUNqQyxDQUFDO0lBdkNBLEtBQUssQ0FBQyxLQUFjO1FBQ25CLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO0lBQzVCLENBQUM7SUFFRCxhQUFhO1FBQ1osSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7SUFDN0IsQ0FBQztJQUVELGlCQUFpQjtRQUNoQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELFVBQVUsQ0FBQyxnQkFBOEMsRUFBRSxLQUF5QixFQUFFLElBQVk7UUFDakcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUMvQixPQUFPLE9BQU8s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