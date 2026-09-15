/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IBrowserViewLoadingEvent } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { WebContentsViewHost } from '../../electron-browser/webContentsViewHost.js';

suite('WebContentsViewHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(hide: () => Promise<void> = async () => { }) {
		const errors: Parameters<ILogService['error']>[] = [];
		const logService = store.add(new class extends NullLogService {
			override error(...args: Parameters<ILogService['error']>): void {
				errors.push(args);
			}
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IWorkspaceTrustRequestService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(INotificationService, {});
		const host = store.add(new WebContentsViewHost(mainWindow, () => { }, logService, upcastPartial<IKeybindingService>({}), instantiationService));
		const onWillDispose = store.add(new Emitter<void>());
		const visibility: boolean[] = [];
		let disposals = 0;
		const model = upcastPartial<IBrowserViewModel>({
			url: '',
			visible: false,
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: Event.None,
			onWillDispose: onWillDispose.event,
			setVisible: async visible => {
				visibility.push(visible);
				await hide();
			},
			dispose: () => { disposals++; },
		});
		host.setModel(model);
		return { host, model, onWillDispose, errors, visibility, disposals: () => disposals };
	}

	test('reports a rejected detach hide once without retrying or disposing the reusable model', async () => {
		const failure = new Error('Controlled IPC failure');
		const fixture = createFixture(async () => { throw failure; });
		fixture.host.setModel(undefined);
		await timeout(0);
		fixture.host.dispose();
		assert.deepStrictEqual({
			visibility: fixture.visibility,
			errors: fixture.errors,
			disposals: fixture.disposals(),
		}, {
			visibility: [false],
			errors: [['WebContentsViewHost: Failed to hide detached browser view', failure]],
			disposals: 0,
		});
	});

	test('model disposal detaches without sending hide IPC to native content being destroyed', () => {
		const fixture = createFixture();
		fixture.onWillDispose.fire();
		fixture.host.dispose();
		assert.deepStrictEqual({
			visibility: fixture.visibility,
			errors: fixture.errors,
			listening: fixture.onWillDispose.hasListeners(),
		}, { visibility: [], errors: [], listening: false });
	});

	test('ordinary detachment and host disposal leave the browser model reusable', async () => {
		const fixture = createFixture();
		fixture.host.setModel(undefined);
		fixture.host.setModel(fixture.model);
		fixture.host.dispose();
		await timeout(0);
		assert.deepStrictEqual({
			visibility: fixture.visibility,
			errors: fixture.errors,
			disposals: fixture.disposals(),
		}, { visibility: [false, false], errors: [], disposals: 0 });
	});

	test('a late hide failure is still reported after the host reattaches the model', async () => {
		const hide = new DeferredPromise<void>();
		const fixture = createFixture(() => hide.p);
		fixture.host.setModel(undefined);
		fixture.host.setModel(fixture.model);
		const failure = new Error('Controlled late IPC failure');
		await hide.error(failure);
		await timeout(0);
		fixture.onWillDispose.fire();
		assert.deepStrictEqual({
			visibility: fixture.visibility,
			errors: fixture.errors,
			disposals: fixture.disposals(),
		}, {
			visibility: [false],
			errors: [['WebContentsViewHost: Failed to hide detached browser view', failure]],
			disposals: 0,
		});
	});

	test('revoked file content replaces cached imagery with focusable trust recovery, including a late screenshot', async () => {
		const fixture = createFixture();
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		fixture.host.onContainerCreated(container);
		fixture.host.setVisible(true);
		const loading = store.add(new Emitter<IBrowserViewLoadingEvent>());
		const screenshot = new DeferredPromise<VSBuffer>();
		let loadingState: IBrowserViewLoadingEvent = { loading: false };
		let visible = true;
		const model = upcastPartial<IBrowserViewModel>({
			url: 'file:///canvas-file-trust/revoked/index.html',
			get error() { return loadingState.error; },
			get visible() { return visible; },
			loading: false,
			screenshot: VSBuffer.fromString('previous-page'),
			onDidChangeVisibility: Event.None,
			onDidKeyCommand: Event.None,
			onDidNavigate: Event.None,
			onDidChangeLoadingState: loading.event,
			onWillDispose: Event.None,
			captureScreenshot: () => screenshot.p,
			setVisible: async value => { visible = value; },
		});
		fixture.host.setModel(model);
		loadingState = { loading: false, error: { url: model.url, errorCode: -2, errorDescription: 'ERR_FAILED', fileAccessDenied: true } };
		loading.fire(loadingState);
		await screenshot.complete(VSBuffer.fromString('late-revoked-page'));
		await timeout(0);
		assert.deepStrictEqual({
			screenshot: fixture.host.screenshotElement.style.backgroundImage,
			screenshotDisplay: fixture.host.screenshotElement.style.display,
			focused: fixture.host.tryFocus(),
			focusLabel: mainWindow.document.activeElement?.textContent,
			errors: fixture.errors,
		}, { screenshot: '', screenshotDisplay: 'none', focused: true, focusLabel: 'Trust Folder...', errors: [] });
	});
});
