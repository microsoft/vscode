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
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadWebviewManager } from '../../browser/mainThreadWebviewManager.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { ExtHostWebviews } from '../../common/extHostWebview.js';
import { ExtHostWebviewPanels } from '../../common/extHostWebviewPanels.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { decodeAuthority, webviewResourceBaseHost } from '../../../contrib/webview/common/webview.js';
import { EditorGroupColumn } from '../../../services/editor/common/editorGroupColumn.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import type * as vscode from 'vscode';

suite('ExtHostWebview', () => {
	let disposables: DisposableStore;
	let rpcProtocol: (IExtHostRpcService & IExtHostContext) | undefined;

	setup(() => {
		disposables = new DisposableStore();

		const shape = createNoopMainThreadWebviews();
		rpcProtocol = SingleProxyRPCProtocol(shape);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createWebview(rpcProtocol: (IExtHostRpcService & IExtHostContext) | undefined, remoteAuthority: string | undefined) {
		const extHostWebviews = disposables.add(new ExtHostWebviews(rpcProtocol!, {
			authority: remoteAuthority,
			isRemote: !!remoteAuthority,
		}, undefined, new NullLogService(), NullApiDeprecationService));

		const extHostWebviewPanels = disposables.add(new ExtHostWebviewPanels(rpcProtocol!, extHostWebviews, undefined));

		return disposables.add(extHostWebviewPanels.createWebviewPanel({
			extensionLocation: URI.from({
				scheme: remoteAuthority ? Schemas.vscodeRemote : Schemas.file,
				authority: remoteAuthority,
				path: '/ext/path',
			})
		} as IExtensionDescription, 'type', 'title', 1, {}));
	}

	test('Cannot register multiple serializers for the same view type', async () => {
		const viewType = 'view.type';

		const extHostWebviews = disposables.add(new ExtHostWebviews(rpcProtocol!, { authority: undefined, isRemote: false }, undefined, new NullLogService(), NullApiDeprecationService));

		const extHostWebviewPanels = disposables.add(new ExtHostWebviewPanels(rpcProtocol!, extHostWebviews, undefined));

		let lastInvokedDeserializer: vscode.WebviewPanelSerializer | undefined = undefined;

		class NoopSerializer implements vscode.WebviewPanelSerializer {
			async deserializeWebviewPanel(webview: vscode.WebviewPanel, _state: any): Promise<void> {
				lastInvokedDeserializer = this;
				disposables.add(webview);
			}
		}

		const extension = {} as IExtensionDescription;

		const serializerA = new NoopSerializer();
		const serializerB = new NoopSerializer();

		const serializerARegistration = extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerA);

		await extHostWebviewPanels.$deserializeWebviewPanel('x', viewType, {
			title: 'title',
			state: {},
			panelOptions: {},
			webviewOptions: {},
			active: true,
		}, 0 as EditorGroupColumn);
		assert.strictEqual(lastInvokedDeserializer, serializerA);

		assert.throws(
			() => disposables.add(extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerB)),
			'Should throw when registering two serializers for the same view');

		serializerARegistration.dispose();

		disposables.add(extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializerB));

		await extHostWebviewPanels.$deserializeWebviewPanel('x', viewType, {
			title: 'title',
			state: {},
			panelOptions: {},
			webviewOptions: {},
			active: true,
		}, 0 as EditorGroupColumn);
		assert.strictEqual(lastInvokedDeserializer, serializerB);
	});

	test('asWebviewUri for local file paths', () => {
		const webview = createWebview(rpcProtocol, /* remoteAuthority */undefined);

		assert.strictEqual(
			(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html')).toString()),
			`https://file%2B.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html`,
			'Unix basic'
		);

		assert.strictEqual(
			(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html#frag')).toString()),
			`https://file%2B.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html#frag`,
			'Unix should preserve fragment'
		);

		assert.strictEqual(
			(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/f%20ile.html')).toString()),
			`https://file%2B.vscode-resource.${webviewResourceBaseHost}/Users/codey/f%20ile.html`,
			'Unix with encoding'
		);

		assert.strictEqual(
			(webview.webview.asWebviewUri(URI.parse('file://localhost/Users/codey/file.html')).toString()),
			`https://file%2Blocalhost.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html`,
			'Unix should preserve authority'
		);

		assert.strictEqual(
			(webview.webview.asWebviewUri(URI.parse('file:///c:/codey/file.txt')).toString()),
			`https://file%2B.vscode-resource.${webviewResourceBaseHost}/c%3A/codey/file.txt`,
			'Windows C drive'
		);
	});

	test('asWebviewUri for remote file paths', () => {
		const webview = createWebview(rpcProtocol, /* remoteAuthority */ 'remote');

		assert.strictEqual(
			(webview.webview.asWebviewUri(URI.parse('file:///Users/codey/file.html')).toString()),
			`https://vscode-remote%2Bremote.vscode-resource.${webviewResourceBaseHost}/Users/codey/file.html`,
			'Unix basic'
		);
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
		assert.strictEqual(
			webviewUri.toString(),
			`https://vscode-remote%2Bssh-002dremote-002blocalhost-003dfoo-002fbar.vscode-resource.vscode-cdn.net/Users/cody/x.png`,
			'Check transform');

		assert.strictEqual(
			decodeAuthority(webviewUri.authority),
			`vscode-remote+${authority}.vscode-resource.vscode-cdn.net`,
			'Check decoded authority'
		);
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
		assert.strictEqual(
			webviewUri.toString(),
			`https://vscode-remote%2Blocalhost-003a8080.vscode-resource.vscode-cdn.net/Users/cody/x.png`,
			'Check transform');

		assert.strictEqual(
			decodeAuthority(webviewUri.authority),
			`vscode-remote+${authority}.vscode-resource.vscode-cdn.net`,
			'Check decoded authority'
		);
	});
});


function createNoopMainThreadWebviews() {
	return new class extends mock<MainThreadWebviewManager>() {
		$disposeWebview() { /* noop */ }
		$createWebviewPanel() { /* noop */ }
		$registerSerializer() { /* noop */ }
		$unregisterSerializer() { /* noop */ }
	};
}
