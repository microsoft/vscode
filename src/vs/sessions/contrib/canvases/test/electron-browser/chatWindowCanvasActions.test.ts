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
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasReference, ICanvasService } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus } from '../../../../browser/menus.js';
import { IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { registerChatWindowCanvasActions } from '../../electron-browser/chatWindowCanvasActions.js';

suite('Chat window - canvases in the Add Tab list', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const definition: ICanvasDefinition = { canvasId: 'plan', extensionId: 'user:plan', extensionSource: 'user', displayName: 'Plan', description: '', requiresInput: false };

	function createFixture(sessions: readonly string[]) {
		const opened: unknown[] = [];
		const reopened: ICanvasReference[] = [];
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
		const contexts: ICanvasContext[] = windows.map(({ owner }) => ({
			owner,
			canvases: observableValue('canvases', []),
			definitionProvider: {
				onDidChangeDefinitions: Event.None,
				listCanvases: async () => [definition],
				openCanvas: async (canvas, instanceId) => { opened.push([owner.session.toString(), canvas.canvasId, instanceId]); },
			},
		}));
		const registration = store.add(registerChatWindowCanvasActions(
			new class extends mock<IChatWindowService>() {
				override readonly windows = observableValue<readonly IChatWindow[]>('windows', windows.map(entry => entry.window));
			}(),
			new class extends mock<ICanvasService>() {
				override readonly enabled = observableValue('enabled', true);
				override readonly reopenableCanvases = observableValue('reopenable', windows.map(({ owner, canvas }) => ({ reference: { ...owner, canvas: canvas.resource }, canvas })));
				override async reopenCanvas(reference: ICanvasReference) { reopened.push(reference); }
			}(),
			new class extends mock<ICanvasContextService>() {
				override readonly contexts = observableValue('contexts', contexts);
			}(),
			new NullLogService() as ILogService,
			new class extends mock<INotificationService>() { }(),
		));
		return { registration, opened, reopened, activeSession, windows };
	}

	async function entries(count: number) {
		const getItems = () => MenuRegistry.getMenuItems(Menus.ChatWindowAddTabCanvas).filter(isIMenuItem);
		while (getItems().length < count) {
			await Event.toPromise(Event.filter(MenuRegistry.onDidChangeMenu, ids => ids.has(Menus.ChatWindowAddTabCanvas)));
		}
		return getItems();
	}

	const whenGroup = (id: number) => `sessions.chatWindowEditorGroup == '${id}'`;

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
});
