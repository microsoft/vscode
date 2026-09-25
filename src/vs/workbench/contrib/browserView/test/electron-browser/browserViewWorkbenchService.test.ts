/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewPresentation, BrowserViewStorageScope, browserZoomDefaultIndex, IBrowserViewCreatedEvent, IBrowserViewCreateOptions, IBrowserViewInfo, IBrowserViewService, IBrowserViewState } from '../../../../../platform/browserView/common/browserView.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';

suite('BrowserViewWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function state(url = ''): IBrowserViewState {
		return {
			url,
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
			storageScope: BrowserViewStorageScope.Ephemeral,
			storageKeys: {},
			permissions: { origins: {} },
			browserZoomIndex: browserZoomDefaultIndex,
			elementSelectionState: { active: false, options: {} },
			isRemoteSession: false,
			isAreaSelectionActive: false,
			device: undefined,
			audiences: [],
		};
	}

	function info(id: string, presentation: BrowserViewPresentation, url = ''): IBrowserViewInfo {
		return {
			id,
			host: { windowId: mainWindow.vscodeWindowId },
			owner: { type: 'user' },
			presentation,
			associatedResource: URI.parse(`browser-test:/${id}`),
			state: state(url),
		};
	}

	test('keeps unlisted views out of workbench discovery across hydration and creation events', async () => {
		const created = store.add(new Emitter<IBrowserViewCreatedEvent>());
		const existing = [info('restored-external', BrowserViewPresentation.Unlisted)];
		const creationOptions: IBrowserViewCreateOptions[] = [];
		const loadedUrls: Array<{ id: string; url: string }> = [];
		const browserViewService = upcastPartial<IBrowserViewService>({
			onDidCreateBrowserView: created.event,
			getBrowserViews: async () => existing,
			getOrCreateBrowserView: async (id, options) => {
				creationOptions.push(options);
				const createdInfo = {
					...info(id, options.presentation ?? BrowserViewPresentation.Listed, options.initialUrl),
					associatedResource: options.associatedResource,
				};
				created.fire({ info: createdInfo, initialUrl: options.initialUrl });
				return createdInfo;
			},
			updateWindowConfiguration: async () => { },
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
			onDynamicDidClose: () => Event.None,
			loadURL: async (id, url) => { loadedUrls.push({ id, url }); },
			destroyBrowserView: async () => { },
		});
		const channel: IChannel = {
			listen: <T>(event: string, arg?: unknown): Event<T> => {
				const target = Reflect.get(browserViewService, event);
				if (event.startsWith('onDynamic') && typeof target === 'function') {
					return target.call(browserViewService, arg) as Event<T>;
				}
				return target as Event<T>;
			},
			call: async <T>(command: string, args?: unknown): Promise<T> => {
				const target = Reflect.get(browserViewService, command);
				if (typeof target !== 'function') {
					throw new Error(`Method not found: ${command}`);
				}
				return target.apply(browserViewService, Array.isArray(args) ? args : []) as T;
			},
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IMainProcessService, {
			getChannel: () => channel,
		});
		instantiationService.stub(INativeWorkbenchEnvironmentService, { userHome: URI.file('/user') });
		instantiationService.stub(IWorkspaceTrustManagementService, {
			workspaceTrustInitialized: Promise.resolve(),
			onDidChangeTrustedFolders: Event.None,
			onDidChangeTrust: Event.None,
			isWorkspaceTrusted: () => true,
			getTrustedUris: () => [],
		});
		instantiationService.stub(IWorkspaceTrustEnablementService, { isWorkspaceTrustEnabled: () => true });
		instantiationService.stub(IBrowserZoomService, {
			onDidChangeZoom: Event.None,
			getEffectiveZoomIndex: () => browserZoomDefaultIndex,
		});
		instantiationService.stub(IAgentNetworkFilterService, {
			onDidChange: Event.None,
			isEnabled: () => false,
			isUriAllowed: () => true,
		});
		const service = instantiationService.createInstance(BrowserViewWorkbenchService);
		instantiationService.stub(IBrowserViewWorkbenchService, service);
		await timeout(0);

		const externalModel = await service.createExternalBrowserView('https://example.test/preview');
		created.fire({ info: info('external-child', BrowserViewPresentation.Unlisted) });
		created.fire({ info: info('listed-page', BrowserViewPresentation.Listed) });
		const listedInput = service.getKnownBrowserViews().get('listed-page');
		assert.ok(listedInput);

		try {
			assert.deepStrictEqual({
				externalModelId: externalModel.id,
				creationPresentations: creationOptions.map(options => options.presentation),
				creationResources: creationOptions.map(options => options.associatedResource),
				creationUrls: creationOptions.map(options => options.initialUrl),
				loadedUrls,
				knownIds: [...service.getKnownBrowserViews().keys()],
			}, {
				externalModelId: externalModel.id,
				creationPresentations: [BrowserViewPresentation.Unlisted],
				creationResources: [undefined],
				creationUrls: [undefined],
				loadedUrls: [{ id: externalModel.id, url: 'https://example.test/preview' }],
				knownIds: ['listed-page'],
			});
		} finally {
			listedInput.dispose();
			externalModel.dispose();
			service.dispose();
		}
	});
});
