/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadWebviews } from 'vs/workbench/api/electron-browser/mainThreadWebview';
import { ExtHostWebviews } from 'vs/workbench/api/node/extHostWebview';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import * as vscode from 'vscode';
import { SingleProxyRPCProtocol } from './testRPCProtocol';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';

suite('ExtHostWebview', function () {

	test('Cannot register multiple serializer for the same view type', async () => {
		const viewType = 'view.type';

		const shape = createNoopMainThreadWebviews();
		const extHostWebviews = new ExtHostWebviews(SingleProxyRPCProtocol(shape));

		let lastInvokedDeserializer: vscode.WebviewSerializer | undefined = undefined;

		class NoopSerializer implements vscode.WebviewSerializer {
			async serializeWebview(webview: vscode.Webview): Promise<any> { /* noop */ }

			async deserializeWebview(webview: vscode.Webview, state: any): Promise<void> {
				lastInvokedDeserializer = this;
			}
		}

		const serializerA = new NoopSerializer();
		const serializerB = new NoopSerializer();

		const serializerARegistration = extHostWebviews.registerWebviewSerializer(viewType, serializerA);

		await extHostWebviews.$deserializeWebview('x', viewType, {}, EditorPosition.ONE, {});
		assert.strictEqual(lastInvokedDeserializer, serializerA);

		assert.throws(
			() => extHostWebviews.registerWebviewSerializer(viewType, serializerB),
			'Should throw when registering two serializers for the same view');

		serializerARegistration.dispose();

		extHostWebviews.registerWebviewSerializer(viewType, serializerB);

		await extHostWebviews.$deserializeWebview('x', viewType, {}, EditorPosition.ONE, {});
		assert.strictEqual(lastInvokedDeserializer, serializerB);
	});
});


function createNoopMainThreadWebviews() {
	return new class extends mock<MainThreadWebviews>() {
		$registerSerializer() { /* noop */ }
		$unregisterSerializer() { /* noop */ }
	};
}

