/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewStorageScope, browserZoomDefaultIndex, type IBrowserViewService, type IBrowserViewState } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserViewModel } from '../../common/browserView.js';

suite('BrowserViewModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not send visibility updates after dispose is called', async () => {
		let setVisibleCalls = 0;
		let destroyCalls = 0;

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
			destroyBrowserView: async () => { destroyCalls++; }
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
			{ isSharingAvailable: true, onDidChangeSharingAvailable: Event.None } as any,
			{ publicLog2() { } } as any,
			{ isPageTracked: async () => false, onDidChangeTrackedPages: Event.None } as any,
			{} as any,
			{} as any,
			{ getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None, setHostZoomIndex() { } } as any,
			{ isUriAllowed: () => true, formatError: () => '' } as any,
			{ warn() { } } as any,
		));

		model.dispose();
		await model.setVisible(false);

		assert.strictEqual(destroyCalls, 1);
		assert.strictEqual(setVisibleCalls, 0);
	});
});
