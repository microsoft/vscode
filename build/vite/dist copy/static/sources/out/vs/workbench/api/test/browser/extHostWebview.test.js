/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtHostWebviews } from '../../common/extHostWebview.js';
import { ExtHostWebviewPanels } from '../../common/extHostWebviewPanels.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { decodeAuthority, webviewResourceBaseHost } from '../../../contrib/webview/common/webview.js';
suite('ExtHostWebview', () => {
    let disposables;
    let rpcProtocol;
    setup(() => {
        disposables = new DisposableStore();
        const shape = createNoopMainThreadWebviews();
        rpcProtocol = SingleProxyRPCProtocol(shape);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createWebview(rpcProtocol, remoteAuthority) {
        const extHostWebviews = disposables.add(new ExtHostWebviews(rpcProtocol, {
            authority: remoteAuthority,
            isRemote: !!remoteAuthority,
        }, undefined, new NullLogService(), NullApiDeprecationService));
        const extHostWebviewPanels = disposables.add(new ExtHostWebviewPanels(rpcProtocol, extHostWebviews, undefined));
        return disposables.add(extHostWebviewPanels.createWebviewPanel({
            extensionLocation: URI.from({
                scheme: remoteAuthority ? Schemas.vscodeRemote : Schemas.file,
                authority: remoteAuthority,
                path: '/ext/path',
            })
        }, 'type', 'title', 1, {}));
    }
    test('Cannot register multiple serializers for the same view type', async () => {
        const viewType = 'view.type';
        const extHostWebviews = disposables.add(new ExtHostWebviews(rpcProtocol, { authority: undefined, isRemote: false }, undefined, new NullLogService(), NullApiDeprecationService));
        const extHostWebviewPanels = disposables.add(new ExtHostWebviewPanels(rpcProtocol, extHostWebviews, undefined));
        let lastInvokedDeserializer = undefined;
        class NoopSerializer {
            async deserializeWebviewPanel(webview, _state) {
                lastInvokedDeserializer = this;
                disposables.add(webview);
            }
        }
        const extension = {};
        const serializerA = new NoopSerializer();
        const serializerB = new NoopSerializer();
        const serializerARegistration = extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerA);
        await extHostWebviewPanels.$deserializeWebviewPanel('x', viewType, {
            title: 'title',
            state: {},
            panelOptions: {},
            webviewOptions: {},
            active: true,
        }, 0);
        assert.strictEqual(lastInvokedDeserializer, serializerA);
        assert.throws(() => disposables.add(extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerB)), 'Should throw when registering two serializers for the same view');
        serializerARegistration.dispose();
        disposables.add(extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerB));
        await extHostWebviewPanels.$deserializeWebviewPanel('x', viewType, {
            title: 'title',
            state: {},
            panelOptions: {},
            webviewOptions: {},
            active: true,
        }, 0);
        assert.strictEqual(lastInvokedDeserializer, serializerB);
    });
    test('asWebviewUri for local file paths', () => {
        const webview = createWebview(rpcProtocol, /* remoteAuthority */ undefined);
        assert.strictEqual((webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html')).toString()), `https://file%2B.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html`, 'Unix basic');
        assert.strictEqual((webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html#frag')).toString()), `https://file%2B.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html#frag`, 'Unix should preserve fragment');
        assert.strictEqual((webview.webview.asWebviewUri(URI.parse('file:///Users/codey/f%20ile.html')).toString()), `https://file%2B.vscode-resource.${webviewResourceBaseHost}/Users/codey/f%20ile.html`, 'Unix with encoding');
        assert.strictEqual((webview.webview.asWebviewUri(URI.parse('file://localhost/Users/codey/file.html')).toString()), `https://file%2Blocalhost.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html`, 'Unix should preserve authority');
        assert.strictEqual((webview.webview.asWebviewUri(URI.parse('file:///c:/codey/file.txt')).toString()), `https://file%2B.vscode-resource.${webviewResourceBaseHost}/c%3A/codey/file.txt`, 'Windows C drive');
    });
    test('asWebviewUri for remote file paths', () => {
        const webview = createWebview(rpcProtocol, /* remoteAuthority */ 'remote');
        assert.strictEqual((webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html')).toString()), `https://vscode-remote%2Bremote.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html`, 'Unix basic');
    });
    test('asWebviewUri for remote with / and + in name', () => {
        const webview = createWebview(rpcProtocol, /* remoteAuthority */ 'remote');
        const authority = 'ssh-remote+localhost=foo/bar';
        const sourceUri = URI.from({
            scheme: 'vscode-remote',
            authority: authority,
            path: '/Users/cody/x.png'
        });
        const webviewUri = webview.webview.asWebviewUri(sourceUri);
        assert.strictEqual(webviewUri.toString(), `https://vscode-remote%2Bssh-002dremote-002blocalhost-003dfoo-002fbar.vscode-resource.vscode-cdn.net/Users/cody/x.png`, 'Check transform');
        assert.strictEqual(decodeAuthority(webviewUri.authority), `vscode-remote+${authority}.vscode-resource.vscode-cdn.net`, 'Check decoded authority');
    });
    test('asWebviewUri for remote with port in name', () => {
        const webview = createWebview(rpcProtocol, /* remoteAuthority */ 'remote');
        const authority = 'localhost:8080';
        const sourceUri = URI.from({
            scheme: 'vscode-remote',
            authority: authority,
            path: '/Users/cody/x.png'
        });
        const webviewUri = webview.webview.asWebviewUri(sourceUri);
        assert.strictEqual(webviewUri.toString(), `https://vscode-remote%2Blocalhost-003a8080.vscode-resource.vscode-cdn.net/Users/cody/x.png`, 'Check transform');
        assert.strictEqual(decodeAuthority(webviewUri.authority), `vscode-remote+${authority}.vscode-resource.vscode-cdn.net`, 'Check decoded authority');
    });
});
function createNoopMainThreadWebviews() {
    return new class extends mock() {
        $disposeWebview() { }
        $createWebviewPanel() { }
        $registerSerializer() { }
        $unregisterSerializer() { }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFdlYnZpZXcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RXZWJ2aWV3LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFekYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxlQUFlLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUt0RyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO0lBQzVCLElBQUksV0FBNEIsQ0FBQztJQUNqQyxJQUFJLFdBQStELENBQUM7SUFFcEUsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRXBDLE1BQU0sS0FBSyxHQUFHLDRCQUE0QixF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