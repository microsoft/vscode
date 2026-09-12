/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewCreateOptions, IBrowserViewCreatedEvent, IBrowserViewInfo, IBrowserViewService, validateBrowserViewReuse } from '../../../../platform/browserView/common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IAgentNetworkFilterService } from '../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { MainThreadBrowsers } from '../../browser/mainThreadBrowsers.js';
import { BrowserTabDto, ExtHostBrowsersShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { TestWorkspaceTrustEnablementService, TestWorkspaceTrustManagementService } from '../../../test/common/workbenchTestServices.js';
import { BrowserViewSharingState, IBrowserViewCDPService, IBrowserViewWorkbenchService } from '../../../contrib/browserView/common/browserView.js';
import { IBrowserZoomService } from '../../../contrib/browserView/common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../../contrib/browserView/electron-browser/browserViewWorkbenchService.js';

suite('External native browser presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test-canvas:/authority/session/chat/instance');

	test('coalesces creation without registering a BrowserEditorInput or extension API/CDP target', async () => {
		const fixture = createFixture(store);
		const first = fixture.service.getOrCreateExternalBrowserView('canvas', resource, 'http://localhost:41000/');
		assert.throws(() => fixture.service.getOrCreateLazy({ id: 'canvas' }), /external presentation/);
		const second = fixture.service.getOrCreateExternalBrowserView('canvas', resource, 'http://localhost:41000/');
		const [model, repeated] = await Promise.all([first, second]);
		await assert.rejects(fixture.api.$startCDPSession('api-session', model.id), /Unknown browser id/);
		await assert.rejects(model.setSharedWithAgent(true), /cannot be shared/);
		assert.deepStrictEqual({
			sameModel: model === repeated,
			creations: fixture.creations.length,
			known: [...fixture.service.getKnownBrowserViews().keys()],
			published: fixture.published,
			cdpTargets: fixture.cdpTargets,
			sharing: model.sharingState,
			options: fixture.creations[0].options,
		}, {
			sameModel: true, creations: 1, known: [], published: [], cdpTargets: [], sharing: BrowserViewSharingState.Unavailable,
			options: {
				presentation: { type: 'external', resource },
				host: { windowId: 1 }, owner: { type: 'user' }, initialAudiences: [],
				session: { scope: BrowserViewStorageScope.Agent, affinity: `external:${resource.toString()}` },
				initialUrl: 'http://localhost:41000/',
			},
		});
	});

	test('enumeration after renderer startup excludes external pages but preserves ordinary browser APIs', async () => {
		const ordinary = createViewInfo('ordinary', { host: { windowId: 1 }, owner: { type: 'user' }, session: { scope: BrowserViewStorageScope.Global }, initialUrl: 'http://localhost:41000/normal' });
		const external = { ...ordinary, id: 'canvas', presentation: { type: 'external' as const, resource } };
		const fixture = createFixture(store, [external, ordinary]);
		await timeout(0);
		const input = fixture.service.getKnownBrowserViews().get('ordinary');
		assert.ok(input);
		store.add(input);
		await fixture.api.$startCDPSession('api-session', input.id);
		await assert.rejects(fixture.api.$startCDPSession('canvas-api-session', external.id), /Unknown browser id/);
		assert.deepStrictEqual({
			known: [...fixture.service.getKnownBrowserViews().keys()],
			published: fixture.published.map(tab => ({ id: tab.id, url: tab.url })),
			cdpTargets: fixture.cdpTargets,
			creations: fixture.creations.length,
		}, {
			known: ['ordinary'], published: [{ id: 'ordinary', url: 'http://localhost:41000/normal' }],
			cdpTargets: ['ordinary'], creations: 0,
		});
	});

	test('reads semantics through a user-scoped native call without an API session or sharing', async () => {
		const fixture = createFixture(store);
		const model = await fixture.service.getOrCreateExternalBrowserView('canvas', resource, 'http://localhost:41000/');
		const snapshot = await model.getAccessibilitySnapshot();
		assert.deepStrictEqual({
			snapshot, semanticCalls: fixture.semanticCalls, cdpTargets: fixture.cdpTargets,
			published: fixture.published, sharing: model.sharingState,
		}, {
			snapshot: { scope: 'main-frame', text: 'button: Increment', truncated: false },
			semanticCalls: [{ id: 'canvas', hostWindowId: 1 }], cdpTargets: [], published: [], sharing: BrowserViewSharingState.Unavailable,
		});
	});
});

function createFixture(store: Pick<DisposableStore, 'add'>, initial: IBrowserViewInfo[] = []) {
	const instantiationService = workbenchInstantiationService(undefined, store);
	const views = new Map(initial.map(info => [info.id, info]));
	const creations: { id: string; options: IBrowserViewCreateOptions }[] = [];
	const published: BrowserTabDto[] = [];
	const cdpTargets: string[] = [];
	const semanticCalls: { id: string; hostWindowId: number }[] = [];
	const onDidCreate = store.add(new Emitter<IBrowserViewCreatedEvent>());
	const native = new class extends mock<IBrowserViewService>() {
		override readonly onDidCreateBrowserView = onDidCreate.event;
		override async getBrowserViews() { return [...views.values()]; }
		override async updateWindowConfiguration() { }
		override async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions) {
			const existing = views.get(id);
			if (existing) {
				validateBrowserViewReuse(existing, options);
				return existing;
			}
			creations.push({ id, options });
			const info = createViewInfo(id, options);
			views.set(id, info);
			onDidCreate.fire({ info });
			return info;
		}
		override async destroyBrowserView(id: string) { views.delete(id); }
		override async setBrowserZoomIndex() { }
		override async getAccessibilitySnapshot(id: string, hostWindowId: number) {
			semanticCalls.push({ id, hostWindowId });
			return { scope: 'main-frame' as const, text: 'button: Increment', truncated: false };
		}
		override onDynamicDidClose() { return Event.None; }
		override onDynamicDidNavigate() { return Event.None; }
		override onDynamicDidChangePermissions() { return Event.None; }
		override onDynamicDidChangeLoadingState() { return Event.None; }
		override onDynamicDidChangeDevToolsState() { return Event.None; }
		override onDynamicDidChangeTitle() { return Event.None; }
		override onDynamicDidChangeFavicon() { return Event.None; }
		override onDynamicDidChangeOwner() { return Event.None; }
		override onDynamicDidChangeFocus() { return Event.None; }
		override onDynamicDidChangeVisibility() { return Event.None; }
		override onDynamicDidChangeDeviceEmulation() { return Event.None; }
		override onDynamicDidChangeElementSelectionState() { return Event.None; }
		override onDynamicDidChangeAreaSelectionActive() { return Event.None; }
		override onDynamicDidChangeAudiences() { return Event.None; }
		override onDynamicDidChangeRemoteStatus() { return Event.None; }
	}();
	const server = ProxyChannel.fromService(native, store.add(new DisposableStore()));
	const channel: IChannel = {
		call: (command, arg, token) => server.call(undefined, command, arg, token),
		listen: (event, arg) => server.listen(undefined, event, arg),
	};
	instantiationService.stub(IMainProcessService, { getChannel: () => channel });
	instantiationService.stub(INativeWorkbenchEnvironmentService, { userHome: URI.file('/test/browser-host-home') });
	instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());
	instantiationService.stub(IWorkspaceTrustManagementService, store.add(new class extends TestWorkspaceTrustManagementService {
		override getTrustedUris(): URI[] { return []; }
	}()));
	instantiationService.stub(IAgentNetworkFilterService, { isEnabled: () => false, isUriAllowed: () => true, onDidChange: Event.None });
	instantiationService.stub(IBrowserZoomService, { getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None });
	instantiationService.stub(IBrowserViewCDPService, new class extends mock<IBrowserViewCDPService>() {
		override async createSessionGroup(id: string) { cdpTargets.push(id); return 'cdp-group'; }
		override async destroySessionGroup() { }
		override onCDPMessage() { return Event.None; }
		override onDidDestroy() { return Event.None; }
	});
	const service = store.add(instantiationService.createInstance(BrowserViewWorkbenchService));
	instantiationService.stub(IBrowserViewWorkbenchService, service);
	const proxy = new class extends mock<ExtHostBrowsersShape>() {
		override $onDidOpenBrowserTab(tab: BrowserTabDto) { published.push(tab); }
		override $onDidCloseBrowserTab() { }
		override $onDidChangeBrowserTabState() { }
		override $onDidChangeActiveBrowserTab() { }
		override $onCDPSessionClosed() { }
	}();
	const api = store.add(instantiationService.createInstance(MainThreadBrowsers, SingleProxyRPCProtocol(proxy)));
	return { service, api, views, creations, published, cdpTargets, semanticCalls };
}

function createViewInfo(id: string, options: IBrowserViewCreateOptions): IBrowserViewInfo {
	return {
		id, host: options.host, owner: options.owner, presentation: options.presentation,
		state: {
			url: options.initialUrl ?? '', title: '', canGoBack: false, canGoForward: false, loading: false,
			focused: false, visible: false, isDevToolsOpen: false, lastScreenshot: undefined, lastFavicon: undefined,
			lastError: undefined, certificateError: undefined,
			storageScope: typeof options.session === 'string' ? BrowserViewStorageScope.Ephemeral : options.session.scope,
			storageKeys: {}, permissions: { origins: {} }, browserZoomIndex: browserZoomDefaultIndex,
			elementSelectionState: { active: false, options: {} }, isRemoteSession: false,
			isAreaSelectionActive: false, device: undefined, audiences: [],
		},
	};
}
