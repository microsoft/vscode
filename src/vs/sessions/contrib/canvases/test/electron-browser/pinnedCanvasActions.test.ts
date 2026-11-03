/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { ActiveEditorContext, IsSessionsWindowContext, ResourceContextKey } from '../../../../../workbench/common/contextkeys.js';
import { IEditorIdentifier } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { CanvasInput, getCanvasInputResource, ICanvasReference } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { Menus } from '../../../../browser/menus.js';
import { CanvasesPinnedToSidebarContext, IPinnedCanvasService } from '../../browser/pinnedCanvases.js';
import { ADD_CANVAS_TO_SIDEBAR_COMMAND_ID, REMOVE_CANVAS_FROM_SIDEBAR_COMMAND_ID, TOGGLE_CANVAS_PINNED_TO_SIDEBAR_COMMAND_ID } from '../../electron-browser/pinnedCanvasActions.js';

suite('PinnedCanvasActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const reference: ICanvasReference = { providerId: 'local-agent-host', session: URI.parse('session:/a'), chat: URI.parse('chat:/a'), canvas: URI.parse('ahp-canvas:/plan') };
	const resource = getCanvasInputResource(reference).toString();

	function evaluate(expression: ContextKeyExpression | undefined, values: Record<string, unknown>): boolean {
		const context: IContext = { getValue: <T>(key: string) => values[key] as T };
		return expression?.evaluate(context) ?? true;
	}

	function getMenuItem(menu: MenuId, commandId: string) {
		const item = MenuRegistry.getMenuItems(menu).find(candidate => isIMenuItem(candidate) && candidate.command.id === commandId);
		assert.ok(item && isIMenuItem(item));
		return item;
	}

	test('offers Add to Sidebar or Remove from Sidebar for canvas tabs, toggled by whether the tab is pinned', () => {
		const available = {
			[ChatContextKeys.enabled.key]: true,
			[IsSessionsWindowContext.key]: true,
			[`config.${CanvasesEnabledSettingId}`]: true,
		};
		const canvasTab = { ...available, [ResourceContextKey.Scheme.key]: 'session-canvas', [ResourceContextKey.Resource.key]: resource, [ActiveEditorContext.key]: CanvasInput.EDITOR_ID };
		const pinnedTab = { ...canvasTab, [CanvasesPinnedToSidebarContext.key]: [resource] };
		const fileTab = { ...available, [ResourceContextKey.Scheme.key]: 'file', [ResourceContextKey.Resource.key]: 'file:///a.ts', [ActiveEditorContext.key]: 'workbench.editors.files.textFileEditor' };
		const toggle = getMenuItem(Menus.SessionsEditorTitle, TOGGLE_CANVAS_PINNED_TO_SIDEBAR_COMMAND_ID);
		const toggled = toggle.command.toggled && hasKey(toggle.command.toggled, { condition: true }) ? toggle.command.toggled : undefined;
		const add = getMenuItem(MenuId.EditorTitleContext, ADD_CANVAS_TO_SIDEBAR_COMMAND_ID);
		const remove = getMenuItem(MenuId.EditorTitleContext, REMOVE_CANVAS_FROM_SIDEBAR_COMMAND_ID);
		const visible = (values: Record<string, unknown>) => ({
			toggle: evaluate(toggle.when, values),
			toggled: evaluate(toggled?.condition, values),
			add: evaluate(add.when, values),
			remove: evaluate(remove.when, values),
		});

		assert.deepStrictEqual({
			canvasTab: visible(canvasTab),
			pinnedTab: visible(pinnedTab),
			fileTab: visible(fileTab),
			canvasesDisabled: visible({ ...pinnedTab, [`config.${CanvasesEnabledSettingId}`]: false }),
			// Unpinning shows the same icon as unpinning a chat input pill.
			icons: { toggle: toggle.command.icon, toggled: toggled?.icon, add: add.command.icon, remove: remove.command.icon },
		}, {
			canvasTab: { toggle: true, toggled: false, add: true, remove: false },
			pinnedTab: { toggle: true, toggled: true, add: false, remove: true },
			fileTab: { toggle: false, toggled: false, add: false, remove: false },
			canvasesDisabled: { toggle: false, toggled: true, add: false, remove: false },
			icons: { toggle: Codicon.pin, toggled: Codicon.unpin, add: Codicon.pin, remove: Codicon.unpin },
		});
	});

	test('offers Remove from Sidebar on a sidebar pin and on the canvas page while pinned canvases are available', () => {
		const available = {
			[ChatContextKeys.enabled.key]: true,
			[IsSessionsWindowContext.key]: true,
			[`config.${CanvasesEnabledSettingId}`]: true,
		};
		const describe = (menu: MenuId) => {
			const item = getMenuItem(menu, REMOVE_CANVAS_FROM_SIDEBAR_COMMAND_ID);
			return {
				group: item.group,
				icon: item.command.icon,
				available: evaluate(item.when, available),
				canvasesDisabled: evaluate(item.when, { ...available, [`config.${CanvasesEnabledSettingId}`]: false }),
			};
		};

		assert.deepStrictEqual({
			toolbar: describe(Menus.SidebarCanvasToolbar),
			contextMenu: describe(Menus.SidebarCanvasContext),
			page: describe(Menus.CustomViewCanvas),
		}, {
			toolbar: { group: 'navigation', icon: Codicon.unpin, available: true, canvasesDisabled: false },
			contextMenu: { group: '2_organize', icon: Codicon.unpin, available: true, canvasesDisabled: false },
			page: { group: '2_organize', icon: Codicon.unpin, available: true, canvasesDisabled: false },
		});
	});

	test('toggles the canvas of the invoking tab without closing it', () => {
		const calls: string[] = [];
		const pinned = new Set<string>();
		const instantiationService = store.add(new TestInstantiationService());
		const input = store.add(new CanvasInput(reference, undefined,
			upcastPartial<IEditorGroupsService>({}),
			upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }),
		));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			activeEditor: undefined,
			findEditors: (target: unknown) => URI.isUri(target) && target.toString() === resource ? [upcastPartial<IEditorIdentifier>({ editor: input, groupId: 1 })] : [],
		}));
		instantiationService.stub(IPinnedCanvasService, upcastPartial<IPinnedCanvasService>({
			isPinned: target => pinned.has(target.canvas.toString()),
			pin: target => { calls.push(`pin ${target.canvas}`); pinned.add(target.canvas.toString()); return true; },
			unpin: target => { calls.push(`unpin ${(target as ICanvasReference).canvas}`); pinned.delete((target as ICanvasReference).canvas.toString()); },
		}));
		const toggle = CommandsRegistry.getCommand(TOGGLE_CANVAS_PINNED_TO_SIDEBAR_COMMAND_ID)!.handler;

		instantiationService.invokeFunction(accessor => toggle(accessor, URI.parse(resource)));
		instantiationService.invokeFunction(accessor => toggle(accessor, URI.parse(resource)));
		instantiationService.invokeFunction(accessor => toggle(accessor, URI.parse('file:///a.ts')));

		assert.deepStrictEqual({ calls, disposed: input.isDisposed() }, {
			calls: ['pin ahp-canvas:/plan', 'unpin ahp-canvas:/plan'],
			disposed: false,
		});
	});

	test('adds or removes every selected canvas tab from a tab context menu', () => {
		const calls: string[] = [];
		const pinned = new Set<string>();
		const createInput = (name: string) => store.add(new CanvasInput({ ...reference, canvas: URI.parse(`ahp-canvas:/${name}`) }, undefined,
			upcastPartial<IEditorGroupsService>({}),
			upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: true }),
		));
		const [plan, preview, unselected] = ['plan', 'preview', 'unselected'].map(createInput);
		const file = upcastPartial<EditorInput>({});
		const editors: EditorInput[] = [plan, preview, file, unselected];
		const selected: EditorInput[] = [plan, preview, file];
		const group = upcastPartial<IEditorGroup>({
			id: 1,
			activeEditor: plan,
			selectedEditors: selected,
			getEditorByIndex: index => editors[index],
			getIndexOfEditor: editor => editors.indexOf(editor),
			isSelected: editor => selected.includes(editor),
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ activeGroup: group, getGroup: id => id === group.id ? group : undefined }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: plan, findEditors: () => [] }));
		instantiationService.stub(IListService, upcastPartial<IListService>({ lastFocusedList: undefined }));
		instantiationService.stub(IPinnedCanvasService, upcastPartial<IPinnedCanvasService>({
			isPinned: target => pinned.has(target.canvas.toString()),
			pin: target => { calls.push(`pin ${target.canvas}`); pinned.add(target.canvas.toString()); return true; },
			unpin: target => { calls.push(`unpin ${(target as ICanvasReference).canvas}`); pinned.delete((target as ICanvasReference).canvas.toString()); },
		}));
		const add = CommandsRegistry.getCommand(ADD_CANVAS_TO_SIDEBAR_COMMAND_ID)!.handler;
		const remove = CommandsRegistry.getCommand(REMOVE_CANVAS_FROM_SIDEBAR_COMMAND_ID)!.handler;
		// A tab's context menu passes its resource and its position in the group.
		const tab = (input: CanvasInput) => [input.resource, { groupId: group.id, editorIndex: editors.indexOf(input) }];

		instantiationService.invokeFunction(accessor => add(accessor, ...tab(preview)));
		instantiationService.invokeFunction(accessor => remove(accessor, ...tab(plan)));
		instantiationService.invokeFunction(accessor => add(accessor, ...tab(unselected)));

		assert.deepStrictEqual(calls, [
			'pin ahp-canvas:/preview', 'pin ahp-canvas:/plan',
			'unpin ahp-canvas:/plan', 'unpin ahp-canvas:/preview',
			'pin ahp-canvas:/unselected',
		]);
	});
});
