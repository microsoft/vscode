/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
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

	function createService(reply?: DeferredPromise<IBrowserViewInfo>, replacementReply?: DeferredPromise<IBrowserViewInfo>) {
		const disposables = store.add(new DisposableStore());
		const events = store.add(new Emitter<BrowserViewEvent>());
		const requested = new DeferredPromise<void>();
		const replacementRequested = new DeferredPromise<void>();
		const destroyed: string[] = [];
		const creationOptions: IBrowserViewCreateOptions[] = [];
		const loadedUrls: Array<{ id: string; url: string }> = [];
		class Source {
			onDynamicBrowserViewEvent(): Event<BrowserViewEvent> { return events.event; }
			async updateWindowConfiguration(): Promise<void> { }
			async destroyBrowserView(id: string): Promise<void> {
				destroyed.push(id);
			}
			async setBrowserZoomIndex(): Promise<void> { }
			async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions): Promise<IBrowserViewInfo> {
				creationOptions.push(options);
				if (reply) {
					if (requested.isSettled && replacementReply) {
						void replacementRequested.complete();
						return replacementReply.p;
					}
					void requested.complete();
					return reply.p;
				}
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
		disposables.add({ dispose: () => { for (const input of service.getKnownBrowserViews().values()) { input.dispose(); } } });
		if (reply) {
			events.fire([{ type: 'snapshot', windowId: mainWindow.vscodeWindowId, views: [] }, []]);
		}
		return { service, events, creationOptions, loadedUrls, requested, replacementRequested, destroyed };
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

		const externalModel = await service.createExternalBrowserView('https://example.test/preview');
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
				loadedUrls,
				knownIds: [...service.getKnownBrowserViews().keys()],
			}, {
				creationPresentations: [BrowserViewPresentation.Unlisted],
				creationUrls: [undefined],
				loadedUrls: [{ id: externalModel.id, url: 'https://example.test/preview' }],
				knownIds: ['listed-page'],
			});
		} finally {
			listedInput.dispose();
			externalModel.dispose();
		}
	});

	function createPendingService(replacementReply?: DeferredPromise<IBrowserViewInfo>) {
		const reply = new DeferredPromise<IBrowserViewInfo>();
		const result = createService(reply, replacementReply);
		const view = info('pending-browser');
		const created = {
			fire: ({ info: view }: { info: IBrowserViewInfo }) => {
				const [serialized, screenshot] = serializeBrowserViewInfo(view);
				result.events.fire([{ type: 'created', windowId: mainWindow.vscodeWindowId, data: { info: serialized } }, [screenshot]]);
			}
		};
		return { ...result, created, reply, info: view };
	}

	test('does not recreate a closed browser when its creation reply arrives', async () => {
		const { service, created, requested, reply, info } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		created.fire({ info });
		input.dispose();
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		assert.strictEqual(service.getKnownBrowserViews().size, 0);
	});

	test('releases a view created after its input was closed', async () => {
		const { service, created, requested, reply, info, destroyed } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		input.dispose();
		created.fire({ info });
		assert.strictEqual(service.getKnownBrowserViews().size, 0);
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, released: destroyed.includes(info.id) }, { known: 0, released: true });
	});

	test('releases late creation even without a creation notification', async () => {
		const { service, requested, reply, info, destroyed } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		input.dispose();
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [info.id] });
	});

	test('keeps a live input and its model across creation events and the reply', async () => {
		const { service, created, requested, reply, info, destroyed } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		created.fire({ info });
		const model = input.model;
		await reply.complete(info);
		const resolvedModel = await resolution;
		created.fire({ info });
		assert.deepStrictEqual({
			inputPreserved: service.getKnownBrowserViews().get(info.id) === input,
			modelPreserved: input.model === model && resolvedModel === model,
			destroyed,
		}, { inputPreserved: true, modelPreserved: true, destroyed: [] });
		input.dispose();
		await Promise.resolve();
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [info.id] });
	});

	for (const oldReplyFirst of [false, true]) {
		test(`preserves a reopened input with the same ID (old reply first: ${oldReplyFirst})`, async () => {
			const replacementReply = new DeferredPromise<IBrowserViewInfo>();
			const { service, created, requested, replacementRequested, reply, info, destroyed } = createPendingService(replacementReply);
			const oldInput = service.getOrCreateLazy({ id: info.id });
			const oldResolution = oldInput.resolve();
			await requested.p;
			oldInput.dispose();
			const replacement = service.getOrCreateLazy({ id: info.id });
			const replacementResolution = replacement.resolve();
			await replacementRequested.p;
			created.fire({ info });
			if (oldReplyFirst) {
				await reply.complete(info);
				await assert.rejects(oldResolution, isCancellationError);
			}
			await replacementReply.complete(info);
			const model = await replacementResolution;
			if (!oldReplyFirst) {
				await reply.complete(info);
				await assert.rejects(oldResolution, isCancellationError);
			}
			assert.deepStrictEqual({
				inputPreserved: service.getKnownBrowserViews().get(info.id) === replacement,
				modelPreserved: replacement.model === model,
				destroyed
			}, { inputPreserved: true, modelPreserved: true, destroyed: [] });
			replacement.dispose();
			await Promise.resolve();
		});
	}

	test('transfers late creation cleanup to a lazy replacement', async () => {
		const { service, created, requested, reply, info, destroyed } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		input.dispose();
		created.fire({ info });
		assert.strictEqual(service.getKnownBrowserViews().size, 0);
		const replacement = service.getOrCreateLazy({ id: info.id });
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		assert.strictEqual(service.getKnownBrowserViews().get(info.id), replacement);
		assert.deepStrictEqual(destroyed, []);
		replacement.dispose();
		await Promise.resolve();
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [info.id] });
	});

	test('preserves creation failures after disposal', async () => {
		const { service, requested, reply, info, destroyed } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		input.dispose();
		const error = new Error('creation failed');
		await reply.error(error);
		await assert.rejects(resolution, candidate => candidate === error);
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [] });
	});
});
