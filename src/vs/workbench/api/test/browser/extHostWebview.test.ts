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
import { IWebviewContentOptions } from '../../common/extHost.protocol.js';
import { ExtHostWebviews } from '../../common/extHostWebview.js';
import { ExtHostWebviewPanels } from '../../common/extHostWebviewPanels.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
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

	suite('ensureDefaultContentOptions', () => {
		function createExtHostWebviewsWithCapture(workspaceFolders: URI[] | undefined) {
			const setOptionsCalls: { handle: string; options: IWebviewContentOptions }[] = [];

			const shape = new class extends mock<MainThreadWebviewManager>() {
				$setOptions(handle: string, options: IWebviewContentOptions) {
					setOptionsCalls.push({ handle, options });
				}
			};

			const captureRpc = SingleProxyRPCProtocol(shape);

			const workspace: IExtHostWorkspace | undefined = workspaceFolders
				? new class extends mock<IExtHostWorkspace>() {
					override getWorkspaceFolders() {
						return workspaceFolders.map((uri, index) => ({ uri, name: `f${index}`, index })) as unknown as vscode.WorkspaceFolder[];
					}
				}
				: undefined;

			const extHostWebviews = disposables.add(new ExtHostWebviews(
				captureRpc,
				{ authority: undefined, isRemote: false },
				workspace,
				new NullLogService(),
				NullApiDeprecationService));

			return { extHostWebviews, setOptionsCalls };
		}

		const extension = {
			extensionLocation: URI.file('/ext/install/path'),
		} as IExtensionDescription;

		test('fills default localResourceRoots from workspace folders and extension location when caller did not supply them', () => {
			const folderA = URI.file('/workspace/a');
			const folderB = URI.file('/workspace/b');
			const { extHostWebviews, setOptionsCalls } = createExtHostWebviewsWithCapture([folderA, folderB]);

			disposables.add(extHostWebviews.createNewWebview('handle-1', { enableScripts: true }, extension));
			extHostWebviews.ensureDefaultContentOptions('handle-1', { enableScripts: true }, extension);

			assert.strictEqual(setOptionsCalls.length, 1, 'expected $setOptions to be called once');
			const call = setOptionsCalls[0];
			assert.strictEqual(call.handle, 'handle-1');
			assert.strictEqual(call.options.enableScripts, true);
			const roots = call.options.localResourceRoots;
			assert.ok(roots, 'expected localResourceRoots to be set');
			const rootStrings = roots!.map(r => URI.from(r).toString());
			assert.deepStrictEqual(rootStrings, [
				folderA.toString(),
				folderB.toString(),
				extension.extensionLocation.toString(),
			]);
		});

		test('does nothing when caller already supplied localResourceRoots', () => {
			const { extHostWebviews, setOptionsCalls } = createExtHostWebviewsWithCapture([URI.file('/workspace/a')]);
			const explicit = [URI.file('/explicit/root')];

			disposables.add(extHostWebviews.createNewWebview('handle-2', { localResourceRoots: explicit }, extension));
			extHostWebviews.ensureDefaultContentOptions('handle-2', { localResourceRoots: explicit }, extension);

			assert.strictEqual(setOptionsCalls.length, 0, 'expected $setOptions not to be called');
		});

		test('falls back to just the extension location when there are no workspace folders', () => {
			const { extHostWebviews, setOptionsCalls } = createExtHostWebviewsWithCapture(undefined);

			disposables.add(extHostWebviews.createNewWebview('handle-3', {}, extension));
			extHostWebviews.ensureDefaultContentOptions('handle-3', {}, extension);

			assert.strictEqual(setOptionsCalls.length, 1);
			const roots = setOptionsCalls[0].options.localResourceRoots!;
			const rootStrings = roots.map(r => URI.from(r).toString());
			assert.deepStrictEqual(rootStrings, [extension.extensionLocation.toString()]);
		});
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
