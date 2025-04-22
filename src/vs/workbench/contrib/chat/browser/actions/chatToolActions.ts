/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { diffSets } from '../../../../../base/common/collections.js';
import { Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { AddConfigurationAction } from '../../../mcp/browser/mcpCommands.js';
import { IMcpService, IMcpServer, McpConnectionState } from '../../../mcp/common/mcpTypes.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatToolInvocation } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ChatMode } from '../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
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

export class AttachToolsAction extends Action2 {

	static readonly id = 'workbench.action.chat.attachTools';

	constructor() {
		super({
			id: AttachToolsAction.id,
			title: localize('label', "Select Tools..."),
			icon: Codicon.tools,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent),
			menu: {
				when: ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent),
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 100
			},
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent)),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {

		const quickPickService = accessor.get(IQuickInputService);
		const mcpService = accessor.get(IMcpService);
		const toolsService = accessor.get(ILanguageModelToolsService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const telemetryService = accessor.get(ITelemetryService);
		const commandService = accessor.get(ICommandService);
		const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);

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

		const enum BucketOrdinal { Extension, Mcp, Other }
		type BucketPick = IQuickPickItem & { picked: boolean; ordinal: BucketOrdinal; status?: string; children: ToolPick[]; source: ToolDataSource };
		type ToolPick = IQuickPickItem & { picked: boolean; tool: IToolData; parent: BucketPick };
		type AddPick = IQuickPickItem & { pickable: false; run: () => void };
		type MyPick = ToolPick | BucketPick | AddPick;

		const addMcpPick: AddPick = { type: 'item', label: localize('addServer', "Add MCP Server..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => commandService.executeCommand(AddConfigurationAction.ID) };
		const addExpPick: AddPick = { type: 'item', label: localize('addExtension', "Install Extension..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: () => extensionWorkbenchService.openSearch('@tag:language-model-tools') };
		const addPick: AddPick = {
			type: 'item', label: localize('addAny', "Add More Tools..."), iconClass: ThemeIcon.asClassName(Codicon.add), pickable: false, run: async () => {
				const pick = await quickPickService.pick(
					[addMcpPick, addExpPick],
					{
						canPickMany: false,
						title: localize('noTools', "Add tools to chat")
					}
				);
				pick?.run();
			}
		};

		const defaultBucket: BucketPick = {
			type: 'item',
			children: [],
			label: localize('defaultBucketLabel', "Other Tools"),
			source: { type: 'internal' },
			ordinal: BucketOrdinal.Other,
			picked: true,
		};

		const nowSelectedTools = new Set(widget.input.selectedToolsModel.tools.get());
		const toolBuckets = new Map<string, BucketPick>();

		for (const tool of toolsService.getTools()) {
			if (!tool.supportsToolPicker) {
				continue;
			}

			let bucket: BucketPick;

			if (tool.source.type === 'mcp') {
				const mcpServer = mcpServerByTool.get(tool.id);
				if (!mcpServer) {
					continue;
				}
				const key = tool.source.type + mcpServer.definition.id;
				bucket = toolBuckets.get(key) ?? {
					type: 'item',
					label: localize('mcplabel', "MCP Server: {0}", mcpServer?.definition.label),
					status: localize('mcpstatus', "From {0} ({1})", mcpServer.collection.label, McpConnectionState.toString(mcpServer.connectionState.get())),
					ordinal: BucketOrdinal.Mcp,
					source: tool.source,
					picked: false,
					children: []
				};
				toolBuckets.set(key, bucket);
			} else if (tool.source.type === 'extension') {
				const key = tool.source.type + ExtensionIdentifier.toKey(tool.source.extensionId);

				bucket = toolBuckets.get(key) ?? {
					type: 'item',
					label: tool.source.label,
					ordinal: BucketOrdinal.Extension,
					picked: false,
					source: tool.source,
					children: []
				};
				toolBuckets.set(key, bucket);
			} else if (tool.source.type === 'internal') {
				bucket = defaultBucket;
			} else {
				assertNever(tool.source);
			}

			const picked = nowSelectedTools.has(tool);

			bucket.children.push({
				tool,
				parent: bucket,
				type: 'item',
				label: tool.displayName,
				description: tool.userDescription,
				picked,
				indented: true,
			});

			if (picked) {
				bucket.picked = true;
			}
		}

		function isBucketPick(obj: any): obj is BucketPick {
			return Boolean((obj as BucketPick).children);
		}
		function isToolPick(obj: any): obj is ToolPick {
			return Boolean((obj as ToolPick).tool);
		}
		function isAddPick(obj: any): obj is AddPick {
			return Boolean((obj as AddPick).run);
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

				const disableBuckets: ToolDataSource[] = [];
				const disableTools: IToolData[] = [];
				for (const item of picks) {
					if (item.type === 'item' && !item.picked) {
						if (isBucketPick(item)) {
							disableBuckets.push(item.source);
						} else if (isToolPick(item) && item.parent.picked) {
							disableTools.push(item.tool);
						}
					}
				}

				widget.input.selectedToolsModel.update(disableBuckets, disableTools);
			} finally {
				ignoreEvent = false;
			}
		};

		_update();
		picker.items = picks;
		picker.show();

		store.add(picker.onDidChangeSelection(selectedPicks => {
			if (ignoreEvent) {
				return;
			}

			const addPick = selectedPicks.find(isAddPick);
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
				} else if (isToolPick(item)) {
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
				} else if (isToolPick(item) && item.parent.children.every(child => !child.picked)) {
					// remove LAST tool -> remove server
					item.parent.picked = false;
				}
			}

			_update();
		}));

		store.add(picker.onDidAccept(() => {
			picker.activeItems.find(isAddPick)?.run();
		}));

		await Promise.race([Event.toPromise(Event.any(picker.onDidAccept, picker.onDidHide))]);
		telemetryService.publicLog2<SelectedToolData, SelectedToolClassification>('chat/selectedTools', {
			enabled: widget.input.selectedToolsModel.tools.get().length,
			total: Iterable.length(toolsService.getTools()),
		});
		store.dispose();
	}
}

export function registerChatToolActions() {
	registerAction2(AcceptToolConfirmation);
	registerAction2(AttachToolsAction);
}
