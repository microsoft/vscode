/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { CanvasInput, ICanvasContextService, ICanvasService } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasService } from '../../../../../workbench/contrib/canvases/electron-browser/canvasService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { EditorService } from '../../../../../workbench/services/editor/browser/editorService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { GroupDirection, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, USE_MODAL_EDITOR_SETTING, UseModalEditorMode } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IChat, ISessionCanvas } from '../../../../services/sessions/common/session.js';
import { ChatLayoutMode } from '../../../../common/chatLayout.js';
import { BaseLayoutController } from '../../../layout/browser/baseSessionLayoutController.js';
import { createTestHarness, makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionCanvasContextService } from '../../electron-browser/sessionCanvasService.js';
import { SessionCanvasSerializer } from '../../electron-browser/sessionCanvasSerializer.js';

class TestCanvasLayoutController extends BaseLayoutController { }

suite('Session canvas working sets', () => {
	const store = new DisposableStore();
	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	async function createHarness(mode: ChatLayoutMode = 'session-shared', useModal: UseModalEditorMode = 'off') {
		const harness = createTestHarness(store, { useModal, workspaceFolders: [{ uri: URI.file('/repo') }], desktopLayout: true, chatLayoutMode: mode });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IAuxiliaryWindowService, { getWindow: () => undefined });
		const workbenchConfigurationService = new TestConfigurationService();
		await workbenchConfigurationService.setUserConfiguration(USE_MODAL_EDITOR_SETTING, useModal);
		instantiationService.stub(IConfigurationService, workbenchConfigurationService);
		const factoryRegistry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
		instantiationService.invokeFunction(accessor => factoryRegistry.start(accessor));
		store.add(registerTestEditor('canvas-working-set-file', [new SyncDescriptor(TestFileEditorInput)], 'canvas-working-set-file'));
		store.add(registerTestEditor(CanvasInput.EDITOR_ID, [new SyncDescriptor(CanvasInput)]));
		const parts = await createEditorParts(instantiationService, store);
		store.add(parts.onDidAddGroup(group => {
			for (const input of group.editors) {
				if (input instanceof TestFileEditorInput) {
					store.add(input);
				}
			}
		}));
		instantiationService.stub(IEditorGroupsService, parts);
		const editorService = store.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);
		harness.instaService.stub(IEditorGroupsService, parts);
		harness.instaService.stub(IEditorService, editorService);
		harness.instaService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
			sentiment: { hidden: false }, onDidChangeSentiment: Event.None,
		}));
		const configurationService = harness.instaService.invokeFunction(accessor => accessor.get(IConfigurationService)) as TestConfigurationService;
		await configurationService.setUserConfiguration(CanvasesEnabledSettingId, true);
		harness.instaService.stub(INotificationService, new TestNotificationService());
		harness.instaService.stub(IChatService, upcastPartial<IChatService>({ chatModels: constObservable([]), getSession: () => undefined }));
		store.add(harness.instaService.createInstance(TestCanvasLayoutController));
		harness.instaService.stub(ICanvasContextService, store.add(harness.instaService.createInstance(SessionCanvasContextService)));
		const canvasService = store.add(harness.instaService.createInstance(CanvasService));
		instantiationService.stub(ICanvasService, canvasService);
		store.add(factoryRegistry.registerEditorSerializer(CanvasInput.ID, SessionCanvasSerializer));
		const canvas: ISessionCanvas = {
			resource: URI.parse('test-canvas:/preview'),
			instanceId: 'preview',
			title: 'Preview',
			source: URI.parse('http://127.0.0.1:12345/?token=live-only'),
		};
		const originalSession = makeSession(URI.parse('session:A'));
		const canvases = observableValue<readonly ISessionCanvas[] | undefined>('canvases', [canvas]);
		const chat: IChat = { ...originalSession.mainChat.get(), resource: URI.parse('chat:A'), canvases };
		const sessionA = {
			...originalSession,
			mainChat: constObservable(chat),
			activeChat: observableValue('activeChat', chat),
			capabilities: constObservable({ supportsMultipleChats: false, supportsCanvases: true }),
		};
		harness.activeSessionObs.set(sessionA, undefined);
		await timeout(0);
		const file = store.add(new TestFileEditorInput(URI.file('/repo/file.txt'), 'canvas-working-set-file'));
		await editorService.openEditor(file, { pinned: true, inactive: true });
		const originalCanvas = editorService.editors.find(input => input instanceof CanvasInput);
		assert.ok(originalCanvas);
		assert.ok(originalCanvas.serializationId);
		const sessionB = makeSession(URI.parse('session:B'));
		const switchTo = async (session: typeof sessionB) => {
			harness.activeSessionObs.set(session, undefined);
			await timeout(0);
		};
		return { harness, instantiationService, parts, editorService, canvasService, canvas, canvases, sessionA, sessionB, originalCanvas, file, switchTo };
	}

	for (const mode of ['session-shared', 'chat-shared', 'chat'] as const) {
		test(`restores a live canvas and ordinary editor automatically after A-B-A (${mode})`, async () => {
			const { harness, parts, editorService, canvasService, sessionA, sessionB, originalCanvas, switchTo } = await createHarness(mode);
			await parts.activeGroup.setSelection(originalCanvas, []);
			const layout = parts.getLayout();
			const focus = document.createElement('input');
			document.body.appendChild(focus);
			store.add(toDisposable(() => focus.remove()));
			focus.focus();

			await switchTo(sessionB);
			const sessionBEditors = editorService.editors.length;
			await switchTo(sessionA);

			assert.deepStrictEqual({
				sessionBEditors,
				editors: editorService.editors.map(input => input.typeId),
				activeEditor: editorService.activeEditor?.typeId,
				selection: parts.activeGroup.selectedEditors.map(input => input.typeId),
				layout: parts.getLayout(),
				reopenable: canvasService.reopenableCanvases.get().length,
				canonical: (editorService.activeEditor as CanvasInput | undefined)?.serializationId === originalCanvas.serializationId,
				editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
				focusPreserved: document.activeElement === focus,
			}, {
				sessionBEditors: 0,
				editors: [CanvasInput.ID, 'canvas-working-set-file'],
				activeEditor: CanvasInput.ID,
				selection: [CanvasInput.ID],
				layout,
				reopenable: 0,
				canonical: true,
				editorVisible: true,
				focusPreserved: true,
			});
		});
	}

	test('a newly advertised incoming canvas opens within the settled working-set transition', async () => {
		const { canvas, editorService, canvasService, sessionA, sessionB, switchTo } = await createHarness();
		const incomingCanvas = { ...canvas, resource: URI.parse('test-canvas:/incoming'), title: 'Incoming' };
		const chat = { ...sessionB.mainChat.get(), canvases: constObservable([incomingCanvas]) };
		const incomingSession = {
			...sessionB,
			mainChat: constObservable(chat),
			activeChat: observableValue('activeChat', chat),
			capabilities: constObservable({ supportsMultipleChats: false, supportsCanvases: true }),
		};
		await switchTo(incomingSession);
		const incomingEditors = editorService.editors.map(input => input.getName());
		await switchTo(sessionA);
		await switchTo(incomingSession);
		assert.deepStrictEqual({
			incomingEditors,
			editorsAfterReturn: editorService.editors.map(input => input.getName()),
			reopenable: canvasService.reopenableCanvases.get().length,
		}, { incomingEditors: ['Incoming'], editorsAfterReturn: ['Incoming'], reopenable: 0 });
	});

	test('a canvas advertised while working-set application is pending waits for the transaction to settle', async () => {
		const { canvas, harness, parts, editorService, canvasService, sessionB } = await createHarness();
		const incomingCanvas = { ...canvas, resource: URI.parse('test-canvas:/incoming-pending'), title: 'Incoming Pending' };
		const incomingCanvases = observableValue<readonly ISessionCanvas[] | undefined>('incomingCanvases', []);
		const chat = { ...sessionB.mainChat.get(), canvases: incomingCanvases };
		const incomingSession = {
			...sessionB,
			mainChat: constObservable(chat),
			activeChat: observableValue('activeChat', chat),
			capabilities: constObservable({ supportsMultipleChats: false, supportsCanvases: true }),
		};
		const applying = new DeferredPromise<void>();
		const gate = new DeferredPromise<void>();
		const applyWorkingSet = parts.applyWorkingSet;
		parts.applyWorkingSet = async (workingSet, options) => {
			applying.complete();
			await gate.p;
			return applyWorkingSet.call(parts, workingSet, options);
		};

		harness.activeSessionObs.set(incomingSession, undefined);
		await applying.p;
		incomingCanvases.set([incomingCanvas], undefined);
		const incomingVisibleWhileApplying = editorService.editors.some(input => input.getName() === incomingCanvas.title);
		gate.complete();
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual({
			incomingVisibleWhileApplying,
			editorsAfterApply: editorService.editors.map(input => input.getName()),
			reopenable: canvasService.reopenableCanvases.get().length,
		}, {
			incomingVisibleWhileApplying: false,
			editorsAfterApply: ['Incoming Pending'],
			reopenable: 0,
		});
	});

	test('returning before the intermediate workspace hydrates settles and restores the original owner', async () => {
		const { canvasService, editorService, harness, originalCanvas, sessionA, switchTo } = await createHarness();
		const otherWorkspace = {
			uri: URI.file('/other'),
			label: 'other',
			icon: Codicon.repo,
			folders: [{ root: URI.file('/other'), workingDirectory: URI.file('/other'), name: 'other', description: undefined, gitRepository: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const hydratingB = makeSession(URI.parse('session:B'), { workspace: otherWorkspace });

		await switchTo(hydratingB);
		const whileHydrating = harness.editorWorkingSetService.restoreState.get();
		await switchTo(sessionA);
		await canvasService.revealCanvas(originalCanvas.reference);
		const afterReturn = harness.editorWorkingSetService.restoreState.get();
		const canvasesAfterReturn = editorService.editors.filter(input => input instanceof CanvasInput).length;

		harness.workspaceFolders = [...harness.workspaceFolders, { uri: otherWorkspace.uri }];
		harness.onDidChangeWorkspaceFolders.fire();
		await timeout(0);

		assert.deepStrictEqual({
			whileHydrating: {
				owner: whileHydrating.owner?.sessionResource.toString(),
				restoring: whileHydrating.restoring,
			},
			afterReturn: {
				owner: afterReturn.owner?.sessionResource.toString(),
				restoring: afterReturn.restoring,
			},
			canvasesAfterReturn,
			afterLateHydration: {
				owner: harness.editorWorkingSetService.restoreState.get().owner?.sessionResource.toString(),
				restoring: harness.editorWorkingSetService.restoreState.get().restoring,
			},
		}, {
			whileHydrating: { owner: 'session:B', restoring: true },
			afterReturn: { owner: 'session:A', restoring: false },
			canvasesAfterReturn: 1,
			afterLateHydration: { owner: 'session:A', restoring: false },
		});
	});

	test('restores canvases from sibling chats in a session-shared working set', async () => {
		const { canvas, editorService, sessionA, sessionB, switchTo } = await createHarness();
		const main = sessionA.activeChat.get();
		const peerCanvas = { ...canvas, resource: URI.parse('test-canvas:/peer'), title: 'Peer' };
		const peer: IChat = { ...main, resource: URI.parse('chat:peer'), canvases: constObservable([peerCanvas]) };
		(sessionA.chats as ISettableObservable<readonly IChat[]>).set([main, peer], undefined);
		(sessionA.activeChat as ISettableObservable<IChat>).set(peer, undefined);
		await timeout(0);
		const canvasesBeforeSwitch = editorService.editors
			.filter((input): input is CanvasInput => input instanceof CanvasInput)
			.map(input => input.reference.chat.toString())
			.sort();

		await switchTo(sessionB);
		await switchTo(sessionA);

		assert.deepStrictEqual({
			canvasesBeforeSwitch,
			canvasesAfterSwitch: editorService.editors
				.filter((input): input is CanvasInput => input instanceof CanvasInput)
				.map(input => input.reference.chat.toString())
				.sort(),
		}, {
			canvasesBeforeSwitch: ['chat:A', 'chat:peer'],
			canvasesAfterSwitch: ['chat:A', 'chat:peer'],
		});
	});

	test('restores a mixed split layout without revealing a hidden editor pane', async () => {
		const { harness, parts, editorService, sessionA, sessionB, switchTo } = await createHarness();
		const right = parts.addGroup(parts.activeGroup, GroupDirection.RIGHT);
		const file = store.add(new TestFileEditorInput(URI.file('/repo/right.txt'), 'canvas-working-set-file'));
		await editorService.openEditor(file, { pinned: true }, right);
		const layout = parts.getLayout();
		harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		await switchTo(sessionB);
		await switchTo(sessionA);
		assert.deepStrictEqual({
			layout: parts.getLayout(),
			groups: parts.groups.map(group => group.editors.map(input => input.typeId)),
			active: editorService.activeEditor?.resource?.toString(),
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
		}, {
			layout,
			groups: [[CanvasInput.ID, 'canvas-working-set-file'], ['canvas-working-set-file']],
			active: file.resource.toString(),
			editorVisible: false,
		});
	});

	test('restores a modal canvas into the main editor part without taking focus', async () => {
		const { harness, parts, editorService, sessionA, sessionB, switchTo } = await createHarness('session-shared', 'all');
		const focus = document.createElement('input');
		document.body.appendChild(focus);
		store.add(toDisposable(() => focus.remove()));
		harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		focus.focus();
		const modalBeforeSwitch = parts.activeModalEditorPart?.activeGroup.editors.some(input => input instanceof CanvasInput) === true;

		await switchTo(sessionB);
		await switchTo(sessionA);
		await timeout(0);

		assert.deepStrictEqual({
			modalBeforeSwitch,
			modalAfterSwitch: parts.activeModalEditorPart !== undefined,
			mainCanvases: parts.mainPart.activeGroup.editors.filter(input => input instanceof CanvasInput).length,
			activeEditor: editorService.activeEditor?.typeId,
			editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
			focusPreserved: document.activeElement === focus,
		}, {
			modalBeforeSwitch: true,
			modalAfterSwitch: false,
			mainCanvases: 1,
			activeEditor: CanvasInput.ID,
			editorVisible: false,
			focusPreserved: true,
		});
	});

	test('does not resurrect user dismissal after A-B-A but permits explicit Add Tab recovery', async () => {
		const { parts, editorService, canvasService, sessionA, sessionB, originalCanvas, switchTo } = await createHarness();
		await parts.activeGroup.closeEditor(originalCanvas);
		await switchTo(sessionB);
		await switchTo(sessionA);
		const afterSwitch = {
			editors: editorService.editors.map(input => input.typeId),
			reopenable: canvasService.reopenableCanvases.get().length,
		};
		await canvasService.reopenCanvas(originalCanvas.reference);
		assert.deepStrictEqual({
			afterSwitch,
			activeAfterExplicitReopen: editorService.activeEditor?.typeId,
			reopenableAfterExplicitReopen: canvasService.reopenableCanvases.get().length,
			newPresentation: (editorService.activeEditor as CanvasInput | undefined)?.serializationId !== originalCanvas.serializationId,
			genericReopenSupported: originalCanvas.canReopen(),
		}, {
			afterSwitch: { editors: ['canvas-working-set-file'], reopenable: 1 },
			activeAfterExplicitReopen: CanvasInput.ID,
			reopenableAfterExplicitReopen: 0,
			newPresentation: true,
			genericReopenSupported: false,
		});
	});

	test('restores inert live identity during hydration without retaining the old source', async () => {
		const { canvas, canvases, canvasService, editorService, sessionA, sessionB, switchTo } = await createHarness();
		await switchTo(sessionB);
		canvases.set(undefined, undefined);
		await switchTo(sessionA);
		const restored = editorService.editors.find(input => input instanceof CanvasInput);
		assert.ok(restored);
		const whileHydrating = {
			title: restored.canvas.get()?.title,
			source: restored.canvas.get()?.source,
			membershipPending: restored.membershipPending.get(),
		};
		canvases.set([{ ...canvas, instanceId: undefined, title: 'Canvas', source: undefined }], undefined);
		const pendingTitle = restored.getName();
		canvases.set([{ ...canvas, source: undefined }], undefined);
		const unavailableSource = restored.canvas.get()?.source;
		const unavailablePending = restored.membershipPending.get();
		const source = URI.parse('http://127.0.0.1:54321/?token=fresh');
		canvases.set([{ ...canvas, source }], undefined);
		const freshSource = restored.canvas.get()?.source;
		canvases.set([], undefined);
		await timeout(0);
		assert.deepStrictEqual({
			whileHydrating, pendingTitle, unavailableSource, unavailablePending, freshSource,
			remainingEditors: editorService.editors.map(input => input.typeId),
			reopenable: canvasService.reopenableCanvases.get().length,
		}, {
			whileHydrating: { title: 'Preview', source: undefined, membershipPending: true },
			pendingTitle: 'Preview',
			unavailableSource: undefined,
			unavailablePending: false,
			freshSource: source,
			remainingEditors: ['canvas-working-set-file'], reopenable: 0,
		});
	});

	for (const mode of ['chat-shared', 'chat'] as const) {
		test(`restores the exact chat owner when peer canvases share a resource (${mode})`, async () => {
			const { canvas, editorService, originalCanvas, sessionA } = await createHarness(mode);
			const main = sessionA.activeChat.get();
			const peer: IChat = { ...main, resource: URI.parse('opaque-chat:/peer'), canvases: constObservable([{ ...canvas, title: 'Peer' }]) };
			sessionA.activeChat.set(peer, undefined);
			await timeout(0);
			const peerEditors = editorService.editors.map(input => input.getName());
			sessionA.activeChat.set(main, undefined);
			await timeout(0);
			const restored = editorService.editors.find(input => input instanceof CanvasInput);
			assert.deepStrictEqual({
				peerEditors,
				mainEditors: editorService.editors.map(input => input.typeId),
				canonical: restored?.serializationId === originalCanvas.serializationId,
				exactChat: restored?.reference.chat.toString(),
			}, {
				peerEditors: ['Peer'],
				mainEditors: [CanvasInput.ID, 'canvas-working-set-file'],
				canonical: true, exactChat: main.resource.toString(),
			});
		});
	}

	test('deduplicates a restored input and concurrent explicit reveals', async () => {
		const { editorService, canvasService, sessionA, sessionB, originalCanvas, switchTo } = await createHarness();
		await switchTo(sessionB);
		await switchTo(sessionA);
		const canonical = editorService.editors.find(input => input instanceof CanvasInput);
		await Promise.all([
			canvasService.revealCanvas(originalCanvas.reference),
			canvasService.revealCanvas(originalCanvas.reference),
		]);
		assert.deepStrictEqual({
			canvases: editorService.editors.filter(input => input instanceof CanvasInput).length,
			canonical: canonical?.serializationId === originalCanvas.serializationId,
			originalDisposed: originalCanvas.isDisposed(),
		}, { canvases: 1, canonical: true, originalDisposed: true });
	});

	test('a superseded delayed working-set restore cannot reveal A over B', async () => {
		const { harness, parts, editorService, sessionA, sessionB, switchTo } = await createHarness();
		await switchTo(sessionB);
		const gate = new DeferredPromise<void>();
		const applying = new DeferredPromise<void>();
		const apply = parts.applyWorkingSet;
		parts.applyWorkingSet = async (workingSet, options) => {
			if (workingSet !== 'empty') {
				applying.complete();
				await gate.p;
			}
			return apply.call(parts, workingSet, options);
		};
		harness.activeSessionObs.set(sessionA, undefined);
		await applying.p;
		harness.activeSessionObs.set(sessionB, undefined);
		gate.complete();
		await timeout(0);
		await timeout(0);
		assert.deepStrictEqual({
			editors: editorService.editors.length,
			suppressionDepth: harness.editorPartAutoVisibilitySuppressionDepth,
		}, { editors: 0, suppressionDepth: 0 });
	});

	test('cold working-set identities cannot grant a fresh service live admission', async () => {
		const { harness, instantiationService, parts, editorService, canvasService, canvas, canvases, sessionA, sessionB, originalCanvas, switchTo } = await createHarness();
		await switchTo(sessionB);
		const stored = instantiationService.invokeFunction(accessor => accessor.get(IStorageService).get('editor.workingSets', StorageScope.WORKSPACE))!;
		const serializationId = originalCanvas.serializationId!;
		canvasService.dispose();
		canvases.set([{ ...canvas, source: undefined }], undefined);
		const freshService = store.add(harness.instaService.createInstance(CanvasService));
		instantiationService.stub(ICanvasService, freshService);
		await switchTo(sessionA);
		assert.deepStrictEqual({
			editors: editorService.editors.map(input => input.typeId),
			workingSets: parts.getWorkingSets().length,
			persistedTransientSource: stored.includes('127.0.0.1') || stored.includes('live-only'),
			persistedProviderIdentity: stored.includes(originalCanvas.reference.providerId),
			persistedChatIdentity: stored.includes(originalCanvas.reference.chat.toString()),
			persistedCanvasIdentity: stored.includes(originalCanvas.reference.canvas.toString()),
			persistedRuntimeCapability: stored.includes(serializationId),
		}, {
			editors: ['canvas-working-set-file'], workingSets: 1,
			persistedTransientSource: false,
			persistedProviderIdentity: false,
			persistedChatIdentity: false,
			persistedCanvasIdentity: false,
			persistedRuntimeCapability: true,
		});
	});
});
