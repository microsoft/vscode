/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MainThreadWebviews } from 'vs/workbench/api/browser/mainThreadWebview';
import { ExtHostWebviews } from 'vs/workbench/api/common/extHostWebview';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import * as vscode from 'vscode';
import { SingleProxyRPCProtocol } from './testRPCProtocol';
import { EditorViewColumn } from 'vs/workbench/api/common/shared/editor';
import { URI } from 'vs/base/common/uri';

suite('ExtHostWebview', () => {

	test('Cannot register multiple serializers for the same view type', async () => {
		const viewType = 'view.type';

		const shape = createNoopMainThreadWebviews();
		const extHostWebviews = new ExtHostWebviews(SingleProxyRPCProtocol(shape), { webviewCspSource: '', webviewResourceRoot: '' });

		let lastInvokedDeserializer: vscode.WebviewPanelSerializer | undefined = undefined;

		class NoopSerializer implements vscode.WebviewPanelSerializer {
			async deserializeWebviewPanel(_webview: vscode.WebviewPanel, _state: any): Promise<void> {
				lastInvokedDeserializer = this;
			}
		}

		const serializerA = new NoopSerializer();
		const serializerB = new NoopSerializer();

		const serializerARegistration = extHostWebviews.registerWebviewPanelSerializer(viewType, serializerA);

		await extHostWebviews.$deserializeWebviewPanel('x', viewType, 'title', {}, 0 as EditorViewColumn, {});
		assert.strictEqual(lastInvokedDeserializer, serializerA);

		assert.throws(
			() => extHostWebviews.registerWebviewPanelSerializer(viewType, serializerB),
			'Should throw when registering two serializers for the same view');

		serializerARegistration.dispose();

		extHostWebviews.registerWebviewPanelSerializer(viewType, serializerB);

		await extHostWebviews.$deserializeWebviewPanel('x', viewType, 'title', {}, 0 as EditorViewColumn, {});
		assert.strictEqual(lastInvokedDeserializer, serializerB);
	});

	test('toWebviewResource for desktop vscode-resource scheme', () => {
		const shape = createNoopMainThreadWebviews();
		const extHostWebviews = new ExtHostWebviews(SingleProxyRPCProtocol(shape), {
			webviewCspSource: '',
			webviewResourceRoot: 'vscode-resource:{{resource}}'
		});
		const webview = extHostWebviews.createWebviewPanel({} as any, 'type', 'title', 1, {});

		assert.strictEqual(
			webview.webview.toWebviewResource(URI.parse('file:///Users/codey/file.html')).toString(),
			'vscode-resource:/Users/codey/file.html',
			'Unix basic'
		);

		assert.strictEqual(
			webview.webview.toWebviewResource(URI.parse('file:///Users/codey/file.html#frag')).toString(),
			'vscode-resource:/Users/codey/file.html#frag',
			'Unix should preserve fragment'
		);

		assert.strictEqual(
			webview.webview.toWebviewResource(URI.parse('file:///Users/codey/f%20ile.html')).toString(),
			'vscode-resource:/Users/codey/f%20ile.html',
			'Unix with encoding'
		);

		assert.strictEqual(
			webview.webview.toWebviewResource(URI.parse('file://localhost/Users/codey/file.html')).toString(),
			'vscode-resource://localhost/Users/codey/file.html',
			'Unix should preserve authority'
		);

		assert.strictEqual(
			webview.webview.toWebviewResource(URI.parse('file:///c:/codey/file.txt')).toString(),
			'vscode-resource:/c%3A/codey/file.txt',
			'Windows C drive'
		);
	});

	test('toWebviewResource for web endpoint', () => {
		const shape = createNoopMainThreadWebviews();

		const extHostWebviews = new ExtHostWebviews(SingleProxyRPCProtocol(shape), {
			webviewCspSource: '',
			webviewResourceRoot: `https://{{uuid}}.webview.contoso.com/commit{{resource}}`
		});
		const webview = extHostWebviews.createWebviewPanel({} as any, 'type', 'title', 1, {});

		function stripEndpointUuid(input: string) {
			return input.replace(/^https:\/\/[^\.]+?\./, '');
		}

		assert.strictEqual(
			stripEndpointUuid(webview.webview.toWebviewResource(URI.parse('file:///Users/codey/file.html')).toString()),
			'webview.contoso.com/commit///Users/codey/file.html',
			'Unix basic'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.toWebviewResource(URI.parse('file:///Users/codey/file.html#frag')).toString()),
			'webview.contoso.com/commit///Users/codey/file.html#frag',
			'Unix should preserve fragment'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.toWebviewResource(URI.parse('file:///Users/codey/f%20ile.html')).toString()),
			'webview.contoso.com/commit///Users/codey/f%20ile.html',
			'Unix with encoding'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.toWebviewResource(URI.parse('file://localhost/Users/codey/file.html')).toString()),
			'webview.contoso.com/commit//localhost/Users/codey/file.html',
			'Unix should preserve authority'
		);

		assert.strictEqual(
			stripEndpointUuid(webview.webview.toWebviewResource(URI.parse('file:///c:/codey/file.txt')).toString()),
			'webview.contoso.com/commit///c%3A/codey/file.txt',
			'Windows C drive'
		);
	});
});


function createNoopMainThreadWebviews() {
	return new class extends mock<MainThreadWebviews>() {
		$createWebviewPanel() { /* noop */ }
		$registerSerializer() { /* noop */ }
		$unregisterSerializer() { /* noop */ }
	};
}

