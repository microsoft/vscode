/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';
import { WebviewElement } from '../../browser/webviewElement.js';

suite('WebviewElement - fatal errors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	for (const extensionId of [undefined, 'publisher.extension']) {
		test(`reports errors ${extensionId ? 'with the owning extension' : 'without an extension owner'}`, async () => {
			const initialized = new DeferredPromise<string>();
			class TestWebviewElement extends WebviewElement {
				protected override webviewContentEndpoint(encodedWebviewOrigin: string): string {
					const origin = `https://${encodedWebviewOrigin}.invalid`;
					initialized.complete(origin);
					return origin;
				}
			}

			const instantiationService = store.add(new TestInstantiationService());
			const configurationService = new TestConfigurationService();
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const errorNotification = sinon.stub();
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IContextMenuService, { onDidHideContextMenu: Event.None });
			instantiationService.stub(INotificationService, { error: errorNotification });
			instantiationService.stub(IWorkbenchEnvironmentService, {});
			instantiationService.stub(ILogService, store.add(new NullLogService()));
			instantiationService.stub(IRemoteAuthorityResolverService, {});
			instantiationService.stub(ITunnelService, {});
			instantiationService.stub(IAccessibilityService, {
				onDidChangeReducedMotion: Event.None,
				onDidChangeScreenReaderOptimized: Event.None,
				isMotionReduced: () => false,
				isScreenReaderOptimized: () => false,
			});

			const webview = store.add(instantiationService.createInstance(TestWebviewElement, {
				title: 'Test view',
				options: {},
				contentOptions: {},
				extension: extensionId ? { id: new ExtensionIdentifier(extensionId) } : undefined,
			}, upcastPartial<WebviewThemeDataProvider>({
				onThemeDataChanged: Event.None,
				getWebviewThemeData: () => ({ styles: {}, activeTheme: 'vscode-dark', themeLabel: 'Dark', themeId: 'test' }),
			})));
			const container = document.createElement('div');
			webview.mountTo(container, mainWindow);
			const origin = await initialized.p;

			const channel = new MessageChannel();
			store.add(toDisposable(() => {
				channel.port1.close();
				channel.port2.close();
			}));
			mainWindow.dispatchEvent(new MessageEvent('message', {
				origin,
				data: { target: container.id, channel: 'webview-ready' },
				ports: [channel.port1],
			}));
			const fatalError = Event.toPromise(webview.onFatalError, store.add(new DisposableStore()));
			channel.port2.postMessage({ channel: 'fatal-error', data: { message: 'Could not register service worker' } });

			assert.deepStrictEqual({
				error: await fatalError,
				notifications: errorNotification.args,
			}, {
				error: { message: 'Could not register service worker' },
				notifications: [[extensionId
					? `Error loading webview provided by '${extensionId}': Could not register service worker`
					: 'Error loading webview: Could not register service worker']],
			});
		});
	}
});
