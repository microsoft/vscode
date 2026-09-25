/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewAudience, IBrowserViewNavigationState, IBrowserViewService, IBrowserViewState, IBrowserViewTitleChangeEvent } from '../../../../../platform/browserView/common/browserView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewModel, BrowserViewSharingState, IBrowserViewWorkbenchService } from '../../common/browserView.js';

suite('BrowserViewModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only blocks disallowed pages that cannot be shared directly', () => {
		const browserViewService = upcastPartial<IBrowserViewService>({
			destroyBrowserView: async () => { },
			getNavigationState: async () => createInitialState(BrowserViewStorageScope.Ephemeral, []),
			onDynamicDidChangePermissions: () => Event.None,
			onDynamicDidNavigate: () => Event.None,
			onDynamicDidChangeLoadingState: () => Event.None,
			onDynamicDidChangeDevToolsState: () => Event.None,
			onDynamicDidChangeTitle: () => Event.None,
			onDynamicDidChangeFavicon: () => Event.None,
			onDynamicDidChangeOwner: () => Event.None,
			onDynamicDidChangeFocus: () => Event.None,
			onDynamicDidChangeVisibility: () => Event.None,
			onDynamicDidChangeDeviceEmulation: () => Event.None,
			onDynamicDidChangeElementSelectionState: () => Event.None,
			onDynamicDidChangeAreaSelectionActive: () => Event.None,
			onDynamicDidChangeAudiences: () => Event.None,
			onDynamicDidChangeRemoteStatus: () => Event.None,
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

	test('reconciles navigation state that changed before it subscribed', async () => {
		const liveTitle = store.add(new Emitter<IBrowserViewTitleChangeEvent>());
		const snapshots = new Map<string, DeferredPromise<IBrowserViewNavigationState>>();
		const browserViewService = upcastPartial<IBrowserViewService>({
			destroyBrowserView: async () => { },
			getNavigationState: id => {
				const snapshot = new DeferredPromise<IBrowserViewNavigationState>();
				snapshots.set(id, snapshot);
				return snapshot.p;
			},
			onDynamicDidChangePermissions: () => Event.None,
			onDynamicDidNavigate: () => Event.None,
			onDynamicDidChangeLoadingState: () => Event.None,
			onDynamicDidChangeDevToolsState: () => Event.None,
			onDynamicDidChangeTitle: id => id === 'live' ? liveTitle.event : Event.None,
			onDynamicDidChangeFavicon: () => Event.None,
			onDynamicDidChangeOwner: () => Event.None,
			onDynamicDidChangeFocus: () => Event.None,
			onDynamicDidChangeVisibility: () => Event.None,
			onDynamicDidChangeDeviceEmulation: () => Event.None,
			onDynamicDidChangeElementSelectionState: () => Event.None,
			onDynamicDidChangeAreaSelectionActive: () => Event.None,
			onDynamicDidChangeAudiences: () => Event.None,
			onDynamicDidChangeRemoteStatus: () => Event.None,
		});
		const createModel = (id: string, initialState: Partial<IBrowserViewState>) => {
			const model = store.add(new BrowserViewModel(
				id,
				{ windowId: 1 },
				{ type: 'user' },
				undefined,
				{ ...createInitialState(BrowserViewStorageScope.Global, []), ...initialState },
				browserViewService,
				upcastPartial<IBrowserViewWorkbenchService>({ isSharingAvailable: false, onDidChangeSharingAvailable: Event.None }),
				upcastPartial<ITelemetryService>({}),
				upcastPartial<IDialogService>({}),
				upcastPartial<IStorageService>({}),
				upcastPartial<IBrowserZoomService>({ getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None }),
				upcastPartial<IAgentNetworkFilterService>({ isEnabled: () => false, onDidChange: Event.None }),
				upcastPartial<ILogService>({}),
			));
			const events: string[] = [];
			store.add(model.onDidNavigate(e => events.push(`navigate ${e.url}`)));
			store.add(model.onDidChangeTitle(e => events.push(`title ${e.title}`)));
			store.add(model.onDidChangeFavicon(e => events.push(`favicon ${e.favicon}`)));
			store.add(model.onDidChangeLoadingState(e => events.push(`loading ${e.loading}`)));
			return { model, events };
		};
		const snapshot = (overrides: Partial<IBrowserViewNavigationState>): IBrowserViewNavigationState => ({
			url: '',
			title: '',
			canGoBack: false,
			canGoForward: false,
			loading: false,
			lastFavicon: undefined,
			lastError: undefined,
			certificateError: undefined,
			...overrides,
		});

		// A popup whose page loaded before its model subscribed.
		const popup = createModel('popup', { url: 'http://127.0.0.1/popup', title: '', loading: true });
		await snapshots.get('popup')!.complete(snapshot({ url: 'http://127.0.0.1/popup', title: 'Popup', lastFavicon: 'data:image/png;base64,AA==' }));

		// A restored page whose navigation has not committed yet keeps its seeded title.
		const restored = createModel('restored', { url: 'http://127.0.0.1/restored', title: 'Restored' });
		await snapshots.get('restored')!.complete(snapshot({ loading: true }));

		// A live event that arrives before the snapshot is not repeated.
		const live = createModel('live', { url: 'http://127.0.0.1/live', title: '' });
		liveTitle.fire({ title: 'Live' });
		await snapshots.get('live')!.complete(snapshot({ url: 'http://127.0.0.1/live', title: 'Live' }));

		assert.deepStrictEqual({
			popup: { title: popup.model.title, favicon: popup.model.favicon, loading: popup.model.loading, events: popup.events },
			restored: { title: restored.model.title, loading: restored.model.loading, events: restored.events },
			live: { title: live.model.title, events: live.events },
		}, {
			popup: { title: 'Popup', favicon: 'data:image/png;base64,AA==', loading: false, events: ['title Popup', 'favicon data:image/png;base64,AA==', 'loading false'] },
			restored: { title: 'Restored', loading: true, events: ['loading true'] },
			live: { title: 'Live', events: ['title Live'] },
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
