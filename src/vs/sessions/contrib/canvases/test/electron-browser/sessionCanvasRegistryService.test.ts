/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, derived, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ICanvasContextService, ICanvasReference, ICanvasService } from '../../../../../workbench/contrib/canvases/common/canvas.js';
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
		let currentDefinitions: readonly ISessionCanvasDefinition[] | undefined = definitions;
		let listingGate: DeferredPromise<void> | undefined;
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			onDidDeleteChat: Event.None,
			listCanvases: async (_session, targetChat) => {
				listedChats.push(targetChat.resource);
				didListCanvases.fire(targetChat.resource);
				if (listingGate) {
					await listingGate.p;
				}
				return currentDefinitions;
			},
			openCanvas: async (_session, targetChat, canvas, instanceId) => {
				opened.push({ chat: targetChat.resource, canvas, instanceId });
			},
		});
		const enabled = observableValue('enabled', true);
		const revealed: ICanvasReference[] = [];
		const canvasService = upcastPartial<ICanvasService>({
			enabled,
			reopenableCanvases: observableValue('reopenableCanvases', []),
			revealCanvas: async reference => { revealed.push(reference); },
			reopenCanvas: async () => { },
		});
		const contextService = upcastPartial<ICanvasContextService>({
			contexts: derived(reader => {
				const currentSession = activeSession.read(reader);
				const currentChat = currentSession?.activeChat.read(reader);
				return currentSession && currentChat ? [{
					owner: { providerId: currentSession.providerId, session: currentSession.resource, chat: currentChat.resource },
					canvases: currentChat.canvases ?? constObservable([]),
				}] : [];
			}),
		});
		const registryService = store.add(new SessionCanvasRegistryService(
			sessionsService,
			sessionsManagementService,
			canvasService,
			new NullLogService(),
		));
		return {
			activeChat,
			activeSession,
			canvases,
			enabled,
			canvasService,
			contextService,
			revealed,
			listedChats,
			onDidListCanvases: didListCanvases.event,
			opened,
			registryService,
			setDefinitions: (value: readonly ISessionCanvasDefinition[] | undefined) => currentDefinitions = value,
			holdListing: () => {
				listingGate = new DeferredPromise<void>();
			},
			releaseListing: (value: readonly ISessionCanvasDefinition[]) => {
				currentDefinitions = value;
				const gate = listingGate;
				listingGate = undefined;
				gate?.complete();
			},
		};
	}

	test('activity bar offers the available canvas types while the chat has no canvas', async () => {
		const harness = createHarness([{
			canvasId: 'plan', extensionId: 'user:plan', extensionSource: 'user',
			displayName: 'Plan', description: 'A plan canvas.', requiresInput: false,
		}]);
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.length === 1);
		const before = MenuRegistry.getMenuItems(Menus.SessionActivityBar);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const getEntries = () => MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(item => !before.includes(item)).map(item => isISubmenuItem(item)
			? `submenu:${item.submenu.id}:${typeof item.title === 'string' ? item.title : item.title.value}`
			: `command:${item.command.id}`);
		const getCanvasEntries = () => MenuRegistry.getMenuItems(Menus.SessionActivityBarCanvas).filter(isIMenuItem);
		const getCanvasTitles = () => getCanvasEntries().map(item => `${item.group}:${typeof item.command.title === 'string' ? item.command.title : item.command.title.value}`);

		const withoutCanvas = { entries: getEntries(), canvasEntries: getCanvasTitles() };
		await CommandsRegistry.getCommand(getCanvasEntries()[0].command.id)?.handler(upcastPartial<ServicesAccessor>({}));
		harness.canvases.set([{
			resource: URI.parse('agent-host-canvas:/session/plan'), instanceId: 'plan',
			title: 'Plan', source: URI.parse('https://example.com/plan'),
		}], undefined);
		const withCanvas = { entries: getEntries(), canvasEntries: getCanvasTitles() };
		harness.canvases.set([], undefined);
		const afterCanvasRemoved = { entries: getEntries(), canvasEntries: getCanvasTitles() };
		registration.dispose();

		assert.deepStrictEqual({
			withoutCanvas,
			opened: harness.opened.map(entry => entry.canvas.canvasId),
			withCanvas,
			afterCanvasRemoved,
			afterDispose: { entries: getEntries(), canvasEntries: getCanvasTitles() },
		}, {
			withoutCanvas: { entries: [`submenu:${Menus.SessionActivityBarCanvas.id}:Canvas`], canvasEntries: ['1_available:Plan'] },
			opened: ['plan'],
			withCanvas: { entries: [`command:${Menus.SessionActivityBarCanvas.id}`], canvasEntries: ['navigation:Plan'] },
			afterCanvasRemoved: { entries: [`submenu:${Menus.SessionActivityBarCanvas.id}:Canvas`], canvasEntries: ['1_available:Plan'] },
			afterDispose: { entries: [], canvasEntries: [] },
		});
	});

	test('activity bar shows no canvas entry when no canvas types are available', () => {
		const harness = createHarness([]);
		const before = MenuRegistry.getMenuItems(Menus.SessionActivityBar);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const entries = MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(item => !before.includes(item));
		registration.dispose();
		assert.deepStrictEqual(entries, []);
	});

	test('activity bar opens its single live canvas directly without a submenu', async () => {
		const harness = createHarness([]);
		const canvas: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/session/triage'), instanceId: 'triage',
			title: 'Daily Triage', source: URI.parse('https://example.com/triage'),
		};
		harness.canvases.set([canvas], undefined);
		const before = MenuRegistry.getMenuItems(Menus.SessionActivityBar);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const entries = MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(item => !before.includes(item));
		for (const entry of entries.filter(isIMenuItem)) {
			await CommandsRegistry.getCommand(entry.command.id)?.handler(upcastPartial<ServicesAccessor>({}));
		}
		registration.dispose();
		assert.deepStrictEqual({
			entries: entries.map(entry => isIMenuItem(entry) ? entry.command.title : 'submenu'),
			revealed: harness.revealed.map(reference => ({
				session: reference.session.toString(), chat: reference.chat.toString(), canvas: reference.canvas.toString(),
			})),
		}, {
			entries: ['Daily Triage'],
			revealed: [{ session: 'agent-host-session:/session', chat: 'agent-host-chat:/session/main', canvas: canvas.resource.toString() }],
		});
	});

	test('activity bar does not change its menus when the canvases re-emit unchanged', async () => {
		const harness = createHarness([{
			canvasId: 'plan', extensionId: 'user:plan', extensionSource: 'user',
			displayName: 'Plan', description: 'A plan canvas.', requiresInput: false,
		}]);
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.length === 1);
		const canvas: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/session/triage'), instanceId: 'triage',
			title: 'Daily Triage', source: URI.parse('https://example.com/triage'),
		};
		store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		let changes = 0;
		store.add(MenuRegistry.onDidChangeMenu(e => {
			if (e.has(Menus.SessionActivityBar) || e.has(Menus.SessionsEditorTabsBarAddTab)) {
				changes++;
			}
		}));
		const changesFor = async (canvases: readonly ISessionCanvas[]) => {
			await timeout(0);
			const before = changes;
			harness.canvases.set(canvases, undefined);
			await timeout(0);
			return changes - before;
		};

		assert.deepStrictEqual({
			emptyAgain: await changesFor([]),
			added: await changesFor([canvas]),
			sameCanvasAgain: await changesFor([{ ...canvas }]),
			renamed: await changesFor([{ ...canvas, title: 'Renamed' }]),
			renamedAgain: await changesFor([{ ...canvas, title: 'Renamed' }]),
		}, {
			emptyAgain: 0,
			added: 1,
			sameCanvasAgain: 0,
			renamed: 1,
			renamedAgain: 0,
		});
	});

	test('activity bar tracks live canvas membership, titles, active chat, enablement and disposal', () => {
		const harness = createHarness([]);
		const first: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/session/first'), instanceId: 'first',
			title: 'Board', source: URI.parse('https://example.com/first'),
		};
		const second: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/session/second'), instanceId: 'second',
			title: 'Board', source: URI.parse('https://example.com/second'),
		};
		const before = MenuRegistry.getMenuItems(Menus.SessionActivityBar);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const snapshot = () => MenuRegistry.getMenuItems(Menus.SessionActivityBar)
			.filter(item => !before.includes(item))
			.map(item => isIMenuItem(item) ? item.command.title : isISubmenuItem(item) ? {
				title: item.title,
				children: MenuRegistry.getMenuItems(item.submenu).filter(isIMenuItem).map(child => child.command.title),
			} : undefined);
		harness.canvases.set([first, second], undefined);
		const multiple = snapshot();
		harness.canvases.set([{ ...first, title: 'Renamed Board' }], undefined);
		const single = snapshot();
		harness.activeChat.set(upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/peer'),
			canvases: observableValue<readonly ISessionCanvas[] | undefined>('peerCanvases', []),
		}), undefined);
		const otherChat = snapshot();
		harness.activeChat.set(upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/main'), canvases: harness.canvases,
		}), undefined);
		harness.enabled.set(false, undefined);
		const disabled = snapshot();
		harness.enabled.set(true, undefined);
		const enabled = snapshot();
		harness.canvases.set(undefined, undefined);
		const unsettled = snapshot();
		harness.canvases.set([first], undefined);
		harness.activeSession.set(undefined, undefined);
		const noSession = snapshot();
		registration.dispose();
		assert.deepStrictEqual({ multiple, single, otherChat, disabled, enabled, unsettled, noSession, disposed: snapshot() }, {
			multiple: [{ title: 'Canvas', children: ['Board (first)', 'Board (second)'] }],
			single: ['Renamed Board'],
			otherChat: [],
			disabled: [],
			enabled: ['Renamed Board'],
			unsettled: [],
			noSession: [],
			disposed: [],
		});
	});

	test('activity bar preserves hidden state across session and single-to-multiple canvas transitions', async () => {
		const harness = createHarness([]);
		const canvas: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/session/board'), instanceId: 'board',
			title: 'Board', source: URI.parse('https://example.com/board'),
		};
		harness.canvases.set([canvas], undefined);
		const storageService = store.add(new InMemoryStorageService());
		const menuService = store.add(new MenuService(NullCommandService, new MockKeybindingService(), storageService));
		const contextKeyService = store.add(new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const getAction = () => {
			const action = menuService.getMenuActions(Menus.SessionActivityBar, contextKeyService)
				.flatMap(([, actions]) => actions).find(action => action.label === 'Board' || action.label === 'Canvas');
			assert.ok(action);
			return action;
		};
		await getAction().hideActions?.hide.run();
		const initial = getAction().hideActions?.isHidden;
		const session = harness.activeSession.get();
		harness.activeSession.set(undefined, undefined);
		harness.activeSession.set(session, undefined);
		const returned = getAction().hideActions?.isHidden;
		harness.canvases.set([canvas, { ...canvas, resource: URI.parse('agent-host-canvas:/session/second'), instanceId: 'second' }], undefined);
		const multiple = getAction().hideActions?.isHidden;
		harness.canvases.set([canvas], undefined);
		const single = getAction().hideActions?.isHidden;
		registration.dispose();
		store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const recreated = getAction().hideActions?.isHidden;

		assert.deepStrictEqual({ initial, returned, multiple, single, recreated }, {
			initial: true, returned: true, multiple: true, single: true, recreated: true,
		});
	});

	test('activity bar singleton command resolves the current owner and ignores stale availability', async () => {
		const harness = createHarness([]);
		const canvas: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/session/board'), instanceId: 'board',
			title: 'Board', source: URI.parse('https://example.com/board'),
		};
		harness.canvases.set([canvas], undefined);
		store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const command = CommandsRegistry.getCommand(Menus.SessionActivityBarCanvas.id);
		assert.ok(command);
		const run = () => command.handler(upcastPartial<ServicesAccessor>({}));
		harness.enabled.set(false, undefined);
		await run();
		harness.enabled.set(true, undefined);
		harness.canvases.set([], undefined);
		await run();
		harness.canvases.set([canvas, { ...canvas, resource: URI.parse('agent-host-canvas:/session/second') }], undefined);
		await run();
		harness.activeChat.set(upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/peer'),
			canvases: constObservable([canvas]),
		}), undefined);
		await run();
		harness.activeSession.set(undefined, undefined);
		await run();

		assert.deepStrictEqual(harness.revealed.map(reference => ({
			chat: reference.chat.toString(), canvas: reference.canvas.toString(),
		})), [{ chat: 'agent-host-chat:/session/peer', canvas: canvas.resource.toString() }]);
	});

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
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
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

	test('keeps shown Add Tab canvas commands registered while the focused chat refreshes', async () => {
		const plan: ISessionCanvasDefinition = {
			canvasId: 'plan',
			extensionId: 'user:plan',
			extensionSource: 'user',
			displayName: 'Plan',
			description: 'A plan canvas.',
			requiresInput: false,
		};
		const board: ISessionCanvasDefinition = {
			canvasId: 'board',
			extensionId: 'project:board',
			extensionSource: 'project',
			displayName: 'Board',
			description: 'A board canvas.',
			requiresInput: false,
		};
		const harness = createHarness([plan]);
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.length === 1);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const getCommandIds = () => MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTabCanvas)
			.filter(isIMenuItem)
			.map(item => item.command.id)
			.filter(id => id.startsWith(`${OPEN_SESSION_CANVAS_COMMAND_ID}.`));
		// An open Add Tab menu runs the command id it was rendered with.
		const [shownCommandId] = getCommandIds();
		const listCallsBeforeRefresh = harness.listedChats.length;

		// Chat updates keep signalling refreshes while a listing request is still pending.
		harness.holdListing();
		const pendingList = Event.toPromise(Event.once(harness.onDidListCanvases));
		harness.canvases.set([], undefined);
		await pendingList;
		harness.canvases.set([], undefined);
		harness.canvases.set([], undefined);
		const whileRefreshing = {
			commandIds: getCommandIds(),
			available: harness.registryService.availableCanvases.get().map(canvas => canvas.canvasId),
			listCalls: harness.listedChats.length - listCallsBeforeRefresh,
		};

		harness.releaseListing([plan, board]);
		await timeout(0);
		const commandIdsAfterRefresh = getCommandIds();
		await CommandsRegistry.getCommand(shownCommandId)?.handler(upcastPartial<ServicesAccessor>({}));
		registration.dispose();

		assert.deepStrictEqual({
			whileRefreshing,
			shownCommandKeptAfterRefresh: commandIdsAfterRefresh.includes(shownCommandId),
			commandsAfterRefresh: commandIdsAfterRefresh.length,
			listCalls: harness.listedChats.length - listCallsBeforeRefresh,
			opened: harness.opened.map(entry => entry.canvas.canvasId),
		}, {
			whileRefreshing: {
				commandIds: [shownCommandId],
				available: ['plan'],
				listCalls: 1,
			},
			shownCommandKeptAfterRefresh: true,
			commandsAfterRefresh: 2,
			listCalls: 2,
			opened: ['plan'],
		});
	});

	test('keeps Add Tab canvas commands through an unsettled registry and removes them after a stable empty listing', async () => {
		const plan: ISessionCanvasDefinition = {
			canvasId: 'plan',
			extensionId: 'user:plan',
			extensionSource: 'user',
			displayName: 'Plan',
			description: 'A plan canvas.',
			requiresInput: false,
		};
		const harness = createHarness([plan]);
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.length === 1);
		const registration = store.add(registerSessionCanvasActions(harness.canvasService, harness.registryService, harness.contextService));
		const getCommandIds = () => MenuRegistry.getMenuItems(Menus.SessionsEditorTabsBarAddTabCanvas)
			.filter(isIMenuItem)
			.map(item => item.command.id)
			.filter(id => id.startsWith(`${OPEN_SESSION_CANVAS_COMMAND_ID}.`));
		const [shownCommandId] = getCommandIds();

		harness.setDefinitions(undefined);
		const unsettledList = Event.toPromise(Event.once(harness.onDidListCanvases));
		harness.canvases.set([], undefined);
		await unsettledList;
		await timeout(0);
		const whileUnsettled = {
			commandIds: getCommandIds(),
			available: harness.registryService.availableCanvases.get().map(canvas => canvas.canvasId),
		};

		harness.setDefinitions([]);
		const stableList = Event.toPromise(Event.once(harness.onDidListCanvases));
		harness.canvases.set([], undefined);
		await stableList;
		await waitForState(harness.registryService.availableCanvases, canvases => canvases.length === 0);
		const afterStableEmpty = getCommandIds();
		registration.dispose();

		assert.deepStrictEqual({ whileUnsettled, afterStableEmpty }, {
			whileUnsettled: {
				commandIds: [shownCommandId],
				available: ['plan'],
			},
			afterStableEmpty: [],
		});
	});
});
