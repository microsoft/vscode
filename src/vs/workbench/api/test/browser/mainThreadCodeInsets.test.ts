/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { createTestCodeEditor, ITestCodeEditor } from '../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../editor/test/common/testTextModel.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { WebviewThemeDataProvider } from '../../../contrib/webview/browser/themeing.js';
import { IWebviewService, WebviewInitInfo } from '../../../contrib/webview/browser/webview.js';
import { WebviewElement } from '../../../contrib/webview/browser/webviewElement.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { MainThreadEditorInsets } from '../../browser/mainThreadCodeInsets.js';
import { ExtHostEditorInsetsShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadEditorInsets lifetime', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let editor: ITestCodeEditor;
	let insets: MainThreadEditorInsets;
	let webviews: WebviewElement[];
	let disposedWebviews: WebviewElement[];
	let disposedHandles: number[];

	setup(() => {
		const model = disposables.add(createTextModel('Inline preview host'));
		editor = disposables.add(createTestCodeEditor(model));
		webviews = [];
		disposedWebviews = [];
		disposedHandles = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextMenuService, { onDidHideContextMenu: Event.None });
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IWorkbenchEnvironmentService, { webviewExternalEndpoint: 'https://{{uuid}}.invalid' });
		instantiationService.stub(ILogService, disposables.add(new NullLogService()));
		instantiationService.stub(IRemoteAuthorityResolverService, {});
		instantiationService.stub(ITunnelService, {});
		instantiationService.stub(IAccessibilityService, {
			onDidChangeReducedMotion: Event.None,
			onDidChangeScreenReaderOptimized: Event.None,
			isMotionReduced: () => false,
			isScreenReaderOptimized: () => false,
		});
		insets = disposables.add(new MainThreadEditorInsets(
			SingleProxyRPCProtocol(new class extends mock<ExtHostEditorInsetsShape>() {
				override $onDidDispose(handle: number): void {
					disposedHandles.push(handle);
					insets.$disposeEditorInset(handle); // The extension host echoes automatic disposal.
				}
			}),
			new class extends mock<ICodeEditorService>() {
				override listCodeEditors() { return [editor]; }
			},
			new class extends mock<IWebviewService>() {
				override createWebviewElement(info: WebviewInitInfo): WebviewElement {
					const webview = disposables.add(instantiationService.createInstance(WebviewElement, info, upcastPartial<WebviewThemeDataProvider>({
						onThemeDataChanged: Event.None,
						getWebviewThemeData: () => ({ styles: {}, activeTheme: 'vscode-dark', themeLabel: 'Dark', themeId: 'test' }),
					})));
					webviews.push(webview);
					disposables.add(webview.onDidDispose(() => disposedWebviews.push(webview)));
					return webview;
				}
			}
		));
	});

	async function createInset(handle: number) {
		await insets.$createEditorInset(handle, `${editor.getId()},test`, editor.getModel()!.uri, 1, 5, {}, new ExtensionIdentifier('test.insets'), URI.file('/extension'));
		return webviews[webviews.length - 1];
	}

	test('explicit disposal releases the webview while its editor stays open', async () => {
		const webview = await createInset(1);
		let disposed = false;
		disposables.add(webview.onDidDispose(() => disposed = true));
		insets.$disposeEditorInset(1);
		assert.strictEqual(disposed, true);
	});

	test('disposing one inset preserves another inset in the same editor', async () => {
		const first = await createInset(1);
		await createInset(2);
		insets.$disposeEditorInset(1);
		assert.deepStrictEqual(disposedWebviews, [first]);
	});

	test('explicit disposal removes the model-change subscription', async () => {
		await createInset(1);
		insets.$disposeEditorInset(1);
		editor.setModel(disposables.add(createTextModel('Replacement document')));
		assert.deepStrictEqual(disposedHandles, []);
	});

	test('model changes dispose the inset and tolerate the extension host reply', async () => {
		const webview = await createInset(1);
		editor.setModel(disposables.add(createTextModel('Replacement document')));
		assert.deepStrictEqual({ disposedWebviews, disposedHandles }, { disposedWebviews: [webview], disposedHandles: [1] });
	});

	test('closing the editor releases its inset', async () => {
		const webview = await createInset(1);
		editor.dispose();
		assert.deepStrictEqual({ disposedWebviews, disposedHandles }, { disposedWebviews: [webview], disposedHandles: [1] });
	});

	test('service shutdown releases all live insets without closing their editor', async () => {
		const first = await createInset(1);
		const second = await createInset(2);
		insets.dispose();
		assert.deepStrictEqual(disposedWebviews, [first, second]);
	});
});
