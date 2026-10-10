/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ICanvasService } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionCanvas, ISessionCanvasDefinition, ISessionCapabilities } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { getSessionCanvasDefinitionInstanceId } from '../../common/sessionCanvas.js';
import { OPEN_SESSION_CANVAS_COMMAND_ID, registerSessionCanvasActions } from '../../electron-browser/sessionCanvasActions.js';
import { SessionCanvasRegistryService } from '../../electron-browser/sessionCanvasService.js';

suite('SessionCanvasRegistryService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(definitions: readonly ISessionCanvasDefinition[]) {
		const sessionResource = URI.parse('agent-host-session:/session');
		const chatResource = URI.parse('agent-host-chat:/session/main');
		const canvases = observableValue<readonly ISessionCanvas[] | undefined>('canvases', []);
		const chat = upcastPartial<IChat>({ resource: chatResource, canvases });
		const activeChat = observableValue<IChat>('activeChat', chat);
		const capabilities = observableValue<ISessionCapabilities>('capabilities', { supportsCanvases: true, supportsMultipleChats: true });
		const session = upcastPartial<IActiveSession>({
			providerId: 'local-agent-host',
			resource: sessionResource,
			activeChat,
			chats: observableValue<readonly IChat[]>('chats', [chat]),
			capabilities,
		});
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const sessionsService = upcastPartial<ISessionsService>({ activeSession });
		const listedChats: URI[] = [];
		const didListCanvases = store.add(new Emitter<URI>());
		const opened: Array<{ chat: URI; canvas: ISessionCanvasDefinition; instanceId: string }> = [];
		let currentDefinitions = definitions;
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			onDidDeleteChat: Event.None,
			listCanvases: async (_session, targetChat) => {
				listedChats.push(targetChat.resource);
				didListCanvases.fire(targetChat.resource);
				return currentDefinitions;
			},
			openCanvas: async (_session, targetChat, canvas, instanceId) => {
				opened.push({ chat: targetChat.resource, canvas, instanceId });
			},
		});
		const canvasService = upcastPartial<ICanvasService>({
			enabled: observableValue('enabled', true),
			reopenableCanvases: observableValue('reopenableCanvases', []),
			revealCanvas: async () => { },
			reopenCanvas: async () => { },
		});
		const registryService = store.add(new SessionCanvasRegistryService(
			sessionsService,
			sessionsManagementService,
			canvasService,
			new NullLogService(),
		));
		return {
			activeChat,
			canvases,
			canvasService,
			listedChats,
			onDidListCanvases: didListCanvases.event,
			opened,
			registryService,
			setDefinitions: (value: readonly ISessionCanvasDefinition[]) => currentDefinitions = value,
		};
	}

	test('refreshes on registry signals and targets the focused chat', async () => {
		const first: ISessionCanvasDefinition = {
			canvasId: 'first',
			extensionId: 'user:first',
			extensionSource: 'user',
			displayName: 'First',
			description: 'First canvas.',
			requiresInput: false,
		};
		const second: ISessionCanvasDefinition = {
			canvasId: 'second',
			extensionId: 'project:second',
			extensionSource: 'project',
			displayName: 'Second',
			description: 'Second canvas.',
			requiresInput: false,
		};
		const harness = createHarness([first]);
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.some(canvas => canvas.canvasId === 'first'));
		const callsBeforeRegistryChange = harness.listedChats.length;
		harness.setDefinitions([second]);

		const registryList = Event.toPromise(Event.once(harness.onDidListCanvases));
		harness.canvases.set([], undefined);
		const registryChat = await registryList;
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.some(canvas => canvas.canvasId === 'second'));

		const peer = upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/peer'),
			canvases: observableValue<readonly ISessionCanvas[] | undefined>('peerCanvases', []),
		});
		const peerList = Event.toPromise(Event.once(harness.onDidListCanvases));
		harness.activeChat.set(peer, undefined);
		const listedPeer = await peerList;
		await harness.registryService.openCanvas(second);

		assert.deepStrictEqual({
			afterRegistryChange: harness.listedChats.slice(callsBeforeRegistryChange, -1).map(resource => resource.toString()),
			registryChat: registryChat.toString(),
			available: harness.registryService.availableCanvases.get().map(canvas => canvas.canvasId),
			listedPeer: listedPeer.toString(),
			opened: harness.opened.map(entry => ({
				chat: entry.chat.toString(),
				canvasId: entry.canvas.canvasId,
				instanceId: entry.instanceId,
			})),
		}, {
			afterRegistryChange: ['agent-host-chat:/session/main'],
			registryChat: 'agent-host-chat:/session/main',
			available: ['second'],
			listedPeer: 'agent-host-chat:/session/peer',
			opened: [{
				chat: 'agent-host-chat:/session/peer',
				canvasId: 'second',
				instanceId: getSessionCanvasDefinitionInstanceId(second),
			}],
		});
	});

	test('contributes registered extension canvases to the Add Tab Canvas submenu', async () => {
		const definitions: ISessionCanvasDefinition[] = [
			{
				canvasId: 'main',
				extensionId: 'user:counter',
				extensionSource: 'user',
				extensionName: 'User Counter',
				displayName: 'Counter',
				description: 'A user counter.',
				requiresInput: false,
			},
			{
				canvasId: 'main',
				extensionId: 'project:counter',
				extensionSource: 'project',
				extensionName: 'Project Counter',
				displayName: 'Counter',
				description: 'A project counter.',
				requiresInput: false,
			},
			{
				canvasId: 'form',
				extensionId: 'project:form',
				extensionSource: 'project',
				displayName: 'Form',
				description: 'Requires opening input.',
				requiresInput: true,
			},
			{
				canvasId: 'browser',
				extensionId: 'github-app',
				extensionSource: 'unknown',
				displayName: 'Browser',
				description: 'Built-in browser.',
				requiresInput: false,
			},
		];
		const harness = createHarness(definitions);
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.length === 2);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService));
		const submenus = MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTab)
			.filter(isISubmenuItem)
			.filter(item => item.submenu === Menus.SessionsEditorTabsBarAddTabCanvas);
		const items = MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTabCanvas)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(`${OPEN_SESSION_CANVAS_COMMAND_ID}.`))
			.sort((firstItem, secondItem) => (firstItem.order ?? 0) - (secondItem.order ?? 0));

		await CommandsRegistry.getCommand(items[1].command.id)!.handler(upcastPartial<ServicesAccessor>({}));
		registration.dispose();

		assert.deepStrictEqual({
			submenuTitles: submenus.map(item => typeof item.title === 'string' ? item.title : item.title.value),
			titles: items.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value),
			groups: items.map(item => item.group),
			opened: harness.opened.map(entry => ({
				chat: entry.chat.toString(),
				extensionId: entry.canvas.extensionId,
				canvasId: entry.canvas.canvasId,
				instanceId: entry.instanceId,
			})),
		}, {
			submenuTitles: ['Canvas'],
			titles: ['Counter (Project Counter)', 'Counter (User Counter)'],
			groups: ['1_available', '1_available'],
			opened: [{
				chat: 'agent-host-chat:/session/main',
				extensionId: 'user:counter',
				canvasId: 'main',
				instanceId: getSessionCanvasDefinitionInstanceId(definitions[0]),
			}],
		});
	});
});
