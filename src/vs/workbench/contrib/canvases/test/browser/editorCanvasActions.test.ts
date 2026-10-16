/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatViewId, IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatViewModel } from '../../../chat/common/model/chatViewModel.js';
import { ChatNewCanvasMenuId, OPEN_EDITOR_CANVAS_COMMAND_ID, registerEditorCanvasActions, REOPEN_EDITOR_CANVAS_COMMAND_ID } from '../../browser/editorCanvasActions.js';
import { getCanvasDefinitionInstanceId, ICanvas, ICanvasContext, ICanvasDefinition, ICanvasReopenTarget, ICanvasService } from '../../common/canvas.js';

suite('EditorCanvasActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes applicable canvases in a separate New Chat section', async () => {
		const owner = {
			providerId: 'local/copilotcli',
			session: URI.parse('agent-host-session:/session'),
			chat: URI.parse('agent-host-chat:/session/main'),
		};
		const projectDefinition: ICanvasDefinition = {
			canvasId: 'main',
			extensionId: 'project:counter',
			extensionSource: 'project',
			extensionName: 'Project Counter',
			displayName: 'Counter',
			description: 'A project counter.',
			requiresInput: false,
		};
		const userDefinition: ICanvasDefinition = {
			canvasId: 'main',
			extensionId: 'user:counter',
			extensionSource: 'user',
			extensionName: 'User Counter',
			displayName: 'Counter',
			description: 'A user counter.',
			requiresInput: false,
		};
		const inputDefinition: ICanvasDefinition = {
			canvasId: 'form',
			extensionId: 'project:form',
			extensionSource: 'project',
			displayName: 'Form',
			description: 'Requires opening input.',
			requiresInput: true,
		};
		const builtInDefinition: ICanvasDefinition = {
			canvasId: 'browser',
			extensionId: 'github-app',
			extensionSource: 'unknown',
			displayName: 'Browser',
			description: 'Built-in browser.',
			requiresInput: false,
		};
		let definitions: readonly ICanvasDefinition[] = [userDefinition, inputDefinition, builtInDefinition, projectDefinition];
		let listCalls = 0;
		const definitionsChanged = store.add(new Emitter<void>());
		const opened: Array<{ canvas: string; instanceId: string }> = [];
		const existing: ICanvas = {
			resource: URI.parse('agent-host-canvas:/user-counter'),
			instanceId: getCanvasDefinitionInstanceId(userDefinition),
			title: 'Counter',
			source: URI.parse('https://example.test/user-counter'),
		};
		const unavailableProject: ICanvas = {
			resource: URI.parse('agent-host-canvas:/project-counter'),
			instanceId: getCanvasDefinitionInstanceId(projectDefinition),
			title: 'Counter',
			source: undefined,
		};
		const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', [existing, unavailableProject]);
		const context: ICanvasContext = {
			owner,
			canvases,
			definitionProvider: {
				onDidChangeDefinitions: definitionsChanged.event,
				listCanvases: async () => {
					listCalls++;
					return definitions;
				},
				openCanvas: async (canvas, instanceId) => {
					opened.push({ canvas: canvas.extensionId, instanceId });
				},
			},
		};
		const canvasContext = observableValue<ICanvasContext | undefined>('canvasContext', context);
		const model = upcastPartial<IChatModel>({ canvasContext });
		const viewModel = upcastPartial<IChatViewModel>({ model });
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = upcastPartial<IChatWidget>({
			viewContext: { viewId: ChatViewId },
			viewModel,
			onDidChangeViewModel: viewModelChanged.event,
		});
		const widgetAdded = store.add(new Emitter<IChatWidget>());
		const widgetRemoved = store.add(new Emitter<IChatWidget>());
		const widgetService = upcastPartial<IChatWidgetService>({
			getAllWidgets: () => [widget],
			onDidAddWidget: widgetAdded.event,
			onDidRemoveWidget: widgetRemoved.event,
		});
		const stableTarget: ICanvasReopenTarget = {
			reference: { ...owner, canvas: URI.parse('agent-host-canvas:/project-counter') },
			canvas: {
				resource: URI.parse('agent-host-canvas:/project-counter'),
				instanceId: getCanvasDefinitionInstanceId(projectDefinition),
				title: 'Counter',
				source: URI.parse('https://example.test/project-counter'),
			},
		};
		const secondaryTarget: ICanvasReopenTarget = {
			reference: { ...owner, canvas: URI.parse('agent-host-canvas:/preview') },
			canvas: {
				resource: URI.parse('agent-host-canvas:/preview'),
				instanceId: 'preview-secondary',
				title: 'Preview',
				source: URI.parse('https://example.test/preview'),
			},
		};
		const enabled = observableValue('enabled', true);
		const reopenableCanvases = observableValue<readonly ICanvasReopenTarget[]>('reopenableCanvases', [stableTarget, secondaryTarget]);
		const revealed: string[] = [];
		const reopened: string[] = [];
		const canvasService = upcastPartial<ICanvasService>({
			enabled,
			reopenableCanvases,
			revealCanvas: async reference => { revealed.push(reference.canvas.toString()); },
			reopenCanvas: async reference => { reopened.push(reference.canvas.toString()); },
		});
		const registration = registerEditorCanvasActions(
			canvasService,
			widgetService,
			new NullLogService(),
			upcastPartial<INotificationService>({ error: () => undefined }),
		);
		await timeout(0);

		const getItems = () => MenuRegistry.getMenuItems(ChatNewCanvasMenuId)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(`${OPEN_EDITOR_CANVAS_COMMAND_ID}.`) || item.command.id.startsWith(`${REOPEN_EDITOR_CANVAS_COMMAND_ID}.`))
			.sort((first, second) => (first.group ?? '').localeCompare(second.group ?? '') || (first.order ?? 0) - (second.order ?? 0));
		const getSubmenus = () => MenuRegistry.getMenuItems(MenuId.ChatNewMenu)
			.filter(isISubmenuItem)
			.filter(item => item.submenu === ChatNewCanvasMenuId);
		const initialItems = getItems();
		const initialSubmenus = getSubmenus();
		const initialCommandIds = initialItems.map(item => item.command.id);
		for (const item of initialItems) {
			await CommandsRegistry.getCommand(item.command.id)!.handler(upcastPartial<ServicesAccessor>({}));
		}

		definitionsChanged.fire();
		await timeout(0);
		const unchangedSubmenus = getSubmenus();
		definitions = [{
			canvasId: 'chart',
			extensionId: 'project:chart',
			extensionSource: 'project',
			displayName: 'Chart',
			description: 'A chart.',
			requiresInput: false,
		}];
		definitionsChanged.fire();
		await timeout(0);
		const refreshedItems = getItems();
		const commandIds = new Set([...initialCommandIds, ...refreshedItems.map(item => item.command.id)]);
		canvasContext.set(undefined, undefined);
		await timeout(0);
		const uninitializedItems = getItems();
		const uninitializedSubmenus = getSubmenus();
		canvasContext.set(context, undefined);
		await timeout(0);
		for (const item of getItems()) {
			commandIds.add(item.command.id);
		}
		enabled.set(false, undefined);
		const disabledItems = getItems();
		const disabledSubmenus = getSubmenus();
		registration.dispose();

		assert.deepStrictEqual({
			submenuTitles: initialSubmenus.map(item => typeof item.title === 'string' ? item.title : item.title.value),
			submenuGroups: initialSubmenus.map(item => item.group),
			initialTitles: initialItems.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value),
			groups: initialItems.map(item => item.group),
			requiresChat: initialItems.map(item => item.when?.serialize().includes(ChatContextKeys.enabled.key)),
			listCalls,
			opened,
			revealed,
			reopened,
			unchangedSubmenuRetained: unchangedSubmenus[0] === initialSubmenus[0],
			refreshedTitles: refreshedItems.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value),
			uninitializedItems: uninitializedItems.length,
			uninitializedSubmenus: uninitializedSubmenus.length,
			disabledItems: disabledItems.length,
			disabledSubmenus: disabledSubmenus.length,
			itemsAfterDispose: getItems().length,
			submenusAfterDispose: getSubmenus().length,
			commandsAfterDispose: [...commandIds].map(id => CommandsRegistry.getCommand(id) !== undefined),
		}, {
			submenuTitles: ['Canvas'],
			submenuGroups: ['z_canvas'],
			initialTitles: ['Counter (Project Counter)', 'Counter (User Counter)', 'Preview'],
			groups: ['1_available', '1_available', '2_open'],
			requiresChat: [true, true, true],
			listCalls: 4,
			opened: [{
				canvas: 'project:counter',
				instanceId: getCanvasDefinitionInstanceId(projectDefinition),
			}],
			revealed: ['agent-host-canvas:/project-counter', 'agent-host-canvas:/user-counter'],
			reopened: ['agent-host-canvas:/preview'],
			unchangedSubmenuRetained: true,
			refreshedTitles: ['Chart', 'Counter', 'Preview'],
			uninitializedItems: 0,
			uninitializedSubmenus: 0,
			disabledItems: 0,
			disabledSubmenus: 0,
			itemsAfterDispose: 0,
			submenusAfterDispose: 0,
			commandsAfterDispose: [false, false, false, false, false, false, false, false],
		});
	});

	test('coalesces definition refreshes and keeps shown commands registered', async () => {
		const owner = {
			providerId: 'local/copilotcli',
			session: URI.parse('agent-host-session:/session'),
			chat: URI.parse('agent-host-chat:/session/main'),
		};
		const definition: ICanvasDefinition = {
			canvasId: 'preview',
			extensionId: 'project:preview',
			extensionSource: 'project',
			displayName: 'Preview',
			description: 'A preview canvas.',
			requiresInput: false,
		};
		const definitionsChanged = store.add(new Emitter<void>());
		const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', []);
		const pendingDefinitions: { value: DeferredPromise<readonly ICanvasDefinition[]> | undefined } = { value: undefined };
		let listCalls = 0;
		const opened: string[] = [];
		const context: ICanvasContext = {
			owner,
			canvases,
			definitionProvider: {
				onDidChangeDefinitions: definitionsChanged.event,
				listCanvases: () => {
					listCalls++;
					return pendingDefinitions.value?.p ?? Promise.resolve([definition]);
				},
				openCanvas: async canvas => {
					opened.push(canvas.canvasId);
				},
			},
		};
		const canvasContext = observableValue<ICanvasContext | undefined>('canvasContext', context);
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = upcastPartial<IChatWidget>({
			viewContext: { viewId: ChatViewId },
			viewModel: upcastPartial<IChatViewModel>({ model: upcastPartial<IChatModel>({ canvasContext }) }),
			onDidChangeViewModel: viewModelChanged.event,
		});
		const widgetAdded = store.add(new Emitter<IChatWidget>());
		const widgetRemoved = store.add(new Emitter<IChatWidget>());
		const widgetService = upcastPartial<IChatWidgetService>({
			getAllWidgets: () => [widget],
			onDidAddWidget: widgetAdded.event,
			onDidRemoveWidget: widgetRemoved.event,
		});
		const enabled = observableValue('enabled', true);
		const canvasService = upcastPartial<ICanvasService>({
			enabled,
			reopenableCanvases: observableValue<readonly ICanvasReopenTarget[]>('reopenableCanvases', []),
		});
		const registration = registerEditorCanvasActions(
			canvasService,
			widgetService,
			new NullLogService(),
			upcastPartial<INotificationService>({ error: () => undefined }),
		);
		await timeout(0);

		const getCommandIds = () => MenuRegistry.getMenuItems(ChatNewCanvasMenuId)
			.filter(isIMenuItem)
			.map(item => item.command.id)
			.filter(id => id.startsWith(`${OPEN_EDITOR_CANVAS_COMMAND_ID}.`));
		const [shownCommandId] = getCommandIds();
		canvases.set([], undefined);
		canvases.set([], undefined);
		await timeout(0);
		const listCallsAfterStreaming = listCalls;

		const refresh = new DeferredPromise<readonly ICanvasDefinition[]>();
		pendingDefinitions.value = refresh;
		definitionsChanged.fire();
		definitionsChanged.fire();
		definitionsChanged.fire();
		await timeout(0);
		const whileRefreshing = {
			commandIds: getCommandIds(),
			commandRegistered: CommandsRegistry.getCommand(shownCommandId) !== undefined,
			listCalls,
		};
		await CommandsRegistry.getCommand(shownCommandId)!.handler(upcastPartial<ServicesAccessor>({}));
		refresh.complete([definition]);
		await refresh.p;
		await timeout(0);
		const commandIdsAfterRefresh = getCommandIds();

		const obsoleteRefresh = new DeferredPromise<readonly ICanvasDefinition[]>();
		pendingDefinitions.value = obsoleteRefresh;
		definitionsChanged.fire();
		await timeout(0);
		definitionsChanged.fire();
		await timeout(0);
		enabled.set(false, undefined);
		obsoleteRefresh.complete([definition]);
		await obsoleteRefresh.p;
		await timeout(0);
		await timeout(0);
		const listCallsAfterDisable = listCalls;
		registration.dispose();

		assert.deepStrictEqual({
			listCallsAfterStreaming,
			whileRefreshing,
			shownCommandKeptAfterRefresh: commandIdsAfterRefresh.includes(shownCommandId),
			opened,
			listCallsAfterDisable,
			commandRegisteredAfterDispose: CommandsRegistry.getCommand(shownCommandId) !== undefined,
		}, {
			listCallsAfterStreaming: 1,
			whileRefreshing: {
				commandIds: [shownCommandId],
				commandRegistered: true,
				listCalls: 2,
			},
			shownCommandKeptAfterRefresh: true,
			opened: ['preview'],
			listCallsAfterDisable: 3,
			commandRegisteredAfterDispose: false,
		});
	});
});
