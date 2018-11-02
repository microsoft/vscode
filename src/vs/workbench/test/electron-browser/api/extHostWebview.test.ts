/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MainThreadWebviews } from 'vs/workbench/api/electron-browser/mainThreadWebview';
import { ExtHostWebviews } from 'vs/workbench/api/node/extHostWebview';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import * as vscode from 'vscode';
import { SingleProxyRPCProtocol } from './testRPCProtocol';
import { EditorViewColumn } from 'vs/workbench/api/shared/editor';

suite('ExtHostWebview', function () {

	test('Cannot register multiple serializers for the same view type', async () => {
		const viewType = 'view.type';

		const shape = createNoopMainThreadWebviews();
		const extHostWebviews = new ExtHostWebviews(SingleProxyRPCProtocol(shape));

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
});


function createNoopMainThreadWebviews() {
	return new class extends mock<MainThreadWebviews>() {
		$registerSerializer() { /* noop */ }
		$unregisterSerializer() { /* noop */ }
	};
}

