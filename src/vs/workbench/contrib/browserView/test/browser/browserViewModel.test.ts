/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import type { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { BrowserViewStorageScope, browserZoomDefaultIndex, type IBrowserViewService, type IBrowserViewState } from '../../../../../platform/browserView/common/browserView.js';
import type { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { BrowserViewModel, type IBrowserViewWorkbenchService } from '../../common/browserView.js';
import type { IBrowserZoomService } from '../../common/browserZoomService.js';

suite('BrowserViewModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fires onWillDispose before late visibility teardown runs', async () => {
		let setVisibleCalls = 0;
		let destroyCalls = 0;
		let destroySawClearedReference = false;
		let currentModel: BrowserViewModel | undefined;
		const storageService = disposables.add(new InMemoryStorageService());
		const logService = new NullLogService();

		const browserViewWorkbenchService: IBrowserViewWorkbenchService = {
			_serviceBrand: undefined,
			isSharingAvailable: true,
			onDidChangeSharingAvailable: Event.None,
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
			getOrCreateLazy: () => { throw new Error('Not implemented in test'); },
			clearGlobalStorage: async () => { },
			clearWorkspaceStorage: async () => { }
		};

		const playwrightService: IPlaywrightService = {
			_serviceBrand: undefined,
			onDidChangeTrackedPages: Event.None,
			startTrackingPage: async () => { },
			stopTrackingPage: async () => { },
			isPageTracked: async () => false,
			getTrackedPages: async () => [],
			openPage: async () => ({ pageId: '', summary: '' }),
			getSummary: async () => '',
			invokeFunctionRaw: async () => undefined as never,
			invokeFunction: async () => ({ summary: '' }),
			waitForDeferredResult: async () => ({ summary: '' }),
			replyToFileChooser: async () => ({ summary: '' }),
			replyToDialog: async () => ({ summary: '' }),
			disposeSession: async () => { }
		};

		const zoomService: IBrowserZoomService = {
			_serviceBrand: undefined,
			onDidChangeZoom: Event.None,
			getEffectiveZoomIndex: () => browserZoomDefaultIndex,
			setHostZoomIndex() { },
			notifyWindowZoomChanged() { }
		};

		const agentNetworkFilterService: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: () => true,
			formatError: () => ''
		};

		const browserViewService: Partial<IBrowserViewService> = {
			onDynamicDidNavigate: () => Event.None,
			onDynamicDidChangeLoadingState: () => Event.None,
			onDynamicDidChangeFocus: () => Event.None,
			onDynamicDidChangeDevToolsState: () => Event.None,
			onDynamicDidKeyCommand: () => Event.None,
			onDynamicDidChangeTitle: () => Event.None,
			onDynamicDidChangeFavicon: () => Event.None,
			onDynamicDidFindInPage: () => Event.None,
			onDynamicDidChangeVisibility: () => Event.None,
			onDynamicDidClose: () => Event.None,
			onDynamicDidSelectElement: () => Event.None,
			onDynamicDidChangeElementSelectionActive: () => Event.None,
			onDynamicDidPickArea: () => Event.None,
			onDynamicDidChangeAreaSelectionActive: () => Event.None,
			onDynamicDidChangeDeviceEmulation: () => Event.None,
			setVisible: async () => { setVisibleCalls++; },
			destroyBrowserView: async () => {
				destroyCalls++;
				destroySawClearedReference = currentModel === undefined;
			}
		};

		const initialState: IBrowserViewState = {
			url: '',
			title: '',
			canGoBack: false,
			canGoForward: false,
			loading: false,
			focused: false,
			visible: true,
			isDevToolsOpen: false,
			lastScreenshot: undefined,
			lastFavicon: undefined,
			lastError: undefined,
			certificateError: undefined,
			storageScope: BrowserViewStorageScope.Ephemeral,
			browserZoomIndex: browserZoomDefaultIndex,
			isElementSelectionActive: false,
			isAreaSelectionActive: false,
			device: undefined
		};

		const model = disposables.add(new BrowserViewModel(
			'test-browser-view',
			{ mainWindowId: 1 },
			initialState,
			browserViewService as IBrowserViewService,
			browserViewWorkbenchService,
			NullTelemetryService,
			playwrightService,
			{} as IDialogService,
			storageService,
			zoomService,
			agentNetworkFilterService,
			logService,
		));

		currentModel = model;
		disposables.add(model.onWillDispose(() => {
			currentModel = undefined;
		}));

		model.dispose();
		if (currentModel) {
			await currentModel.setVisible(false);
		}

		assert.strictEqual(destroyCalls, 1);
		assert.strictEqual(setVisibleCalls, 0);
		assert.strictEqual(destroySawClearedReference, true);
	});
});
