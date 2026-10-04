/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
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
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionCanvasInput } from '../../common/sessionCanvas.js';
import { registerSessionCanvasAddTabActions, REOPEN_SESSION_CANVAS_COMMAND_ID } from '../../electron-browser/sessionCanvasActions.js';
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
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({ onDidChangeSessions: sessionChanges.event });
		const opened: SessionCanvasInput[] = [];
		const openOptions: unknown[] = [];
		const openSettled: Promise<void>[] = [];
		let openEditorHandler = (input: SessionCanvasInput) => Promise.resolve<ITextDiffEditorPane | undefined>(upcastPartial<ITextDiffEditorPane>({ input }));
		let findEditorsHandler = (_resource: URI): readonly IEditorIdentifier[] => [];
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
			override async closeEditors(): Promise<void> {
				closeCount++;
			}
		}();
		const entitlementService = upcastPartial<IChatEntitlementService>({
			sentiment: { hidden: false },
			onDidChangeSentiment: Event.None,
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
		return { activeChat, activeSession, canvas, canvasService, canvases, chat, opened, openOptions, openSettled, session, sessionChanges, get closeCount() { return closeCount; }, setCanvasesEnabled, setFindEditorsHandler, setOpenEditorHandler };
	}

	test('automatically reveals a newly opened canvas', () => {
		const { openOptions } = createHarness();

		assert.deepStrictEqual(openOptions, [{ pinned: true, revealIfOpened: true, preserveFocus: false }]);
	});

	test('does not reveal Canvases while the setting is disabled', () => {
		const { opened } = createHarness(false);

		assert.deepStrictEqual(opened, []);
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

	test('restores dismissal when opening resolves undefined without an open editor', async () => {
		const { canvasService, opened, setOpenEditorHandler } = createHarness();
		opened[0].dispose();
		const reopenable = canvasService.reopenableCanvases.get()[0];
		setOpenEditorHandler(() => Promise.resolve(undefined));

		await assert.rejects(canvasService.reopenCanvas(reopenable.reference), /Canvas editor failed to open/);

		assert.deepStrictEqual({
			openCount: opened.length,
			reopenable: canvasService.reopenableCanvases.get().map(target => target.canvas.resource.toString()),
		}, {
			openCount: 2,
			reopenable: ['agent-host-canvas:/preview'],
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
		const registration = store.add(registerSessionCanvasAddTabActions(canvasService));
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
});
