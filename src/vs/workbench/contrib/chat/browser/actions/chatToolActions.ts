/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ToolsScope } from '../widget/input/chatSelectedTools.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { showToolsPicker } from './chatToolPicker.js';


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
export const SkipToolConfirmationActionId = 'workbench.action.chat.skipTool';
export const AcceptToolPostConfirmationActionId = 'workbench.action.chat.acceptToolPostExecution';
export const SkipToolPostConfirmationActionId = 'workbench.action.chat.skipToolPostExecution';

export interface IToolConfirmationActionContext {
	readonly sessionResource?: URI;
}

abstract class ToolConfirmationAction extends Action2 {
	protected abstract getReason(): ConfirmedReason;

	run(accessor: ServicesAccessor, context?: IToolConfirmationActionContext) {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = context?.sessionResource
			? chatWidgetService.getWidgetBySessionResource(context.sessionResource)
			: chatWidgetService.lastFocusedWidget;
		const lastItem = widget?.viewModel?.getItems().at(-1);
		if (!isResponseVM(lastItem)) {
			return;
		}

		for (const item of lastItem.model.response.value) {
			const state = item.kind === 'toolInvocation' ? item.state.get() : undefined;
			if (state?.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state?.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				state.confirm(this.getReason());
				break;
			}
		}

		// Return focus to the chat input, in case it was in the tool confirmation editor
		widget?.focusInput();
	}
}

class AcceptToolConfirmation extends ToolConfirmationAction {
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

	protected override getReason(): ConfirmedReason {
		return { type: ToolConfirmKind.UserAction };
	}
}

class SkipToolConfirmation extends ToolConfirmationAction {
	constructor() {
		super({
			id: SkipToolConfirmationActionId,
			title: localize2('chat.skip', "Skip"),
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasToolConfirmation),
				primary: KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt,
				// Override chatEditor.action.accept
				weight: KeybindingWeight.WorkbenchContrib + 1,
			},
		});
	}

	protected override getReason(): ConfirmedReason {
		return { type: ToolConfirmKind.Skipped };
	}
}

class ConfigureToolsAction extends Action2 {
	public static ID = 'workbench.action.chat.configureTools';

	constructor() {
		super({
			id: ConfigureToolsAction.ID,
			title: localize('label', "Configure Tools..."),
			icon: Codicon.tools,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
			menu: [{
				when: ContextKeyExpr.and(
					ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
					ChatContextKeys.lockedToCodingAgent.negate(),
					ContextKeyExpr.notEquals(`config.${ChatConfiguration.AlternativeToolAction}`, true)
				),
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 100,
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {

		const instaService = accessor.get(IInstantiationService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const telemetryService = accessor.get(ITelemetryService);

		let widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			widget = this.extractWidget(args);
		}

		if (!widget) {
			return;
		}

		const source = this.extractSource(args) ?? 'chatInput';

		let placeholder;
		let description;
		const { entriesScope, entriesMap } = widget.input.selectedToolsModel;
		switch (entriesScope) {
			case ToolsScope.Session:
				placeholder = localize('chat.tools.placeholder.session', "Select tools for this chat session");
				description = localize('chat.tools.description.session', "The selected tools were configured only for this chat session.");
				break;
			case ToolsScope.Agent:
				placeholder = localize('chat.tools.placeholder.agent', "Select tools for this custom agent");
				description = localize('chat.tools.description.agent', "The selected tools are configured by the '{0}' custom agent. Changes to the tools will be applied to the custom agent file as well.", widget.input.currentModeObs.get().label.get());
				break;
			case ToolsScope.Agent_ReadOnly:
				placeholder = localize('chat.tools.placeholder.readOnlyAgent', "Select tools for this custom agent");
				description = localize('chat.tools.description.readOnlyAgent', "The selected tools are configured by the '{0}' custom agent. Changes to the tools will only be used for this session and will not change the '{0}' custom agent.", widget.input.currentModeObs.get().label.get());
				break;
			case ToolsScope.Global:
				placeholder = localize('chat.tools.placeholder.global', "Select tools that are available to chat.");
				description = localize('chat.tools.description.global', "The selected tools will be applied globally for all chat sessions that use the default agent.");
				break;

		}

		// Create a cancellation token that cancels when the mode changes
		const cts = new CancellationTokenSource();
		const initialMode = widget.input.currentModeObs.get();
		const modeListener = autorun(reader => {
			if (initialMode.id !== widget.input.currentModeObs.read(reader).id) {
				cts.cancel();
			}
		});

		try {
			const result = await instaService.invokeFunction(showToolsPicker, placeholder, source, description, () => entriesMap.get(), widget.input.selectedLanguageModel.get()?.metadata, cts.token);
			if (result) {
				widget.input.selectedToolsModel.set(result, false);
			}
		} finally {
			modeListener.dispose();
			cts.dispose();
		}

		const tools = widget.input.selectedToolsModel.entriesMap.get();
		telemetryService.publicLog2<SelectedToolData, SelectedToolClassification>('chat/selectedTools', {
			total: tools.size,
			enabled: Iterable.reduce(tools, (prev, [_, enabled]) => enabled ? prev + 1 : prev, 0),
		});
	}

	private extractWidget(args: unknown[]): IChatWidget | undefined {
		type ChatActionContext = { widget: IChatWidget };
		function isChatActionContext(obj: unknown): obj is ChatActionContext {
			return !!obj && typeof obj === 'object' && !!(obj as ChatActionContext).widget;
		}

		for (const arg of args) {
			if (isChatActionContext(arg)) {
				return arg.widget;
			}
		}

		return undefined;
	}

	private extractSource(args: unknown[]): string | undefined {
		type ChatActionSource = { source: string };
		function isChatActionSource(obj: unknown): obj is ChatActionSource {
			return !!obj && typeof obj === 'object' && !!(obj as ChatActionSource).source;
		}

		for (const arg of args) {
			if (isChatActionSource(arg)) {
				return arg.source;
			}
		}

		return undefined;
	}
}

export function registerChatToolActions() {
	registerAction2(AcceptToolConfirmation);
	registerAction2(SkipToolConfirmation);
	registerAction2(ConfigureToolsAction);
}
