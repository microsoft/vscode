/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { diffSets } from '../../../../../base/common/collections.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { AddConfigurationAction } from '../../../mcp/browser/mcpCommands.js';
import { IMcpRegistry } from '../../../mcp/common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, McpConnectionState } from '../../../mcp/common/mcpTypes.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatToolInvocation } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ChatMode } from '../../common/constants.js';
import { IToolData, ToolSet, ToolDataSource } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ConfigureToolSets } from '../tools/toolSetsContribution.js';
import { CHAT_CATEGORY } from './chatActions.js';


type SelectedToolData = {
	enabled: number;
	total: number;
};
type SelectedToolClassification = {
	owner: 'connor4312';
	comment: 'Details the capabilities of the MCP server';
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of enabled chat tools' };
	total: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of total chat tools' };
};

export const AcceptToolConfirmationActionId = 'workbench.action.chat.acceptTool';

class AcceptToolConfirmation extends Action2 {
	constructor() {
		super({
			id: AcceptToolConfirmationActionId,
			title: localize2('chat.accept', "Accept"),
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasToolConfirmation),
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				// Override chatEditor.action.accept
				weight: KeybindingWeight.WorkbenchContrib + 1,
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		const lastItem = widget?.viewModel?.getItems().at(-1);
		if (!isResponseVM(lastItem)) {
			return;
		}

		const unconfirmedToolInvocation = lastItem.model.response.value.find((item): item is IChatToolInvocation => item.kind === 'toolInvocation' && !item.isConfirmed);
		if (unconfirmedToolInvocation) {
			unconfirmedToolInvocation.confirmed.complete(true);
		}

		// Return focus to the chat input, in case it was in the tool confirmation editor
		widget?.focusInput();
	}
}

class ConfigureToolsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.chat.configureTools',
			title: localize('label', "Configure Tools..."),
			icon: Codicon.tools,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent),
			menu: {
				when: ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent),
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 1,
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {

		const quickPickService = accessor.get(IQuickInputService);
		const mcpService = accessor.get(IMcpService);
		const mcpRegistry = accessor.get(IMcpRegistry);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const telemetryService = accessor.get(ITelemetryService);
		const commandService = accessor.get(ICommandService);
		const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const editorService = accessor.get(IEditorService);

		let widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			type ChatActionContext = { widget: IChatWidget };
			function isChatActionContext(obj: any): obj is ChatActionContext {
				return obj && typeof obj === 'object' && (obj as ChatActionContext).widget;
			}
			const context = args[0];
			if (isChatActionContext(context)) {
				widget = context.widget;
			}
		}

		if (!widget) {
			return;
		}

		const mcpServerByTool = new Map<string, IMcpServer>();
		for (const server of mcpService.servers.get()) {
			for (const tool of server.tools.get()) {
				mcpServerByTool.set(tool.id, server);
			}
		}

		const enum BucketOrdinal { User, Mcp, Extension, BuiltIn }
		type BucketPick = IQuickPickItem & { picked: boolean; ordinal: BucketOrdinal; status?: string; children: (ToolPick | ToolSetPick)[] };
		type ToolSetPick = IQuickPickItem & { picked: boolean; toolset: ToolSet; parent: BucketPick };
		type ToolPick = IQuickPickItem & { picked: boolean; tool: IToolData; parent: BucketPick };
		type CallbackPick = IQuickPickItem & { pickable: false; run: () => void };
		type MyPick = BucketPick | ToolSetPick | ToolPick | CallbackPick;
		type ActionableButton = IQuickInputButton & { action: () => void };

		function isBucketPick(obj: any): obj is BucketPick {
			return Boolean((obj as BucketPick).children);
		}
		function isToolSetPick(obj: MyPick): obj is ToolSetPick {
			return Boolean((obj as ToolSetPick).toolset);
		}
		function isToolPick(obj: MyPick): obj is ToolPick {
			return Boolean((obj as ToolPick).tool);
		}
		function isCallbackPick(obj: MyPick): obj is CallbackPick {
			return Boolean((obj as CallbackPick).run);
		}
		function isActionableButton(obj: IQuickInputButton): obj is ActionableButton {
			return typeof (obj as ActionableButton).action === 'function';
		}

		const addMcpPick: CallbackPick = { type: 'item', label: localize('addServer', "Add MCP Server..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => commandService.executeCommand(AddConfigurationAction.ID) };
		const configureToolSetsPick: CallbackPick = { type: 'item', label: localize('configToolSet', "Configure Tool Sets..."), iconClass: ThemeIcon.asClassName(Codicon.tools), pickable: false, run: () => commandService.executeCommand(ConfigureToolSets.ID) };
		const addExpPick: CallbackPick = { type: 'item', label: localize('addExtension', "Install Extension..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => extensionWorkbenchService.openSearch('@tag:language-model-tools') };
		const addPick: CallbackPick = {
			type: 'item', label: localize('addAny', "Add More Tools..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: async () => {
				const pick = await quickPickService.pick(
					[addMcpPick, addExpPick],
					{
						canPickMany: false,
						placeHolder: localize('noTools', "Add tools to chat")
					}
				);
				pick?.run();
			}
		};

		const builtinBucket: BucketPick = {
			type: 'item',
			children: [],
			label: localize('defaultBucketLabel', "Built-In"),
			ordinal: BucketOrdinal.BuiltIn,
			picked: false,
		};

		const mcpBucket: BucketPick = {
			type: 'item',
			children: [],
			label: localize('mcp', "MCP Server"),
			ordinal: BucketOrdinal.Mcp,
			alwaysShow: true,
			picked: false,
		};

		const userBucket: BucketPick = {
			type: 'item',
			children: [],
			label: localize('userBucket', "User Defined"),
			ordinal: BucketOrdinal.User,
			alwaysShow: true,
			picked: false,
		};

		const toolBuckets = new Map<string, BucketPick>();

		for (const [toolSetOrTool, picked] of widget.input.selectedToolsModel.entriesMap) {

			let bucket: BucketPick | undefined;
			let buttons: ActionableButton[] | undefined;
			let description: string | undefined;

			if (toolSetOrTool.source.type === 'mcp') {
				const { definitionId } = toolSetOrTool.source;
				const mcpServer = mcpService.servers.get().find(candidate => candidate.definition.id === definitionId);
				if (!mcpServer) {
					continue;
				}
				bucket = mcpBucket;

				// if (!bucket) {
				buttons = [];
				const collection = mcpRegistry.collections.get().find(c => c.id === mcpServer.collection.id);
				if (collection?.presentation?.origin) {
					buttons.push({
						iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
						tooltip: localize('configMcpCol', "Configure {0}", collection.label),
						action: () => editorService.openEditor({
							resource: collection!.presentation!.origin,
						})
					});
				}
				if (mcpServer.connectionState.get().state === McpConnectionState.Kind.Error) {
					buttons.push({
						iconClass: ThemeIcon.asClassName(Codicon.warning),
						tooltip: localize('mcpShowOutput', "Show Output"),
						action: () => mcpServer.showOutput(),
					});
				}

				description = localize('mcplabel', "MCP Server: {0}", mcpServer?.definition.label);

			} else if (toolSetOrTool.source.type === 'extension') {
				const key = ToolDataSource.toKey(toolSetOrTool.source);
				bucket = toolBuckets.get(key) ?? {
					type: 'item',
					label: toolSetOrTool.source.label,
					ordinal: BucketOrdinal.Extension,
					picked: false,
					alwaysShow: true,
					children: []
				};
				toolBuckets.set(key, bucket);
			} else if (toolSetOrTool.source.type === 'internal') {
				bucket = builtinBucket;
			} else if (toolSetOrTool.source.type === 'user') {
				bucket = userBucket;
			} else {
				assertNever(toolSetOrTool.source);
			}

			if (toolSetOrTool instanceof ToolSet) {
				bucket.children.push({
					parent: bucket,
					type: 'item',
					picked,
					toolset: toolSetOrTool,
					label: toolSetOrTool.displayName,
					description: description ?? toolSetOrTool.description,
					indented: true,
					buttons

				});
			} else if (toolSetOrTool.canBeReferencedInPrompt) {
				bucket.children.push({
					parent: bucket,
					type: 'item',
					picked,
					tool: toolSetOrTool,
					label: toolSetOrTool.toolReferenceName ?? toolSetOrTool.displayName,
					description: toolSetOrTool.userDescription,
					indented: true,
				});
			}

			if (picked) {
				bucket.picked = true;
			}
		}

		for (const bucket of [builtinBucket, mcpBucket, userBucket]) {
			if (bucket.children.length > 0) {
				toolBuckets.set(generateUuid(), bucket);
			}
		}

		const store = new DisposableStore();

		const picks: (MyPick | IQuickPickSeparator)[] = [];

		for (const bucket of Array.from(toolBuckets.values()).sort((a, b) => a.ordinal - b.ordinal)) {
			picks.push({
				type: 'separator',
				label: bucket.status
			});

			picks.push(bucket);
			picks.push(...bucket.children);
		}

		const picker = store.add(quickPickService.createQuickPick<MyPick>({ useSeparators: true }));
		picker.placeholder = localize('placeholder', "Select tools that are available to chat");
		picker.canSelectMany = true;
		picker.keepScrollPosition = true;
		picker.sortByLabel = false;
		picker.matchOnDescription = true;

		if (picks.length === 0) {
			picker.placeholder = localize('noTools', "Add tools to chat");
			picker.canSelectMany = false;
			picks.push(
				addMcpPick,
				addExpPick,
			);
		} else {
			picks.push(
				{ type: 'separator' },
				configureToolSetsPick,
				addPick,
			);
		}


		let lastSelectedItems = new Set<MyPick>();
		let ignoreEvent = false;

		const _update = () => {
			ignoreEvent = true;
			try {
				const items = picks.filter((p): p is MyPick => p.type === 'item' && Boolean(p.picked));
				lastSelectedItems = new Set(items);
				picker.selectedItems = items;

				const disableToolSets: ToolSet[] = [];
				const disableTools: IToolData[] = [];


				for (const item of picks) {
					if (item.type === 'item' && !item.picked) {
						if (isToolSetPick(item)) {
							disableToolSets.push(item.toolset);
						} else if (isToolPick(item)) {
							disableTools.push(item.tool);
						} else if (isBucketPick(item)) {
							for (const child of item.children) {
								if (isToolSetPick(child)) {
									disableToolSets.push(child.toolset);
								} else if (isToolPick(child)) {
									disableTools.push(child.tool);
								}
							}
						}
					}
				}

				widget.input.selectedToolsModel.update(disableToolSets, disableTools);
			} finally {
				ignoreEvent = false;
			}
		};

		_update();
		picker.items = picks;
		picker.show();

		store.add(picker.onDidTriggerItemButton(e => {
			if (isActionableButton(e.button)) {
				e.button.action();
				store.dispose();
			}
		}));

		store.add(picker.onDidChangeSelection(selectedPicks => {
			if (ignoreEvent) {
				return;
			}

			const addPick = selectedPicks.find(isCallbackPick);
			if (addPick) {
				addPick.run();
				picker.hide();
				return;
			}

			const { added, removed } = diffSets(lastSelectedItems, new Set(selectedPicks));

			for (const item of added) {
				item.picked = true;

				if (isBucketPick(item)) {
					// add server -> add back tools
					for (const toolPick of item.children) {
						toolPick.picked = true;
					}
				} else if (isToolPick(item) || isToolSetPick(item)) {
					// add server when tool is picked
					item.parent.picked = true;
				}
			}

			for (const item of removed) {
				item.picked = false;

				if (isBucketPick(item)) {
					// removed server -> remove tools
					for (const toolPick of item.children) {
						toolPick.picked = false;
					}
				} else if ((isToolPick(item) || isToolSetPick(item)) && item.parent.children.every(child => !child.picked)) {
					// remove LAST tool -> remove server
					item.parent.picked = false;
				}
			}

			_update();
		}));

		store.add(picker.onDidAccept(() => {
			picker.activeItems.find(isCallbackPick)?.run();
		}));

		await Promise.race([Event.toPromise(Event.any(picker.onDidAccept, picker.onDidHide))]);

		telemetryService.publicLog2<SelectedToolData, SelectedToolClassification>('chat/selectedTools', {
			total: widget.input.selectedToolsModel.entriesMap.size,
			enabled: widget.input.selectedToolsModel.entries.get().size,
		});
		store.dispose();
	}
}

export function registerChatToolActions() {
	registerAction2(AcceptToolConfirmation);
	registerAction2(ConfigureToolsAction);
}
