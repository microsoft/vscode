/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewAudience, IBrowserViewService, IBrowserViewState } from '../../../../../platform/browserView/common/browserView.js';
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
