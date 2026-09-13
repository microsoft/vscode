/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, IBrowserViewService } from '../../../../../platform/browserView/common/browserView.js';
import { createTestBrowserView } from '../../../../../platform/browserView/test/electron-main/browserViewTestUtils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { BrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';

suite('BrowserView native favicon synchronization', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(native: ReturnType<typeof createTestBrowserView>, models: DisposableStore): BrowserViewModel {
		const service = upcastPartial<IBrowserViewService>({
			getNavigationState: async () => native.view.getNavigationState(),
			destroyBrowserView: async () => native.view.dispose(),
			setBrowserZoomIndex: async (_id, index) => native.view.setBrowserZoomIndex(index),
			onDynamicDidNavigate: () => native.view.onDidNavigate,
			onDynamicDidChangeTitle: () => native.view.onDidChangeTitle,
			onDynamicDidChangeFavicon: () => native.view.onDidChangeFavicon,
			onDynamicDidChangeLoadingState: () => native.view.onDidChangeLoadingState,
			onDynamicDidChangePermissions: () => native.view.onDidChangePermissions,
			onDynamicDidChangeDevToolsState: () => native.view.onDidChangeDevToolsState,
			onDynamicDidChangeOwner: () => native.view.onDidChangeOwner,
			onDynamicDidChangeFocus: () => native.view.onDidChangeFocus,
			onDynamicDidChangeVisibility: () => native.view.onDidChangeVisibility,
			onDynamicDidChangeDeviceEmulation: () => native.view.emulator.onDidChange,
			onDynamicDidChangeElementSelectionState: () => native.view.inspector.onDidChangeElementSelectionState,
			onDynamicDidChangeAreaSelectionActive: () => native.view.inspector.onDidChangeAreaSelectionActive,
			onDynamicDidChangeAudiences: () => native.view.onDidChangeAudiences,
			onDynamicDidChangeRemoteStatus: () => native.view.onDidChangeRemoteStatus,
		});
		return models.add(new BrowserViewModel(
			native.view.id, native.view.host, native.view.owner, undefined, native.view.getState(), service,
			upcastPartial<IBrowserViewWorkbenchService>({ isSharingAvailable: false, onDidChangeSharingAvailable: Event.None }),
			NullTelemetryService, upcastPartial<IDialogService>({}), upcastPartial<IStorageService>({}),
			upcastPartial<IBrowserZoomService>({ getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None }),
			upcastPartial<IAgentNetworkFilterService>({ onDidChange: Event.None }), new NullLogService(),
		));
	}

	test('clears the synchronized favicon when a redirect chain returns to the original host', async () => {
		const models = store.add(new DisposableStore());
		const native = createTestBrowserView(store);
		const oldIcon = 'data:image/png;base64,b2xk';
		await native.setIcon(oldIcon);
		const model = createModel(native, models);
		await native.settle();
		const before = model.favicon;

		native.navigate('https://first.example/redirect');
		native.redirect('https://second.example/intermediate');
		native.redirect('https://first.example/page');
		native.commit('https://first.example/page');
		const atCommit = model.favicon;
		const iconUrl = 'https://first.example/missing.png';
		native.events.emit('page-favicon-updated', {}, [iconUrl]);
		await native.completeFavicon(iconUrl, '', 404);

		assert.deepStrictEqual({
			before, atCommit, afterMissingIcon: model.favicon,
			nativeIcon: native.view.getNavigationState().lastFavicon,
			oldHistoryIcon: native.history[0].favicon, newHistoryIcon: native.history[1].favicon,
		}, {
			before: oldIcon, atCommit: undefined, afterMissingIcon: undefined, nativeIcon: undefined,
			oldHistoryIcon: oldIcon, newHistoryIcon: undefined,
		});
	});

	for (const attachDuringNavigation of [false, true]) {
		test(`restores the favicon after aborting navigation with a model attached ${attachDuringNavigation ? 'during' : 'before'} the load`, async () => {
			const models = store.add(new DisposableStore());
			const native = createTestBrowserView(store);
			const oldIcon = 'data:image/png;base64,b2xk';
			await native.setIcon(oldIcon);
			if (attachDuringNavigation) {
				native.navigate('https://second.example/destination');
			}
			const model = createModel(native, models);
			await native.settle();
			if (!attachDuringNavigation) {
				native.navigate('https://second.example/destination');
			}
			const beforeAbort = model.favicon;
			native.events.emit('did-stop-loading');
			native.events.emit('did-navigate-in-page', {}, 'https://first.example/page#after-cancel', true);

			assert.deepStrictEqual({
				beforeAbort, favicon: model.favicon, nativeIcon: native.view.getNavigationState().lastFavicon,
				url: model.url, oldHistoryIcon: native.history[0].favicon,
			}, {
				beforeAbort: attachDuringNavigation ? undefined : oldIcon,
				favicon: oldIcon, nativeIcon: oldIcon,
				url: 'https://first.example/page#after-cancel', oldHistoryIcon: oldIcon,
			});
		});
	}

	for (const completeBeforeFailure of [true, false]) {
		test(`clears the model favicon after a failed load with icon completion ${completeBeforeFailure ? 'before' : 'after'} the failure`, async () => {
			const models = store.add(new DisposableStore());
			const native = createTestBrowserView(store);
			const oldIcon = 'data:image/png;base64,b2xk';
			await native.setIcon(oldIcon);
			const model = createModel(native, models);
			await native.settle();
			const target = 'https://first.example/failure';
			const iconUrl = 'https://first.example/provisional.png';
			native.navigate(target);
			native.events.emit('page-favicon-updated', {}, [iconUrl]);
			if (completeBeforeFailure) {
				await native.completeFavicon(iconUrl, 'new');
			}
			native.events.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', target, true);
			native.events.emit('did-stop-loading');
			if (!completeBeforeFailure) {
				await native.completeFavicon(iconUrl, 'new');
			}

			assert.deepStrictEqual({
				favicon: model.favicon, nativeIcon: native.view.getNavigationState().lastFavicon,
				url: model.url, error: model.error?.errorCode, historyIcon: native.history[0].favicon,
			}, {
				favicon: undefined, nativeIcon: undefined,
				url: target, error: -105, historyIcon: oldIcon,
			});
		});
	}
});
