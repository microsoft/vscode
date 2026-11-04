/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadCustomEditorsShape } from '../../common/extHost.protocol.js';
import { ExtHostCustomEditors } from '../../common/extHostCustomEditors.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostWebviews } from '../../common/extHostWebview.js';
import { ExtHostWebviewPanels } from '../../common/extHostWebviewPanels.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostCustomEditors document disposal', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let editors: ExtHostCustomEditors;

	setup(() => {
		const proxy = new class extends mock<MainThreadCustomEditorsShape>() {
			override $registerCustomEditorProvider(): void { }
			override $registerTextEditorProvider(): void { }
			override $unregisterEditorProvider(): void { }
		};
		editors = new ExtHostCustomEditors(SingleProxyRPCProtocol(proxy), new class extends mock<ExtHostDocuments>() { }, undefined,
			new class extends mock<ExtHostWebviews>() { }, new class extends mock<ExtHostWebviewPanels>() { });
	});

	const viewType = 'custom-document-test';
	const resource = URI.file('/test/document');

	function register(document: vscode.CustomDocument): vscode.Disposable {
		return store.add(editors.registerCustomEditorProvider(nullExtensionDescription, viewType, {
			openCustomDocument: () => document,
			resolveCustomEditor: () => { }
		}, {}));
	}

	function open(): Promise<{ editable: boolean }> {
		return editors.$createCustomDocument(resource, viewType, undefined, undefined, CancellationToken.None);
	}

	test('disposes the document after its provider has been unregistered', async () => {
		let disposed = 0;
		const registration = register({ uri: resource, dispose: () => disposed++ });
		await open();
		registration.dispose();
		await editors.$disposeCustomDocument(resource, viewType);
		assert.strictEqual(disposed, 1);
	});

	test('removes the old document so a replacement provider can reopen its resource', async () => {
		const disposed: string[] = [];
		const registration = register({ uri: resource, dispose: () => disposed.push('old') });
		await open();
		registration.dispose();
		await editors.$disposeCustomDocument(resource, viewType);
		register({ uri: resource, dispose: () => disposed.push('new') });
		await open();
		await editors.$disposeCustomDocument(resource, viewType);
		assert.deepStrictEqual(disposed, ['old', 'new']);
	});

	test('does not require a replacement provider to be a custom document provider', async () => {
		let disposed = 0;
		const registration = register({ uri: resource, dispose: () => disposed++ });
		await open();
		registration.dispose();
		store.add(editors.registerCustomEditorProvider(nullExtensionDescription, viewType, { resolveCustomTextEditor: () => { } }, {}));
		await editors.$disposeCustomDocument(resource, viewType);
		assert.strictEqual(disposed, 1);
	});

	test('still disposes documents while their provider is registered', async () => {
		let disposed = 0;
		register({ uri: resource, dispose: () => disposed++ });
		await open();
		await editors.$disposeCustomDocument(resource, viewType);
		assert.strictEqual(disposed, 1);
	});

	test('removes the entry before invoking a throwing document dispose callback', async () => {
		const error = new Error('expected document disposal failure');
		const registration = register({ uri: resource, dispose: () => { throw error; } });
		await open();
		registration.dispose();
		await assert.rejects(editors.$disposeCustomDocument(resource, viewType), error);
		register({ uri: resource, dispose: () => { } });
		await open();
		await editors.$disposeCustomDocument(resource, viewType);
	});

	test('uses the stored resource key when the document URI has changed', async () => {
		let currentUri = resource;
		let disposed = 0;
		const registration = register({ get uri() { return currentUri; }, dispose: () => disposed++ });
		await open();
		currentUri = URI.file('/test/renamed');
		registration.dispose();
		await editors.$disposeCustomDocument(resource, viewType);
		register({ uri: resource, dispose: () => disposed++ });
		await open();
		await editors.$disposeCustomDocument(resource, viewType);
		assert.strictEqual(disposed, 2);
	});
});
