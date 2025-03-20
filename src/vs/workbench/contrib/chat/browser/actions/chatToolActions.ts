/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { diffSets } from '../../../../../base/common/collections.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IMcpService, IMcpServer, McpConnectionState } from '../../../mcp/common/mcpTypes.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatToolInvocation } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ChatMode } from '../../common/constants.js';
import { ILanguageModelToolsService, IToolData } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

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
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.or(ChatContextKeys.Tools.toolsCount.greater(0)),
				ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent)
			),
			menu: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(ChatContextKeys.Tools.toolsCount.greater(0)),
					ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent)
				),
				id: MenuId.ChatInputAttachmentToolbar,
				group: 'navigation',
				order: 1
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
		const extensionService = accessor.get(IExtensionService);
		const chatWidgetService = accessor.get(IChatWidgetService);

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
		type BucketPick = IQuickPickItem & { picked: boolean; ordinal: BucketOrdinal; status?: string; children: ToolPick[] };
		type ToolPick = IQuickPickItem & { picked: boolean; tool: IToolData; parent: BucketPick };
		type MyPick = ToolPick | BucketPick;

		const defaultBucket: BucketPick = {
			type: 'item',
			children: [],
			label: localize('defaultBucketLabel', "Other Tools"),
			ordinal: BucketOrdinal.Other,
			picked: true,
		};

		const nowSelectedTools = new Set(widget.input.selectedToolsModel.tools.get());
		const toolBuckets = new Map<string, BucketPick>();

		for (const tool of toolsService.getTools()) {

			if (!tool.canBeReferencedInPrompt) {
				continue;
			}

			let bucket: BucketPick;

			const mcpServer = mcpServerByTool.get(tool.id);
			const ext = extensionService.extensions.find(value => ExtensionIdentifier.equals(value.identifier, tool.extensionId));
			if (mcpServer) {
				bucket = toolBuckets.get(mcpServer.definition.id) ?? {
					type: 'item',
					label: localize('mcplabel', "MCP Server: {0}", mcpServer.definition.label),
					status: localize('mcpstatus', "From {0} ({1})", mcpServer.collection.label, McpConnectionState.toString(mcpServer.connectionState.get())),
					ordinal: BucketOrdinal.Mcp,
					picked: false,
					children: []
				};
				toolBuckets.set(mcpServer.definition.id, bucket);
			} else if (ext) {
				bucket = toolBuckets.get(ExtensionIdentifier.toKey(ext.identifier)) ?? {
					type: 'item',
					label: ext.displayName ?? ext.name,
					ordinal: BucketOrdinal.Extension,
					picked: false,
					children: []
				};
				toolBuckets.set(ExtensionIdentifier.toKey(ext.identifier), bucket);
			} else {
				bucket = defaultBucket;
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

		const store = new DisposableStore();
		const picker = store.add(quickPickService.createQuickPick<MyPick>({ useSeparators: true }));

		const picks: (MyPick | IQuickPickSeparator)[] = [];

		for (const bucket of Array.from(toolBuckets.values()).sort((a, b) => a.ordinal - b.ordinal)) {
			picks.push({
				type: 'separator',
				label: bucket.status
			});

			picks.push(bucket);
			picks.push(...bucket.children);
		}


		picker.placeholder = localize('placeholder', "Select tools that are available to chat");
		picker.canSelectMany = true;

		let lastSelectedItems = new Set<MyPick>();
		let ignoreEvent = false;

		const _update = () => {
			ignoreEvent = true;
			try {
				const items = picks.filter((p): p is MyPick => p.type === 'item' && Boolean(p.picked));
				lastSelectedItems = new Set(items);
				picker.items = picks;
				picker.selectedItems = items;

				widget.input.selectedToolsModel.update(items.filter(isToolPick).map(tool => tool.tool));

			} finally {
				ignoreEvent = false;
			}
		};

		_update();
		picker.show();

		store.add(picker.onDidChangeSelection(selectedPicks => {
			if (ignoreEvent) {
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

		await Promise.race([Event.toPromise(Event.any(picker.onDidAccept, picker.onDidHide))]);
		store.dispose();
	}
}

export function registerChatToolActions() {
	registerAction2(AcceptToolConfirmation);
	registerAction2(AttachToolsAction);
}
