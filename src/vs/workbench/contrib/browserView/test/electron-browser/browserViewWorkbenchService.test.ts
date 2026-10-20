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
import { BrowserViewReferences } from '../../../../../platform/browserView/common/browserViewReference.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { ICopilotHomeService } from '../../../../../platform/environment/common/copilotHome.js';
import { TestCopilotHomeService } from '../../../../../platform/environment/test/common/testCopilotHomeService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';

suite('BrowserViewWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(reply?: DeferredPromise<IBrowserViewInfo>, replacementReply?: DeferredPromise<IBrowserViewInfo>, loadError?: Error) {
		const disposables = store.add(new DisposableStore());
		const events = store.add(new Emitter<BrowserViewEvent>());
		const requested = new DeferredPromise<void>();
		const replacementRequested = new DeferredPromise<void>();
		const destroyed: string[] = [];
		const nativeViews = new Map<string, IBrowserViewInfo>();
		const references = store.add(new BrowserViewReferences((id, options) => {
			const view = nativeViews.get(id) ?? info(id, options.presentation ?? BrowserViewPresentation.Listed);
			nativeViews.set(id, view);
			return view;
		}, id => {
			if (nativeViews.delete(id)) {
				destroyed.push(id);
			}
		}));
		const creationOptions: IBrowserViewCreateOptions[] = [];
		const loadedUrls: Array<{ id: string; url: string }> = [];
		class Source {
			onDynamicBrowserViewEvent(): Event<BrowserViewEvent> { return events.event; }
			async updateWindowConfiguration(): Promise<void> { }
			async acquireBrowserView(id: string, windowId: number, referenceId: string): Promise<void> {
				references.acquire(id, windowId, referenceId);
			}
			async releaseBrowserView(id: string, referenceId: string): Promise<void> {
				references.release(id, referenceId);
			}
			async setBrowserZoomIndex(): Promise<void> { }
			async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions, referenceId: string): Promise<IBrowserViewInfo> {
				const view = references.getOrCreate(id, options, referenceId);
				creationOptions.push(options);
				if (reply) {
					if (requested.isSettled && replacementReply) {
						void replacementRequested.complete();
						return replacementReply.p;
					}
					void requested.complete();
					try {
						return await reply.p;
					} catch (error) {
						nativeViews.delete(id);
						throw error;
					}
				}
				const [serialized, screenshot] = serializeBrowserViewInfo(view);
				events.fire([{ type: 'created', windowId: 1, data: { info: serialized, initialUrl: options.initialUrl } }, [screenshot]]);
				return view;
			}
			async loadURL(id: string, url: string): Promise<void> {
				loadedUrls.push({ id, url });
				if (loadError) {
					throw loadError;
				}
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
		instantiationService.stub(ICopilotHomeService, new TestCopilotHomeService(URI.file('/home/test')));
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
		return { service, events, creationOptions, loadedUrls, requested, replacementRequested, nativeViews, destroyed };
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

	test('publishes a model before notifying consumers that can immediately close its new input', async () => {
		const { service, events, nativeViews, destroyed } = createService();
		const view = info('page');
		nativeViews.set(view.id, view);
		let modelDisposed = false;
		store.add(service.onDidChangeBrowserViews(() => {
			const input = service.getKnownBrowserViews().get(view.id);
			if (input) {
				assert.ok(input.model);
				store.add(input.model.onWillDispose(() => modelDisposed = true));
				input.dispose();
			}
		}));
		const [serialized, screenshot] = serializeBrowserViewInfo(view);
		events.fire([{ type: 'created', windowId: 1, data: { info: serialized } }, [screenshot]]);
		await Promise.resolve();
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, modelDisposed, remaining: nativeViews.size, destroyed }, {
			known: 0, modelDisposed: true, remaining: 0, destroyed: [view.id],
		});
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

	test('preserves sandbox network restrictions when creating a browser view', async () => {
		const { service, events, creationOptions } = createService();
		events.fire([{ type: 'snapshot', windowId: mainWindow.vscodeWindowId, views: [] }, []]);
		const sandboxNetworkRestrictions = {
			sandboxEnabled: true,
			allowNetwork: true,
			allowedDomains: ['example.test'],
			deniedDomains: ['blocked.example.test'],
		};
		const input = store.add(await service.createBrowserView({
			owner: { type: 'agent', sessionId: 'agent-session' },
			session: { scope: BrowserViewStorageScope.Agent, affinity: 'agent-session' },
			sandboxNetworkRestrictions,
		}));
		assert.deepStrictEqual(creationOptions.map(options => options.sandboxNetworkRestrictions), [sandboxNetworkRestrictions]);
		input.dispose();
		await Promise.resolve();
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

	test('closing before hydration prevents a native creation request', async () => {
		const { service, events, creationOptions, destroyed } = createService();
		const input = service.getOrCreateLazy({ id: 'page' });
		const resolution = input.resolve();
		input.dispose();
		events.fire([{ type: 'snapshot', windowId: mainWindow.vscodeWindowId, views: [] }, []]);
		await assert.rejects(resolution, isCancellationError);
		assert.deepStrictEqual({ creationOptions, destroyed, known: service.getKnownBrowserViews().size }, {
			creationOptions: [], destroyed: [], known: 0,
		});
	});

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

	test('keeps native ownership in a lazy replacement without attaching the abandoned model', async () => {
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
		assert.deepStrictEqual({ input: service.getKnownBrowserViews().get(info.id), model: replacement.model, destroyed }, {
			input: replacement, model: undefined, destroyed: [],
		});
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

	test('resolves a lazy replacement from the preserved native view without a second creation event', async () => {
		const { service, created, requested, reply, info, nativeViews, destroyed } = createPendingService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		input.dispose();
		created.fire({ info });
		const replacement = service.getOrCreateLazy({ id: info.id });
		const nativeView = nativeViews.get(info.id);
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		const model = await replacement.resolve();
		assert.deepStrictEqual({ attached: replacement.model === model, reused: nativeViews.get(info.id) === nativeView, destroyed }, {
			attached: true, reused: true, destroyed: [],
		});
		replacement.dispose();
		await Promise.resolve();
		assert.deepStrictEqual(destroyed, [info.id]);
	});

	test('releases an external view when the workbench is disposed while its creation reply is pending', async () => {
		const reply = new DeferredPromise<IBrowserViewInfo>();
		const { service, requested, nativeViews, destroyed } = createService(reply);
		const creation = service.createExternalBrowserView('https://example.test/preview');
		await requested.p;
		const view = [...nativeViews.values()][0];
		service.dispose();
		await reply.complete(view);
		await assert.rejects(creation, isCancellationError);
		assert.deepStrictEqual({ remaining: nativeViews.size, destroyed }, { remaining: 0, destroyed: [view.id] });
	});

	test('workbench shutdown leaves listed native views with the window and cancels late model attachment', async () => {
		const { service, requested, reply, info, nativeViews, destroyed } = createPendingService();
		const input = store.add(service.getOrCreateLazy({ id: info.id }));
		const resolution = input.resolve();
		await requested.p;
		service.dispose();
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		assert.deepStrictEqual({ model: input.model, remaining: [...nativeViews.keys()], destroyed }, {
			model: undefined, remaining: [info.id], destroyed: [],
		});
		input.dispose();
	});

	test('releases an external view when its initial navigation fails', async () => {
		const error = new Error('navigation failed');
		const { service, nativeViews, destroyed } = createService(undefined, undefined, error);
		await assert.rejects(service.createExternalBrowserView('https://example.test/preview'), candidate => candidate === error);
		assert.deepStrictEqual({ remaining: nativeViews.size, destroyed: destroyed.length }, { remaining: 0, destroyed: 1 });
	});

	test('cleans event lifetimes when embedded canvas models are repeatedly disposed', async () => {
		const { service, nativeViews, destroyed } = createService();
		const closed: string[] = [];
		for (let index = 0; index < 3; index++) {
			const model = await service.createExternalBrowserView(`https://example.test/canvas-${index}`);
			store.add(model.onWillDispose(() => closed.push(model.id)));
			model.dispose();
			await Promise.resolve();
		}
		assert.deepStrictEqual({ closed: closed.length, listed: service.getKnownBrowserViews().size, remaining: nativeViews.size, destroyed: destroyed.length }, {
			closed: 3, listed: 0, remaining: 0, destroyed: 3,
		});
	});
});
