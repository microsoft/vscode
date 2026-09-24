/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChannel, ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewStorageScope, browserZoomDefaultIndex, externalBrowserViewStorageAffinity, IBrowserViewCreateOptions, IBrowserViewInfo, IBrowserViewService, IBrowserViewWindowConfiguration, validateExternalBrowserViewOptions } from '../../../../../platform/browserView/common/browserView.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { BrowserViewModel } from '../../common/browserView.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';

suite('BrowserViewWorkbenchService native initialization', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/canvas-file-trust/workspace');
	const external = URI.file('/canvas-file-trust/outside');
	const resource = URI.parse('test-canvas:/owner/chat/instance');

	function createViewInfo(id: string, creation: IBrowserViewCreateOptions): IBrowserViewInfo {
		return {
			id, host: creation.host, owner: creation.owner,
			associatedResource: undefined, presentation: creation.presentation,
			state: {
				url: creation.initialUrl ?? '', title: '', canGoBack: false, canGoForward: false,
				loading: false, focused: false, visible: false, isDevToolsOpen: false,
				lastScreenshot: undefined, lastFavicon: undefined, lastError: undefined, certificateError: undefined,
				storageScope: creation.presentation ? BrowserViewStorageScope.Agent : BrowserViewStorageScope.Global,
				storageKeys: {}, permissions: { origins: {} },
				browserZoomIndex: browserZoomDefaultIndex, elementSelectionState: { active: false, options: {} },
				isRemoteSession: false, isAreaSelectionActive: false, device: undefined, audiences: [],
			},
		};
	}

	function restoredView(id: string, canvas?: URI, windowId = mainWindow.vscodeWindowId): IBrowserViewInfo {
		return createViewInfo(id, {
			host: { windowId }, owner: { type: 'user' },
			session: canvas
				? { scope: BrowserViewStorageScope.Agent, affinity: externalBrowserViewStorageAffinity(canvas) }
				: { scope: BrowserViewStorageScope.Global },
			presentation: canvas ? { type: 'external', resource: canvas } : undefined,
		});
	}

	function createFixture(options: {
		configure?: () => Promise<void>;
		create?: () => Promise<void>;
		existingViews?: readonly IBrowserViewInfo[];
		destroy?: (id: string) => Promise<void>;
	} = {}) {
		const lifetime = store.add(new DisposableStore());
		const instantiation = workbenchInstantiationService(undefined, lifetime);
		const initialized = new DeferredPromise<void>();
		const foldersChanged = lifetime.add(new Emitter<void>());
		const trustChanged = lifetime.add(new Emitter<boolean>());
		let workspaceTrusted = false;
		let trusted: URI[] = [];
		const configurations: IBrowserViewWindowConfiguration[] = [];
		const creations: IBrowserViewCreateOptions[] = [];
		const nativeViews = new Map(options.existingViews?.map(view => [view.id, view]));
		const enumeratedWindows: (number | undefined)[] = [];
		const destroyRequests: string[] = [];
		const destroyed: string[] = [];
		const native = upcastPartial<IBrowserViewService>({
			onDidCreateBrowserView: Event.None,
			getBrowserViews: async windowId => {
				enumeratedWindows.push(windowId);
				return [...nativeViews.values()].filter(view => windowId === undefined || view.host.windowId === windowId);
			},
			updateWindowConfiguration: async (_windowId, configuration) => {
				configurations.push(configuration);
				await options.configure?.();
			},
			getOrCreateBrowserView: async (id, creation) => {
				creations.push(creation);
				await options.create?.();
				validateExternalBrowserViewOptions(creation, nativeViews.values());
				const info = createViewInfo(id, creation);
				nativeViews.set(id, info);
				return info;
			},
			destroyBrowserView: async id => {
				destroyRequests.push(id);
				await options.destroy?.(id);
				nativeViews.delete(id);
				destroyed.push(id);
			},
		});
		const server = ProxyChannel.fromService(native, lifetime);
		const channel: IChannel = {
			call: (command, args) => server.call(undefined, command, args),
			listen: (event, args) => server.listen(undefined, event, args),
		};
		instantiation.stub(IMainProcessService, { getChannel: () => channel });
		instantiation.stub(INativeWorkbenchEnvironmentService, { userHome: URI.file('/canvas-file-trust/home') });
		instantiation.stub(IWorkspaceContextService, {
			getWorkspace: () => ({
				id: 'canvas-file-trust',
				folders: [upcastPartial<IWorkspaceFolder>({ uri: workspace })],
			}),
			getWorkbenchState: () => WorkbenchState.FOLDER,
			onDidChangeWorkspaceFolders: Event.None,
		});
		instantiation.stub(IWorkspaceTrustEnablementService, { isWorkspaceTrustEnabled: () => true });
		instantiation.stub(IWorkspaceTrustManagementService, {
			workspaceTrustInitialized: initialized.p,
			isWorkspaceTrusted: () => workspaceTrusted,
			getTrustedUris: () => trusted,
			onDidChangeTrust: trustChanged.event,
			onDidChangeTrustedFolders: foldersChanged.event,
		});
		instantiation.stubInstance(BrowserViewModel, {
			onWillDispose: Event.None, onDidClose: Event.None, onDidChangeTitle: Event.None,
			onDidChangeFavicon: Event.None, onDidChangeLoadingState: Event.None, onDidNavigate: Event.None,
			dispose: () => { },
		});
		const service = lifetime.add(instantiation.createInstance(BrowserViewWorkbenchService));
		lifetime.add(service.onDidChangeBrowserViews(() => {
			for (const input of service.getKnownBrowserViews().values()) {
				lifetime.add(input);
			}
		}));
		const setTrust = (uris: URI[], workspaceIsTrusted: boolean) => {
			trusted = uris;
			workspaceTrusted = workspaceIsTrusted;
			foldersChanged.fire();
			trustChanged.fire(workspaceIsTrusted);
		};
		return { service, initialized, configurations, creations, nativeViews, enumeratedWindows, destroyRequests, destroyed, setTrust };
	}

	test('renderer restoration retires every old external view before replacement without closing ordinary or other-window views', async () => {
		const secondResource = resource.with({ path: '/owner/chat/second' });
		const firstDestroyed = new DeferredPromise<void>();
		const secondDestroyed = new DeferredPromise<void>();
		const fixture = createFixture({
			existingViews: [
				restoredView('old-first', resource),
				restoredView('ordinary'),
				restoredView('old-second', secondResource),
				restoredView('other-window', resource.with({ path: '/other-owner/chat/instance' }), mainWindow.vscodeWindowId + 1),
			],
			destroy: id => id === 'old-first' ? firstDestroyed.p : secondDestroyed.p,
		});
		await fixture.initialized.complete();
		const replacements = Promise.allSettled([
			fixture.service.getOrCreateExternalBrowserView('new-first', resource, 'http://localhost/first'),
			fixture.service.getOrCreateExternalBrowserView('new-second', secondResource, 'http://localhost/second'),
		]);
		await timeout(0);
		const beforeCleanup = fixture.creations.length;
		await firstDestroyed.complete();
		await timeout(0);
		const afterFirstCleanup = fixture.creations.length;
		await secondDestroyed.complete();
		const outcomes = (await replacements).map(result => result.status);

		assert.deepStrictEqual({
			beforeCleanup, afterFirstCleanup, outcomes,
			enumeratedWindows: fixture.enumeratedWindows,
			destroyRequests: fixture.destroyRequests,
			destroyed: fixture.destroyed,
			remaining: [...fixture.nativeViews.keys()].sort(),
			ordinaryEditors: [...fixture.service.getKnownBrowserViews().keys()],
		}, {
			beforeCleanup: 0, afterFirstCleanup: 0, outcomes: ['fulfilled', 'fulfilled'],
			enumeratedWindows: [mainWindow.vscodeWindowId],
			destroyRequests: ['old-first', 'old-second'],
			destroyed: ['old-first', 'old-second'],
			remaining: ['new-first', 'new-second', 'ordinary', 'other-window'],
			ordinaryEditors: ['ordinary'],
		});
	});

	test('failed restoration cleanup blocks replacement but still restores ordinary browser inputs', async () => {
		const failure = new Error('Controlled native cleanup failure');
		const fixture = createFixture({
			existingViews: [restoredView('old', resource), restoredView('ordinary')],
			destroy: async () => { throw failure; },
		});
		await fixture.initialized.complete();
		await assert.rejects(fixture.service.getOrCreateExternalBrowserView('new', resource, 'http://localhost/'), error => error === failure);
		assert.deepStrictEqual({
			creations: fixture.creations,
			destroyRequests: fixture.destroyRequests,
			remaining: [...fixture.nativeViews.keys()],
			ordinaryEditors: [...fixture.service.getKnownBrowserViews().keys()],
		}, {
			creations: [], destroyRequests: ['old'], remaining: ['old', 'ordinary'], ordinaryEditors: ['ordinary'],
		});
	});

	test('waits for initialized file authority and its native acknowledgement before external creation', async () => {
		const configured = new DeferredPromise<void>();
		const fixture = createFixture({ configure: () => configured.p });
		const pending = fixture.service.getOrCreateExternalBrowserView('external-file', resource, URI.joinPath(external, 'index.html').toString());
		await timeout(0);
		const beforeInitialization = fixture.creations.length;
		fixture.setTrust([external], true);
		await fixture.initialized.complete();
		await timeout(0);
		const beforeAcknowledgement = fixture.creations.length;
		await configured.complete();
		await pending;
		const configuration = fixture.configurations.at(-1)!;
		const creation = fixture.creations[0];
		assert.deepStrictEqual({
			beforeInitialization, beforeAcknowledgement,
			roots: [workspace, external].map(root => configuration.trustedFileRoots.includes(root.fsPath)),
			trustAllFiles: configuration.trustAllFiles,
			owner: creation.owner, audiences: creation.initialAudiences, presentation: creation.presentation,
			session: creation.session,
			ordinaryEditors: fixture.service.getKnownBrowserViews().size,
		}, {
			beforeInitialization: 0, beforeAcknowledgement: 0, roots: [true, true], trustAllFiles: false,
			owner: { type: 'user' }, audiences: [], presentation: { type: 'external', resource },
			session: { scope: BrowserViewStorageScope.Agent, affinity: externalBrowserViewStorageAffinity(resource) },
			ordinaryEditors: 0,
		});
	});

	test('explicit outside-folder trust is independent of current-workspace trust and is revoked live', async () => {
		const fixture = createFixture();
		fixture.setTrust([external], false);
		await fixture.initialized.complete();
		await fixture.service.getOrCreateExternalBrowserView('outside-file', resource, URI.joinPath(external, 'index.html').toString());
		const granted = fixture.configurations.at(-1)!;
		fixture.setTrust([], false);
		await timeout(0);
		const revoked = fixture.configurations.at(-1)!;
		assert.deepStrictEqual({
			granted: [workspace, external].map(root => granted.trustedFileRoots.includes(root.fsPath)),
			revoked: [workspace, external].map(root => revoked.trustedFileRoots.includes(root.fsPath)),
			all: [granted.trustAllFiles, revoked.trustAllFiles],
			creations: fixture.creations.length,
		}, { granted: [false, true], revoked: [false, false], all: [false, false], creations: 1 });
	});

	test('failed native authority synchronization cannot create an external page', async () => {
		const failure = new Error('Controlled native configuration failure');
		const fixture = createFixture({ configure: async () => { throw failure; } });
		await fixture.initialized.complete();
		await assert.rejects(fixture.service.getOrCreateExternalBrowserView('file', resource, 'file:///canvas-file-trust/outside/index.html'), error => error === failure);
		assert.deepStrictEqual(fixture.creations, []);
	});

	test('disposal while awaiting trust initialization prevents native allocation', async () => {
		const fixture = createFixture();
		const pending = fixture.service.getOrCreateExternalBrowserView('file', resource, 'file:///canvas-file-trust/outside/index.html');
		fixture.service.dispose();
		await fixture.initialized.complete();
		await assert.rejects(pending, isCancellationError);
		assert.deepStrictEqual(fixture.creations, []);
	});

	test('native allocation completing after disposal is released instead of becoming a presentation', async () => {
		const created = new DeferredPromise<void>();
		const fixture = createFixture({ create: () => created.p });
		await fixture.initialized.complete();
		const pending = fixture.service.getOrCreateExternalBrowserView('late-file', resource, 'file:///canvas-file-trust/outside/index.html');
		await timeout(0);
		fixture.service.dispose();
		await created.complete();
		await assert.rejects(pending, isCancellationError);
		assert.deepStrictEqual({ created: fixture.creations.length, destroyed: fixture.destroyed }, { created: 1, destroyed: ['late-file'] });
	});
});
