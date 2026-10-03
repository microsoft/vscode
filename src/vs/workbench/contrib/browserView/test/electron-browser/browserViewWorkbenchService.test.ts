/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewCreatedEvent, IBrowserViewInfo } from '../../../../../platform/browserView/common/browserView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { AgentNetworkFilterService, IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkspaceTrustEnablementService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';

suite('BrowserViewWorkbenchService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(replacementReply?: DeferredPromise<IBrowserViewInfo>) {
		const created = disposables.add(new Emitter<IBrowserViewCreatedEvent>());
		const closed = disposables.add(new Emitter<void>());
		const requested = new DeferredPromise<void>();
		const replacementRequested = new DeferredPromise<void>();
		const reply = new DeferredPromise<IBrowserViewInfo>();
		const destroyed: string[] = [];
		const channel: IChannel = {
			listen: <T>(event: string) => (event === 'onDidCreateBrowserView' ? created.event : event === 'onDynamicDidClose' ? closed.event : Event.None) as Event<T>,
			call: async <T>(command: string, args?: string[]): Promise<T> => {
				switch (command) {
					case 'getBrowserViews': return [] as T;
					case 'updateWindowConfiguration': return undefined as T;
					case 'getOrCreateBrowserView':
						if (requested.isSettled && replacementReply) {
							void replacementRequested.complete();
							return await replacementReply.p as T;
						}
						void requested.complete();
						return await reply.p as T;
					case 'destroyBrowserView':
						destroyed.push(args![0]);
						closed.fire();
						return undefined as T;
					default: throw new Error(`Unexpected browser command: ${command}`);
				}
			}
		};
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IMainProcessService, upcastPartial<IMainProcessService>({ getChannel: () => channel }));
		instantiationService.stub(INativeWorkbenchEnvironmentService, upcastPartial<INativeWorkbenchEnvironmentService>({ userHome: URI.file('/test-home') }));
		instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());
		instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new class extends TestWorkspaceTrustManagementService {
			override getTrustedUris(): URI[] { return []; }
		}()));
		instantiationService.stub(IBrowserZoomService, upcastPartial<IBrowserZoomService>({
			onDidChangeZoom: Event.None,
			getEffectiveZoomIndex: () => browserZoomDefaultIndex,
		}));
		instantiationService.stub(IAgentNetworkFilterService, disposables.add(new AgentNetworkFilterService(instantiationService.get(IConfigurationService))));
		const service = disposables.add(instantiationService.createInstance(BrowserViewWorkbenchService));
		instantiationService.stub(IBrowserViewWorkbenchService, service);
		const info: IBrowserViewInfo = {
			id: 'pending-browser',
			host: { windowId: mainWindow.vscodeWindowId },
			owner: { type: 'user' },
			state: {
				url: 'about:blank', title: '', canGoBack: false, canGoForward: false,
				loading: false, focused: false, visible: false, isDevToolsOpen: false,
				lastScreenshot: undefined, lastFavicon: undefined, lastError: undefined,
				certificateError: undefined, storageScope: BrowserViewStorageScope.Global,
				storageKeys: {}, permissions: { origins: {} }, browserZoomIndex: browserZoomDefaultIndex,
				elementSelectionState: { active: false, options: {} }, isRemoteSession: false,
				isAreaSelectionActive: false, device: undefined, audiences: [],
			}
		};
		// Also clean up any unexpectedly resurrected input when a regression fails.
		disposables.add({ dispose: () => { for (const input of service.getKnownBrowserViews().values()) { input.dispose(); } } });
		return { service, created, requested, replacementRequested, reply, destroyed, info };
	}

	test('does not recreate a closed browser when its creation reply arrives', async () => {
		const { service, created, requested, reply, info } = createService();
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
		const { service, created, requested, reply, info, destroyed } = createService();
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
		const { service, requested, reply, info, destroyed } = createService();
		const input = service.getOrCreateLazy({ id: info.id });
		const resolution = input.resolve();
		await requested.p;
		input.dispose();
		await reply.complete(info);
		await assert.rejects(resolution, isCancellationError);
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [info.id] });
	});

	for (const eventBeforeReply of [false, true]) {
		test(`keeps a live input and its resolved model (creation event first: ${eventBeforeReply})`, async () => {
			const { service, created, requested, reply, info, destroyed } = createService();
			const input = service.getOrCreateLazy({ id: info.id });
			const resolution = input.resolve();
			await requested.p;
			if (eventBeforeReply) {
				created.fire({ info });
			}
			await reply.complete(info);
			const model = await resolution;
			if (!eventBeforeReply) {
				created.fire({ info });
			}
			assert.deepStrictEqual({
				inputPreserved: service.getKnownBrowserViews().get(info.id) === input,
				modelPreserved: input.model === model,
				destroyed,
			}, { inputPreserved: true, modelPreserved: true, destroyed: [] });
			input.dispose();
			assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [info.id] });
		});
	}

	for (const oldReplyFirst of [false, true]) {
		test(`preserves a reopened input with the same ID (old reply first: ${oldReplyFirst})`, async () => {
			const replacementReply = new DeferredPromise<IBrowserViewInfo>();
			const { service, created, requested, replacementRequested, reply, info, destroyed } = createService(replacementReply);
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
		});
	}

	test('transfers late creation cleanup to a lazy replacement', async () => {
		const { service, created, requested, reply, info, destroyed } = createService();
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
		assert.deepStrictEqual({ known: service.getKnownBrowserViews().size, destroyed }, { known: 0, destroyed: [info.id] });
	});

	test('preserves creation failures after disposal', async () => {
		const { service, requested, reply, info, destroyed } = createService();
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
