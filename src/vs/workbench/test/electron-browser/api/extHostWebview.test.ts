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

		let lastInvokedDeserializer: vscode.WebviewEditorSerializer | undefined = undefined;

		class NoopSerializer implements vscode.WebviewEditorSerializer {
			async serializeWebviewEditor(webview: vscode.WebviewEditor): Promise<any> { /* noop */ }

			async deserializeWebviewEditor(webview: vscode.WebviewEditor, state: any): Promise<void> {
				lastInvokedDeserializer = this;
			}
		}

		const serializerA = new NoopSerializer();
		const serializerB = new NoopSerializer();

		const serializerARegistration = extHostWebviews.registerWebviewEditorSerializer(viewType, serializerA);

		await extHostWebviews.$deserializeWebview('x', viewType, 'title', {}, EditorPosition.ONE, {});
		assert.strictEqual(lastInvokedDeserializer, serializerA);

		assert.throws(
			() => extHostWebviews.registerWebviewEditorSerializer(viewType, serializerB),
			'Should throw when registering two serializers for the same view');

		serializerARegistration.dispose();

		extHostWebviews.registerWebviewEditorSerializer(viewType, serializerB);

		await extHostWebviews.$deserializeWebview('x', viewType, 'title', {}, EditorPosition.ONE, {});
		assert.strictEqual(lastInvokedDeserializer, serializerB);
	});
});


function createNoopMainThreadWebviews() {
	return new class extends mock<MainThreadWebviews>() {
		$registerSerializer() { /* noop */ }
		$unregisterSerializer() { /* noop */ }
	};
}

