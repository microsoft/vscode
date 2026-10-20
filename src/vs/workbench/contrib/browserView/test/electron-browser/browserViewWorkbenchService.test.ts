/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewEvent, BrowserViewPresentation, BrowserViewStorageScope, browserZoomDefaultIndex, IBrowserViewCreateOptions, IBrowserViewInfo, IBrowserViewWindowConfiguration, serializeBrowserViewInfo } from '../../../../../platform/browserView/common/browserView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITunnelProxyInfo } from '../../../../../platform/tunnel/common/tunnelProxy.js';
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

	function createService(remoteAuthority?: string) {
		const disposables = store.add(new DisposableStore());
		const events = store.add(new Emitter<BrowserViewEvent>());
		const creationOptions: IBrowserViewCreateOptions[] = [];
		const loadedUrls: Array<{ id: string; url: string }> = [];
		const windowConfigurations: IBrowserViewWindowConfiguration[] = [];
		// When set, window configuration updates wait for it, like a slow main process.
		const publishing: { value: Promise<void> | undefined } = { value: undefined };
		class Source {
			onDynamicBrowserViewEvent(): Event<BrowserViewEvent> { return events.event; }
			async updateWindowConfiguration(_windowId: number, config: IBrowserViewWindowConfiguration): Promise<void> {
				windowConfigurations.push(config);
				await publishing.value;
			}
			async destroyBrowserView(): Promise<void> { }
			async setBrowserZoomIndex(): Promise<void> { }
			async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions): Promise<IBrowserViewInfo> {
				creationOptions.push(options);
				const view = info(id, options.presentation ?? BrowserViewPresentation.Listed);
				if (typeof options.session !== 'string' && options.session.scope !== BrowserViewStorageScope.Global && options.session.network) {
					view.state.network = options.session.network;
				}
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
			remoteAuthority,
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
		const configurationService = new TestConfigurationService({ workbench: { browser: { enableRemoteProxy: true } } });
		instantiationService.stub(IConfigurationService, configurationService);
		const service = store.add(instantiationService.createInstance(BrowserViewWorkbenchService));
		instantiationService.stub(IBrowserViewWorkbenchService, service);
		return { service, events, creationOptions, loadedUrls, windowConfigurations, configurationService, publishing };
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
				network: undefined, isAreaSelectionActive: false, device: undefined, audiences: [],
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

	function registerProxyProvider(service: BrowserViewWorkbenchService, calls: string[]): ITunnelProxyInfo {
		const proxyInfo: ITunnelProxyInfo = { url: 'https://127.0.0.1:1', host: '127.0.0.1', port: 1, credentials: { username: 'u', password: 'p' }, certFingerprint: 'f' };
		store.add(service.registerNetworkProxyProvider({
			acquire: async authority => { calls.push(`acquire ${authority}`); return proxyInfo; },
			release: authority => { calls.push(`release ${authority}`); },
		}));
		return proxyInfo;
	}

	test('binds views to their resolved network', async () => {
		const { service, events, creationOptions, windowConfigurations } = createService('ssh-remote+other');
		events.fire([{ type: 'snapshot', windowId: 1, views: [] }, []]);
		const proxyCalls: string[] = [];
		const proxyInfo = registerProxyProvider(service, proxyCalls);
		store.add(service.registerNetworkResolver({ resolveNetwork: () => ({ authority: 'host' }) }));

		const remote = store.add(service.getOrCreateLazy({ id: 'remote', url: 'http://remote/' }));
		const local = store.add(service.getOrCreateLazy({ id: 'local', network: null }));
		const [remoteModel] = await Promise.all([remote.resolve(), local.resolve()]);
		const networkProxies = windowConfigurations.at(-1)?.networkProxies;
		remote.dispose();
		await Promise.resolve();

		assert.deepStrictEqual({
			sessions: Object.fromEntries(creationOptions.map(options => [options.initialUrl ?? 'none', options.session])),
			inputNetworks: [remote.serialize().network, local.serialize().network],
			modelNetwork: remoteModel.network,
			networkProxies,
			proxyCalls,
		}, {
			sessions: {
				// Only the window's own remote can use the window's workspace storage.
				'http://remote/': { scope: BrowserViewStorageScope.Ephemeral, network: { authority: 'host' } },
				'none': { scope: BrowserViewStorageScope.Workspace },
			},
			inputNetworks: [{ authority: 'host' }, null],
			modelNetwork: { authority: 'host' },
			networkProxies: { host: proxyInfo },
			proxyCalls: ['acquire host', 'release host'],
		});
	});

	test('uses the window remote network with the window workspace storage for remote workspace views', async () => {
		const { service, events, creationOptions } = createService('ssh-remote+host');
		events.fire([{ type: 'snapshot', windowId: 1, views: [] }, []]);
		const proxyCalls: string[] = [];
		registerProxyProvider(service, proxyCalls);

		const input = store.add(service.getOrCreateLazy({ id: 'page', url: 'http://localhost:3000/' }));
		await input.resolve();
		// Pages created on the network outside the workbench (e.g. by Playwright) need the proxy even without open tabs.
		const agentNetwork = service.resolveNetwork({ type: 'agent', sessionId: 'chat' });
		const hold = await service.acquireNetwork(agentNetwork!);
		input.dispose();
		await Promise.resolve();
		const callsWhileHeld = [...proxyCalls];
		hold.dispose();

		assert.deepStrictEqual({
			session: creationOptions[0].session,
			agentNetwork,
			callsWhileHeld,
			proxyCalls,
		}, {
			session: { scope: BrowserViewStorageScope.Workspace, network: { authority: 'ssh-remote+host' } },
			agentNetwork: { authority: 'ssh-remote+host' },
			callsWhileHeld: ['acquire ssh-remote+host'],
			proxyCalls: ['acquire ssh-remote+host', 'release ssh-remote+host'],
		});
	});

	function proxy(port: number): ITunnelProxyInfo {
		return { url: `https://127.0.0.1:${port}`, host: '127.0.0.1', port, credentials: { username: 'u', password: `p${port}` }, certFingerprint: `f${port}` };
	}

	test('does not create a view closed while its shared network proxy starts', async () => {
		const { service, events, creationOptions } = createService('ssh-remote+host');
		events.fire([{ type: 'snapshot', windowId: 1, views: [] }, []]);
		const started = new DeferredPromise<ITunnelProxyInfo>();
		store.add(service.registerNetworkProxyProvider({ acquire: () => started.p, release: () => { } }));

		const kept = store.add(service.getOrCreateLazy({ id: 'kept', url: 'http://kept/' }));
		const closed = store.add(service.getOrCreateLazy({ id: 'closed', url: 'http://closed/' }));
		const keptModel = kept.resolve();
		const closedModel = closed.resolve();
		await timeout(0);
		closed.dispose();
		started.complete(proxy(1));
		await keptModel;
		await assert.rejects(closedModel);

		assert.deepStrictEqual({
			created: creationOptions.map(options => options.initialUrl),
			known: [...service.getKnownBrowserViews().keys()],
		}, {
			created: ['http://kept/'],
			known: ['kept'],
		});
	});

	test('uses the proxy of a provider that replaced the one starting it', async () => {
		const results: Record<string, unknown> = {};
		// The retired provider is replaced while it acquires (finishing after its replacement, or failing) or while its proxy is published.
		for (const phase of ['acquired', 'failed', 'published'] as const) {
			const { service, events, creationOptions, windowConfigurations, publishing } = createService('ssh-remote+host');
			events.fire([{ type: 'snapshot', windowId: 1, views: [] }, []]);
			const acquired = new DeferredPromise<ITunnelProxyInfo>();
			const published = new DeferredPromise<void>();
			if (phase === 'published') {
				void acquired.complete(proxy(1));
				publishing.value = published.p;
			}
			store.add(service.registerNetworkProxyProvider({ acquire: () => acquired.p, release: () => { } }));

			const input = store.add(service.getOrCreateLazy({ id: 'page', url: 'http://page/' }));
			const model = input.resolve();
			await timeout(0);
			publishing.value = undefined;
			const replacement = new DeferredPromise<ITunnelProxyInfo>();
			store.add(service.registerNetworkProxyProvider({ acquire: () => replacement.p, release: () => { } }));
			if (phase === 'failed') {
				void acquired.error(new Error('extension host exited'));
			} else if (phase === 'published') {
				void published.complete();
			}
			await timeout(0);
			const createdBeforeReplacement = creationOptions.length;
			void replacement.complete(proxy(2));
			if (phase === 'acquired') {
				await timeout(0);
				void acquired.complete(proxy(1));
			}
			await model;
			results[phase] = { createdBeforeReplacement, networkProxies: windowConfigurations.at(-1)?.networkProxies };
		}

		const expected = { createdBeforeReplacement: 0, networkProxies: { 'ssh-remote+host': proxy(2) } };
		assert.deepStrictEqual(results, { acquired: expected, failed: expected, published: expected });
	});

	test('does not keep a view whose creation failed to start its proxy', async () => {
		const { service, events } = createService('ssh-remote+host');
		events.fire([{ type: 'snapshot', windowId: 1, views: [] }, []]);
		store.add(service.registerNetworkProxyProvider({ acquire: async () => { throw new Error('extension host exited'); }, release: () => { } }));

		await assert.rejects(service.createBrowserView({ owner: { type: 'user' }, session: { scope: BrowserViewStorageScope.Workspace, network: { authority: 'ssh-remote+host' } }, initialUrl: 'http://page/' }));

		assert.deepStrictEqual([...service.getKnownBrowserViews().keys()], []);
	});

	test('restarts the proxy of restored views after it failed to start', async () => {
		const { service, events, windowConfigurations } = createService('ssh-remote+host');
		store.add(service.registerNetworkProxyProvider({ acquire: async () => { throw new Error('extension host exited'); }, release: () => { } }));
		// A view that survived a window reload keeps needing its network.
		const restored = info('restored');
		restored.state.network = { authority: 'ssh-remote+host' };
		const [serialized, screenshot] = serializeBrowserViewInfo(restored);
		events.fire([{ type: 'snapshot', windowId: 1, views: [serialized] }, [screenshot]]);
		store.add(service.getKnownBrowserViews().get('restored')!);
		await timeout(0);
		store.add(service.registerNetworkProxyProvider({ acquire: async () => proxy(2), release: () => { } }));
		await timeout(0);

		assert.deepStrictEqual(windowConfigurations.at(-1)?.networkProxies, { 'ssh-remote+host': proxy(2) });
	});

	test('releases a proxy whose last view closed while it was published', async () => {
		const { service, events, windowConfigurations, publishing } = createService('ssh-remote+host');
		events.fire([{ type: 'snapshot', windowId: 1, views: [] }, []]);
		const calls: string[] = [];
		registerProxyProvider(service, calls);

		const input = store.add(service.getOrCreateLazy({ id: 'page', url: 'http://page/' }));
		const model = input.resolve();
		const published = new DeferredPromise<void>();
		publishing.value = published.p;
		await timeout(0);
		input.dispose();
		publishing.value = undefined;
		published.complete();
		await assert.rejects(model);

		assert.deepStrictEqual({ calls, networkProxies: windowConfigurations.at(-1)?.networkProxies }, {
			calls: ['acquire ssh-remote+host', 'release ssh-remote+host'],
			networkProxies: {},
		});
	});
});
