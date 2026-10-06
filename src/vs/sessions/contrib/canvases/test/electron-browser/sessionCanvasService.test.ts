/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorIdentifier, ITextDiffEditorPane } from '../../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionCanvas, ISessionCapabilities } from '../../../../services/sessions/common/session.js';
import { IActiveSession, IChatDeletedEvent, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { REVEAL_SESSION_CANVAS_COMMAND_ID, SessionCanvasInput } from '../../common/sessionCanvas.js';
import { registerSessionCanvasActions, REOPEN_SESSION_CANVAS_COMMAND_ID } from '../../electron-browser/sessionCanvasActions.js';
import { SessionCanvasService } from '../../electron-browser/sessionCanvasService.js';

suite('SessionCanvasService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(canvasesEnabled = true, initialCanvases?: readonly ISessionCanvas[]) {
		const sessionResource = URI.parse('agent-host-session:/session');
		const chatResource = URI.parse('agent-host-chat:/session/main');
		const canvas: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/preview'),
			instanceId: 'preview',
			title: 'Preview',
			source: URI.parse('https://example.test/preview'),
		};
		const canvases = observableValue<readonly ISessionCanvas[] | undefined>('canvases', initialCanvases ?? [canvas]);
		const chat = upcastPartial<IChat>({ resource: chatResource, canvases });
		const activeChat = observableValue<IChat>('activeChat', chat);
		const capabilities = observableValue<ISessionCapabilities>('capabilities', { supportsCanvases: true, supportsMultipleChats: false });
		const session = upcastPartial<IActiveSession>({
			providerId: 'local-agent-host',
			resource: sessionResource,
			activeChat,
			capabilities,
		});
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const sessionsService = upcastPartial<ISessionsService>({ activeSession });
		const sessionChanges = store.add(new Emitter<ISessionsChangeEvent>());
		const chatDeleted = store.add(new Emitter<IChatDeletedEvent>());
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({ onDidChangeSessions: sessionChanges.event, onDidDeleteChat: chatDeleted.event });
		const opened: SessionCanvasInput[] = [];
		const openOptions: unknown[] = [];
		const openSettled: Promise<void>[] = [];
		let openEditorHandler = (input: SessionCanvasInput) => Promise.resolve<ITextDiffEditorPane | undefined>(upcastPartial<ITextDiffEditorPane>({ input }));
		let findEditorsHandler = (_resource: URI): readonly IEditorIdentifier[] => [];
		let closeEditorsHandler = () => Promise.resolve();
		const closeSettled: Promise<void>[] = [];
		let closeCount = 0;
		const editorService = new class extends mock<IEditorService>() {
			override openEditor(...args: unknown[]): Promise<ITextDiffEditorPane | undefined> {
				const input = args[0] as SessionCanvasInput;
				opened.push(input);
				openOptions.push(args[1]);
				const result = openEditorHandler(input);
				openSettled.push(result.then(() => undefined, () => undefined));
				return result;
			}
			override findEditors(...args: unknown[]): readonly IEditorIdentifier[] {
				return findEditorsHandler(args[0] as URI);
			}
			override closeEditors(): Promise<void> {
				closeCount++;
				const result = closeEditorsHandler();
				closeSettled.push(result.then(() => undefined, () => undefined));
				return result;
			}
		}();
		const sentimentChanged = store.add(new Emitter<void>());
		const entitlementService = upcastPartial<IChatEntitlementService>({
			sentiment: { hidden: false },
			onDidChangeSentiment: sentimentChanged.event,
		});
		const configurationService = new TestConfigurationService({ [CanvasesEnabledSettingId]: canvasesEnabled });
		const canvasService = store.add(new SessionCanvasService(
			sessionsService,
			sessionsManagementService,
			editorService,
			entitlementService,
			configurationService,
			new NullLogService(),
		));
		const setCanvasesEnabled = async (enabled: boolean) => {
			await configurationService.setUserConfiguration(CanvasesEnabledSettingId, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === CanvasesEnabledSettingId,
			}));
		};
		const setOpenEditorHandler = (handler: (input: SessionCanvasInput) => Promise<ITextDiffEditorPane | undefined>) => openEditorHandler = handler;
		const setFindEditorsHandler = (handler: (resource: URI) => readonly IEditorIdentifier[]) => findEditorsHandler = handler;
		const setCloseEditorsHandler = (handler: () => Promise<void>) => closeEditorsHandler = handler;
		const setHidden = () => {
			entitlementService.sentiment.hidden = true;
			sentimentChanged.fire();
		};
		return { activeChat, activeSession, canvas, canvasService, canvases, capabilities, chat, chatDeleted, closeSettled, opened, openOptions, openSettled, session, sessionChanges, get closeCount() { return closeCount; }, setCanvasesEnabled, setCloseEditorsHandler, setFindEditorsHandler, setHidden, setOpenEditorHandler };
	}

	test('automatically reveals a newly opened canvas', () => {
		const { openOptions } = createHarness();

		assert.deepStrictEqual(openOptions, [{ pinned: true, revealIfOpened: true, preserveFocus: false }]);
	});

	test('does not reveal Canvases while the setting is disabled', () => {
		const { opened } = createHarness(false);

		assert.deepStrictEqual(opened, []);
	});

	test('focuses an open canvas and reopens it after dismissal', async () => {
		const { canvasService, opened, openOptions, openSettled } = createHarness();
		const original = opened[0];
		await openSettled[0];
		await Promise.resolve();
		const registration = store.add(registerSessionCanvasActions(canvasService));
		const command = CommandsRegistry.getCommand(REVEAL_SESSION_CANVAS_COMMAND_ID);
		assert.ok(command);

		await command.handler(upcastPartial<ServicesAccessor>({}), original.reference);
		const focusedInput = opened[1];
		original.dispose();
		const reopenableAfterDismiss = canvasService.reopenableCanvases.get().length;
		await command.handler(upcastPartial<ServicesAccessor>({}), original.reference);
		registration.dispose();

		assert.deepStrictEqual({
			focusedExistingInput: focusedInput === original,
			reopenableAfterDismiss,
			reopenedWithNewInput: opened[2] !== original,
			openOptions,
			commandRegisteredAfterDispose: CommandsRegistry.getCommand(REVEAL_SESSION_CANVAS_COMMAND_ID) !== undefined,
		}, {
			focusedExistingInput: true,
			reopenableAfterDismiss: 1,
			reopenedWithNewInput: true,
			openOptions: [
				{ pinned: true, revealIfOpened: true, preserveFocus: false },
				{ pinned: true, revealIfOpened: true, preserveFocus: false },
				{ pinned: true, revealIfOpened: true, preserveFocus: false },
			],
			commandRegisteredAfterDispose: false,
		});
	});

	test('closes Canvases when the setting is disabled', async () => {
		const harness = createHarness();

		await harness.setCanvasesEnabled(false);

		assert.deepStrictEqual({ opened: harness.opened.length, closed: harness.closeCount }, { opened: 1, closed: 1 });
	});

	test('reopens a dismissed canvas from the Add Tab action state', async () => {
		const { canvasService, opened, openOptions } = createHarness();
		const original = opened[0];
		const reopenableInitially = canvasService.reopenableCanvases.get();

		original.dispose();
		const reopenableAfterDismiss = canvasService.reopenableCanvases.get();
		await canvasService.reopenCanvas(reopenableAfterDismiss[0].reference);

		assert.deepStrictEqual({
			reopenableInitially: reopenableInitially.length,
			reopenableAfterDismiss: reopenableAfterDismiss.map(target => ({
				title: target.canvas.title,
				instanceId: target.canvas.instanceId,
			})),
			reopenableAfterOpen: canvasService.reopenableCanvases.get().length,
			openCount: opened.length,
			reopenedResource: opened[1].reference.canvas.toString(),
			reopenedWithNewInput: opened[1] !== original,
			openOptions: openOptions[1],
		}, {
			reopenableInitially: 0,
			reopenableAfterDismiss: [{ title: 'Preview', instanceId: 'preview' }],
			reopenableAfterOpen: 0,
			openCount: 2,
			reopenedResource: 'agent-host-canvas:/preview',
			reopenedWithNewInput: true,
			openOptions: { pinned: true, revealIfOpened: true, preserveFocus: false },
		});
	});

	test('ignores a disposed matching editor when opening resolves undefined', async () => {
		const { canvasService, opened, setFindEditorsHandler, setOpenEditorHandler } = createHarness();
		const disposedInput = opened[0];
		disposedInput.dispose();
		const reopenable = canvasService.reopenableCanvases.get()[0];
		setOpenEditorHandler(() => Promise.resolve(undefined));
		setFindEditorsHandler(() => [upcastPartial<IEditorIdentifier>({ editor: disposedInput, groupId: 1 })]);

		await assert.rejects(canvasService.reopenCanvas(reopenable.reference), /Canvas editor failed to open/);

		assert.deepStrictEqual({
			openCount: opened.length,
			reopenable: canvasService.reopenableCanvases.get().map(target => target.canvas.resource.toString()),
		}, {
			openCount: 2,
			reopenable: ['agent-host-canvas:/preview'],
		});
	});

	test('cleans up after close rejection so the same canvas can open again', async () => {
		const { canvas, canvasService, canvases, closeSettled, opened, setCloseEditorsHandler } = createHarness();
		const original = opened[0];
		setCloseEditorsHandler(() => Promise.reject(new Error('close failed')));

		canvases.set([], undefined);
		await closeSettled[closeSettled.length - 1];
		setCloseEditorsHandler(() => Promise.resolve());
		canvases.set([canvas], undefined);

		assert.deepStrictEqual({
			originalDisposed: original.isDisposed(),
			openCount: opened.length,
			openedWithNewInput: opened[1] !== original,
			reopenable: canvasService.reopenableCanvases.get().length,
		}, {
			originalDisposed: true,
			openCount: 2,
			openedWithNewInput: true,
			reopenable: 0,
		});
	});

	test('accepts an undefined result when the canvas editor is already open', async () => {
		const { canvasService, opened, setFindEditorsHandler, setOpenEditorHandler } = createHarness();
		opened[0].dispose();
		const reopenable = canvasService.reopenableCanvases.get()[0];
		let openedInput: SessionCanvasInput | undefined;
		setOpenEditorHandler(input => {
			openedInput = input;
			return Promise.resolve(undefined);
		});
		setFindEditorsHandler(() => openedInput
			? [upcastPartial<IEditorIdentifier>({ editor: openedInput, groupId: 1 })]
			: []);

		await canvasService.reopenCanvas(reopenable.reference);

		assert.deepStrictEqual({
			openCount: opened.length,
			reopenable: canvasService.reopenableCanvases.get().length,
		}, {
			openCount: 2,
			reopenable: 0,
		});
	});

	test('restores dismissal when reopening fails after switching chats', async () => {
		const { activeChat, canvasService, chat, opened, setOpenEditorHandler } = createHarness();
		opened[0].dispose();
		const reopenable = canvasService.reopenableCanvases.get()[0];
		const failedOpen = new DeferredPromise<undefined>();
		setOpenEditorHandler(() => failedOpen.p);

		const reopenRejected = assert.rejects(canvasService.reopenCanvas(reopenable.reference), /open failed/);
		activeChat.set(upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/other'),
			canvases: observableValue<readonly ISessionCanvas[] | undefined>('otherCanvases', []),
		}), undefined);
		await failedOpen.error(new Error('open failed'));
		await reopenRejected;
		activeChat.set(chat, undefined);

		assert.deepStrictEqual({
			openCount: opened.length,
			reopenable: canvasService.reopenableCanvases.get().map(target => target.canvas.resource.toString()),
		}, {
			openCount: 2,
			reopenable: ['agent-host-canvas:/preview'],
		});
	});

	test('does not let an older failed open clear a newer presentation', async () => {
		const { canvas, canvasService, canvases, opened, setOpenEditorHandler } = createHarness();
		opened[0].dispose();
		const reopenable = canvasService.reopenableCanvases.get()[0];
		const failedOpen = new DeferredPromise<undefined>();
		setOpenEditorHandler(() => failedOpen.p);

		const reopenRejected = assert.rejects(canvasService.reopenCanvas(reopenable.reference), /open failed/);
		canvases.set([], undefined);
		setOpenEditorHandler(input => Promise.resolve(upcastPartial<ITextDiffEditorPane>({ input })));
		canvases.set([canvas], undefined);
		await failedOpen.error(new Error('open failed'));
		await reopenRejected;
		canvases.set([{ ...canvas, status: 'updated' }], undefined);

		assert.deepStrictEqual({
			openCount: opened.length,
			reopenable: canvasService.reopenableCanvases.get().length,
		}, {
			openCount: 3,
			reopenable: 0,
		});
	});

	test('offers an automatically failed canvas reveal for manual reopening', async () => {
		const { canvas, canvasService, canvases, opened, openSettled, setOpenEditorHandler } = createHarness();
		const failedCanvas: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/failed'),
			instanceId: 'failed',
			title: 'Failed Preview',
			source: URI.parse('https://example.test/failed'),
		};
		const failedOpen = new DeferredPromise<undefined>();
		setOpenEditorHandler(() => failedOpen.p);

		canvases.set([canvas, failedCanvas], undefined);
		await failedOpen.error(new Error('automatic open failed'));
		await openSettled.at(-1);
		await Promise.resolve();
		canvases.set([canvas, { ...failedCanvas, status: 'retry' }], undefined);

		assert.deepStrictEqual({
			openCount: opened.length,
			reopenable: canvasService.reopenableCanvases.get().map(target => target.canvas.resource.toString()),
		}, {
			openCount: 2,
			reopenable: ['agent-host-canvas:/failed'],
		});
	});

	test('contributes titled canvas instances to the right pane Add Tab menu', async () => {
		const canvases: ISessionCanvas[] = [
			{ resource: URI.parse('agent-host-canvas:/preview-editor'), instanceId: 'editor', title: 'Preview', source: URI.parse('https://example.test/editor') },
			{ resource: URI.parse('agent-host-canvas:/preview-sidebar'), instanceId: 'sidebar', title: 'Preview', source: URI.parse('https://example.test/sidebar') },
			{ resource: URI.parse('agent-host-canvas:/preview-editor-title'), instanceId: 'dashboard', title: 'Preview (editor)', source: URI.parse('https://example.test/editor-title') },
			{ resource: URI.parse('agent-host-canvas:/dashboard'), instanceId: 'dashboard', title: 'Dashboard', source: URI.parse('https://example.test/dashboard') },
			{ resource: URI.parse('agent-host-canvas:/logs-numbered'), instanceId: undefined, title: 'Logs', source: URI.parse('https://example.test/logs-numbered') },
			{ resource: URI.parse('agent-host-canvas:/logs-semantic'), instanceId: '1', title: 'Logs', source: URI.parse('https://example.test/logs-semantic') },
		];
		const { canvasService, canvases: canvasStates, opened } = createHarness(true, canvases);
		const registration = store.add(registerSessionCanvasActions(canvasService));
		for (const input of [...opened]) {
			input.dispose();
		}
		const getItems = () => MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTab)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(`${REOPEN_SESSION_CANVAS_COMMAND_ID}.`))
			.sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
		const items = getItems();
		const initialCommandIds = items.map(item => item.command.id);
		const when = items[0].when?.serialize() ?? '';
		canvasStates.set(canvases.map((canvas, index) => index === 1 ? { ...canvas, title: 'Preview Updated' } : canvas), undefined);
		const refreshedItems = getItems();
		await CommandsRegistry.getCommand(items[1].command.id)!.handler(upcastPartial<ServicesAccessor>({}));
		const remainingItems = getItems();
		const remainingTitles = remainingItems.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value);
		const remainingCommandIds = remainingItems.map(item => item.command.id);
		const staleCommandsRegistered = initialCommandIds.map(id => CommandsRegistry.getCommand(id) !== undefined);
		registration.dispose();

		assert.deepStrictEqual({
			titles: items.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value),
			groups: items.map(item => item.group),
			requiresChat: when.includes(ChatContextKeys.enabled.key),
			requiresSessionsWindow: when.includes(IsSessionsWindowContext.key),
			excludesAuxiliaryWindow: when.includes(`!${IsAuxiliaryWindowContext.key}`),
			requiresRightPane: when.includes(IsTopRightEditorGroupContext.key),
			reopenedResource: opened.at(-1)?.reference.canvas.toString(),
			refreshedCommandIds: refreshedItems.map(item => item.command.id),
			refreshedTitles: refreshedItems.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value),
			remainingTitles,
			initialCommandsRegisteredAfterReopen: staleCommandsRegistered,
			itemsAfterDispose: getItems().length,
			remainingCommandsAfterDispose: remainingCommandIds.map(id => CommandsRegistry.getCommand(id) !== undefined),
		}, {
			titles: ['Preview (editor, 2)', 'Preview (sidebar)', 'Preview (editor)', 'Dashboard', 'Logs (1)', 'Logs (1, 2)'],
			groups: ['navigation', 'navigation', 'navigation', 'navigation', 'navigation', 'navigation'],
			requiresChat: true,
			requiresSessionsWindow: true,
			excludesAuxiliaryWindow: true,
			requiresRightPane: true,
			reopenedResource: 'agent-host-canvas:/preview-sidebar',
			refreshedCommandIds: initialCommandIds,
			refreshedTitles: ['Preview', 'Preview Updated', 'Preview (editor)', 'Dashboard', 'Logs (1)', 'Logs (1, 2)'],
			remainingTitles: ['Preview', 'Preview (editor)', 'Dashboard', 'Logs (1)', 'Logs (1, 2)'],
			initialCommandsRegisteredAfterReopen: [true, false, true, true, true, true],
			itemsAfterDispose: 0,
			remainingCommandsAfterDispose: [false, false, false, false, false],
		});
	});

	test('forgets a dismissed canvas when the provider removes its membership', () => {
		const { canvas, canvases, opened } = createHarness();
		opened[0].dispose();

		canvases.set([], undefined);
		canvases.set([canvas], undefined);

		assert.strictEqual(opened.length, 2);
	});

	test('forgets dismissed canvases when the owning session disappears', () => {
		const { activeSession, opened, session, sessionChanges } = createHarness();
		opened[0].dispose();
		activeSession.set(undefined, undefined);

		sessionChanges.fire({ added: [], changed: [], removed: [session] });
		activeSession.set(session, undefined);

		assert.strictEqual(opened.length, 2);
	});

	test('metadata and source changes do not reveal a dismissed canvas', () => {
		const { canvas, canvases, opened } = createHarness();
		opened[0].dispose();
		canvases.set([{ ...canvas, title: 'Updated', source: URI.parse('https://example.test/replacement') }], undefined);
		assert.strictEqual(opened.length, 1);
	});

	test('metadata and source changes do not repeatedly reveal an open canvas', () => {
		const { canvas, canvases, opened } = createHarness();
		canvases.set([{ ...canvas, title: 'Updated', source: URI.parse('https://example.test/replacement') }], undefined);
		assert.strictEqual(opened.length, 1);
	});

	test('temporary membership and canvas hydration do not forget dismissal', () => {
		const { canvas, canvases, opened } = createHarness();
		opened[0].dispose();
		canvases.set(undefined, undefined);
		canvases.set([{ ...canvas, instanceId: undefined, source: undefined }], undefined);
		canvases.set([canvas], undefined);
		assert.strictEqual(opened.length, 1);
	});

	test('keeps runtime admission during suspension and restores a canonical input through hydration', async () => {
		const { canvas, canvasService, canvases, closeSettled, opened, openSettled } = createHarness();
		await openSettled[0];
		const original = opened[0];
		await original.suspendForWorkingSet();
		canvases.set(undefined, undefined);
		const restored = canvasService.restoreCanvasInput(original.reference);
		assert.ok(restored);
		const pendingCanvas = restored.canvas.get();
		canvases.set([canvas], undefined);
		const hydrated = restored.canvas.get();
		canvases.set([], undefined);
		await closeSettled.at(-1);
		assert.deepStrictEqual({
			originalDisposed: original.isDisposed(),
			pendingCanvas,
			hydratedSource: hydrated?.source,
			restoredDisposed: restored.isDisposed(),
			removedRestore: canvasService.restoreCanvasInput(original.reference),
			reopenable: canvasService.reopenableCanvases.get().length,
		}, {
			originalDisposed: true, pendingCanvas: undefined, hydratedSource: canvas.source,
			restoredDisposed: true, removedRestore: undefined, reopenable: 0,
		});
	});

	test('never restores an old source while unavailable and follows fresh live sources', async () => {
		const { canvas, canvasService, canvases, opened, openSettled } = createHarness();
		await openSettled[0];
		const original = opened[0];
		await original.suspendForWorkingSet();
		canvases.set([{ ...canvas, source: undefined }], undefined);
		const restored = canvasService.restoreCanvasInput(original.reference);
		const unavailableSource = restored?.canvas.get()?.source;
		const source = URI.parse('http://127.0.0.1:54321/?token=fresh');
		canvases.set([{ ...canvas, source }], undefined);
		assert.deepStrictEqual({
			unavailableSource,
			freshSource: restored?.canvas.get()?.source,
			canonical: canvasService.restoreCanvasInput(original.reference) === restored,
			automaticOpens: opened.length,
		}, { unavailableSource: undefined, freshSource: source, canonical: true, automaticOpens: 1 });
	});

	for (const invalidation of ['canvasDisabled', 'aiHidden', 'unsupported', 'sessionRemoved', 'chatDeleted'] as const) {
		test(`invalidates suspended admission when ${invalidation}`, async () => {
			const harness = createHarness();
			await harness.openSettled[0];
			const original = harness.opened[0];
			await original.suspendForWorkingSet();
			if (invalidation === 'canvasDisabled') {
				await harness.setCanvasesEnabled(false);
			} else if (invalidation === 'aiHidden') {
				harness.setHidden();
			} else if (invalidation === 'unsupported') {
				harness.capabilities.set({ supportsCanvases: false, supportsMultipleChats: false }, undefined);
			} else if (invalidation === 'sessionRemoved') {
				harness.sessionChanges.fire({ added: [], changed: [], removed: [harness.session] });
			} else {
				harness.chatDeleted.fire({
					session: harness.session, sessionResource: harness.session.resource, chatResource: harness.chat.resource,
				});
			}
			assert.deepStrictEqual({
				restored: harness.canvasService.restoreCanvasInput(original.reference),
				automaticOpens: harness.opened.length,
				reopenable: harness.canvasService.reopenableCanvases.get().length,
			}, { restored: undefined, automaticOpens: 1, reopenable: 0 });
		});
	}

	test('rejects references for inactive owners and different provider identities', async () => {
		const { activeSession, canvasService, opened, openSettled, session } = createHarness();
		await openSettled[0];
		const original = opened[0];
		await original.suspendForWorkingSet();
		const altered = canvasService.restoreCanvasInput({ ...original.reference, providerId: 'other-provider' });
		activeSession.set(undefined, undefined);
		const inactive = canvasService.restoreCanvasInput(original.reference);
		activeSession.set(session, undefined);
		const current = canvasService.restoreCanvasInput(original.reference);
		assert.deepStrictEqual({
			altered, inactive, current: !!current, canonical: canvasService.restoreCanvasInput(original.reference) === current,
		}, { altered: undefined, inactive: undefined, current: true, canonical: true });
	});

	test('late disposal of a replaced input cannot clear the newer canonical presentation', async () => {
		const { canvas, canvasService, canvases, closeSettled, opened, openSettled, setCloseEditorsHandler } = createHarness();
		await openSettled[0];
		const original = opened[0];
		const gate = new DeferredPromise<void>();
		setCloseEditorsHandler(() => gate.p);
		canvases.set([], undefined);
		canvases.set([canvas], undefined);
		await openSettled.at(-1);
		const replacement = opened.at(-1);
		gate.complete();
		await closeSettled.at(-1);
		assert.deepStrictEqual({
			originalDisposed: original.isDisposed(),
			replacementDisposed: replacement?.isDisposed(),
			canonical: canvasService.restoreCanvasInput(original.reference) === replacement,
			reopenable: canvasService.reopenableCanvases.get().length,
		}, { originalDisposed: true, replacementDisposed: false, canonical: true, reopenable: 0 });
	});

	test('a delayed automatic open is suspended rather than left visible over another owner', async () => {
		const { activeSession, canvas, canvasService, canvases, closeSettled, opened, openSettled, setOpenEditorHandler } = createHarness();
		await openSettled[0];
		const gate = new DeferredPromise<ITextDiffEditorPane | undefined>();
		setOpenEditorHandler(() => gate.p);
		canvases.set([canvas, { ...canvas, resource: URI.parse('agent-host-canvas:/delayed') }], undefined);
		const delayed = opened[1];
		activeSession.set(undefined, undefined);
		gate.complete(upcastPartial<ITextDiffEditorPane>({ input: delayed }));
		await openSettled.at(-1);
		await closeSettled.at(-1);
		assert.deepStrictEqual({
			disposed: delayed.isDisposed(),
			staleRestore: canvasService.restoreCanvasInput(delayed.reference),
		}, { disposed: true, staleRestore: undefined });
	});

	test('a failed live open cannot authorize restoration and can be explicitly retried', async () => {
		const { canvas, canvasService, canvases, opened, openSettled, setOpenEditorHandler } = createHarness();
		await openSettled[0];
		const gate = new DeferredPromise<ITextDiffEditorPane | undefined>();
		setOpenEditorHandler(() => gate.p);
		canvases.set([canvas, { ...canvas, resource: URI.parse('agent-host-canvas:/retry') }], undefined);
		const pending = opened[1];
		const pendingRestore = canvasService.restoreCanvasInput(pending.reference);
		await gate.error(new Error('open failed'));
		await openSettled.at(-1);
		await Promise.resolve();
		const failedRestore = canvasService.restoreCanvasInput(pending.reference);
		setOpenEditorHandler(input => Promise.resolve(upcastPartial<ITextDiffEditorPane>({ input })));
		await canvasService.reopenCanvas(pending.reference);
		assert.deepStrictEqual({
			pendingRestore,
			failedRestore,
			canonical: canvasService.restoreCanvasInput(pending.reference) === opened.at(-1),
			reopenable: canvasService.reopenableCanvases.get().length,
		}, { pendingRestore: undefined, failedRestore: undefined, canonical: true, reopenable: 0 });
	});

	test('an exact suspended-input resumption never suppresses a newer user dismissal', async () => {
		const { canvasService, opened, openSettled } = createHarness();
		await openSettled[0];
		const original = opened[0];
		const resume = await original.suspendForWorkingSet();
		const restored = canvasService.restoreCanvasInput(original.reference);
		assert.ok(restored);
		restored.dispose();
		await resume?.();
		assert.deepStrictEqual({
			opens: opened.length,
			reopenable: canvasService.reopenableCanvases.get().length,
			restored: canvasService.restoreCanvasInput(original.reference),
		}, { opens: 1, reopenable: 1, restored: undefined });
	});

	test('failed transaction resumption leaves an explicit retry instead of false live admission', async () => {
		const { canvasService, opened, openSettled, setOpenEditorHandler } = createHarness();
		await openSettled[0];
		const original = opened[0];
		const resume = await original.suspendForWorkingSet();
		assert.ok(resume);
		setOpenEditorHandler(() => Promise.reject(new Error('resume failed')));
		await assert.rejects(resume(), /resume failed/);
		const failedRestore = canvasService.restoreCanvasInput(original.reference);
		const retryAvailable = canvasService.reopenableCanvases.get().length;
		setOpenEditorHandler(input => Promise.resolve(upcastPartial<ITextDiffEditorPane>({ input })));
		await canvasService.reopenCanvas(original.reference);
		assert.deepStrictEqual({
			failedRestore, retryAvailable,
			canonical: canvasService.restoreCanvasInput(original.reference) === opened.at(-1),
			reopenable: canvasService.reopenableCanvases.get().length,
		}, { failedRestore: undefined, retryAvailable: 1, canonical: true, reopenable: 0 });
	});
});
