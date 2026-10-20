/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatContextPickerItem, IChatContextPickService, IChatContextValueItem, isChatContextPickerPickItem } from '../../../chat/browser/attachments/chatContextPickService.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { registerCanvasContextPicker } from '../../browser/canvasContextPicker.js';

suite('CanvasContextPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('appears after Sessions and runs Canvas menu actions without attaching context', async () => {
		const runs: string[] = [];
		let disposedMenus = 0;
		const contextKeyService = new MockContextKeyService();
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async id => { runs.push(id); return undefined; },
		});
		const actions = [
			new MenuItemAction({ id: 'registered', title: 'Registered Canvas' }, undefined, undefined, undefined, undefined, contextKeyService, commandService),
			new MenuItemAction({ id: 'dismissed', title: 'Dismissed Canvas' }, undefined, undefined, undefined, undefined, contextKeyService, commandService),
		];
		const menuService = upcastPartial<IMenuService>({
			createMenu: () => upcastPartial<IMenu>({
				onDidChange: Event.None,
				getActions: () => [['navigation', actions]],
				dispose: () => disposedMenus++,
			}),
		});
		const items: (IChatContextValueItem | IChatContextPickerItem)[] = [];
		const contextPickService = createContextPickService(items);
		store.add(registerCanvasContextPicker(
			contextPickService,
			menuService,
			new TestNotificationService(),
			new MenuId('TestCanvasContextPicker'),
		));
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			scopedContextKeyService: contextKeyService,
		});
		const canvas = items.find((item): item is IChatContextPickerItem => item.type === 'pickerPick');
		assert.ok(canvas);
		const enabled = await canvas.isEnabled?.(widget);
		const picker = canvas.asPicker(widget);
		assert.ok(picker && picker.picks instanceof Promise);
		const picks = (await picker.picks).filter(isChatContextPickerPickItem);
		const results = [];
		for (const pick of picks) {
			results.push(await pick.asAttachment());
		}
		picker.dispose?.();

		assert.deepStrictEqual({
			label: canvas.label,
			ordinal: canvas.ordinal,
			enabled,
			picks: picks.map(pick => pick.label),
			results,
			runs,
			disposedMenus,
		}, {
			label: 'Canvas...',
			ordinal: -401,
			enabled: true,
			picks: ['Registered Canvas', 'Dismissed Canvas'],
			results: ['noop', 'noop'],
			runs: ['registered', 'dismissed'],
			disposedMenus: 2,
		});
	});

	test('is hidden outside Chat and when the Canvas menu is empty', () => {
		const menuService = upcastPartial<IMenuService>({
			createMenu: () => upcastPartial<IMenu>({
				onDidChange: Event.None,
				getActions: () => [],
				dispose: () => { },
			}),
		});
		const items: (IChatContextValueItem | IChatContextPickerItem)[] = [];
		const contextPickService = createContextPickService(items);
		store.add(registerCanvasContextPicker(
			contextPickService,
			menuService,
			upcastPartial<INotificationService>({ error: () => undefined }),
			new MenuId('TestEmptyCanvasContextPicker'),
		));
		const canvas = items[0] as IChatContextPickerItem;

		assert.deepStrictEqual({
			chat: canvas.isEnabled?.(upcastPartial<IChatWidget>({
				location: ChatAgentLocation.Chat,
				scopedContextKeyService: new MockContextKeyService(),
			})),
			inline: canvas.isEnabled?.(upcastPartial<IChatWidget>({
				location: ChatAgentLocation.EditorInline,
				scopedContextKeyService: new MockContextKeyService(),
			})),
		}, {
			chat: false,
			inline: false,
		});
	});

	function createContextPickService(items: (IChatContextValueItem | IChatContextPickerItem)[]): IChatContextPickService {
		return upcastPartial<IChatContextPickService>({
			items,
			registerChatContextItem: item => {
				items.push(item);
				return toDisposable(() => items.splice(items.indexOf(item), 1));
			},
		});
	}
});
