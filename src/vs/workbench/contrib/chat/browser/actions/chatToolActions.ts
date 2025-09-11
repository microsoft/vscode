/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ChatModeKind } from '../../common/constants.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ToolsScope } from '../chatSelectedTools.js';
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

		const unconfirmedToolInvocation = lastItem.model.response.value.find((item): item is IChatToolInvocation => item.kind === 'toolInvocation' && item.isConfirmed === undefined);
		if (unconfirmedToolInvocation) {
			unconfirmedToolInvocation.confirmed.complete({ type: ToolConfirmKind.UserAction });
		}

		// Return focus to the chat input, in case it was in the tool confirmation editor
		widget?.focusInput();
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
				when: ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ChatContextKeys.lockedToCodingAgent.negate()),
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 1,
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {

		const instaService = accessor.get(IInstantiationService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const telemetryService = accessor.get(ITelemetryService);

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

		let placeholder;
		let description;
		const { entriesScope, entriesMap } = widget.input.selectedToolsModel;
		switch (entriesScope) {
			case ToolsScope.Session:
				placeholder = localize('chat.tools.placeholder.session', "Select tools for this chat session");
				description = localize('chat.tools.description.session', "The selected tools were configured by a prompt command and only apply to this chat session.");
				break;
			case ToolsScope.Mode:
				placeholder = localize('chat.tools.placeholder.mode', "Select tools for this chat mode");
				description = localize('chat.tools.description.mode', "The selected tools are configured by the '{0}' chat mode. Changes to the tools will be applied to the mode file as well.", widget.input.currentModeObs.get().label);
				break;
			case ToolsScope.Global:
				placeholder = localize('chat.tools.placeholder.global', "Select tools that are available to chat.");
				description = undefined;
				break;
		}

		const result = await instaService.invokeFunction(showToolsPicker, placeholder, description, entriesMap.get());
		if (result) {
			widget.input.selectedToolsModel.set(result, false);
		}

		const tools = widget.input.selectedToolsModel.entriesMap.get();
		telemetryService.publicLog2<SelectedToolData, SelectedToolClassification>('chat/selectedTools', {
			total: tools.size,
			enabled: Iterable.reduce(tools, (prev, [_, enabled]) => enabled ? prev + 1 : prev, 0),
		});
	}
}

class ConfigureToolsActionRendering implements IWorkbenchContribution {

	static readonly ID = 'chat.configureToolsActionRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		const disposable = actionViewItemService.register(MenuId.ChatExecute, ConfigureToolsAction.ID, (action, _opts, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(class extends MenuEntryActionViewItem {
				private warningElement!: HTMLElement;

				override render(container: HTMLElement): void {
					super.render(container);

					// Add warning indicator element
					this.warningElement = $(`.tool-warning-indicator${ThemeIcon.asCSSSelector(Codicon.warning)}`);
					this.warningElement.style.display = 'none';
					container.appendChild(this.warningElement);
					container.style.position = 'relative';

					// Set up context key listeners
					this.updateWarningState();
					this._register(this._contextKeyService.onDidChangeContext(() => {
						this.updateWarningState();
					}));
				}

				private updateWarningState(): void {
					const wasShown = this.warningElement.style.display === 'block';
					const shouldBeShown = this.isAboveToolLimit();

					if (!wasShown && shouldBeShown) {
						this.warningElement.style.display = 'block';
						this.updateTooltip();
					} else if (wasShown && !shouldBeShown) {
						this.warningElement.style.display = 'none';
						this.updateTooltip();
					}
				}

				protected override getTooltip(): string {
					if (this.isAboveToolLimit()) {
						const warningMessage = localize('chatTools.tooManyEnabled', 'More than {0} tools are enabled, you may experience degraded tool calling.', this._contextKeyService.getContextKeyValue(ChatContextKeys.chatToolGroupingThreshold.key));
						return `${warningMessage}`;
					}

					return super.getTooltip();
				}

				private isAboveToolLimit() {
					const rawToolLimit = this._contextKeyService.getContextKeyValue(ChatContextKeys.chatToolGroupingThreshold.key);
					const rawToolCount = this._contextKeyService.getContextKeyValue(ChatContextKeys.chatToolCount.key);
					if (rawToolLimit === undefined || rawToolCount === undefined) {
						return false;
					}

					const toolLimit = Number(rawToolLimit || 0);
					const toolCount = Number(rawToolCount || 0);
					return toolCount > toolLimit;
				}
			}, action, undefined);
		});

		// Reduces flicker a bit on reload/restart
		markAsSingleton(disposable);
	}
}

export function registerChatToolActions() {
	registerAction2(AcceptToolConfirmation);
	registerAction2(ConfigureToolsAction);
	registerWorkbenchContribution2(ConfigureToolsActionRendering.ID, ConfigureToolsActionRendering, WorkbenchPhase.BlockRestore);
}
