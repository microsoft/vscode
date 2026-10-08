/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorIdentifier, ITextDiffEditorPane } from '../../../../../workbench/common/editor.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionCanvas, ISessionCapabilities } from '../../../../services/sessions/common/session.js';
import { IActiveSession, IChatDeletedEvent, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionEditorWorkingSetOwner, SessionEditorWorkingSetService } from '../../../layout/common/sessionEditorWorkingSet.js';
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
		const chats = observableValue<readonly IChat[]>('chats', [chat]);
		const capabilities = observableValue<ISessionCapabilities>('capabilities', { supportsCanvases: true, supportsMultipleChats: false });
		const isArchived = observableValue('isArchived', false);
		const session = upcastPartial<IActiveSession>({
			providerId: 'local-agent-host',
			resource: sessionResource,
			activeChat,
			chats,
			capabilities,
			isArchived,
		});
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const sessionsService = upcastPartial<ISessionsService>({ activeSession });
		const sessionChanges = store.add(new Emitter<ISessionsChangeEvent>());
		const chatDeleted = store.add(new Emitter<IChatDeletedEvent>());
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: sessionChanges.event,
			onDidDeleteChat: chatDeleted.event,
		});
		const opened: SessionCanvasInput[] = [];
		const openOptions: unknown[] = [];
		const openSettled: Promise<void>[] = [];
		let openEditorHandler = (input: SessionCanvasInput) => Promise.resolve<ITextDiffEditorPane | undefined>(upcastPartial<ITextDiffEditorPane>({ input }));
		let findEditorsHandler = (_resource: URI): readonly IEditorIdentifier[] => [];
		let closeEditorsHandler = () => Promise.resolve();
		let createBrowserModelHandler = (_url: string, _openSource: string | undefined) => Promise.reject<IBrowserViewModel>(new Error('Browser model creation was not configured'));
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
		const entitlementService = upcastPartial<IChatEntitlementService>({
			sentiment: { hidden: false },
			onDidChangeSentiment: Event.None,
		});
		const configurationService = new TestConfigurationService({ [CanvasesEnabledSettingId]: canvasesEnabled });
		const editorWorkingSetService = new SessionEditorWorkingSetService();
		editorWorkingSetService.setCurrentOwner({ sessionResource, chatResource: undefined });
		const editorGroup = upcastPartial<IEditorGroup>({ id: 1 });
		const canvasService = store.add(new SessionCanvasService(
			sessionsService,
			sessionsManagementService,
			editorService,
			upcastPartial<IBrowserViewWorkbenchService>({
				createExternalBrowserView: (url, openSource) => createBrowserModelHandler(url, openSource),
			}),
			upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorGroupsService['mainPart']>({ activeGroup: editorGroup }) }),
			upcastPartial<IAgentWorkbenchLayoutService>({ suppressEditorPartAutoVisibility: () => Disposable.None }),
			editorWorkingSetService,
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
		const setCreateBrowserModelHandler = (handler: (url: string, openSource: string | undefined) => Promise<IBrowserViewModel>) => createBrowserModelHandler = handler;
		return { activeChat, activeSession, canvas, canvasService, canvases, chat, chatDeleted, chats, closeSettled, editorWorkingSetService, isArchived, opened, openOptions, openSettled, session, sessionChanges, get closeCount() { return closeCount; }, setCanvasesEnabled, setCloseEditorsHandler, setCreateBrowserModelHandler, setFindEditorsHandler, setOpenEditorHandler };
	}

	function owner(session: IActiveSession, chatResource?: URI): ISessionEditorWorkingSetOwner {
		return { sessionResource: session.resource, chatResource };
	}

	test('automatically reveals a newly opened canvas', () => {
		const { openOptions } = createHarness();

		assert.deepStrictEqual(openOptions, [{ pinned: true, revealIfOpened: true, preserveFocus: false }]);
	});

	test('registers live canvas inputs for retention across Details-only layout collapse', async () => {
		const { editorWorkingSetService, opened, openSettled } = createHarness();
		await openSettled[0];
		const input = opened[0];
		const retainedWhileLive = editorWorkingSetService.shouldRetainEditor(input);
		input.dispose();

		assert.deepStrictEqual({
			retainedWhileLive,
			retainedAfterDispose: editorWorkingSetService.shouldRetainEditor(input),
		}, {
			retainedWhileLive: true,
			retainedAfterDispose: false,
		});
	});

	test('retains the same browser model across a working-set suspension and restore', async () => {
		const harness = createHarness();
		await harness.openSettled[0];
		await Promise.resolve();
		const original = harness.opened[0];
		const serializationId = original.serializationId;
		assert.ok(serializationId);
		let createCount = 0;
		let disposed = false;
		const onWillDispose = store.add(new Emitter<void>());
		const model = upcastPartial<IBrowserViewModel>({
			onWillDispose: onWillDispose.event,
			dispose: () => {
				if (!disposed) {
					disposed = true;
					onWillDispose.fire();
				}
			},
		});
		harness.setCreateBrowserModelHandler(async () => {
			createCount++;
			return model;
		});
		const firstResolution = await harness.canvasService.resolveCanvasModel(original.reference, harness.canvas.source!);

		const leaving = harness.editorWorkingSetService.beginRestore(owner(upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host-session:/other'),
		})));
		assert.strictEqual(harness.editorWorkingSetService.beginApply(owner(upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host-session:/other'),
		}))), true);
		original.dispose();
		leaving.dispose();
		harness.canvases.set([{ ...harness.canvas, instanceId: undefined, title: 'Canvas', source: undefined }], undefined);
		const returning = harness.editorWorkingSetService.beginRestore(owner(harness.session));
		const restored = harness.canvasService.restoreCanvasInput(serializationId);
		assert.ok(restored);
		const pending = {
			membershipPending: restored.membershipPending.get(),
			title: restored.getName(),
			source: restored.canvas.get()?.source,
		};
		harness.canvases.set([harness.canvas], undefined);
		harness.setCreateBrowserModelHandler(async () => {
			createCount++;
			throw new Error('Browser model should have been retained');
		});
		const restoredResolution = await harness.canvasService.resolveCanvasModel(restored.reference, harness.canvas.source!);

		assert.deepStrictEqual({
			sameModel: restoredResolution.model === firstResolution.model,
			createCount,
			disposed,
			pending,
			reused: [firstResolution.reused, restoredResolution.reused],
		}, {
			sameModel: true,
			createCount: 1,
			disposed: false,
			pending: { membershipPending: true, title: 'Preview', source: undefined },
			reused: [false, true],
		});
		returning.dispose();
	});

	test('disposes the retained browser model on user dismissal and known source loss', async () => {
		const dismissed = createHarness();
		await dismissed.openSettled[0];
		await Promise.resolve();
		const dismissedInput = dismissed.opened[0];
		let dismissedModelDisposed = false;
		const dismissedWillDispose = store.add(new Emitter<void>());
		dismissed.setCreateBrowserModelHandler(async () => upcastPartial<IBrowserViewModel>({
			onWillDispose: dismissedWillDispose.event,
			dispose: () => {
				if (!dismissedModelDisposed) {
					dismissedModelDisposed = true;
					dismissedWillDispose.fire();
				}
			},
		}));
		await dismissed.canvasService.resolveCanvasModel(dismissedInput.reference, dismissed.canvas.source!);
		dismissedInput.dispose();
		let staleDismissedCreates = 0;
		dismissed.setCreateBrowserModelHandler(async () => {
			staleDismissedCreates++;
			return upcastPartial<IBrowserViewModel>({ onWillDispose: Event.None, dispose: () => { } });
		});
		await assert.rejects(dismissed.canvasService.resolveCanvasModel(dismissedInput.reference, dismissed.canvas.source!), CancellationError);

		const unavailable = createHarness();
		await unavailable.openSettled[0];
		await Promise.resolve();
		const unavailableInput = unavailable.opened[0];
		let unavailableModelDisposed = false;
		const unavailableWillDispose = store.add(new Emitter<void>());
		unavailable.setCreateBrowserModelHandler(async () => upcastPartial<IBrowserViewModel>({
			onWillDispose: unavailableWillDispose.event,
			dispose: () => {
				if (!unavailableModelDisposed) {
					unavailableModelDisposed = true;
					unavailableWillDispose.fire();
				}
			},
		}));
		await unavailable.canvasService.resolveCanvasModel(unavailableInput.reference, unavailable.canvas.source!);
		unavailable.canvases.set([{ ...unavailable.canvas, source: undefined }], undefined);
		let staleUnavailableCreates = 0;
		unavailable.setCreateBrowserModelHandler(async () => {
			staleUnavailableCreates++;
			return upcastPartial<IBrowserViewModel>({ onWillDispose: Event.None, dispose: () => { } });
		});
		await assert.rejects(unavailable.canvasService.resolveCanvasModel(unavailableInput.reference, unavailable.canvas.source!), CancellationError);

		assert.deepStrictEqual({
			dismissedModelDisposed,
			unavailableModelDisposed,
			staleDismissedCreates,
			staleUnavailableCreates,
		}, {
			dismissedModelDisposed: true,
			unavailableModelDisposed: true,
			staleDismissedCreates: 0,
			staleUnavailableCreates: 0,
		});
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
		const { activeChat, canvasService, chat, opened, openSettled, setOpenEditorHandler } = createHarness();
		await openSettled[0];
		await Promise.resolve();
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

	test('forgets dismissed canvases when the owning session is archived', () => {
		const { activeSession, isArchived, opened, session, sessionChanges } = createHarness();
		opened[0].dispose();
		activeSession.set(undefined, undefined);
		isArchived.set(true, undefined);
		sessionChanges.fire({ added: [], changed: [session], removed: [] });
		isArchived.set(false, undefined);
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

	test('suspends an admitted canvas for a working-set restore without recording a dismissal', async () => {
		const harness = createHarness();
		await harness.openSettled[0];
		const original = harness.opened[0];
		const serializationId = original.serializationId;
		assert.ok(serializationId);

		const restore = harness.editorWorkingSetService.beginRestore(owner(upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host-session:/other'),
		})));
		const disposedBeforeApply = original.isDisposed();
		assert.strictEqual(harness.editorWorkingSetService.beginApply(owner(upcastPartial<IActiveSession>({
			resource: URI.parse('agent-host-session:/other'),
		}))), true);
		original.dispose();

		assert.deepStrictEqual({
			disposedBeforeApply,
			originalDisposed: original.isDisposed(),
			reopenable: harness.canvasService.reopenableCanvases.get().length,
			wrongOwnerRestore: harness.canvasService.restoreCanvasInput(serializationId),
		}, {
			disposedBeforeApply: false,
			originalDisposed: true,
			reopenable: 0,
			wrongOwnerRestore: undefined,
		});
		restore.dispose();
	});

	test('defers a newly advertised canvas until its working-set restore settles', () => {
		const harness = createHarness(true, []);
		const restore = harness.editorWorkingSetService.beginRestore(owner(harness.session));
		harness.canvases.set([harness.canvas], undefined);
		const openedWhileRestoring = harness.opened.length;
		restore.dispose();

		assert.deepStrictEqual({
			openedWhileRestoring,
			openedAfterRestore: harness.opened.length,
		}, {
			openedWhileRestoring: 0,
			openedAfterRestore: 1,
		});
	});

	test('an explicit reveal upgrades an in-flight fallback open to a focused reveal', async () => {
		const harness = createHarness();
		await harness.openSettled[0];
		await Promise.resolve();
		const original = harness.opened[0];
		const reference = original.reference;
		const other = owner(upcastPartial<IActiveSession>({ resource: URI.parse('agent-host-session:/other') }));
		const leaving = harness.editorWorkingSetService.beginRestore(other);
		assert.strictEqual(harness.editorWorkingSetService.beginApply(other), true);
		original.dispose();
		leaving.dispose();

		const fallbackGate = new DeferredPromise<ITextDiffEditorPane | undefined>();
		let fallbackPending = true;
		harness.setOpenEditorHandler(input => {
			if (fallbackPending) {
				fallbackPending = false;
				return fallbackGate.p;
			}
			return Promise.resolve(upcastPartial<ITextDiffEditorPane>({ input }));
		});
		const returning = harness.editorWorkingSetService.beginRestore(owner(harness.session));
		assert.strictEqual(harness.editorWorkingSetService.beginApply(owner(harness.session)), true);
		returning.dispose();
		const reveal = harness.canvasService.revealCanvas(reference);
		fallbackGate.complete(upcastPartial<ITextDiffEditorPane>({ input: harness.opened.at(-1) }));
		await reveal;

		assert.deepStrictEqual(harness.openOptions.slice(1), [
			{ pinned: true, preserveFocus: true, inactive: true, activation: EditorActivation.PRESERVE },
			{ pinned: true, revealIfOpened: true, preserveFocus: false },
		]);
	});

	test('restores an admitted sibling-chat canvas with current metadata in a session-shared working set', async () => {
		const harness = createHarness();
		await harness.openSettled[0];
		const original = harness.opened[0];
		const serializationId = original.serializationId;
		assert.ok(serializationId);
		const otherSession = upcastPartial<IActiveSession>({ resource: URI.parse('agent-host-session:/other') });
		const leaving = harness.editorWorkingSetService.beginRestore(owner(otherSession));
		assert.strictEqual(harness.editorWorkingSetService.beginApply(owner(otherSession)), true);
		original.dispose();
		leaving.dispose();

		const peer = upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/peer'),
			canvases: observableValue<readonly ISessionCanvas[] | undefined>('peerCanvases', []),
		});
		harness.chats.set([harness.chat, peer], undefined);
		harness.activeChat.set(peer, undefined);
		const freshSource = URI.parse('https://example.test/fresh');
		harness.canvases.set([{ ...harness.canvas, source: freshSource }], undefined);

		const returning = harness.editorWorkingSetService.beginRestore(owner(harness.session));
		const restored = harness.canvasService.restoreCanvasInput(serializationId);

		assert.deepStrictEqual({
			restored: !!restored,
			chat: restored?.reference.chat.toString(),
			source: restored?.canvas.get()?.source?.toString(),
		}, {
			restored: true,
			chat: 'agent-host-chat:/session/main',
			source: freshSource.toString(),
		});
		returning.dispose();
	});

	test('rejects an admitted sibling-chat canvas after authoritative membership removal', async () => {
		const harness = createHarness();
		await harness.openSettled[0];
		const original = harness.opened[0];
		const serializationId = original.serializationId;
		assert.ok(serializationId);
		const otherSession = upcastPartial<IActiveSession>({ resource: URI.parse('agent-host-session:/other') });
		const leaving = harness.editorWorkingSetService.beginRestore(owner(otherSession));
		assert.strictEqual(harness.editorWorkingSetService.beginApply(owner(otherSession)), true);
		original.dispose();
		leaving.dispose();

		const peer = upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/peer'),
			canvases: observableValue<readonly ISessionCanvas[] | undefined>('peerCanvases', []),
		});
		harness.chats.set([harness.chat, peer], undefined);
		harness.activeChat.set(peer, undefined);
		harness.canvases.set([], undefined);
		const returning = harness.editorWorkingSetService.beginRestore(owner(harness.session));

		assert.strictEqual(harness.canvasService.restoreCanvasInput(serializationId), undefined);
		returning.dispose();
	});

	test('invalidates admitted and dismissed canvases when their chat is deleted', async () => {
		const harness = createHarness();
		await harness.openSettled[0];
		const serializationId = harness.opened[0].serializationId;
		assert.ok(serializationId);
		harness.chatDeleted.fire({
			session: harness.session,
			sessionResource: harness.session.resource,
			chatResource: harness.chat.resource,
		});
		const restore = harness.editorWorkingSetService.beginRestore(owner(harness.session));
		const restoredAfterDelete = harness.canvasService.restoreCanvasInput(serializationId);
		restore.dispose();

		const dismissedHarness = createHarness();
		await dismissedHarness.openSettled[0];
		dismissedHarness.opened[0].dispose();
		const reopenableBeforeDelete = dismissedHarness.canvasService.reopenableCanvases.get().length;
		dismissedHarness.chatDeleted.fire({
			session: dismissedHarness.session,
			sessionResource: dismissedHarness.session.resource,
			chatResource: dismissedHarness.chat.resource,
		});
		assert.deepStrictEqual({
			reopenableBeforeDelete,
			reopenableAfterDelete: dismissedHarness.canvasService.reopenableCanvases.get().length,
			restoredAfterDelete,
		}, {
			reopenableBeforeDelete: 1,
			reopenableAfterDelete: 0,
			restoredAfterDelete: undefined,
		});
	});
});
