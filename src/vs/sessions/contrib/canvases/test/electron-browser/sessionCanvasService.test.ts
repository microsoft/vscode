/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { isResourceEditorInput } from '../../../../../workbench/common/editor.js';
import { SessionCanvasesEnabledSettingId, SessionCanvasUri, type CanvasEntry, type ISessionCanvasReference } from '../../../../services/sessions/common/sessionCanvases.js';
import type { ISessionCapabilities } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { BaseLayoutController } from '../../../layout/browser/baseSessionLayoutController.js';
import { SinglePaneLayoutController } from '../../../layout/browser/singlePaneLayoutController.js';
import { createTestHarness, makeSession, type ICreateOptions } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { ISessionCanvasService, SessionCanvasInput, SessionCanvasSerializer } from '../../common/sessionCanvas.js';
import { SessionCanvasMount } from '../../common/sessionCanvasMount.js';
import { SessionCanvasService } from '../../electron-browser/sessionCanvasService.js';
import { canvasEntry, createCanvasState, TestSessionCanvases } from '../common/sessionCanvasTestUtils.js';

class CanvasTestLayoutController extends BaseLayoutController { }

suite('Session canvas editor ownership and working sets', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(options: ICreateOptions = {}, enabled = true) {
		const harness = createTestHarness(store.add(new DisposableStore()), { useModal: 'some', workspaceFolders: [{ uri: URI.file('/repo') }], ...options });
		const configuration = harness.instaService.get(IConfigurationService);
		assert.ok(configuration instanceof TestConfigurationService);
		if (enabled) {
			configuration.setUserConfiguration(SessionCanvasesEnabledSettingId, true);
		}
		const aSession = makeSession(URI.parse('session:/a'));
		const aCapabilities = observableValue<ISessionCapabilities>(harness, { supportsMultipleChats: false, supportsCanvases: true });
		const aActiveChat = observableValue(harness, aSession.activeChat.get());
		const aChats = observableValue(harness, aSession.chats.get());
		const aArchived = observableValue(harness, false);
		const a: IActiveSession = { ...aSession, capabilities: aCapabilities, activeChat: aActiveChat, chats: aChats, isArchived: aArchived };
		const b: IActiveSession = { ...makeSession(URI.parse('session:/b')), capabilities: observableValue<ISessionCapabilities>(harness, { supportsMultipleChats: false, supportsCanvases: true }) };
		const canvases = store.add(new TestSessionCanvases(createCanvasState('ahp-session:/a/chat/default')));
		const background = store.add(new TestSessionCanvases(createCanvasState('ahp-session:/b/chat/default', 'ahp-canvas:/background')));
		const reference: ISessionCanvasReference = { providerId: a.providerId, session: a.resource, chat: a.mainChat.get().resource, canvas: URI.parse(canvases.entries.get()[0].resource) };
		harness.instaService.stub(ISessionsManagementService, 'getSession', (resource: URI) => [a, b].find(session => isEqual(session.resource, resource)));
		harness.instaService.stub(ISessionsManagementService, 'getSessionCanvases', (session: URI, chat: URI) =>
			isEqual(session, a.resource) && isEqual(chat, a.mainChat.get().resource) ? canvases
				: isEqual(session, b.resource) && isEqual(chat, b.mainChat.get().resource) ? background : undefined);
		const sentimentChanged = store.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = sentimentChanged.event;
			override sentiment = { hidden: false };
		}();
		harness.instaService.stub(IChatEntitlementService, entitlement);
		const notifications: string[] = [];
		harness.instaService.stub(INotificationService, { info: message => notifications.push(String(message)) });
		const native: { id: string; resource: URI; url: string; disposed: boolean; model: IBrowserViewModel }[] = [];
		harness.instaService.stub(IBrowserViewWorkbenchService, {
			getOrCreateExternalBrowserView: async (id, resource, url) => {
				const willDispose = store.add(new Emitter<void>());
				const record = { id, resource, url, disposed: false };
				const model = new class extends mock<IBrowserViewModel>() {
					override readonly id = id;
					override readonly onWillDispose = willDispose.event;
					override dispose(): void {
						if (!record.disposed) {
							record.disposed = true;
							willDispose.fire();
						}
					}
				}();
				native.push(Object.assign(record, { model }));
				return model;
			},
		});
		const opened: { input: SessionCanvasInput; options: IEditorOptions | undefined }[] = [];
		if (!options.activateAux) {
			harness.instaService.stub(IEditorService, 'openEditor', async (input: SessionCanvasInput, options?: IEditorOptions) => {
				opened.push({ input, options });
				return undefined;
			});
		}
		const service = store.add(harness.instaService.createInstance(SessionCanvasService));
		harness.instaService.stub(ISessionCanvasService, service);
		const input = service.getInput(SessionCanvasUri.create(reference));
		const currentInput = observableValue<SessionCanvasInput | undefined>('input', input);
		const visible = observableValue('visible', true);
		const mount = store.add(new SessionCanvasMount(service, currentInput, visible, mainWindow.vscodeWindowId));
		return { harness, a, b, aCapabilities, aActiveChat, aChats, aArchived, canvases, background, reference, service, input, currentInput, visible, mount, native, opened, entitlement, sentimentChanged, notifications };
	}

	async function settleLayout(): Promise<void> {
		for (let i = 0; i < 6; i++) {
			await timeout(0);
		}
	}

	async function singlePaneFixture() {
		const f = fixture({ activateAux: true, singlePaneLayoutEnabled: true });
		f.visible.set(false, undefined);
		store.add(f.harness.instaService.createInstance(SinglePaneLayoutController));
		store.add(f.harness.onDidChangePartVisibility.event(event => {
			if (event.partId === Parts.EDITOR_PART) {
				f.visible.set(event.visible, undefined);
			}
		}));
		store.add(f.harness.onDidCloseEditor.event(event => {
			if (event.editor === f.currentInput.get()) {
				f.currentInput.set(undefined, undefined);
				event.editor.dispose();
			}
		}));
		await settleLayout();
		f.harness.activeSessionObs.set(f.a, undefined);
		await settleLayout();
		f.harness.activeGroupEditors.splice(1, 0, f.input);
		f.harness.visibleEditorsList = [f.input];
		f.harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		f.harness.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		f.visible.set(true, undefined);
		f.harness.onDidEditorsChange.fire();
		await f.canvases.completeSource(0);
		await settleLayout();
		return f;
	}

	for (const hydration of ['before', 'after']) {
		test(`restored inputs hydrate titles when entries arrive ${hydration} input creation`, () => {
			const f = fixture();
			const entry = f.canvases.entries.get()[0];
			const serializer = f.harness.instaService.createInstance(SessionCanvasSerializer);
			const serialized = serializer.serialize(f.input);
			assert.ok(serialized);
			transaction(tx => {
				f.visible.set(false, tx);
				f.currentInput.set(undefined, tx);
				f.canvases.entries.set([], tx);
				f.canvases.initialized.set(false, tx);
				f.harness.activeSessionObs.set(f.a, tx);
			});
			f.input.dispose();
			const hydrate = () => transaction(tx => {
				f.canvases.entries.set([entry], tx);
				f.canvases.initialized.set(true, tx);
			});
			if (hydration === 'before') {
				hydrate();
			}
			const restored = serializer.deserialize(f.harness.instaService, serialized);
			assert.ok(restored instanceof SessionCanvasInput);
			const initialName = restored.getName();
			const labels: string[] = [];
			store.add(restored.onDidChangeLabel(() => labels.push(restored.getName())));
			if (hydration === 'after') {
				hydrate();
			}
			const hydratedName = restored.getName();
			f.canvases.entries.set([{ ...entry, title: 'Renamed counter' }], undefined);
			assert.deepStrictEqual({
				initialName, hydratedName, renamed: restored.getName(), labels,
				reused: f.service.getInput(restored.resource) === restored,
				sourceRequests: f.canvases.sourceRequests.length, native: f.native.length,
				effects: f.canvases.effects, opened: f.opened.length,
			}, {
				initialName: hydration === 'before' ? 'Counter' : 'Canvas',
				hydratedName: 'Counter', renamed: 'Renamed counter',
				labels: hydration === 'before' ? ['Renamed counter'] : ['Counter', 'Renamed counter'],
				reused: true, sourceRequests: 0, native: 0, effects: [], opened: 0,
			});
		});
	}

	test('input titles never use a different provider, chat or canvas membership', () => {
		const f = fixture();
		const references = [
			{ ...f.reference, providerId: 'different-provider' },
			{ ...f.reference, chat: URI.parse('chat:/missing') },
			{ ...f.reference, canvas: URI.parse('ahp-canvas:/missing') },
		];
		assert.deepStrictEqual({
			titles: references.map(reference => f.service.getInput(SessionCanvasUri.create(reference)).getName()),
			sourceRequests: f.canvases.sourceRequests.length, native: f.native.length, effects: f.canvases.effects,
		}, { titles: ['Canvas', 'Canvas', 'Canvas'], sourceRequests: 0, native: 0, effects: [] });
	});

	test('real layout-controller working-set swaps release and freshly remount the logical view without closing membership', async () => {
		const f = fixture();
		store.add(f.harness.instaService.createInstance(CanvasTestLayoutController));
		f.harness.visibleEditorsList = [f.input];
		f.harness.activeGroupEditors = [f.input];
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.harness.activeSessionObs.set(f.b, undefined);
		await timeout(0);
		const away = { nativeDisposed: f.native[0].disposed, mounted: !!f.mount.presentation.get(), members: f.canvases.entries.get().length };
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(1, 'https://fixture.invalid/fresh-after-switch');
		await timeout(0);
		assert.deepStrictEqual({
			away, workingSet: f.harness.applyWorkingSetCalls.at(-1), native: f.native.map(record => ({ url: record.url, disposed: record.disposed })),
			effects: f.canvases.effects, logicalKey: f.input.resource.toString(),
		}, {
			away: { nativeDisposed: true, mounted: false, members: 1 },
			workingSet: { id: 'session-working-set:session:/a', name: 'session-working-set:session:/a' },
			native: [{ url: 'http://127.0.0.1:43123/canvas', disposed: true }, { url: 'https://fixture.invalid/fresh-after-switch', disposed: false }],
			effects: [], logicalKey: SessionCanvasUri.create(f.reference).toString(),
		});
	});

	test('multi-session working sets detach the old native owner without changing shared editor visibility', async () => {
		const f = fixture();
		f.harness.visibleSessionsObs.set([f.a, f.b], undefined);
		store.add(f.harness.instaService.createInstance(CanvasTestLayoutController));
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.harness.applyWorkingSetCalls = [];
		f.harness.setPartHiddenCalls = [];
		f.harness.activeSessionObs.set(f.b, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			mounted: !!f.mount.presentation.get(), disposed: f.native[0].disposed, effects: f.canvases.effects, workingSets: f.harness.applyWorkingSetCalls, visibility: f.harness.setPartHiddenCalls,
		}, { mounted: false, disposed: true, effects: [], workingSets: ['empty'], visibility: [] });
	});

	test('real Single-Pane whole-side-pane hiding retains the tab and membership but releases native resources', async () => {
		const f = await singlePaneFixture();
		f.harness.closedEditors = [];
		f.harness.layoutService.hideSidePane();
		await settleLayout();
		const hidden = {
			nativeDisposed: f.native[0].disposed, inputDisposed: f.input.isDisposed(), members: f.canvases.entries.get().length,
			tabKept: f.harness.activeGroupEditors.includes(f.input), closed: f.harness.closedEditors.length,
		};
		f.harness.layoutService.toggleSidePane();
		await f.canvases.completeSource(1);
		await settleLayout();
		assert.deepStrictEqual({ hidden, nativeCount: f.native.length, effects: f.canvases.effects },
			{ hidden: { nativeDisposed: true, inputDisposed: false, members: 1, tabKept: true, closed: 0 }, nativeCount: 2, effects: [] });
	});

	test('real Single-Pane Hide Editor restores its captured logical descriptor, not a source or effect', async () => {
		const f = await singlePaneFixture();
		f.harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		await settleLayout();
		const hidden = { disposed: f.native[0].disposed, tabGone: !f.harness.activeGroupEditors.includes(f.input), members: f.canvases.entries.get().length };
		f.harness.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		await settleLayout();
		const descriptor = f.harness.openedEditors.find(editor => isResourceEditorInput(editor) && isEqual(editor.resource, f.input.resource));
		assert.ok(descriptor && isResourceEditorInput(descriptor) && descriptor.resource);
		const restored = f.service.getInput(descriptor.resource);
		f.currentInput.set(restored, undefined);
		await f.canvases.completeSource(1, 'https://fixture.invalid/restored-by-controller');
		await settleLayout();
		assert.deepStrictEqual({
			hidden, resource: descriptor.resource.toString(), override: descriptor.options?.override,
			disposed: f.native.map(record => record.disposed), effects: f.canvases.effects,
		}, {
			hidden: { disposed: true, tabGone: true, members: 1 }, resource: f.input.resource.toString(), override: SessionCanvasInput.EDITOR_ID,
			disposed: [true, false], effects: [],
		});
	});

	test('tab disposal and descriptor-based Hide Editor restoration are detach-only', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		const resource = f.input.resource;
		f.currentInput.set(undefined, undefined);
		f.input.dispose();
		const restored = f.service.getInput(resource);
		f.currentInput.set(restored, undefined);
		await f.canvases.completeSource(1, 'https://fixture.invalid/restored');
		await timeout(0);
		assert.deepStrictEqual({ resource: restored.resource, sameInput: restored === f.input, disposed: f.native.map(record => record.disposed), effects: f.canvases.effects },
			{ resource, sameInput: false, disposed: [true, false], effects: [] });
	});

	test('Close Canvas is a single guarded effect and releases the page before awaiting the reply', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.canvases.closeResult = new DeferredPromise<void>();
		const closing = f.service.close(f.reference);
		const pending = { disposed: f.native[0].disposed, mounted: !!f.mount.presentation.get(), closing: f.service.isClosing(f.reference) };
		await f.canvases.closeResult.complete();
		await closing;
		assert.deepStrictEqual({ pending, effects: f.canvases.effects, closedRevision: f.canvases.closes[0].revision, inputDisposed: f.input.isDisposed() },
			{ pending: { disposed: true, mounted: false, closing: true }, effects: ['close'], closedRevision: 1, inputDisposed: true });
	});

	test('a failed logical close restores only the view and never retries the effect', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.canvases.closeResult = new DeferredPromise<void>();
		const closing = f.service.close(f.reference);
		const rejected = assert.rejects(closing, /Controlled/);
		await f.canvases.closeResult.error(new Error('Controlled close failure'));
		await rejected;
		await f.canvases.completeSource(1);
		await timeout(0);
		assert.deepStrictEqual({ disposed: f.native.map(record => record.disposed), effects: f.canvases.effects, closing: f.service.isClosing(f.reference), inputDisposed: f.input.isDisposed() },
			{ disposed: [true, false], effects: ['close'], closing: false, inputDisposed: false });
	});

	test('closing a background canvas preserves the foreground native lease', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		const presentation = f.mount.presentation.get();
		f.background.closeResult = new DeferredPromise<void>();
		const closing = f.service.close({
			providerId: f.b.providerId, session: f.b.resource, chat: f.b.mainChat.get().resource,
			canvas: URI.parse(f.background.entries.get()[0].resource),
		});
		const pending = { retained: f.mount.presentation.get() === presentation, disposed: f.native[0].disposed, reads: f.canvases.sourceRequests.length };
		await f.background.closeResult.complete();
		await closing;
		await timeout(0);

		assert.deepStrictEqual({
			pending, retained: f.mount.presentation.get() === presentation,
			native: f.native.map(record => record.disposed), reads: f.canvases.sourceRequests.length,
			foregroundEffects: f.canvases.effects, backgroundEffects: f.background.effects,
		}, {
			pending: { retained: true, disposed: false, reads: 1 }, retained: true,
			native: [false], reads: 1, foregroundEffects: [], backgroundEffects: ['close'],
		});
	});

	test('unrelated owner metadata changes do not remount the native view', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		const presentation = f.mount.presentation.get();
		f.aCapabilities.set({ ...f.aCapabilities.get(), supportsRename: true }, undefined);
		f.aChats.set([...f.aChats.get()], undefined);
		f.aActiveChat.set({ ...f.aActiveChat.get() }, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			retained: f.mount.presentation.get() === presentation, native: f.native.map(record => record.disposed),
			reads: f.canvases.sourceRequests.length, effects: f.canvases.effects,
		}, { retained: true, native: [false], reads: 1, effects: [] });
	});

	test('native publication reveals only the currently represented chat, preserving conversation focus', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		const added = canvasEntry(createCanvasState('ahp-session:/a/chat/default', 'ahp-canvas:/new'));
		f.canvases.entries.set([...f.canvases.entries.get(), added], undefined);
		f.background.entries.set([canvasEntry(createCanvasState('ahp-session:/b/chat/default', 'ahp-canvas:/new-background'))], undefined);
		await timeout(0);
		assert.deepStrictEqual(f.opened.map(opened => ({ owner: opened.input.reference.session.toString(), canvas: opened.input.reference.canvas.toString(), preserveFocus: opened.options?.preserveFocus })),
			[{ owner: f.a.resource.toString(), canvas: added.resource, preserveFocus: true }]);
	});

	test('an open that finishes after navigation stays in its captured owner without switching sessions', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		const target = f.service.getTarget(f.a.resource, f.a.mainChat.get().resource)!;
		f.canvases.openResult = new DeferredPromise<CanvasEntry>();
		const entry = f.canvases.entries.get()[0];
		const pending = f.service.open(target, { ...entry.identity, title: entry.title });
		f.harness.activeSessionObs.set(f.b, undefined);
		await f.canvases.openResult.complete(entry);
		await pending;
		assert.deepStrictEqual({ active: f.harness.activeSessionObs.get()?.resource, opened: f.opened.length, notices: f.notifications.length, effects: f.canvases.effects },
			{ active: f.b.resource, opened: 0, notices: 1, effects: ['open'] });
	});

	test('AI hiding releases native resources without closing logical members', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.entitlement.sentiment = { hidden: true };
		f.sentimentChanged.fire();
		assert.deepStrictEqual({ disposed: f.native[0].disposed, inputDisposed: f.input.isDisposed(), members: f.canvases.entries.get().length, effects: f.canvases.effects },
			{ disposed: true, inputDisposed: true, members: 1, effects: [] });
	});

	test('capability rollback, peer navigation and archive each detach without modifying membership', async () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.aCapabilities.set({ supportsMultipleChats: false, supportsCanvases: false }, undefined);
		const capability = !!f.mount.presentation.get();
		f.aCapabilities.set({ supportsMultipleChats: false, supportsCanvases: true }, undefined);
		await f.canvases.completeSource(1);
		await timeout(0);
		f.aActiveChat.set({ ...f.a.mainChat.get(), resource: URI.parse('session:/a/peer') }, undefined);
		const peer = !!f.mount.presentation.get();
		f.aActiveChat.set(f.a.mainChat.get(), undefined);
		await f.canvases.completeSource(2);
		await timeout(0);
		f.aArchived.set(true, undefined);
		assert.deepStrictEqual({
			capability, peer, archived: !!f.mount.presentation.get(), disposed: f.native.map(record => record.disposed), members: f.canvases.entries.get().length, effects: f.canvases.effects,
		}, { capability: false, peer: false, archived: false, disposed: [true, true, true], members: 1, effects: [] });
	});

	test('absence of the presentation opt-in never mounts or exposes a target', () => {
		const f = fixture({}, false);
		f.harness.activeSessionObs.set(f.a, undefined);
		assert.deepStrictEqual({
			enabled: f.service.enabled.get(), mounted: !!f.mount.presentation.get(), target: f.service.getTarget(f.a.resource, f.a.mainChat.get().resource), native: f.native.length, effects: f.canvases.effects,
		}, { enabled: false, mounted: false, target: undefined, native: 0, effects: [] });
	});

	test('chat hydration and removal reevaluate ownership even when the active-chat facade is unchanged', async () => {
		const f = fixture();
		const chats = f.aChats.get();
		f.aChats.set([], undefined);
		f.harness.activeSessionObs.set(f.a, undefined);
		const before = { mounted: !!f.mount.presentation.get(), reads: f.canvases.sourceRequests.length };
		f.aChats.set(chats, undefined);
		await f.canvases.completeSource(0);
		await timeout(0);
		f.canvases.entries.set([...f.canvases.entries.get(), canvasEntry(createCanvasState('ahp-session:/a/chat/default', 'ahp-canvas:/after-hydration'))], undefined);
		await timeout(0);
		f.aChats.set([], undefined);
		assert.deepStrictEqual({
			before, mounted: !!f.mount.presentation.get(), disposed: f.native[0].disposed, published: f.opened.length, effects: f.canvases.effects,
		}, { before: { mounted: false, reads: 0 }, mounted: false, disposed: true, published: 1, effects: [] });
	});

	test('duplicate mounts and cross-window acquisition cannot clone native authority', () => {
		const f = fixture();
		f.harness.activeSessionObs.set(f.a, undefined);
		assert.deepStrictEqual({
			duplicate: f.service.acquirePresentation(f.input, mainWindow.vscodeWindowId),
			otherWindow: f.service.acquirePresentation(f.input, mainWindow.vscodeWindowId + 1),
		}, { duplicate: undefined, otherWindow: undefined });
	});
});
