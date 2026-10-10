/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewEvent, BrowserViewPresentation, BrowserViewStorageScope, browserZoomDefaultIndex, IBrowserViewCreateOptions, IBrowserViewInfo, serializeBrowserViewInfo } from '../../../../../platform/browserView/common/browserView.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';

suite('BrowserViewWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const disposables = store.add(new DisposableStore());
		const events = store.add(new Emitter<BrowserViewEvent>());
		const creationOptions: IBrowserViewCreateOptions[] = [];
		const loadedUrls: Array<{ id: string; url: string }> = [];
		class Source {
			onDynamicBrowserViewEvent(): Event<BrowserViewEvent> { return events.event; }
			async updateWindowConfiguration(): Promise<void> { }
			async destroyBrowserView(): Promise<void> { }
			async setBrowserZoomIndex(): Promise<void> { }
			async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions): Promise<IBrowserViewInfo> {
				creationOptions.push(options);
				const view = info(id, options.presentation ?? BrowserViewPresentation.Listed);
				const [serialized, screenshot] = serializeBrowserViewInfo(view);
				events.fire([{ type: 'created', windowId: 1, data: { info: serialized, initialUrl: options.initialUrl } }, [screenshot]]);
				return view;
			}
			async loadURL(id: string, url: string): Promise<void> {
				loadedUrls.push({ id, url });
			}
		}
		const channel = ProxyChannel.fromService(new Source(), disposables);
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IWorkspaceTrustManagementService, 'getTrustedUris', () => []);
		instantiationService.stub(IMainProcessService, upcastPartial<IMainProcessService>({
			getChannel: () => ({
				call: (command, args) => channel.call(undefined, command, args),
				listen: (event, args) => channel.listen(undefined, event, args),
			}),
		}));
		instantiationService.stub(INativeWorkbenchEnvironmentService, upcastPartial<INativeWorkbenchEnvironmentService>({
			userHome: URI.file('/home/test'),
		}));
		instantiationService.stub(IWorkspaceTrustEnablementService, upcastPartial<IWorkspaceTrustEnablementService>({
			isWorkspaceTrustEnabled: () => false,
		}));
		instantiationService.stub(IBrowserZoomService, upcastPartial<IBrowserZoomService>({
			getEffectiveZoomIndex: () => browserZoomDefaultIndex,
			onDidChangeZoom: Event.None,
		}));
		instantiationService.stub(IAgentNetworkFilterService, upcastPartial<IAgentNetworkFilterService>({
			isEnabled: () => false,
			onDidChange: Event.None,
		}));
		const service = store.add(instantiationService.createInstance(BrowserViewWorkbenchService));
		instantiationService.stub(IBrowserViewWorkbenchService, service);
		return { service, events, creationOptions, loadedUrls };
	}

	function info(id: string, presentation = BrowserViewPresentation.Listed): IBrowserViewInfo {
		return {
			id, host: { windowId: 1 }, owner: { type: 'user' }, presentation,
			state: {
				url: '', title: '', canGoBack: false, canGoForward: false,
				loading: false, focused: false, visible: false, isDevToolsOpen: false,
				lastScreenshot: undefined, lastFavicon: undefined, lastError: undefined, certificateError: undefined,
				storageScope: BrowserViewStorageScope.Global, storageKeys: {},
				permissions: { origins: {} }, browserZoomIndex: browserZoomDefaultIndex,
				elementSelectionState: { active: false, options: {} },
				isRemoteSession: false, isAreaSelectionActive: false, device: undefined, audiences: [],
			}
		};
	}

	test('preserves restored metadata on early disposal without overriding fresh native state', async () => {
		const { service, events } = createService();
		const results = [];
		for (const fresh of [false, true]) {
			const id = `restored-${fresh}`;
			const input = store.add(service.getOrCreateLazy({
				id, url: 'https://saved.example/', title: 'Saved title', favicon: 'saved-icon',
			}));
			const view = info(id);
			if (fresh) {
				view.state.title = 'Fresh title';
				view.state.lastFavicon = 'fresh-icon';
			}
			const [serialized, screenshot] = serializeBrowserViewInfo(view);
			events.fire([{ type: 'created', windowId: 1, data: { info: serialized, initialUrl: 'https://new.example/' } }, [screenshot]]);
			input.dispose();
			const { url, title, favicon } = input.serialize();
			results.push({ url, title, favicon });
		}
		await Promise.resolve();
		assert.deepStrictEqual(results, [
			{ url: 'https://new.example/', title: 'Saved title', favicon: 'saved-icon' },
			{ url: 'https://new.example/', title: 'Fresh title', favicon: 'fresh-icon' },
		]);
	});

	test('delivers close to later consumers and retains a replacement with the same ID', async () => {
		const { service, events } = createService();
		const [serialized, screenshot] = serializeBrowserViewInfo(info('page'));
		const create = () => events.fire([{ type: 'created', windowId: 1, data: { info: serialized } }, [screenshot]]);
		create();
		const input = store.add(service.getKnownBrowserViews().get('page')!);
		const received: string[] = [];
		store.add(input.model!.onDidClose(() => {
			received.push('closed');
			create();
		}));
		events.fire([{ type: 'changed', windowId: 1, id: 'page', event: 'onDidClose', data: undefined }, []]);
		const replacement = service.getKnownBrowserViews().get('page');
		if (replacement) {
			store.add(replacement);
		}
		await Promise.resolve();
		events.fire([{ type: 'changed', windowId: 1, id: 'page', event: 'onDidChangeTitle', data: { title: 'Replacement' } }, []]);
		assert.deepStrictEqual({
			received, oldDisposed: input.isDisposed(), replacementTitle: replacement?.model?.title,
		}, {
			received: ['closed'], oldDisposed: true, replacementTitle: 'Replacement',
		});
		replacement?.dispose();
		await Promise.resolve();
	});

	test('keeps unlisted views out of workbench discovery across hydration and creation events', async () => {
		const { service, events, creationOptions, loadedUrls } = createService();
		const restored = info('restored-external', BrowserViewPresentation.Unlisted);
		const [restoredSerialized, restoredScreenshot] = serializeBrowserViewInfo(restored);
		events.fire([{ type: 'snapshot', windowId: 1, views: [restoredSerialized] }, [restoredScreenshot]]);

		const externalModel = await service.createExternalBrowserView('https://example.test/preview', 'canvas');
		const [childSerialized, childScreenshot] = serializeBrowserViewInfo(info('external-child', BrowserViewPresentation.Unlisted));
		events.fire([{ type: 'created', windowId: 1, data: { info: childSerialized } }, [childScreenshot]]);
		const [listedSerialized, listedScreenshot] = serializeBrowserViewInfo(info('listed-page'));
		events.fire([{ type: 'created', windowId: 1, data: { info: listedSerialized } }, [listedScreenshot]]);
		const listedInput = service.getKnownBrowserViews().get('listed-page');
		assert.ok(listedInput);

		try {
			assert.deepStrictEqual({
				creationPresentations: creationOptions.map(options => options.presentation),
				creationUrls: creationOptions.map(options => options.initialUrl),
				openSources: creationOptions.map(options => options.openSource),
				loadedUrls,
				knownIds: [...service.getKnownBrowserViews().keys()],
			}, {
				creationPresentations: [BrowserViewPresentation.Unlisted],
				creationUrls: [undefined],
				openSources: ['canvas'],
				loadedUrls: [{ id: externalModel.id, url: 'https://example.test/preview' }],
				knownIds: ['listed-page'],
			});
		} finally {
			listedInput.dispose();
			externalModel.dispose();
		}
	});

	test('cleans event lifetimes when embedded canvas models are repeatedly disposed', async () => {
		const { service } = createService();
		const closed: string[] = [];
		for (let index = 0; index < 3; index++) {
			const model = await service.createExternalBrowserView(`https://example.test/canvas-${index}`);
			store.add(model.onWillDispose(() => closed.push(model.id)));
			model.dispose();
			await Promise.resolve();
		}
		assert.deepStrictEqual({ closed: closed.length, listed: service.getKnownBrowserViews().size }, { closed: 3, listed: 0 });
	});
});
