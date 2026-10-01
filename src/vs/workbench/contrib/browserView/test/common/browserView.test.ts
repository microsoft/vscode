/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewAudience, IBrowserViewService, IBrowserViewState } from '../../../../../platform/browserView/common/browserView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewModel, BrowserViewSharingState, createBrowserViewEventEmitters, IBrowserViewWorkbenchService } from '../../common/browserView.js';

suite('BrowserViewModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only blocks disallowed pages that cannot be shared directly', () => {
		const browserViewService = upcastPartial<IBrowserViewService>({
			destroyBrowserView: async () => { },
		});
		const browserViewWorkbenchService = upcastPartial<IBrowserViewWorkbenchService>({
			isSharingAvailable: true,
			onDidChangeSharingAvailable: Event.None,
		});
		const agentNetworkFilterService = upcastPartial<IAgentNetworkFilterService>({
			isEnabled: () => true,
			isUriAllowed: () => false,
			onDidChange: Event.None,
		});
		const zoomService = upcastPartial<IBrowserZoomService>({
			getEffectiveZoomIndex: () => browserZoomDefaultIndex,
			onDidChangeZoom: Event.None,
		});

		const createModel = (storageScope: BrowserViewStorageScope, audiences: IBrowserViewAudience[]) => store.add(new BrowserViewModel(
			`browser-${storageScope}-${audiences.length}`,
			{ windowId: 1 },
			{ type: 'user' },
			undefined,
			createInitialState(storageScope, audiences),
			browserViewService,
			createBrowserViewEventEmitters(store.add(new DisposableStore())),
			browserViewWorkbenchService,
			upcastPartial<ITelemetryService>({}),
			upcastPartial<IDialogService>({}),
			upcastPartial<IStorageService>({}),
			zoomService,
			agentNetworkFilterService,
			upcastPartial<ILogService>({}),
		));

		assert.deepStrictEqual({
			sharedWorkspace: createModel(BrowserViewStorageScope.Workspace, [{ type: 'agent' }]).sharingState,
			unsharedWorkspace: createModel(BrowserViewStorageScope.Workspace, []).sharingState,
			unsharedAgent: createModel(BrowserViewStorageScope.Agent, []).sharingState,
		}, {
			sharedWorkspace: BrowserViewSharingState.Shared,
			unsharedWorkspace: BrowserViewSharingState.BlockedByNetworkPolicy,
			unsharedAgent: BrowserViewSharingState.Available,
		});
	});

	test('mirrors workbench-owned events before notifying local consumers without subscribing to IPC', () => {
		const eventStore = store.add(new DisposableStore());
		const emitters = createBrowserViewEventEmitters(eventStore);
		const model = store.add(new BrowserViewModel(
			'page', { windowId: 1 }, { type: 'user' }, undefined,
			createInitialState(BrowserViewStorageScope.Global, []),
			upcastPartial<IBrowserViewService>({
				destroyBrowserView: async () => { },
				setBrowserZoomIndex: async () => { },
			}),
			emitters,
			upcastPartial<IBrowserViewWorkbenchService>({ isSharingAvailable: true, onDidChangeSharingAvailable: Event.None }),
			upcastPartial<ITelemetryService>({}),
			upcastPartial<IDialogService>({}),
			upcastPartial<IStorageService>({}),
			upcastPartial<IBrowserZoomService>({ getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None }),
			upcastPartial<IAgentNetworkFilterService>({ isEnabled: () => false, onDidChange: Event.None }),
			upcastPartial<ILogService>({}),
		));
		eventStore.add(Event.once(model.onWillDispose)(() => eventStore.dispose()));
		const received: string[] = [];
		const removed = store.add(model.onDidChangeTitle(() => received.push('removed')));
		removed.dispose();
		store.add(model.onDidNavigate(() => received.push(model.url)));
		store.add(model.onDidChangeTitle(() => received.push(model.title)));
		store.add(model.onDidChangeLoadingState(() => received.push(`loading:${model.loading}`)));
		store.add(model.onDidClose(() => received.push('closed')));
		store.add(model.onDidChangeFocus(() => received.push('unexpected focus')));
		store.add(model.onDidPickArea(() => received.push('unexpected area')));
		emitters.onDidNavigate.fire({
			url: 'https://example.com/', title: 'initial', canGoBack: true, canGoForward: false, certificateError: undefined
		});
		emitters.onDidChangeTitle.fire({ title: 'Example' });
		emitters.onDidChangeLoadingState.fire({ loading: false });
		emitters.onDidClose.fire();
		model.dispose();
		emitters.onDidChangeTitle.fire({ title: 'after model disposal' });
		assert.deepStrictEqual({ received, canGoBack: model.canGoBack, titleAfterDisposal: model.title }, {
			received: ['https://example.com/', 'Example', 'loading:false', 'closed'],
			canGoBack: true,
			titleAfterDisposal: 'Example'
		});
	});
});

function createInitialState(storageScope: BrowserViewStorageScope, audiences: IBrowserViewAudience[]): IBrowserViewState {
	return {
		url: 'https://blocked.example.com/',
		title: '',
		canGoBack: false,
		canGoForward: false,
		loading: false,
		focused: false,
		visible: false,
		isDevToolsOpen: false,
		lastScreenshot: undefined,
		lastFavicon: undefined,
		lastError: undefined,
		certificateError: undefined,
		storageScope,
		storageKeys: {},
		permissions: { origins: {} },
		browserZoomIndex: browserZoomDefaultIndex,
		elementSelectionState: { active: false, options: {} },
		isRemoteSession: false,
		isAreaSelectionActive: false,
		device: undefined,
		audiences,
	};
}
