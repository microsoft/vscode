/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuItem, isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { Menus } from '../../../../browser/menus.js';
import { ChatWindowIdContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { registerChatWindowCanvasActions } from '../../electron-browser/chatWindowCanvasActions.js';

suite('Chat window - canvases in the Add Tab list', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const definition: ICanvasDefinition = { canvasId: 'plan', extensionId: 'user:plan', extensionSource: 'user', displayName: 'Plan', description: '', requiresInput: false };

	function createFixture(sessions: readonly string[]) {
		const providerIds = sessions.map(() => 'test');
		const opened: unknown[] = [];
		const reopened: ICanvasReference[] = [];
		const revealed: ICanvasReference[] = [];
		const activeSession = observableValue('activeSession', 'main');
		const windows = sessions.map((name, index) => {
			const session = URI.parse(`test://session/${name}`);
			const chat = URI.parse(`test://chat/${name}`);
			const canvas: ICanvas = { resource: URI.parse(`canvas://${name}/old`), instanceId: 'closed', title: `Old ${name}`, source: undefined };
			return {
				owner: { providerId: providerIds[index], session, chat },
				canvas,
				window: new class extends mock<IChatWindow>() {
					override readonly windowId = index + 10;
					override readonly editorArea = {} as never;
					override readonly session = observableValue('session', { providerId: providerIds[index], resource: session, activeChat: observableValue('chat', { resource: chat }) } as never);
				}(),
			};
		});
		const canvasLists = windows.map(() => observableValue<readonly ICanvas[]>('canvases', []));
		const listed: string[] = [];
		const createContexts = (): ICanvasContext[] => windows.map(({ owner }, index) => ({
			owner: { ...owner, providerId: providerIds[index] },
			canvases: canvasLists[index],
			definitionProvider: {
				onDidChangeDefinitions: Event.None,
				listCanvases: async () => { listed.push(owner.session.toString()); return [definition]; },
				openCanvas: async (canvas, instanceId) => { opened.push([owner.session.toString(), canvas.canvasId, instanceId]); },
			},
		}));
		const contexts = observableValue<readonly ICanvasContext[]>('contexts', createContexts());
		const windowList = observableValue<readonly IChatWindow[]>('windows', windows.map(entry => entry.window));
		const reopenable = observableValue('reopenable', windows.map(({ owner, canvas }) => ({ reference: { ...owner, canvas: canvas.resource }, canvas })));
		const registration = store.add(registerChatWindowCanvasActions(
			new class extends mock<IChatWindowService>() {
				override readonly windows = windowList;
			}(),
			new class extends mock<ICanvasService>() {
				override readonly enabled = observableValue('enabled', true);
				override readonly reopenableCanvases = reopenable;
				override async reopenCanvas(reference: ICanvasReference) { reopened.push(reference); }
				override async revealCanvas(reference: ICanvasReference) { revealed.push(reference); }
			}(),
			new class extends mock<ICanvasContextService>() {
				override readonly contexts = contexts;
			}(),
			new NullLogService() as ILogService,
			new class extends mock<INotificationService>() { }(),
		));
		const changeProvider = (index: number, providerId: string) => {
			providerIds[index] = providerId;
			transaction(tx => {
				windows[index].window.session.set({ providerId, resource: windows[index].owner.session, activeChat: observableValue('chat', { resource: windows[index].owner.chat }) } as never, tx);
				contexts.set(createContexts(), tx);
			});
		};
		return { registration, changeProvider, listed, rebuildContexts: () => contexts.set(createContexts(), undefined), replaceCanvases: (index: number) => { canvasLists[index] = observableValue<readonly ICanvas[]>('canvases', []); contexts.set(createContexts(), undefined); }, opened, reopened, revealed, activeSession, windows, windowList, reopenable, canvasLists };
	}

	async function entries(count: number) {
		const getItems = () => MenuRegistry.getMenuItems(Menus.ChatWindowAddTabCanvas).filter(isIMenuItem);
		while (getItems().length < count) {
			await Event.toPromise(Event.filter(MenuRegistry.onDidChangeMenu, ids => ids.has(Menus.ChatWindowAddTabCanvas)));
		}
		return getItems();
	}

	const whenGroup = (id: number) => ContextKeyExpr.and(ChatWindowIdContext.isEqualTo(id), ChatContextKeys.enabled)!.serialize();

	const describe = (item: IMenuItem) => [typeof item.command.title === 'string' ? item.command.title : item.command.title.value, item.when?.serialize()];

	test('each chat window lists the canvases of its own session, scoped to its editor group, and the submenu is offered in both Add Tab menus', async () => {
		const { registration } = createFixture(['one', 'two']);
		const items = await entries(4);
		const submenus = [Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab].map(menu => MenuRegistry.getMenuItems(menu).filter(item => !isIMenuItem(item)).length > 0);

		assert.deepStrictEqual({ items: items.map(describe), submenus }, {
			items: [
				['Plan', whenGroup(10)],
				['Old one', whenGroup(10)],
				['Plan', whenGroup(11)],
				['Old two', whenGroup(11)],
			],
			submenus: [true, true],
		});
		registration.dispose();
		assert.deepStrictEqual(MenuRegistry.getMenuItems(Menus.ChatWindowAddTabCanvas).length, 0);
	});

	test('rebuilding the contexts for the same owners does not list the canvases of each window again', async () => {
		const { listed, rebuildContexts } = createFixture(['one', 'two']);
		await entries(4);
		for (let i = 0; i < 5; i++) {
			rebuildContexts();
			await timeout(0);
		}

		assert.deepStrictEqual(listed.slice().sort(), ['test://session/one', 'test://session/two']);
	});

	test('the same owner with a new source of canvases is listed again once', async () => {
		const { listed, rebuildContexts, replaceCanvases } = createFixture(['one']);
		await entries(2);
		replaceCanvases(0);
		await timeout(0);
		rebuildContexts();
		await timeout(0);

		assert.deepStrictEqual(listed, ['test://session/one', 'test://session/one']);
	});

	test('opening a canvas targets the window the entry belongs to and leaves the active session alone', async () => {
		const { opened, reopened, activeSession, windows } = createFixture(['one', 'two']);
		const items = await entries(4);
		const run = (item: IMenuItem) => CommandsRegistry.getCommand(item.command.id)!.handler(undefined!);

		await run(items[2]);
		await run(items[1]);

		assert.deepStrictEqual({
			opened,
			reopened: reopened.map(reference => reference.canvas.toString()),
			activeSession: activeSession.get(),
		}, {
			opened: [[windows[1].owner.session.toString(), 'plan', getCanvasDefinitionInstanceId(definition)]],
			reopened: ['canvas://one/old'],
			activeSession: 'main',
		});
	});

	test('opening a canvas that is already open reveals it and only asks the provider again when it has no source', async () => {
		const { opened, revealed, canvasLists } = createFixture(['one']);
		const items = await entries(2);
		const instanceId = getCanvasDefinitionInstanceId(definition);
		const existing: ICanvas = { resource: URI.parse('canvas://one/plan'), instanceId, title: 'Plan', source: undefined };

		canvasLists[0].set([existing], undefined);
		await CommandsRegistry.getCommand(items[0].command.id)!.handler(undefined!);
		canvasLists[0].set([{ ...existing, source: {} as never }], undefined);
		await CommandsRegistry.getCommand(items[0].command.id)!.handler(undefined!);

		assert.deepStrictEqual({ revealed: revealed.map(reference => reference.canvas.toString()), opened: opened.length }, { revealed: ['canvas://one/plan', 'canvas://one/plan'], opened: 1 });
	});

	test('closing a chat window removes its canvas menu items and commands', async () => {
		const baseline = CommandsRegistry.getCommands().size;
		const { windowList, registration } = createFixture(['one', 'two']);
		const items = await entries(4);
		const ids = items.map(item => item.command.id);

		windowList.set([], undefined);

		assert.deepStrictEqual({
			items: MenuRegistry.getMenuItems(Menus.ChatWindowAddTabCanvas).length,
			commands: ids.filter(id => CommandsRegistry.getCommand(id)).length,
			count: CommandsRegistry.getCommands().size,
		}, { items: 0, commands: 0, count: baseline });
		registration.dispose();
	});

	test('a canvas change that leaves a window\'s entries as they are does not register them again', async () => {
		const { reopenable } = createFixture(['one', 'two']);
		const before = (await entries(4)).map(item => item.command.id);

		reopenable.set([...reopenable.get()], undefined);
		const after = MenuRegistry.getMenuItems(Menus.ChatWindowAddTabCanvas).filter(isIMenuItem).map(item => item.command.id);

		assert.deepStrictEqual(after, before);
	});

	test('the same session and chat of another provider is registered again', async () => {
		const { changeProvider } = createFixture(['one']);
		await entries(2);
		let changes = 0;
		store.add(MenuRegistry.onDidChangeMenu(ids => { changes += ids.has(Menus.ChatWindowAddTabCanvas) || ids.has(Menus.SessionActivityBar) ? 1 : 0; }));
		changeProvider(0, 'other');
		await timeout(0);

		assert.strictEqual(changes > 0, true);
	});

	suite('Session Activity Bar', () => {

		const title = (item: { command: { title: string | { value: string } } }) => typeof item.command.title === 'string' ? item.command.title : item.command.title.value;

		/** What the Session Activity Bar of the window with the editor group offers: a direct entry or the Canvas menu. */
		function activityBar(groupId: number) {
			const when = whenGroup(groupId);
			const items = MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(item => item.when?.serialize() === when);
			const direct = items.filter(isIMenuItem).map(title);
			const submenus = items.filter(item => !isIMenuItem(item)).length;
			const submenuEntries = MenuRegistry.getMenuItems(Menus.ChatWindowActivityBarCanvas).filter(isIMenuItem).filter(item => item.when?.serialize() === when).map(title);
			return { direct, submenus, submenuEntries };
		}

		const canvasOf = (name: string, id: string): ICanvas => ({ resource: URI.parse(`canvas://${name}/${id}`), instanceId: id, title: `Open ${id}`, source: undefined });

		test('a window whose chat has no canvas offers what Add Tab offers in a Canvas menu', async () => {
			createFixture(['one']);
			await entries(2);

			assert.deepStrictEqual(activityBar(10), { direct: [], submenus: 1, submenuEntries: ['Plan', 'Old one'] });
		});

		test('a window whose chat has one canvas offers it directly and reveals it', async () => {
			const { canvasLists, revealed, windows } = createFixture(['one']);
			canvasLists[0].set([canvasOf('one', 'a')], undefined);
			await timeout(0);
			const item = MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(isIMenuItem).find(candidate => candidate.when?.serialize() === whenGroup(10))!;
			await CommandsRegistry.getCommand(item.command.id)!.handler(undefined!);

			assert.deepStrictEqual({ ...activityBar(10), revealed: revealed.map(reference => reference.canvas.toString()), chat: revealed[0].chat.toString() }, {
				direct: [title(item)], submenus: 0, submenuEntries: [], revealed: ['canvas://one/a'], chat: windows[0].owner.chat.toString(),
			});
		});

		test('a window whose chat has several canvases offers a Canvas menu with each of them', async () => {
			const { canvasLists } = createFixture(['one']);
			canvasLists[0].set([canvasOf('one', 'a'), canvasOf('one', 'b')], undefined);
			await timeout(0);

			assert.deepStrictEqual(activityBar(10), { direct: [], submenus: 1, submenuEntries: ['Open a', 'Open b'] });
		});

		test('two chat windows with different chats each offer their own canvas', async () => {
			const { canvasLists } = createFixture(['one', 'two']);
			canvasLists[0].set([canvasOf('one', 'a')], undefined);
			canvasLists[1].set([canvasOf('two', 'b'), canvasOf('two', 'c')], undefined);
			await timeout(0);

			assert.deepStrictEqual({ first: activityBar(10), second: activityBar(11) }, {
				first: { direct: ['Open a'], submenus: 0, submenuEntries: [] },
				second: { direct: [], submenus: 1, submenuEntries: ['Open b', 'Open c'] },
			});
		});

		test('a change of the canvases in the Canvas menu leaves the strips of all windows as they are', async () => {
			const { canvasLists } = createFixture(['one', 'two']);
			canvasLists[0].set([canvasOf('one', 'a'), canvasOf('one', 'b')], undefined);
			canvasLists[1].set([canvasOf('two', 'c'), canvasOf('two', 'd')], undefined);
			await timeout(0);
			let stripChanges = 0;
			store.add(MenuRegistry.onDidChangeMenu(ids => { stripChanges += ids.has(Menus.SessionActivityBar) ? 1 : 0; }));
			canvasLists[0].set([canvasOf('one', 'a'), canvasOf('one', 'b'), canvasOf('one', 'e')], undefined);
			await timeout(0);

			assert.deepStrictEqual({ stripChanges, first: activityBar(10).submenuEntries, second: activityBar(11).submenuEntries }, {
				stripChanges: 0, first: ['Open a', 'Open b', 'Open e'], second: ['Open c', 'Open d'],
			});
		});

		test('closing the window removes its entries', async () => {
			const { windowList, canvasLists } = createFixture(['one']);
			canvasLists[0].set([canvasOf('one', 'a')], undefined);
			await timeout(0);
			windowList.set([], undefined);

			assert.deepStrictEqual(activityBar(10), { direct: [], submenus: 0, submenuEntries: [] });
		});
	});
});
