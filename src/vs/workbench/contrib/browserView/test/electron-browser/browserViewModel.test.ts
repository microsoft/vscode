/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
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
import { BrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';

suite('BrowserViewModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('blocks sharing reported parser-differential authorities with the agent', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
		const networkFilterService = disposables.add(new AgentNetworkFilterService(configService));
		const browserViewService = upcastPartial<IBrowserViewService>({
			onDynamicDidChangePermissions: () => Event.None,
			onDynamicDidChangeDeviceEmulation: () => Event.None,
			onDynamicDidNavigate: () => Event.None,
			onDynamicDidChangeLoadingState: () => Event.None,
			onDynamicDidChangeDevToolsState: () => Event.None,
			onDynamicDidChangeTitle: () => Event.None,
			onDynamicDidChangeFavicon: () => Event.None,
			onDynamicDidChangeOwner: () => Event.None,
			onDynamicDidChangeFocus: () => Event.None,
			onDynamicDidChangeVisibility: () => Event.None,
			onDynamicDidChangeElementSelectionState: () => Event.None,
			onDynamicDidChangeAreaSelectionActive: () => Event.None,
			onDynamicDidChangeRemoteStatus: () => Event.None,
			onDynamicDidChangeAudiences: () => Event.None,
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
			storageScope: BrowserViewStorageScope.Global,
			storageKeys: {},
			permissions: { origins: {} },
			browserZoomIndex: browserZoomDefaultIndex,
			elementSelectionState: { active: false, options: {} },
			isRemoteSession: false,
			isAreaSelectionActive: false,
			device: undefined,
			audiences: [],
		};
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
});
