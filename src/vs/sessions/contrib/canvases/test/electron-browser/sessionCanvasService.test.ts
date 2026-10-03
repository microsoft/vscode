/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
		let closeCount = 0;
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened.push(args[0] as SessionCanvasInput);
				openOptions.push(args[1]);
				return undefined;
			}
			override findEditors(): never[] {
				return [];
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
		return { activeSession, canvas, canvasService, canvases, opened, openOptions, session, sessionChanges, get closeCount() { return closeCount; }, setCanvasesEnabled };
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

	test('contributes titled canvas instances to the right pane Add Tab menu', async () => {
		const canvases: ISessionCanvas[] = [
			{ resource: URI.parse('agent-host-canvas:/preview-editor'), instanceId: 'editor', title: 'Preview', source: URI.parse('https://example.test/editor') },
			{ resource: URI.parse('agent-host-canvas:/preview-sidebar'), instanceId: 'sidebar', title: 'Preview', source: URI.parse('https://example.test/sidebar') },
			{ resource: URI.parse('agent-host-canvas:/dashboard'), instanceId: 'dashboard', title: 'Dashboard', source: URI.parse('https://example.test/dashboard') },
		];
		const { canvasService, opened } = createHarness(true, canvases);
		const registration = store.add(registerSessionCanvasAddTabActions(canvasService));
		for (const input of [...opened]) {
			input.dispose();
		}
		const getItems = () => MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTab)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(`${REOPEN_SESSION_CANVAS_COMMAND_ID}.`));
		const items = getItems();
		const initialCommandIds = items.map(item => item.command.id);
		const when = items[0].when?.serialize() ?? '';
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
			remainingTitles,
			staleCommandsRegistered,
			itemsAfterDispose: getItems().length,
			remainingCommandsAfterDispose: remainingCommandIds.map(id => CommandsRegistry.getCommand(id) !== undefined),
		}, {
			titles: ['Preview (editor)', 'Preview (sidebar)', 'Dashboard'],
			groups: ['navigation', 'navigation', 'navigation'],
			requiresChat: true,
			requiresSessionsWindow: true,
			excludesAuxiliaryWindow: true,
			requiresRightPane: true,
			reopenedResource: 'agent-host-canvas:/preview-sidebar',
			remainingTitles: ['Preview', 'Dashboard'],
			staleCommandsRegistered: [false, false, false],
			itemsAfterDispose: 0,
			remainingCommandsAfterDispose: [false, false],
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
