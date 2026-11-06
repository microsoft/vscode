/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService, IChatContextValueItem, isChatContextPickerPickItem } from '../../../chat/browser/attachments/chatContextPickService.js';
import { ChatViewId, IChatWidget } from '../../../chat/browser/chat.js';
import { IChatViewModel } from '../../../chat/common/model/chatViewModel.js';
import { isChatViewCanvasContextPickerWidget, registerCanvasContextPicker } from '../../browser/canvasContextPicker.js';

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
		store.add(registerCanvasContextPicker(
			createContextPickService(items),
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
		const pickerPicks = picker.picks;
		if (typeof pickerPicks !== 'function') {
			assert.fail('Expected observable Canvas picks');
		}
		const pickerStore = new DisposableStore();
		const picksObservable = pickerPicks(constObservable(''), CancellationToken.None);
		let picks: IChatContextPickerPickItem[] = [];
		pickerStore.add(autorun(reader => {
			picks = picksObservable.read(reader).picks.filter(isChatContextPickerPickItem);
		}));
		const results = [];
		for (const pick of picks) {
			results.push(await pick.asAttachment());
		}
		pickerStore.dispose();
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

	test('updates visible rows when the Canvas menu changes', () => {
		const contextKeyService = new MockContextKeyService();
		const commandService = upcastPartial<ICommandService>({ executeCommand: async () => undefined });
		const registered = new MenuItemAction({ id: 'registered', title: 'Registered Canvas' }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		const dismissed = new MenuItemAction({ id: 'dismissed', title: 'Dismissed Canvas' }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		const replacement = new MenuItemAction({ id: 'replacement', title: 'Replacement Canvas' }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		let actions = [registered, dismissed];
		const onDidChange = store.add(new Emitter<IMenuChangeEvent>());
		const menu = upcastPartial<IMenu>({
			onDidChange: onDidChange.event,
			getActions: () => [['navigation', actions]],
			dispose: () => { },
		});
		const menuService = upcastPartial<IMenuService>({
			createMenu: () => menu,
		});
		const items: (IChatContextValueItem | IChatContextPickerItem)[] = [];
		store.add(registerCanvasContextPicker(
			createContextPickService(items),
			menuService,
			new TestNotificationService(),
			new MenuId('TestDynamicCanvasContextPicker'),
		));
		const picker = (items[0] as IChatContextPickerItem).asPicker(upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			scopedContextKeyService: contextKeyService,
		}));
		const pickerPicks = picker.picks;
		if (typeof pickerPicks !== 'function') {
			assert.fail('Expected observable Canvas picks');
		}
		const picksObservable = pickerPicks(constObservable(''), CancellationToken.None);
		const snapshots: string[][] = [];
		const pickerStore = new DisposableStore();
		pickerStore.add(autorun(reader => {
			snapshots.push(picksObservable.read(reader).picks
				.filter(isChatContextPickerPickItem)
				.map(pick => pick.label));
		}));

		actions = [dismissed];
		onDidChange.fire({ menu, isStructuralChange: true, isToggleChange: false, isEnablementChange: false });
		actions = [dismissed, replacement];
		onDidChange.fire({ menu, isStructuralChange: true, isToggleChange: false, isEnablementChange: false });

		pickerStore.dispose();
		picker.dispose?.();
		assert.deepStrictEqual(snapshots, [
			['Registered Canvas', 'Dismissed Canvas'],
			['Dismissed Canvas'],
			['Dismissed Canvas', 'Replacement Canvas'],
		]);
	});

	test('Editor registration uses only the sidebar Chat session that owns its Canvas menu', () => {
		let createdMenus = 0;
		const contextKeyService = new MockContextKeyService();
		const action = new MenuItemAction(
			{ id: 'sidebar-canvas', title: 'Sidebar Canvas' },
			undefined,
			undefined,
			undefined,
			undefined,
			contextKeyService,
			upcastPartial<ICommandService>({ executeCommand: async () => undefined }),
		);
		const menuService = upcastPartial<IMenuService>({
			createMenu: () => {
				createdMenus++;
				return upcastPartial<IMenu>({
					onDidChange: Event.None,
					getActions: () => [['navigation', [action]]],
					dispose: () => { },
				});
			},
		});
		const items: (IChatContextValueItem | IChatContextPickerItem)[] = [];
		store.add(registerCanvasContextPicker(
			createContextPickService(items),
			menuService,
			new TestNotificationService(),
			new MenuId('TestSidebarCanvasContextPicker'),
			isChatViewCanvasContextPickerWidget,
		));
		const canvas = items[0] as IChatContextPickerItem;
		const widget = (sessionResource: URI, viewContext: IChatWidget['viewContext']) => upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			viewContext,
			viewModel: upcastPartial<IChatViewModel>({ sessionResource }),
			scopedContextKeyService: contextKeyService,
		});

		assert.deepStrictEqual({
			sidebarSession: canvas.isEnabled?.(widget(URI.parse('chat-session:/sidebar'), { viewId: ChatViewId })),
			editorSession: canvas.isEnabled?.(widget(URI.parse('chat-session:/editor'), {})),
			createdMenus,
		}, {
			sidebarSession: true,
			editorSession: false,
			createdMenus: 1,
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
		store.add(registerCanvasContextPicker(
			createContextPickService(items),
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
