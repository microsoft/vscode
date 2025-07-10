/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { WebviewInput } from '../webviewEditorInput.js';
import { WebviewEditorInputSerializer } from '../webviewEditorInputSerializer.js';
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput, WebviewEditorService } from '../webviewWorkbenchService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { WebviewIconManager } from '../webviewIconManager.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

suite('WebviewSerialization', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let mockWebviewWorkbenchService: IWebviewWorkbenchService;
	let serializer: WebviewEditorInputSerializer;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();
		
		mockWebviewWorkbenchService = new class extends mock<IWebviewWorkbenchService>() {
			private _revivers = new Set<{ canResolve: (webview: WebviewInput) => boolean }>();
			
			shouldPersist(webview: WebviewInput): boolean {
				// Use the fixed logic: only persist webviews that have a reviver
				for (const reviver of this._revivers) {
					if (reviver.canResolve(webview)) {
						return true;
					}
				}
				return false;
			}
			
			registerReviver(reviver: { canResolve: (webview: WebviewInput) => boolean }) {
				this._revivers.add(reviver);
			}
		};
		
		serializer = new WebviewEditorInputSerializer(mockWebviewWorkbenchService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockWebview(): IOverlayWebview {
		return new class extends mock<IOverlayWebview>() {
			options = {};
			contentOptions = {};
			state = null;
			origin = null;
		};
	}

	function createMockIconManager(): WebviewIconManager {
		return new class extends mock<WebviewIconManager>() {
			setIcons() { }
		};
	}

	test('should not serialize webview without reviver', () => {
		const webview = createMockWebview();
		const iconManager = createMockIconManager();
		const webviewInput = new WebviewInput(
			{ viewType: 'test', providedId: 'test', name: 'Test' },
			webview,
			iconManager
		);

		const canSerialize = serializer.canSerialize(webviewInput);
		assert.strictEqual(canSerialize, false, 'WebviewInput without reviver should not be serializable');
	});

	test('should not serialize webview with group but without reviver', () => {
		const webview = createMockWebview();
		const iconManager = createMockIconManager();
		const webviewInput = new WebviewInput(
			{ viewType: 'test', providedId: 'test', name: 'Test' },
			webview,
			iconManager
		);
		webviewInput.updateGroup(1); // Simulate being opened with 'beside' option

		const canSerialize = serializer.canSerialize(webviewInput);
		assert.strictEqual(canSerialize, false, 'WebviewInput with group but without reviver should not be serializable');
	});

	test('should not serialize LazilyResolvedWebviewEditorInput without reviver', () => {
		const webview = createMockWebview();
		const webviewInput = new LazilyResolvedWebviewEditorInput(
			{ viewType: 'test', providedId: 'test', name: 'Test' },
			webview,
			mockWebviewWorkbenchService
		);
		webviewInput.updateGroup(1);

		const canSerialize = serializer.canSerialize(webviewInput);
		assert.strictEqual(canSerialize, false, 'LazilyResolvedWebviewEditorInput without reviver should not be serializable');
	});

	test('should serialize webview with reviver', () => {
		// Register a reviver that can handle this webview
		mockWebviewWorkbenchService.registerReviver({
			canResolve: (webview: WebviewInput) => webview.viewType === 'test'
		});

		const webview = createMockWebview();
		const iconManager = createMockIconManager();
		const webviewInput = new WebviewInput(
			{ viewType: 'test', providedId: 'test', name: 'Test' },
			webview,
			iconManager
		);
		webviewInput.updateGroup(1);

		const canSerialize = serializer.canSerialize(webviewInput);
		assert.strictEqual(canSerialize, true, 'WebviewInput with reviver should be serializable');
	});

	test('should serialize LazilyResolvedWebviewEditorInput with reviver', () => {
		// Register a reviver that can handle this webview
		mockWebviewWorkbenchService.registerReviver({
			canResolve: (webview: WebviewInput) => webview.viewType === 'test'
		});

		const webview = createMockWebview();
		const webviewInput = new LazilyResolvedWebviewEditorInput(
			{ viewType: 'test', providedId: 'test', name: 'Test' },
			webview,
			mockWebviewWorkbenchService
		);
		webviewInput.updateGroup(1);

		const canSerialize = serializer.canSerialize(webviewInput);
		assert.strictEqual(canSerialize, true, 'LazilyResolvedWebviewEditorInput with reviver should be serializable');
	});
});