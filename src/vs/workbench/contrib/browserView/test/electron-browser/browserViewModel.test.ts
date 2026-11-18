/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewStorageScope, browserZoomDefaultIndex, IBrowserViewService, IBrowserViewState } from '../../../../../platform/browserView/common/browserView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { BrowserViewModel, createBrowserViewEventEmitters, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';

suite('BrowserViewModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const initialState: IBrowserViewState = {
		url: '',
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
		session: { scope: BrowserViewStorageScope.Global },
		storageKeys: {},
		permissions: { origins: {} },
		browserZoomIndex: browserZoomDefaultIndex,
		elementSelectionState: { active: false, options: {} },
		isAreaSelectionActive: false,
		device: undefined,
		audiences: [],
	};

	test('blocks sharing reported parser-differential authorities with the agent', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const browserViewService = upcastPartial<IBrowserViewService>({
			destroyBrowserView: async () => { },
		});
		const browserViewWorkbenchService = upcastPartial<IBrowserViewWorkbenchService>({
			isSharingAvailable: true,
			onDidChangeSharingAvailable: Event.None,
		});
		let infoCalls = 0;
		const dialogService = upcastPartial<IDialogService>({
			info: async () => {
				infoCalls++;
			},
		});
		const zoomService = upcastPartial<IBrowserZoomService>({
			onDidChangeZoom: Event.None,
			getEffectiveZoomIndex: () => browserZoomDefaultIndex,
		});
		const urls = [
			'http://a@b@127.0.0.1:3000/private',
			'http://a%40b@127.0.0.1:3000/private',
			'http://[::1]:3000/private',
			'http://[::ffff:127.0.0.1]:3000/private',
			'https://evil.com%2fx/',
			'https://evil.com%5c/',
		];
		const results = await Promise.all(urls.map((url, index) => {
			const model = disposables.add(new BrowserViewModel(
				`page-${index}`,
				{ windowId: 1 },
				{ type: 'user' },
				undefined,
				{ ...initialState, url },
				browserViewService,
				createBrowserViewEventEmitters(disposables.add(new DisposableStore())),
				browserViewWorkbenchService,
				NullTelemetryService,
				dialogService,
				upcastPartial<IStorageService>({}),
				zoomService,
				networkFilterService,
				new NullLogService(),
			));
			return model.setSharedWithAgent(true);
		}));

		assert.deepStrictEqual({
			results,
			infoCalls,
		}, {
			results: urls.map(() => undefined),
			infoCalls: urls.length,
		});
	});

	test('reflects main-process favicon state after navigation and renderer recreation', () => {
		const url = 'http://127.0.0.1:8123/';
		const favicon = 'data:image/svg+xml;base64,original';
		const failedUrl = 'http://favicon-recovery-test.invalid/';
		const error = { url: failedUrl, errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED' };
		const createModel = (state: IBrowserViewState) => {
			const events = createBrowserViewEventEmitters(disposables.add(new DisposableStore()));
			const model = disposables.add(new BrowserViewModel(
				'favicon-recovery',
				{ windowId: 1 },
				{ type: 'user' },
				undefined,
				state,
				upcastPartial<IBrowserViewService>({
					destroyBrowserView: async () => { },
					setBrowserZoomIndex: async () => { },
				}),
				events,
				upcastPartial<IBrowserViewWorkbenchService>({ isSharingAvailable: true, onDidChangeSharingAvailable: Event.None }),
				NullTelemetryService,
				upcastPartial<IDialogService>({}),
				upcastPartial<IStorageService>({}),
				upcastPartial<IBrowserZoomService>({ onDidChangeZoom: Event.None, getEffectiveZoomIndex: () => browserZoomDefaultIndex }),
				disposables.add(new AgentNetworkFilterService(new TestConfigurationService())),
				new NullLogService(),
			));
			return { model, events };
		};
		const original = createModel({ ...initialState, url, lastFavicon: favicon });
		original.events.onDidChangeFavicon.fire({ favicon: undefined });
		original.events.onDidChangeLoadingState.fire({ loading: false, error });
		original.events.onDidNavigate.fire({ url: failedUrl, title: '', canGoBack: true, canGoForward: false, certificateError: undefined });
		const failed = original.model.favicon;
		original.model.dispose();

		const recreated = createModel({ ...initialState, url: failedUrl, lastError: error });
		const recreatedFailed = recreated.model.favicon;
		recreated.events.onDidChangeLoadingState.fire({ loading: true });
		recreated.events.onDidChangeFavicon.fire({ favicon });
		recreated.events.onDidNavigate.fire({ url, title: 'Original page', canGoBack: false, canGoForward: true, certificateError: undefined });
		recreated.events.onDidChangeLoadingState.fire({ loading: false });
		const recovered = recreated.model.favicon;
		recreated.model.dispose();

		const recreatedRecovered = createModel({ ...initialState, url, lastFavicon: favicon }).model.favicon;
		assert.deepStrictEqual({ failed, recreatedFailed, recovered, recreatedRecovered }, {
			failed: undefined,
			recreatedFailed: undefined,
			recovered: favicon,
			recreatedRecovered: favicon,
		});
	});
});
