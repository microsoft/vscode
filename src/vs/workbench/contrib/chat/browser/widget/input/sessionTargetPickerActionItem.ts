/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from '../../agentSessions/agentSessions.js';

export interface IAgentSessionPickerDelegate {
	getActiveSessionProvider(): AgentSessionProviders | undefined;
}

interface IAgentSessionItem {
	type: AgentSessionProviders;
	label: string;
	description: string;
	commandId: string;
}

/**
 * Action view item for selecting a session target in the chat interface.
 * This picker allows switching between different chat session types contributed via extensions.
 */
export class SessionTargetPickerActionItem extends ActionWidgetDropdownActionViewItem {
	private _agentSessionItems: IAgentSessionItem[] = [];

	constructor(
		action: MenuItemAction,
		private readonly chatSessionPosition: 'sidebar' | 'editor',
		private readonly delegate: IAgentSessionPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const currentType = this.delegate.getActiveSessionProvider();

				const actions: IActionWidgetDropdownAction[] = [];
				for (const agentSessionItem of this._agentSessionItems) {
					actions.push({
						...action,
						id: agentSessionItem.commandId,
						label: agentSessionItem.label,
						tooltip: agentSessionItem.description,
						checked: currentType === agentSessionItem.type,
						enabled: true,
						run: async () => {
							this.commandService.executeCommand(agentSessionItem.commandId, this.chatSessionPosition);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					});
				}

				return actions;
			}
		};

		const sessionTargetPickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider: undefined,
			showItemKeybindings: true,
		};

		super(action, sessionTargetPickerOptions, actionWidgetService, keybindingService, contextKeyService);

		this._updateAgentSessionItems();
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this._updateAgentSessionItems();
		}));
	}

	private _updateAgentSessionItems(): void {
		const localSessionItem = {
			type: AgentSessionProviders.Local,
			label: getAgentSessionProviderName(AgentSessionProviders.Local),
			description: localize('chat.sessionTarget.local.description', "Local chat session"),
			commandId: `workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.Local}`,
		};

		const agentSessionItems = [localSessionItem];

		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		for (const contribution of contributions) {
			const agentSessionType = getAgentSessionProvider(contribution.type);
			if (!agentSessionType) {
				continue;
			}

			agentSessionItems.push({
				type: agentSessionType,
				label: getAgentSessionProviderName(agentSessionType),
				description: contribution.description,
				commandId: `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}`,
			});
		}
		this._agentSessionItems = agentSessionItems;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const currentType = this.delegate.getActiveSessionProvider();

		const label = getAgentSessionProviderName(currentType ?? AgentSessionProviders.Local);

		dom.reset(element, dom.$('span.chat-input-picker-label', undefined, label), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-input-picker-item');
	}
}
