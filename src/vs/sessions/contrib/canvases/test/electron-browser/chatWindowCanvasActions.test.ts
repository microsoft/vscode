/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
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
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus } from '../../../../browser/menus.js';
import { ChatWindowEditorGroupContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { registerChatWindowCanvasActions } from '../../electron-browser/chatWindowCanvasActions.js';

suite('Chat window - canvases in the Add Tab list', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const definition: ICanvasDefinition = { canvasId: 'plan', extensionId: 'user:plan', extensionSource: 'user', displayName: 'Plan', description: '', requiresInput: false };

	function createFixture(sessions: readonly string[]) {
		const opened: unknown[] = [];
		const reopened: ICanvasReference[] = [];
		const revealed: ICanvasReference[] = [];
		const activeSession = observableValue('activeSession', 'main');
		const windows = sessions.map((name, index) => {
			const session = URI.parse(`test://session/${name}`);
			const chat = URI.parse(`test://chat/${name}`);
			const canvas: ICanvas = { resource: URI.parse(`canvas://${name}/old`), instanceId: 'closed', title: `Old ${name}`, source: undefined };
			return {
				owner: { providerId: 'test', session, chat },
				canvas,
				window: new class extends mock<IChatWindow>() {
					override readonly editorGroup = new class extends mock<IEditorGroup>() {
						override readonly id = index + 10;
					}();
					override readonly content = observableValue('content', { editorArea: {} } as never);
					override readonly session = observableValue('session', { providerId: 'test', resource: session, activeChat: observableValue('chat', { resource: chat }) } as never);
				}(),
			};
		});
		const canvasLists = windows.map(() => observableValue<readonly ICanvas[]>('canvases', []));
		const contexts: ICanvasContext[] = windows.map(({ owner }, index) => ({
			owner,
			canvases: canvasLists[index],
			definitionProvider: {
				onDidChangeDefinitions: Event.None,
				listCanvases: async () => [definition],
				openCanvas: async (canvas, instanceId) => { opened.push([owner.session.toString(), canvas.canvasId, instanceId]); },
			},
		}));
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
				override readonly contexts = observableValue('contexts', contexts);
			}(),
			new NullLogService() as ILogService,
			new class extends mock<INotificationService>() { }(),
		));
		return { registration, opened, reopened, revealed, activeSession, windows, windowList, reopenable, canvasLists };
	}

	async function entries(count: number) {
		const getItems = () => MenuRegistry.getMenuItems(Menus.ChatWindowAddTabCanvas).filter(isIMenuItem);
		while (getItems().length < count) {
			await Event.toPromise(Event.filter(MenuRegistry.onDidChangeMenu, ids => ids.has(Menus.ChatWindowAddTabCanvas)));
		}
		return getItems();
	}

	const whenGroup = (id: number) => ContextKeyExpr.and(ChatWindowEditorGroupContext.isEqualTo(id), ChatContextKeys.enabled)!.serialize();

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
});
